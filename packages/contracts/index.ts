import { z } from 'zod';

const text = (max: number) => z.string().trim().min(1).max(max);
export const email = z.email().max(254).transform(v => v.toLowerCase());
export const password = z.string().min(12, 'Use pelo menos 12 caracteres.').max(128);
export const loginInput = z.object({ email, password: z.string().min(1).max(128) });
export const companyInput = z.object({ name: text(120), slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(60), ownerName: text(120), ownerEmail: email, ownerPassword: password, plan: text(80).default('Piloto'), userLimit: z.number().int().min(1).max(1000).default(5), itemLimit: z.number().int().min(1).max(100000).default(100) });
export const brandingInput = z.object({ name: text(120), accent: z.string().regex(/^#[0-9a-fA-F]{6}$/), plan: text(80), status: z.enum(['active', 'suspended']), userLimit: z.number().int().min(1).max(1000), itemLimit: z.number().int().min(1).max(100000) });
export const memberInput = z.object({ name: text(120), email, password, role: z.enum(['admin', 'attendant', 'operator']) });
export const customerInput = z.object({ name: text(120), phone: text(40), email: z.union([email, z.literal('')]).default(''), address: z.string().trim().max(500).default('') });
export const itemInput = z.object({ name: text(160), category: text(80), quantity: z.number().int().min(0).max(100000), unitPrice: z.number().int().min(0).max(100000000), description: z.string().trim().max(2000).default('') });
export const rentalInput = z.object({ customerId: z.uuid(), start: z.iso.datetime({ offset: true }), end: z.iso.datetime({ offset: true }), delivery: z.number().int().min(0).max(100000000).default(0), discount: z.number().int().min(0).max(100000000).default(0), notes: z.string().trim().max(2000).default(''), lines: z.array(z.object({ itemId: z.uuid(), quantity: z.number().int().min(1).max(100000) })).min(1).max(100) }).refine(v => new Set(v.lines.map(l => l.itemId)).size === v.lines.length, 'Cada material deve aparecer uma única vez.');
// Physical returns and financial closing belong to the next delivery.
export const transitionInput = z.object({ status: z.enum(['sent', 'confirmed', 'separated', 'delivered', 'canceled']), reason: z.string().trim().max(500).default('') });
