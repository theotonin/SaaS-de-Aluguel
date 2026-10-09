import pg from "pg";
import type { DatabaseOptions } from './config.ts';
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
export function postgres(url: string, options: DatabaseOptions = {}): Database {
  const pool = new pg.Pool({
    connectionString: url,
    max: options.max ?? 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  });
  return databaseFromPool(pool, options);
}
interface PoolLike {
  query: SQL['query'];
  connect(): Promise<SQL & { release(error?: Error): void }>;
  end(): Promise<void>;
}
export function databaseFromPool(pool: PoolLike, options: DatabaseOptions = {}): Database {
  const db: Database = {
    query: (text, values) => options.role
      ? db.transaction(sql => sql.query(text, values))
      : pool.query(text, values),
    async transaction(work) {
      const client = await pool.connect();
      let discard: Error | undefined;
      try {
        await client.query("BEGIN");
        // Fixed identifier, never user input. Transaction state works with Prisma pooling.
        if (options.role) await client.query('SET LOCAL ROLE loca_runtime');
        const result = await work(client);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        try { await client.query("ROLLBACK"); }
        catch { discard = new Error('Falha ao reverter transação.'); }
        throw error;
      } finally {
        client.release(discard);
      }
    },
    close: () => pool.end(),
  };
  return db;
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
    `SELECT current_user AS name, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb,
      EXISTS(SELECT 1 FROM pg_auth_members WHERE member=pg_roles.oid) AS member
      FROM pg_roles WHERE rolname=current_user`,
  );
  if (
    rows[0]?.name !== "loca_runtime" ||
    rows[0]?.rolsuper ||
    rows[0]?.rolbypassrls || rows[0]?.rolcreaterole || rows[0]?.rolcreatedb || rows[0]?.member
  )
    throw new Error(
      "DATABASE_URL deve usar loca_runtime sem privilégios administrativos.",
    );
  const protection = await db.query(
    `SELECT count(*)::int AS count FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ('customers','items','rentals','rental_lines','idempotency','audit_log') AND relrowsecurity AND relforcerowsecurity AND relowner<>(SELECT oid FROM pg_roles WHERE rolname=current_user)`,
  );
  if (protection.rows[0]?.count !== 6)
    throw new Error(
      "Proteção RLS incompleta. Execute as migrations antes de iniciar.",
    );
}
