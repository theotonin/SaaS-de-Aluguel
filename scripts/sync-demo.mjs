import { readdir, readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const target = join(root, 'demo');
const folders = ['apps/web', 'packages/contracts', 'packages/domain'];
async function files(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const path = join(prefix, entry.name);
    if (entry.isDirectory()) result.push(...await files(join(directory, entry.name), path));
    else if (entry.isFile()) result.push(path);
    else throw new Error(`Link não permitido na interface: ${path}`);
  }
  return result;
}
const expected = new Map();
for (const folder of folders) {
  for (const path of await files(join(root, folder))) {
    const relative = join(folder, path);
    expected.set(relative, await readFile(join(root, relative)));
  }
}
// Same UI and domain rules; this adapter has no server/network fallback.
expected.set('apps/web/src/api.ts', Buffer.from(`import { createDemo } from './demo/store';
export const isDemo = true;
export const demo = createDemo(window.localStorage);
export class RequestError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export function setCsrf(_value: string) {}
export async function request<T = any>(path: string, method = 'GET', body?: unknown, key?: string): Promise<T> {
  return demo.request(path, method, body, key);
}
`));
if (process.argv.includes('--check')) {
  for (const [path, content] of expected) {
    const actual = await readFile(join(target, path)).catch(() => null);
    if (!actual?.equals(content)) throw new Error(`Demo desatualizada: ${path}. Execute npm run demo:sync.`);
  }
  for (const folder of folders) {
    for (const path of await files(join(target, folder))) {
      if (!expected.has(join(folder, path))) throw new Error(`Arquivo extra na cópia da interface: ${join(folder, path)}`);
    }
  }
  console.log('Demo sincronizada com a interface comercial.');
} else {
  for (const folder of folders) await rm(join(target, folder), { recursive: true, force: true });
  for (const [path, content] of expected) {
    await mkdir(dirname(join(target, path)), { recursive: true });
    await writeFile(join(target, path), content);
  }
  console.log('Interface e regras sincronizadas em demo/.');
}
