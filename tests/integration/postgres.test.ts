import { test } from 'node:test';
import assert from 'node:assert/strict';
import { postgres, tenant, verifyRuntime } from '../../packages/database/index.ts';
import { migrate } from '../../packages/database/migrate.ts';
import { createSuperadmin } from '../../packages/database/provision.ts';
import { recordReturn, releaseMaintenance } from '../../apps/api/returns.ts';
import { recordFinance, financeDetails } from '../../apps/api/payments.ts';
import { createRental, transitionRental } from '../../apps/api/rentals.ts';

test('PostgreSQL TCP: migrations, pool isolation and concurrent rental, return, maintenance and refund writes', async () => {
  const url = process.env.TEST_DATABASE_ADMIN_URL;
  if (!url) throw new Error('Defina TEST_DATABASE_ADMIN_URL apontando para um banco DESCARTÁVEL e vazio.');
  const admin = postgres(url, { max: 1 });
  const observer = postgres(url, { max: 1 });
  const db = postgres(url, { role: 'loca_runtime', max: 4 });
  try {
    const existing = await admin.query("SELECT to_regclass('public.organizations') AS name");
    if (existing.rows[0].name) throw new Error('Use um banco de testes vazio: este teste não altera bancos existentes.');
    await migrate(admin);
    assert.deepEqual(await migrate(admin), []);
    await createSuperadmin(admin, { name: 'Teste Root', email: 'root@example.test', password: 'SenhaDeTesteSegura123!' });
    await verifyRuntime(db);
    // Hold the rental row until both independent TCP connections are waiting on it.
    // This makes the overlap deterministic instead of depending on task scheduling.
    async function race(rentalId: string, operation: () => Promise<unknown>) {
      let results: Promise<PromiseSettledResult<unknown>[]> | undefined;
      let waiting = false;
      try {
        await admin.transaction(async sql => {
          await sql.query('SELECT id FROM rentals WHERE id=$1 FOR UPDATE', [rentalId]);
          results = Promise.allSettled([operation(), operation()]);
          const deadline = Date.now() + 5000;
          while (Date.now() < deadline) {
            const activity = await observer.query(`SELECT count(*)::int AS count FROM pg_stat_activity
              WHERE datname=current_database() AND wait_event_type='Lock'
              AND query LIKE '%FROM rentals%FOR UPDATE%'`);
            if (activity.rows[0].count === 2) { waiting = true; break; }
            await new Promise(resolve => setTimeout(resolve, 20));
          }
        });
      } finally {
        // Always drain the contenders after releasing the blocking transaction.
        if (results) await results;
      }
      assert.ok(waiting, 'Both operations must contend for the rental row over TCP');
      const settled = await results!;
      assert.equal(settled.filter(result => result.status === 'fulfilled').length, 1);
      const failures = settled.filter(result => result.status === 'rejected') as PromiseRejectedResult[];
      assert.equal(failures.length, 1);
      assert.equal(failures[0].reason.status, 409);
    }
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
    const confirmed = confirmations.find(result => result.status === 'fulfilled') as PromiseFulfilledResult<any>;
    const rentalId = confirmed.value.id;
    // Fixture delivery bypasses the wall-clock delivery window only; return and
    // finance writes still use the production API and tenant transactions.
    await admin.query("UPDATE rentals SET status='delivered' WHERE id=$1", [rentalId]);
    await race(rentalId, () => tenant(db, org, sql => recordReturn(sql, actor, rentalId, {
      lines: [{ itemId, receivedQuantity: 1, damagedQuantity: 1, note: 'Pé quebrado' }],
    })));
    const returned = (await admin.query('SELECT status FROM rentals WHERE id=$1', [rentalId])).rows[0];
    assert.equal(returned.status, 'returned');
    const returnRows = (await admin.query('SELECT received_quantity,damaged_quantity FROM rental_return_lines WHERE rental_id=$1', [rentalId])).rows;
    assert.deepEqual(returnRows.map(row => [row.received_quantity, row.damaged_quantity]), [[1, 1]]);
    assert.equal((await admin.query('SELECT id FROM rental_returns WHERE rental_id=$1', [rentalId])).rows.length, 1);
    const jobs = (await admin.query('SELECT id,remaining_quantity FROM item_maintenance WHERE rental_id=$1', [rentalId])).rows;
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].remaining_quantity, 1);
    await race(rentalId, () => tenant(db, org, sql => releaseMaintenance(sql, actor, rentalId, jobs[0].id, { quantity: 1, note: 'Reparado' })));
    assert.equal((await admin.query('SELECT remaining_quantity FROM item_maintenance WHERE id=$1', [jobs[0].id])).rows[0].remaining_quantity, 0);
    assert.equal((await admin.query('SELECT id FROM maintenance_releases WHERE maintenance_id=$1', [jobs[0].id])).rows.length, 1);
    for (const [receivedKind, refundKind, amount] of [['payment', 'refund', 700], ['deposit_received', 'deposit_refund', 300]] as const) {
      await tenant(db, org, sql => recordFinance(sql, actor, rentalId, { kind: receivedKind, amount, method: 'pix', note: 'Recebido' }));
      await race(rentalId, () => tenant(db, org, sql => recordFinance(sql, actor, rentalId, { kind: refundKind, amount, method: 'pix', note: 'Devolvido' })));
      const ledger = await tenant(db, org, sql => financeDetails(sql, rentalId));
      assert.equal(ledger.entries.filter(entry => entry.kind === refundKind).length, 1);
      assert.equal(ledger.summary.paid, 0);
      assert.equal(ledger.summary.depositHeld, 0);
    }
    assert.equal((await db.query('SELECT * FROM customers')).rows.length, 0);
    await assert.rejects(db.query('SELECT * FROM users'));
    const readings = await Promise.all(Array.from({ length: 8 }, (_, i) => tenant(db, i % 2 ? org : crypto.randomUUID(), sql => sql.query('SELECT * FROM customers'))));
    assert.deepEqual(readings.map(result => result.rows.length), [0,1,0,1,0,1,0,1]);
  } finally { await db.close(); await observer.close(); await admin.close(); }
});
