type Environment = Record<string, string | undefined>;
export interface DatabaseOptions { role?: 'loca_runtime'; max?: number }

/** Accept PostgreSQL wire-protocol URLs only. Never include credentials in errors. */
export function databaseConfig(env: Environment, purpose: 'runtime' | 'admin'): DatabaseOptions & { url: string } {
  const provider = env.DATABASE_PROVIDER || 'postgres';
  if (!['postgres', 'prisma'].includes(provider)) throw new Error('DATABASE_PROVIDER deve ser postgres ou prisma.');
  const value = purpose === 'admin' ? env.DIRECT_URL || env.DATABASE_ADMIN_URL : env.DATABASE_URL;
  if (!value) throw new Error(purpose === 'admin' ? 'Defina DIRECT_URL para migrations e superadmin.' : 'Defina DATABASE_URL para a aplicação.');
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('URL do banco inválida.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('Use uma URL TCP postgres:// ou postgresql:// do painel Prisma; prisma+postgres:// (Accelerate) não é compatível com este driver.');
  if (!url.hostname || !url.username || !url.password) throw new Error('A conexão PostgreSQL precisa de host, usuário e senha.');
  const prisma = url.hostname === 'db.prisma.io' || url.hostname.endsWith('.db.prisma.io');
  if (purpose === 'admin' && url.hostname.startsWith('pooled.') && prisma) throw new Error('Use a conexão direta em DIRECT_URL para administração.');
  if (prisma || provider === 'prisma') {
    if (!['require', 'verify-full'].includes(url.searchParams.get('sslmode') || '')) throw new Error('Conexões Prisma exigem SSL: acrescente sslmode=require.');
    // Require encryption AND certificate/hostname validation in node-postgres.
    url.searchParams.set('sslmode', 'verify-full');
  }
  const max = Number(env.DB_POOL_SIZE || (provider === 'prisma' ? '3' : '10'));
  if (!Number.isInteger(max) || max < 1 || max > 20) throw new Error('DB_POOL_SIZE deve ser um inteiro entre 1 e 20.');
  return { url: url.toString(), max: purpose === 'admin' ? 1 : max, role: purpose === 'runtime' && provider === 'prisma' ? 'loca_runtime' : undefined };
}
