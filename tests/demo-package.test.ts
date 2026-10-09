import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

test('demo is standalone, static and synchronized with the commercial interface', async () => {
  const root = new URL('../', import.meta.url);
  const pkg = JSON.parse(await readFile(new URL('demo/package.json', root), 'utf8'));
  assert.equal(pkg.dependencies.pg, undefined);
  assert.equal(pkg.dependencies.tsx, undefined);
  assert.equal(pkg.scripts.start, undefined);
  await assert.rejects(access(new URL('demo/api', root)));
  await assert.rejects(access(new URL('demo/packages/database', root)));
  const adapter = await readFile(new URL('demo/apps/web/src/api.ts', root), 'utf8');
  assert.match(adapter, /isDemo = true/);
  assert.doesNotMatch(adapter, /fetch\(|VITE_DEMO|DATABASE_URL/);
  execFileSync(process.execPath, ['scripts/sync-demo.mjs', '--check'], { cwd: root, stdio: 'pipe' });
});
