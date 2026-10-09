import pg from "pg";
export interface SQL {
  query<T extends Record<string, any> = Record<string, any>>(
    text: string,
    values?: any[],
  ): Promise<{ rows: T[] }>;
}
export interface Database extends SQL {
  transaction<T>(work: (sql: SQL) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
export function postgres(url: string): Database {
  const pool = new pg.Pool({
    connectionString: url,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  });
  return {
    async query<T extends Record<string, any>>(text: string, values?: any[]) {
      return pool.query<T>(text, values);
    },
    async transaction(work) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await work(client);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
export async function tenant<T>(
  db: Database,
  organizationId: string,
  work: (sql: SQL) => Promise<T>,
): Promise<T> {
  return db.transaction(async (sql) => {
    await sql.query("SELECT set_config('app.organization_id',$1,true)", [
      organizationId,
    ]);
    return work(sql);
  });
}

export async function verifyRuntime(db: SQL): Promise<void> {
  const { rows } = await db.query(
    `SELECT current_user AS name, rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user`,
  );
  if (
    rows[0]?.name !== "loca_runtime" ||
    rows[0]?.rolsuper ||
    rows[0]?.rolbypassrls
  )
    throw new Error(
      "DATABASE_URL deve usar loca_runtime sem privilégios administrativos.",
    );
  const protection = await db.query(
    `SELECT count(*)::int AS count FROM pg_class WHERE relname IN ('customers','items','rentals','rental_lines','idempotency','audit_log') AND relrowsecurity AND relforcerowsecurity`,
  );
  if (protection.rows[0]?.count !== 6)
    throw new Error(
      "Proteção RLS incompleta. Execute as migrations antes de iniciar.",
    );
}
