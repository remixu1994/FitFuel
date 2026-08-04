import pg from "pg";

const sourceDatabase = process.env.SOURCE_DATABASE || "food_db";
const targetDatabase = process.env.TARGET_DATABASE || "fitfuel";

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

const mappings = [
  ["public.food_category", "food_info.food_category", "id"],
  ["public.food", "food_info.food", "id"],
  ["public.food_nutrition", "food_info.food_nutrition", "id"],
  ["public.food_serving", "food_info.food_serving", "id"],
  ...["app_user","nutrition_goal","daily_record","meal","custom_food","meal_item","water_log","auth_session"]
    .map(table => [`fitfuel.${table}`, `fitfuel.${table}`, "id"]),
  ["fitfuel.user_profile", "fitfuel.user_profile", "user_id"]
];

const source = new pg.Client(connection(sourceDatabase));
const target = new pg.Client(connection(targetDatabase));

try {
  await source.connect();
  await target.connect();
  const checks = [];
  for (const [sourceName, targetName, keyColumn] of mappings) {
    const sourceResult = await source.query(
      `select count(*)::int count,coalesce(sum(${keyColumn}),0)::numeric id_sum,max(${keyColumn}) max_id
       from ${sourceName}`
    );
    const sourceValue = sourceResult.rows[0];
    const targetResult = sourceValue.max_id === null
      ? { rows: [{ count: 0, id_sum: "0" }] }
      : await target.query(
          `select count(*)::int count,coalesce(sum(${keyColumn}),0)::numeric id_sum
           from ${targetName} where ${keyColumn} <= $1`,
          [sourceValue.max_id]
        );
    const targetTotal = await target.query(`select count(*)::int count from ${targetName}`);
    const targetValue = targetResult.rows[0];
    checks.push({
      source: sourceName,
      target: targetName,
      sourceCount: sourceValue.count,
      migratedCount: targetValue.count,
      targetTotal: targetTotal.rows[0].count,
      idsMatch: String(sourceValue.id_sum) === String(targetValue.id_sum),
      ok: sourceValue.count === targetValue.count && String(sourceValue.id_sum) === String(targetValue.id_sum)
    });
  }
  const admin = await target.query(
    "select email,role,must_change_password from fitfuel.app_user where role='admin'"
  );
  const foreignKey = await target.query(`
    select count(*)::int count
    from information_schema.table_constraints tc
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_schema=tc.constraint_schema and ccu.constraint_name=tc.constraint_name
    where tc.constraint_type='FOREIGN KEY' and tc.table_schema='fitfuel'
      and tc.table_name='meal_item' and ccu.table_schema='food_info' and ccu.table_name='food'
  `);
  const result = {
    sourceDatabase,
    targetDatabase,
    checks,
    admin: admin.rows,
    mealItemFoodForeignKey: foreignKey.rows[0].count === 1,
    ok: checks.every(check => check.ok)
      && admin.rowCount === 1
      && admin.rows[0].email.toLowerCase() === "xnysym@outlook.com"
      && foreignKey.rows[0].count === 1
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
} finally {
  await source.end().catch(() => undefined);
  await target.end().catch(() => undefined);
}
