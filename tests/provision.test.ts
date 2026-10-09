import { test } from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from "node:fs/promises";
import { PGlite } from '@electric-sql/pglite';
import type { Database, SQL } from '../packages/database/index.ts';
import { migrate } from '../packages/database/migrate.ts';
import { createSuperadmin } from '../packages/database/provision.ts';
import { verifyPassword } from '../apps/api/auth.ts';

function adapter(pg: PGlite): Database {
  const sql = (pg: Pick<PGlite, 'query' | 'exec'>): SQL => ({
    query: (text, values) => values ? pg.query(text, values) : pg.exec(text).then(results => results.at(-1) as any),
  });
  return { ...sql(pg), transaction: work => pg.transaction(tx => work(sql(tx))), close: () => pg.close() };
}
test('migrations are repeatable and refuse altered history; bootstrap never overwrites existing credentials', async () => {
  const pg = new PGlite(); const db = adapter(pg);
  try {
    assert.equal((await migrate(db)).length, 4);
    assert.deepEqual(await migrate(db), []);
    const input = { name: 'Gestor Tonin', email: 'ROOT@example.test', password: 'UmaSenhaSegura123!' };
    assert.equal(await createSuperadmin(db, input), 'created');
    assert.equal(await createSuperadmin(db, { ...input, password: 'OutraSenhaSegura123!' }), 'exists');
    const { rows } = await db.query('SELECT * FROM users');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].email, 'root@example.test');
    assert.equal(rows[0].organization_id, null);
    assert.equal(rows[0].role, 'superadmin');
    assert.equal(await verifyPassword(input.password, rows[0].password_hash), true);
    await assert.rejects(createSuperadmin(db, { ...input, email: 'bad', password: 'short' }));
    await db.query("UPDATE schema_migrations SET checksum='tampered' WHERE version=1");
    await assert.rejects(migrate(db), /checksum/);
  } finally { await db.close(); }
});
test('legacy migration history upgrades without losing companies; bootstrap refuses a tenant account email', async () => {
  const pg = new PGlite(); const db = adapter(pg);
  try {
    await pg.exec(await readFile(new URL("../packages/database/schema.sql",import.meta.url),"utf8"));
    await pg.exec("CREATE TABLE schema_migrations(version integer PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now()); INSERT INTO schema_migrations(version) VALUES(1);");
    await db.query("INSERT INTO organizations(name,slug) VALUES('Preservada','preservada')");
    await db.query("INSERT INTO users(organization_id,name,email,password_hash,role) SELECT id,'Gestor','owner@example.test','hash','admin' FROM organizations");
    assert.equal((await migrate(db)).length, 3);
    assert.equal((await db.query('SELECT * FROM organizations')).rows.length, 1);
    await assert.rejects(createSuperadmin(db, { name: 'Root', email: 'owner@example.test', password: 'UmaSenhaSegura123!' }), /já pertence/);
    assert.equal((await db.query('SELECT role FROM users')).rows[0].role, 'admin');
  } finally { await db.close(); }
});
