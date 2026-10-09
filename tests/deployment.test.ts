import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import handler from '../api/[...path].ts';
import { runtime } from '../apps/api/runtime.ts';

test('runtime rejects invalid origins and proxy addresses before creating a database pool', async () => {
  await assert.rejects(runtime({ APP_ORIGIN: 'https://site.test/subpath' }), /apenas a origem/);
  await assert.rejects(runtime({ APP_ORIGIN: 'http://site.test', NODE_ENV: 'production' }), /HTTPS/);
  await assert.rejects(runtime({ APP_ORIGIN: 'https://site.test', TRUST_PROXY_ADDRESS: '*' }), /IP confiável/);
  await assert.rejects(runtime({ APP_ORIGIN: 'https://site.test' }), /DATABASE_URL/);
});
test('commercial serverless entry fails closed without configuration', async () => {
  const previousOrigin = process.env.APP_ORIGIN;
  delete process.env.APP_ORIGIN;
  const server = createServer(handler);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/auth/me`;
    const real = await fetch(url);
    assert.equal(real.status, 503);
    assert.equal(real.headers.get('cache-control'), 'no-store');
    assert.match((await real.json()).error, /Serviço indisponível/);
  } finally {
    if (previousOrigin === undefined) delete process.env.APP_ORIGIN; else process.env.APP_ORIGIN = previousOrigin;
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
