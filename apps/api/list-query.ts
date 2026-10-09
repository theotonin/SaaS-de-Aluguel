import { DomainError } from '../../packages/domain/rental.ts';

export type PageCursor = { sort: 'name' | 'rental'; key: string; id: string };
export type PageRequest = { page: number; limit: number; offset: number; search: string; cursor: PageCursor | null };

export function encodeCursor(sort: PageCursor['sort'], key: string | Date, id: string): string {
  const value = key instanceof Date ? key.toISOString() : key;
  return Buffer.from(JSON.stringify({ v: 1, sort, key: value, id })).toString('base64url');
}

function decodeCursor(raw: string | null): PageCursor | null {
  if (!raw) return null;
  if (raw.length > 512 || !/^[A-Za-z0-9_-]+$/.test(raw)) throw new DomainError('Cursor inválido.', 400);
  let value: unknown;
  try { value = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')); }
  catch { throw new DomainError('Cursor inválido.', 400); }
  if (!value || typeof value !== 'object') throw new DomainError('Cursor inválido.', 400);
  const cursor = value as Record<string, unknown>;
  if (cursor.v !== 1 || !['name','rental'].includes(String(cursor.sort)) || typeof cursor.key !== 'string' || cursor.key.length > 200 || typeof cursor.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cursor.id))
    throw new DomainError('Cursor inválido.', 400);
  if (cursor.sort === 'rental' && Number.isNaN(Date.parse(cursor.key))) throw new DomainError('Cursor inválido.', 400);
  return { sort: cursor.sort as PageCursor['sort'], key: cursor.key, id: cursor.id };
}

export function parsePage(params: URLSearchParams): PageRequest {
  const rawPage = params.get('page') ?? '1';
  const rawLimit = params.get('limit') ?? '50';
  if (!/^\d+$/.test(rawPage) || !/^\d+$/.test(rawLimit))
    throw new DomainError('Página ou quantidade inválida.', 400);
  const page = Number(rawPage), requestedLimit = Number(rawLimit);
  if (!Number.isSafeInteger(page) || page < 1 || page > 1_000_000 || !Number.isSafeInteger(requestedLimit) || requestedLimit < 1)
    throw new DomainError('Página ou quantidade inválida.', 400);
  const limit = Math.min(requestedLimit, 100);
  return { page, limit, offset: (page - 1) * limit, search: (params.get('search') ?? '').trim().replace(/\s+/g,' ').slice(0, 120), cursor: decodeCursor(params.get('cursor')) };
}

export function searchPredicate(columns: string[], parameter = '$1'): string {
  const matches = columns.map(column => `(CASE WHEN term ~ '[0-9]' AND term !~ '[[:alpha:]]' THEN regexp_replace(coalesce(${column},''),'[^0-9]','','g') ILIKE '%' || regexp_replace(term,'[^0-9]','','g') || '%' ELSE loca_search_normalize(${column}) ILIKE '%' || loca_search_normalize(term) || '%' END)`).join(' OR ');
  return `NOT EXISTS (SELECT 1 FROM regexp_split_to_table(${parameter}, '\\s+') AS term WHERE term <> '' AND NOT (${matches}))`;
}

export function pageResult<T extends { __cursorKey?: string | Date; id?: string }>(rows: T[], total: number, page: PageRequest, sort: PageCursor['sort']) {
  const hasMore = rows.length > page.limit;
  const items = rows.slice(0, page.limit);
  const last = items.at(-1);
  const nextCursor = hasMore && last?.__cursorKey !== undefined && typeof last.id === 'string'
    ? encodeCursor(sort, last.__cursorKey, last.id)
    : null;
  return { items: items.map(({__cursorKey: _ignored, ...row}) => row), total, page: page.page, limit: page.limit, pages: Math.ceil(total / page.limit), hasMore, nextCursor };
}
