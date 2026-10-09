import { postgres } from '../packages/database/index.ts';
import { databaseConfig } from '../packages/database/config.ts';
import { createSuperadmin } from '../packages/database/provision.ts';
const config = databaseConfig(process.env, 'admin');
const db = postgres(config.url, config);
try {
  const result = await createSuperadmin(db, { name: process.env.ADMIN_NAME || 'Superadmin Tonin', email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });
  console.log(result === 'created' ? 'Superadmin criado. Remova ADMIN_PASSWORD do ambiente.' : 'Superadmin já existe; senha e dados preservados.');
} catch {
  console.error('Falha ao provisionar superadmin. Confira migrations, ADMIN_NAME, ADMIN_EMAIL e ADMIN_PASSWORD (mínimo de 12 caracteres); o e-mail não pode pertencer a outra conta.');
  process.exitCode = 1;
} finally { await db.close(); }
