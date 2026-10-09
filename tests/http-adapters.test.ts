import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import type { IncomingMessage } from 'node:http';
import { readJson } from '../apps/api/read-json.ts';
import { vercelClientAddress } from '../apps/api/client-address.ts';

test('JSON reader supports raw HTTP and Vercel parsed bodies with the same size/content limits', async () => {
  const request = (data: string) => Object.assign(Readable.from([Buffer.from(data)]), { headers: { 'content-type': 'application/json' } }) as IncomingMessage;
  assert.deepEqual(await readJson(request('{"email":"root@example.test"}')), { email: 'root@example.test' });
  const consumed = request('');
  Object.assign(consumed, { body: { email: 'root@example.test' } });
  assert.deepEqual(await readJson(consumed), { email: 'root@example.test' });
  await assert.rejects(readJson(Object.assign(request(''), { body: { value: 'x'.repeat(65537) } })), (e: any) => e.status === 413);
  await assert.rejects(readJson(request('{broken')), (e: any) => e.status === 400);
  const unsupported = request('{}'); unsupported.headers['content-type'] = 'text/plain';
  await assert.rejects(readJson(unsupported), (e: any) => e.status === 415);
});
test('Vercel IP resolver only uses validated platform headers inside the Vercel adapter', () => {
  assert.equal(vercelClientAddress('10.0.0.1', '203.0.113.10'), '203.0.113.10');
  assert.equal(vercelClientAddress('10.0.0.1', '203.0.113.10,203.0.113.20'), '10.0.0.1');
  assert.equal(vercelClientAddress('10.0.0.1', ['203.0.113.10']), '10.0.0.1');
  assert.equal(vercelClientAddress(undefined, undefined), 'unknown');
});
