import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createApp } from '../apps/api/app.ts';
import { hashPassword } from '../apps/api/auth.ts';
import type { Database, SQL } from '../packages/database/index.ts';

test('HTTP workflow protects authentication, CSRF, tenant access and reservation capacity', async () => {
  const pg = new PGlite();
  await pg.exec(await readFile(new URL('../packages/database/schema.sql', import.meta.url), 'utf8'));
  const hash = await hashPassword('UmaSenhaSegura123!');
  await pg.query(`INSERT INTO users(name,email,password_hash,role) VALUES('Tonin','root@example.test',$1,'superadmin')`, [hash]);
  await pg.exec('SET ROLE loca_runtime');
  const db: Database = {
    query: (text, params) => pg.query(text, params),
    transaction: work => pg.transaction(tx => work(tx as SQL)),
    close: () => pg.close(),
  };
  const server = createServer(createApp(db, { origin: 'http://localhost:5173', production: false }));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}/api`;
  let cookie = '', csrf = '';
  const request = async (path: string, method = 'GET', body?: unknown, extra: Record<string, string> = {}) => {
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', origin: 'http://localhost:5173', cookie, 'x-csrf-token': csrf, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await res.json();
    return { res, data };
  };
  const login = async (email: string) => {
    const { res, data } = await request('/auth/login', 'POST', { email, password: 'UmaSenhaSegura123!' });
    assert.equal(res.status, 200);
    cookie = res.headers.get('set-cookie')!.split(';')[0]; csrf = data.csrf;
    return data;
  };
  try {
    assert.equal((await request('/items')).res.status, 401);
    assert.equal((await request('/auth/login', 'POST', { email: 'root@example.test', password: 'wrong' })).res.status, 401);
    await login('root@example.test');
    assert.equal((await request('/admin/companies', 'POST', {}, { 'x-csrf-token': 'bad' })).res.status, 403);
    const createCompany = (name: string, slug: string, ownerEmail: string) => request('/admin/companies', 'POST', { name, slug, ownerName: 'Gestor', ownerEmail, ownerPassword: 'UmaSenhaSegura123!', plan: 'Piloto', userLimit: 3, itemLimit: 2 });
    const a = await createCompany('Locadora A', 'locadora-a', 'a@example.test');
    assert.equal(a.res.status, 201);
    const b = await createCompany('Locadora B', 'locadora-b', 'b@example.test');
    assert.equal(b.res.status, 201);
    assert.equal((await request('/items')).res.status, 403, 'superadmin does not read operational data');
    await login('a@example.test');
    assert.equal((await request('/admin/companies')).res.status, 403);
    const customer = await request('/customers', 'POST', { name: 'Cliente A', phone: '11999999999' });
    assert.equal(customer.res.status, 201);
    const item = await request('/items', 'POST', { name: 'Cadeira', category: 'Mobiliário', quantity: 10, unitPrice: 500 });
    assert.equal(item.res.status, 201);
    const payload = { customerId: customer.data.id, start: '2026-12-20T12:00:00Z', end: '2026-12-21T12:00:00Z', lines: [{ itemId: item.data.id, quantity: 8 }] };
    const key = crypto.randomUUID();
    const rental = await request('/rentals', 'POST', payload, { 'idempotency-key': key });
    assert.equal(rental.res.status, 201);
    assert.equal(Number(rental.data.total), 4000);
    const retry = await request('/rentals', 'POST', payload, { 'idempotency-key': key });
    assert.equal(retry.data.id, rental.data.id);
    assert.equal((await request('/rentals', 'POST', { ...payload, notes: 'different' }, { 'idempotency-key': key })).res.status, 409);
    assert.equal((await request(`/rentals/${rental.data.id}/status`, 'POST', { status: 'confirmed' }, { 'idempotency-key': crypto.randomUUID() })).res.status, 200);
    const second = await request('/rentals', 'POST', payload, { 'idempotency-key': crypto.randomUUID() });
    assert.equal((await request(`/rentals/${second.data.id}/status`, 'POST', { status: 'confirmed' }, { 'idempotency-key': crypto.randomUUID() })).res.status, 409);
    assert.equal((await request('/items/' + item.data.id, 'PATCH', { name: 'Cadeira', category: 'Mobiliário', quantity: 5, unitPrice: 500 })).res.status, 409);
    await request('/team', 'POST', { name: 'Operador', email: 'op@example.test', password: 'UmaSenhaSegura123!', role: 'operator' });
    await login('op@example.test');
    assert.equal((await request('/customers', 'POST', { name: 'Bloqueado', phone: '1' })).res.status, 403);
    assert.equal((await request(`/rentals/${rental.data.id}/status`, 'POST', { status: 'canceled', reason: 'Teste' }, { 'idempotency-key': crypto.randomUUID() })).res.status, 403);
    await login('b@example.test');
    assert.equal((await request('/items')).data.length, 0);
    assert.equal((await request(`/rentals/${rental.data.id}`)).res.status, 404);
    assert.equal((await request('/rentals', 'POST', payload, { 'idempotency-key': crypto.randomUUID() })).res.status, 404);
    await login('root@example.test');
    await request('/admin/companies/' + a.data.id, 'PATCH', { name: 'Locadora A', accent: '#acd5bd', status: 'suspended', plan: 'Piloto', userLimit: 3, itemLimit: 2 });
    await login('a@example.test');
    assert.equal((await request('/items')).res.status, 403);
    await request('/auth/logout', 'POST');
    assert.equal((await request('/auth/me')).res.status, 401);
  } finally { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); await pg.close(); }
});
