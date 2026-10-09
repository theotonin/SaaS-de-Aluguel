import { test } from 'node:test';
import assert from 'node:assert/strict';
import { databaseConfig } from '../packages/database/config.ts';

const pooled = 'postgres://user:secret@pooled.db.prisma.io:5432/postgres?sslmode=require';
const direct = 'postgres://user:secret@db.prisma.io:5432/postgres?sslmode=require';
test('Prisma uses pooled traffic, direct administration and transaction scoped runtime role', () => {
  const env = { DATABASE_PROVIDER: 'prisma', DATABASE_URL: pooled, DIRECT_URL: direct };
  const runtime = databaseConfig(env, 'runtime');
  assert.equal(new URL(runtime.url).hostname, 'pooled.db.prisma.io');
  assert.equal(runtime.role, 'loca_runtime');
  assert.equal(new URL(runtime.url).searchParams.get('sslmode'), 'verify-full');
  assert.equal(databaseConfig(env, 'admin').role, undefined);
  assert.equal(new URL(databaseConfig(env, 'admin').url).hostname, 'db.prisma.io');
});
test('configuration rejects Accelerate URLs, insecure Prisma traffic, pooled migrations and invalid pool sizes without exposing secrets', () => {
  for (const env of [
    { DATABASE_URL: 'prisma+postgres://accelerate.prisma-data.net/?api_key=PRIVATE' },
    { DATABASE_PROVIDER: 'prisma', DATABASE_URL: pooled.replace('?sslmode=require', '') },
    { DATABASE_URL: pooled, DB_POOL_SIZE: '0' },
    { DATABASE_URL: pooled, DB_POOL_SIZE: '1;DROP TABLE users' },
    { DATABASE_URL: pooled, DATABASE_PROVIDER: 'unknown' },
  ]) assert.throws(() => databaseConfig(env, 'runtime'), (e: Error) => !e.message.includes('PRIVATE') && !e.message.includes('secret'));
  assert.throws(() => databaseConfig({ DATABASE_PROVIDER: 'prisma', DIRECT_URL: pooled }, 'admin'), /direta/);
});
test('conventional PostgreSQL keeps restricted login and legacy admin URL support', () => {
  const env = { DATABASE_URL: 'postgres://loca_runtime:secret@localhost/loca', DATABASE_ADMIN_URL: 'postgres://owner:secret@localhost/loca' };
  assert.equal(databaseConfig(env, 'runtime').role, undefined);
  assert.equal(databaseConfig(env, 'admin').url, env.DATABASE_ADMIN_URL);
});
