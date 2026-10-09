import { test } from 'node:test';
import assert from 'node:assert/strict';
import { postgres, tenant, verifyRuntime } from '../../packages/database/index.ts';
import { migrate } from '../../packages/database/migrate.ts';
import { createSuperadmin } from '../../packages/database/provision.ts';
import { createRental, transitionRental } from '../../apps/api/rentals.ts';

test('PostgreSQL TCP: migrations, real pool isolation and concurrent confirmations', async () => {
  const url = process.env.TEST_DATABASE_ADMIN_URL;
  if (!url) throw new Error('Defina TEST_DATABASE_ADMIN_URL apontando para um banco DESCARTÁVEL e vazio.');
  const admin = postgres(url, { max: 1 });
  const db = postgres(url, { role: 'loca_runtime', max: 4 });
  try {
    const existing = await admin.query("SELECT to_regclass('public.organizations') AS name");
    if (existing.rows[0].name) throw new Error('Use um banco de testes vazio: este teste não altera bancos existentes.');
    await migrate(admin);
    assert.deepEqual(await migrate(admin), []);
    await createSuperadmin(admin, { name: 'Teste Root', email: 'root@example.test', password: 'SenhaDeTesteSegura123!' });
    await verifyRuntime(db);
    const org = (await admin.query("INSERT INTO organizations(name,slug) VALUES('Locadora Teste','locadora-teste') RETURNING id")).rows[0].id;
    const actorId = (await admin.query("INSERT INTO users(organization_id,name,email,password_hash,role) VALUES($1,'Gestor','owner@example.test','unused','admin') RETURNING id", [org])).rows[0].id;
    const customerId = (await tenant(db, org, sql => sql.query("INSERT INTO customers(organization_id,name,phone) VALUES($1,'Cliente','1') RETURNING id", [org]))).rows[0].id;
    const itemId = (await tenant(db, org, sql => sql.query("INSERT INTO items(organization_id,name,category,quantity,unit_price) VALUES($1,'Mesa','Móveis',1,1000) RETURNING id", [org]))).rows[0].id;
    const actor = { id: actorId, organization_id: org, role: 'admin' };
    const input = { customerId, start: '2030-12-20T12:00:00Z', end: '2030-12-21T12:00:00Z', lines: [{ itemId, quantity: 1 }] };
    const a = await tenant(db, org, sql => createRental(sql, actor, input));
    const b = await tenant(db, org, sql => createRental(sql, actor, input));
    const confirmations = await Promise.allSettled([a, b].map(rental => tenant(db, org, sql => transitionRental(sql, actor, rental.id, 'confirmed', ''))));
    assert.equal(confirmations.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(confirmations.filter(result => result.status === 'rejected').length, 1);
    const failure = confirmations.find(result => result.status === 'rejected') as PromiseRejectedResult;
    assert.equal(failure.reason.status, 409);
    assert.equal((await db.query('SELECT * FROM customers')).rows.length, 0);
    await assert.rejects(db.query('SELECT * FROM users'));
    const readings = await Promise.all(Array.from({ length: 8 }, (_, i) => tenant(db, i % 2 ? org : crypto.randomUUID(), sql => sql.query('SELECT * FROM customers'))));
    assert.deepEqual(readings.map(result => result.rows.length), [0,1,0,1,0,1,0,1]);
  } finally { await db.close(); await admin.close(); }
});
