import { readFile, readdir } from "node:fs/promises";
import pg from "pg";

const sourceDatabase = process.env.SOURCE_DATABASE || "food_db";
const targetDatabase = process.env.TARGET_DATABASE || "fitfuel";
const adminEmail = (process.env.FITFUEL_ADMIN_EMAIL || "xnysym@outlook.com").toLowerCase();
const importKey = "food_db_initial_v1";

function connection(database) {
  return {
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database,
    ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 8000
  };
}

function identifier(value) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) throw new Error(`Unsafe identifier: ${value}`);
  return `"${value.replaceAll('"', '""')}"`;
}

const tables = [
  ["public", "food_category", "food_info", "food_category", "id"],
  ["public", "food", "food_info", "food", "id"],
  ["public", "food_nutrition", "food_info", "food_nutrition", "id"],
  ["public", "food_serving", "food_info", "food_serving", "id"],
  ["fitfuel", "app_user", "fitfuel", "app_user", "id"],
  ["fitfuel", "user_profile", "fitfuel", "user_profile", "user_id"],
  ["fitfuel", "nutrition_goal", "fitfuel", "nutrition_goal", "id"],
  ["fitfuel", "daily_record", "fitfuel", "daily_record", "id"],
  ["fitfuel", "meal", "fitfuel", "meal", "id"],
  ["fitfuel", "custom_food", "fitfuel", "custom_food", "id"],
  ["fitfuel", "meal_item", "fitfuel", "meal_item", "id"],
  ["fitfuel", "water_log", "fitfuel", "water_log", "id"],
  ["fitfuel", "auth_session", "fitfuel", "auth_session", "id"]
];

async function ensureDatabase() {
  const maintenance = new pg.Client(connection("postgres"));
  await maintenance.connect();
  try {
    const exists = await maintenance.query("select 1 from pg_database where datname=$1", [targetDatabase]);
    if (!exists.rowCount) {
      await maintenance.query(`create database ${identifier(targetDatabase)} template template0 encoding 'UTF8'`);
      console.log(`Created database ${targetDatabase}.`);
    }
  } finally {
    await maintenance.end();
  }
}

async function applyMigrations(target) {
  const migrationsUrl = new URL("../database/migrations/", import.meta.url);
  const files = (await readdir(migrationsUrl)).filter(file => file.endsWith(".sql")).sort();
  for (const file of files) {
    await target.query(await readFile(new URL(file, migrationsUrl), "utf8"));
  }
  return files;
}

async function columns(client, schema, table) {
  const result = await client.query(
    `select column_name
     from information_schema.columns
     where table_schema=$1 and table_name=$2
     order by ordinal_position`,
    [schema, table]
  );
  return result.rows.map(row => row.column_name);
}

async function primaryKey(client, schema, table) {
  const result = await client.query(
    `select kcu.column_name
     from information_schema.table_constraints tc
     join information_schema.key_column_usage kcu
       on kcu.constraint_schema=tc.constraint_schema
      and kcu.constraint_name=tc.constraint_name
     where tc.table_schema=$1 and tc.table_name=$2 and tc.constraint_type='PRIMARY KEY'
     order by kcu.ordinal_position`,
    [schema, table]
  );
  return result.rows.map(row => row.column_name);
}

async function copyTable(source, target, mapping) {
  const [sourceSchema, sourceTable, targetSchema, targetTable] = mapping;
  const sourceColumns = await columns(source, sourceSchema, sourceTable);
  const targetColumns = new Set(await columns(target, targetSchema, targetTable));
  const sharedColumns = sourceColumns.filter(column => targetColumns.has(column));
  const rows = (await source.query(
    `select ${sharedColumns.map(identifier).join(",")}
     from ${identifier(sourceSchema)}.${identifier(sourceTable)}
     order by 1`
  )).rows;
  if (!rows.length) return 0;

  const keys = await primaryKey(target, targetSchema, targetTable);
  const updates = sharedColumns.filter(column => !keys.includes(column));
  const chunkSize = Math.max(1, Math.floor(50_000 / sharedColumns.length));
  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const chunk = rows.slice(offset, offset + chunkSize);
    const values = [];
    const placeholders = chunk.map((row, rowIndex) => {
      const fields = sharedColumns.map((column, columnIndex) => {
        values.push(row[column]);
        return `$${rowIndex * sharedColumns.length + columnIndex + 1}`;
      });
      return `(${fields.join(",")})`;
    });
    const conflict = keys.length
      ? `on conflict (${keys.map(identifier).join(",")}) ${updates.length
        ? `do update set ${updates.map(column => `${identifier(column)}=excluded.${identifier(column)}`).join(",")}`
        : "do nothing"}`
      : "";
    await target.query(
      `insert into ${identifier(targetSchema)}.${identifier(targetTable)}
       (${sharedColumns.map(identifier).join(",")})
       overriding system value values ${placeholders.join(",")} ${conflict}`,
      values
    );
  }
  return rows.length;
}

async function resetSequence(target, schema, table) {
  const sequence = await target.query("select pg_get_serial_sequence($1,'id') as name", [`${schema}.${table}`]);
  if (!sequence.rows[0]?.name) return;
  const aggregate = await target.query(
    `select coalesce(max(id),0)::bigint maximum,count(*)::bigint total
     from ${identifier(schema)}.${identifier(table)}`
  );
  const { maximum, total } = aggregate.rows[0];
  await target.query("select setval($1::regclass,$2,$3)", [
    sequence.rows[0].name,
    Math.max(1, Number(maximum)),
    Number(total) > 0
  ]);
}

async function tableCounts(client, target = false) {
  const result = {};
  for (const [sourceSchema, sourceTable, targetSchema, targetTable, keyColumn] of tables) {
    const schema = target ? targetSchema : sourceSchema;
    const table = target ? targetTable : sourceTable;
    const count = await client.query(
      `select count(*)::int count,coalesce(sum(${identifier(keyColumn)}),0)::numeric id_sum
       from ${identifier(schema)}.${identifier(table)}`
    );
    result[`${schema}.${table}`] = count.rows[0];
  }
  return result;
}

await ensureDatabase();
const source = new pg.Client(connection(sourceDatabase));
const target = new pg.Client(connection(targetDatabase));

try {
  await source.connect();
  await target.connect();
  const migrations = await applyMigrations(target);
  const imported = await target.query(
    "select source_snapshot,imported_at from fitfuel.data_import where import_key=$1",
    [importKey]
  );
  if (imported.rowCount) {
    console.log(`Import ${importKey} already completed at ${imported.rows[0].imported_at.toISOString()}.`);
    process.exitCode = 0;
  } else {
    const existing = await tableCounts(target, true);
    const nonEmpty = Object.entries(existing).filter(([, value]) => Number(value.count) > 0);
    if (nonEmpty.length) {
      throw new Error(`Target database is not empty: ${nonEmpty.map(([name]) => name).join(", ")}`);
    }

    await source.query("begin isolation level repeatable read read only");
    await target.query("begin");
    try {
      const snapshot = await tableCounts(source);
      for (const mapping of tables) {
        const count = await copyTable(source, target, mapping);
        console.log(`Copied ${count} rows: ${mapping[0]}.${mapping[1]} -> ${mapping[2]}.${mapping[3]}`);
      }
      for (const [, , schema, table, keyColumn] of tables) {
        if (keyColumn === "id") await resetSequence(target, schema, table);
      }

      const promoted = await target.query(
        `update fitfuel.app_user
         set role='admin',must_change_password=false,updated_at=now()
         where lower(email)=$1 returning id`,
        [adminEmail]
      );
      if (promoted.rowCount !== 1) throw new Error(`Expected one admin account for ${adminEmail}`);
      await target.query(
        "update fitfuel.app_user set role='user' where lower(email)<>$1 and role='admin'",
        [adminEmail]
      );
      await target.query(
        `insert into fitfuel.data_import(import_key,source_database,source_snapshot)
         values($1,$2,$3)`,
        [importKey, sourceDatabase, snapshot]
      );
      await target.query("commit");
      await source.query("commit");
      console.log(`Applied ${migrations.length} migrations and completed import ${importKey}.`);
    } catch (error) {
      await target.query("rollback");
      await source.query("rollback");
      throw error;
    }
  }
} catch (error) {
  console.error("FitFuel database migration failed:", error.message);
  process.exitCode = 1;
} finally {
  await source.end().catch(() => undefined);
  await target.end().catch(() => undefined);
}
