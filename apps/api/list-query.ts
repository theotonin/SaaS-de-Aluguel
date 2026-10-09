import { DomainError } from '../../packages/domain/rental.ts';

export type PageRequest = { page: number; limit: number; offset: number; search: string };

export function parsePage(params: URLSearchParams): PageRequest {
  const rawPage = params.get('page') ?? '1';
  const rawLimit = params.get('limit') ?? '50';
  if (!/^\d+$/.test(rawPage) || !/^\d+$/.test(rawLimit))
    throw new DomainError('Página ou quantidade inválida.', 400);
  const page = Number(rawPage), requestedLimit = Number(rawLimit);
  if (!Number.isSafeInteger(page) || page < 1 || page > 1_000_000 || !Number.isSafeInteger(requestedLimit) || requestedLimit < 1)
    throw new DomainError('Página ou quantidade inválida.', 400);
  const limit = Math.min(requestedLimit, 100);
  return { page, limit, offset: (page - 1) * limit, search: (params.get('search') ?? '').trim().replace(/\s+/g,' ').slice(0, 120) };
}

export function searchPredicate(columns: string[], parameter = '$1'): string {
  const matches = columns.map(column => `(CASE WHEN term ~ '^[0-9]+$' THEN regexp_replace(coalesce(${column},''),'[^0-9]','','g') ILIKE '%' || term || '%' ELSE loca_search_normalize(${column}) ILIKE '%' || loca_search_normalize(term) || '%' END)`).join(' OR ');
  return `NOT EXISTS (SELECT 1 FROM regexp_split_to_table(${parameter}, '\\s+') AS term WHERE term <> '' AND NOT (${matches}))`;
}

export function pageResult<T>(rows: T[], total: number, page: PageRequest) {
  return { items: rows, total, page: page.page, limit: page.limit, pages: Math.ceil(total / page.limit) };
}
