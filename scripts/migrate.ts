import { postgres } from '../packages/database/index.ts';
import { databaseConfig } from '../packages/database/config.ts';
import { migrate } from '../packages/database/migrate.ts';
const config = databaseConfig(process.env, 'admin');
const db = postgres(config.url, config);
try {
  const applied = await migrate(db);
  console.log(applied.length ? `Migrations aplicadas: ${applied.join(', ')}.` : 'Banco já atualizado.');
} catch {
  console.error('Não foi possível aplicar migrations. Confira a conexão direta, o histórico e as permissões para criar tabelas, funções e o papel loca_runtime.');
  process.exitCode = 1;
} finally { await db.close(); }
