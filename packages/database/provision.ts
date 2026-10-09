import { z } from 'zod';
import { email, password } from '../contracts/index.ts';
import { hashPassword } from '../../apps/api/auth.ts';
import type { Database } from './index.ts';

const admin = z.object({ name: z.string().trim().min(2).max(120), email, password });
export async function createSuperadmin(db: Database, input: unknown): Promise<'created' | 'exists'> {
  const data = admin.parse(input);
  const hash = await hashPassword(data.password);
  return db.transaction(async sql => {
    await sql.query('SELECT pg_advisory_xact_lock(867432)');
    const { rows } = await sql.query('SELECT role,active FROM users WHERE email=$1', [data.email]);
    if (rows.length) {
      if (rows[0].role !== 'superadmin' || !rows[0].active) throw new Error('Este e-mail já pertence a outra conta ou a um superadmin desativado.');
      return 'exists';
    }
    await sql.query("INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,'superadmin')", [data.name, data.email, hash]);
    return 'created';
  });
}
