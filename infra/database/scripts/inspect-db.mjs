import pg from "pg";

const client = new pg.Client({ connectionTimeoutMillis: 8000 });

try {
  await client.connect();
  const connection = await client.query(
    "select current_database() as database, current_user as username, version()"
  );
  const tables = await client.query(`
    select table_schema, table_name
    from information_schema.tables
    where table_schema not in ('pg_catalog', 'information_schema')
    order by table_schema, table_name
  `);
  const columns = await client.query(`
    select table_schema, table_name, column_name, data_type
    from information_schema.columns
    where table_schema not in ('pg_catalog', 'information_schema')
    order by table_schema, table_name, ordinal_position
  `);
  console.log(JSON.stringify({
    connection: connection.rows[0],
    tables: tables.rows,
    columns: columns.rows
  }, null, 2));
} finally {
  await client.end();
}
