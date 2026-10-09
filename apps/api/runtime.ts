import { isIP } from 'node:net';
import { postgres, verifyRuntime } from '../../packages/database/index.ts';
import { databaseConfig } from '../../packages/database/config.ts';
import { createApp } from './app.ts';
import { vercelClientAddress } from './client-address.ts';

export async function runtime(env: Record<string, string | undefined>, platform?: 'vercel') {
  if (!env.APP_ORIGIN) throw new Error('Defina APP_ORIGIN.');
  let url: URL;
  try { url = new URL(env.APP_ORIGIN); } catch { throw new Error('APP_ORIGIN inválida.'); }
  const production = env.NODE_ENV === 'production';
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash)
    throw new Error('APP_ORIGIN deve conter apenas a origem, como https://loca.exemplo.com.');
  if (production && url.protocol !== 'https:') throw new Error('APP_ORIGIN de produção deve usar HTTPS.');
  const trustedProxy = env.TRUST_PROXY_ADDRESS || undefined;
  if (trustedProxy && !isIP(trustedProxy)) throw new Error('TRUST_PROXY_ADDRESS deve ser um único IP confiável.');
  if (production && (!env.LOGIN_RATE_LIMIT_SECRET || Buffer.byteLength(env.LOGIN_RATE_LIMIT_SECRET) < 32))
    throw new Error('Defina LOGIN_RATE_LIMIT_SECRET com pelo menos 32 bytes aleatórios.');
  const config = databaseConfig(env, 'runtime');
  const db = postgres(config.url, config);
  try {
    await verifyRuntime(db);
    return { db, handler: createApp(db, { origin: url.origin, production, trustedProxy,
      clientIp: platform === 'vercel' ? req => vercelClientAddress(req.socket.remoteAddress, req.headers['x-vercel-forwarded-for']) : undefined,
      loginLimitSecret: env.LOGIN_RATE_LIMIT_SECRET || 'loca-development-only-login-throttle-secret',
    }) };
  } catch (error) { await db.close(); throw error; }
}
