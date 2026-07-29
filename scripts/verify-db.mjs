import pg from "pg";

const client = new pg.Client({ connectionTimeoutMillis: 8000 });

try {
  await client.connect();
  const objects = await client.query(`
    select table_schema, table_name, table_type
    from information_schema.tables
    where table_schema in ('food_info', 'fitfuel')
    order by table_schema, table_name
  `);
  const foodCounts = await client.query(`
    select
      (select count(*) from food_info.food)::int as foods,
      (select count(*) from food_info.food_nutrition)::int as nutrition_rows,
      (select count(*) from food_info.food_serving)::int as serving_rows
  `);
  const foodForeignKey = await client.query(`
    select count(*)::int as count
    from information_schema.table_constraints tc
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = tc.constraint_name
     and ccu.constraint_schema = tc.constraint_schema
    where tc.constraint_type = 'FOREIGN KEY'
      and tc.table_schema = 'fitfuel'
      and tc.table_name = 'meal_item'
      and ccu.table_schema = 'food_info'
      and ccu.table_name = 'food'
  `);
  const migration = await client.query(
    "select version, applied_at from fitfuel.schema_migration order by applied_at"
  );

  console.log(JSON.stringify({
    objects: objects.rows,
    existingFoodDatabase: foodCounts.rows[0],
    mealItemFoodForeignKey: foodForeignKey.rows[0].count === 1,
    migrations: migration.rows
  }, null, 2));
} finally {
  await client.end();
}
