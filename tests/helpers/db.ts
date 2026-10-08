import pg from "pg";

const pool = new pg.Pool({
  connectionString:
    process.env["DATABASE_URL"] ||
    "postgresql://piyush@localhost:5432/invoice_db?schema=public",
});

export async function queryDb<T = any>(
  sql: string,
  params: any[] = []
): Promise<T[]> {
  const result = await pool.query(sql, params);
  return result.rows;
}
