import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { Database } from './index.ts';

const files = [
  { version: 1, name: 'foundation', path: './schema.sql' },
  { version: 2, name: 'runtime-hardening', path: './migrations/002-runtime-hardening.sql' },
  { version: 3, name: 'rental-returns', path: './migrations/003-rental-returns.sql' },
  { version: 4, name: 'rental-finance', path: './migrations/004-rental-finance.sql' },
  { version: 5, name: 'login-throttle', path: './migrations/005-login-throttle.sql' },
];
export async function migrate(db: Database): Promise<number[]> {
  const migrations = await Promise.all(files.map(async file => {
    const sql = await readFile(new URL(file.path, import.meta.url), 'utf8');
    return { ...file, sql, checksum: createHash('sha256').update(sql).digest('hex') };
  }));
  return db.transaction(async sql => {
    await sql.query('SELECT pg_advisory_xact_lock(867431)');
    await sql.query(`CREATE TABLE IF NOT EXISTS schema_migrations(version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
      ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS name text;
      ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum text;`);
    const { rows } = await sql.query<{ version: number; checksum: string | null }>('SELECT version,checksum FROM schema_migrations ORDER BY version');
    if (rows.some((row, i) => row.version !== i + 1 || !files.some(f => f.version === row.version))) throw new Error('Histórico de migrations incompatível com esta versão.');
    const applied: number[] = [];
    for (const migration of migrations) {
      const previous = rows.find(row => row.version === migration.version);
      if (previous) {
        if (previous.checksum && previous.checksum !== migration.checksum) throw new Error(`Migration ${migration.version}: checksum divergente. Restaure o arquivo original.`);
        // Only the legacy initial migration may lack its checksum.
        if (!previous.checksum && migration.version !== 1) throw new Error('Migration sem checksum. Verifique o histórico.');
        await sql.query('UPDATE schema_migrations SET name=$1,checksum=$2 WHERE version=$3', [migration.name, migration.checksum, migration.version]);
        continue;
      }
      await sql.query(migration.sql);
      await sql.query('INSERT INTO schema_migrations(version,name,checksum) VALUES($1,$2,$3)', [migration.version, migration.name, migration.checksum]);
      applied.push(migration.version);
    }
    return applied;
  });
}
