import { spawnSync } from 'node:child_process';
const mode = process.env.TONIN_DEPLOYMENT || 'demo';
if (!['demo', 'production'].includes(mode)) throw new Error('TONIN_DEPLOYMENT deve ser demo ou production.');
const result = spawnSync('npm', ['run', mode === 'production' ? 'build' : 'build:demo'], {
  stdio: 'inherit', env: { ...process.env, VITE_DEMO: mode === 'production' ? 'false' : 'true' },
});
process.exit(result.status ?? 1);
