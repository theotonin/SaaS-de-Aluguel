import { postgres, verifyRuntime } from '../packages/database/index.ts';
import { databaseConfig } from '../packages/database/config.ts';
let db: ReturnType<typeof postgres> | undefined;
try {
  const config = databaseConfig(process.env, 'runtime');
  db = postgres(config.url, config);
  await verifyRuntime(db);
  const { rows } = await db.query('SELECT current_user AS role');
  // Permission check of auth function without accessing users or exposing hashes.
  await db.query('SELECT * FROM auth_session($1)', ['diagnostic-no-session']);
  console.log(`Conexão OK. Papel efetivo: ${rows[0].role}. RLS validado nas seis tabelas operacionais.`);
  if (process.env.DATABASE_PROVIDER === 'prisma') console.log('Modo Prisma: papel restrito por transação; a credencial do provedor continua privilegiada.');
} catch {
  console.error('Diagnóstico falhou. Confira DATABASE_PROVIDER, URLs TCP, SSL, migrations e permissão para assumir loca_runtime. Nenhuma credencial foi exibida.');
  process.exitCode = 1;
} finally { await db?.close(); }
