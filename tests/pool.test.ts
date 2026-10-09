import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { databaseFromPool, tenant, verifyRuntime } from '../packages/database/index.ts';

test('Prisma role is local to each transaction, RLS fails closed, rollback and pool reuse do not leak tenant context', async () => {
  const pg = new PGlite();
  await pg.exec(await readFile(new URL('../packages/database/schema.sql', import.meta.url), 'utf8'));
  await pg.exec(`INSERT INTO organizations(id,name,slug) VALUES
    ('00000000-0000-4000-8000-000000000001','A','a'),('00000000-0000-4000-8000-000000000002','B','b');
    INSERT INTO customers(organization_id,name,phone) VALUES
    ('00000000-0000-4000-8000-000000000001','Cliente A','1'),('00000000-0000-4000-8000-000000000002','Cliente B','2');`);
  const query = (sql: string, values?: any[]) => pg.query<any>(sql, values);
  const db = databaseFromPool({ query, connect: async () => ({ query, release() {} }), end: () => pg.close() }, { role: 'loca_runtime' });
  try {
    await verifyRuntime(db);
    assert.equal((await db.query('SELECT current_user AS name')).rows[0].name, 'loca_runtime');
    assert.equal((await db.query('SELECT * FROM customers')).rows.length, 0);
    assert.deepEqual((await tenant(db, '00000000-0000-4000-8000-000000000001', sql => sql.query('SELECT name FROM customers'))).rows, [{ name: 'Cliente A' }]);
    await assert.rejects(tenant(db, '00000000-0000-4000-8000-000000000001', sql => sql.query("INSERT INTO customers(organization_id,name,phone) VALUES('00000000-0000-4000-8000-000000000002','Invasão','1')")));
    assert.equal((await db.query('SELECT * FROM customers')).rows.length, 0);
    assert.deepEqual((await tenant(db, '00000000-0000-4000-8000-000000000002', sql => sql.query('SELECT name FROM customers'))).rows, [{ name: 'Cliente B' }]);
    await assert.rejects(db.query('SELECT * FROM users'));
    assert.notEqual((await pg.query<{ name: string }>('SELECT current_user AS name')).rows[0].name, 'loca_runtime');
  } finally { await db.close(); }
});
