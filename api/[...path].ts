import type { IncomingMessage, ServerResponse } from 'node:http';
import { runtime } from '../apps/api/runtime.ts';

let ready: ReturnType<typeof runtime> | undefined;
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    ready ??= runtime(process.env, 'vercel').catch(error => { ready = undefined; throw error; });
    const { handler } = await ready;
    await handler(req, res);
  } catch {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Serviço indisponível. Verifique a configuração do banco.' }));
  }
}
