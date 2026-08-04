import { readFile, readdir } from "node:fs/promises";
import pg from "pg";

const required = ["PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE"];
const missing = required.filter((name) => !process.env[name]);

if (missing.length) {
  console.error(`Missing database environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

const client = new pg.Client({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 8000
});

try {
  await client.connect();
const migrationsUrl = new URL("../migrations/", import.meta.url);
  const files = (await readdir(migrationsUrl))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = await readFile(new URL(file, migrationsUrl), "utf8");
    await client.query(sql);
  }

  const result = await client.query(`
    select table_name
    from information_schema.tables
    where table_schema = 'fitfuel'
    order by table_name
  `);
  console.log(`Applied ${files.length} migration files.`);
  console.log(`FitFuel database initialized with ${result.rowCount} tables/views.`);
  console.log(result.rows.map(({ table_name }) => `- fitfuel.${table_name}`).join("\n"));
} catch (error) {
  console.error("Database initialization failed:", error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
