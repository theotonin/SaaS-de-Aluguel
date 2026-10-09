import { createServer } from 'node:http';
import { isIP } from 'node:net';
import { runtime } from './runtime.ts';
const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || '127.0.0.1';
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT inválida.');
if (!isIP(host)) throw new Error('HOST deve ser um endereço IP.');
const { db, handler } = await runtime(process.env);
const server = createServer(handler);
server.requestTimeout = 30000;
server.headersTimeout = 15000;
server.listen(port, host, () => console.log('API Tonin Loca pronta.'));
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => server.close(() => void db.close()));
