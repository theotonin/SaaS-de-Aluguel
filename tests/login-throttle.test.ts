import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { PGlite } from '@electric-sql/pglite';
import { migrate } from '../packages/database/migrate.ts';
import { databaseFromPool, type Database } from '../packages/database/index.ts';
import { createApp } from '../apps/api/app.ts';
import { hashPassword } from '../apps/api/auth.ts';

test('login throttle is shared across app instances and stores no raw address', async () => {
  const pg = new PGlite();
  const owner: Database = {
    query: (q, v) => v ? pg.query(q, v) : pg.exec(q).then(r => r.at(-1) as any),
    transaction: work => pg.transaction(tx => work({ query: (q, v) => v ? tx.query(q, v) : tx.exec(q).then(r => r.at(-1) as any) })),
    close: () => pg.close(),
  };
  await migrate(owner);
  await pg.query("INSERT INTO users(name,email,password_hash,role) VALUES('Admin','root@example.test',$1,'superadmin')", [await hashPassword('SeguroParaTeste123!')]);
  const query = (text: string, params?: any[]) => pg.query<any>(text, params);
  const db = databaseFromPool({ query, connect: async () => ({ query, release() {} }), end: () => pg.close() }, { role: 'loca_runtime' });
  const servers = [0, 1].map(() => createServer(createApp(db, { origin: 'http://localhost:5173', production: false, loginLimitSecret: 'unit-test-secret-long-enough-for-hmac-digest', clientIp: () => '203.0.113.77' })));
  try {
    await Promise.all(servers.map(s => new Promise<void>(resolve => s.listen(0, '127.0.0.1', resolve))));
    const login = async (index: number) => {
      const address = servers[index].address() as { port: number };
      return fetch(`http://127.0.0.1:${address.port}/api/auth/login`, { method: 'POST', headers: { origin: 'http://localhost:5173', 'content-type': 'application/json' }, body: JSON.stringify({ email: 'root@example.test', password: 'wrong-password' }) });
    };
    for (let i = 0; i < 10; i++) assert.equal((await login(i % 2)).status, 401);
    assert.equal((await login(1)).status, 429);
    const rows = await pg.query<{ address_key: string }>('SELECT address_key FROM login_attempts');
    assert.equal(rows.rows.length, 1);
    assert.match(rows.rows[0].address_key, /^[0-9a-f]{64}$/);
    assert.ok(!rows.rows[0].address_key.includes('203.0.113.77'));
  } finally {
    await Promise.all(servers.map(s => new Promise<void>(resolve => s.close(() => resolve()))));
    await db.close();
  }
});
