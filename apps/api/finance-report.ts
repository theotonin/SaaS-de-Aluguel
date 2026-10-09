import type { SQL } from '../../packages/database/index.ts';
import { DomainError } from '../../packages/domain/rental.ts';
import { exactMoney } from '../../packages/domain/money.ts';
export { exactMoney };

export type FinanceReport = {
  from: string; to: string; received: string; receivable: string;
  depositReceived: string; depositRefunded: string; depositMovement: string; depositHeld: string;
  expenses: string|null; operatingNet: string|null; cashNet: string|null;
};

function validDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function parseReportPeriod(params: URLSearchParams): { from: string; until: string } {
  const from = params.get('from'), to = params.get('to');
  if (!validDate(from) || !validDate(to) || from > to)
    throw new DomainError('Informe um período válido usando as datas inicial e final.', 400);
  const last = new Date(`${to}T00:00:00Z`), first = new Date(`${from}T00:00:00Z`);
  if (last.valueOf() - first.valueOf() > 365 * 86400000)
    throw new DomainError('O relatório aceita períodos de até 366 dias.', 400);
  last.setUTCDate(last.getUTCDate() + 1);
  return { from, until: last.toISOString().slice(0, 10) };
}

export async function loadFinanceReport(sql: SQL, from: string, until: string, includeExpenses: boolean): Promise<FinanceReport> {
  const row = (await sql.query<any>(`WITH ledger AS (
    SELECT
      COALESCE(sum(amount) FILTER (WHERE kind='payment'),0)-COALESCE(sum(amount) FILTER (WHERE kind='refund'),0) AS received,
      COALESCE(sum(amount) FILTER (WHERE kind='deposit_received'),0) AS deposit_received,
      COALESCE(sum(amount) FILTER (WHERE kind='deposit_refund'),0) AS deposit_refunded,
      COALESCE(sum(amount) FILTER (WHERE kind='expense'),0) AS expenses
    FROM rental_finance
    WHERE created_at AT TIME ZONE 'America/Sao_Paulo' >= $1::date
      AND created_at AT TIME ZONE 'America/Sao_Paulo' < $2::date
  ), expected AS (
    SELECT COALESCE(sum(GREATEST(0,
      (CASE WHEN r.status='canceled' THEN 0 ELSE r.total END + COALESCE(f.charges,0)-COALESCE(f.charge_reversals,0))
      - (COALESCE(f.payments,0)-COALESCE(f.refunds,0))
    )),0) AS receivable
    FROM rentals r LEFT JOIN LATERAL (
      SELECT sum(amount) FILTER(WHERE kind='charge') AS charges,
        sum(amount) FILTER(WHERE kind='charge_reversal') AS charge_reversals,
        sum(amount) FILTER(WHERE kind='payment') AS payments,
        sum(amount) FILTER(WHERE kind='refund') AS refunds
      FROM rental_finance WHERE rental_id=r.id
    ) f ON true
    WHERE r.status IN ('confirmed','separated','delivered','returned','closed')
      AND r.starts_at AT TIME ZONE 'America/Sao_Paulo' >= $1::date
      AND r.starts_at AT TIME ZONE 'America/Sao_Paulo' < $2::date
  ), deposits AS (
    SELECT COALESCE(sum(GREATEST(0,COALESCE(f.received,0)-COALESCE(f.refunded,0))),0) AS deposit_held
    FROM rentals r LEFT JOIN LATERAL (
      SELECT sum(amount) FILTER(WHERE kind='deposit_received') AS received,
        sum(amount) FILTER(WHERE kind='deposit_refund') AS refunded
      FROM rental_finance WHERE rental_id=r.id
    ) f ON true
    WHERE r.status IN ('confirmed','separated','delivered','returned','canceled')
      AND r.starts_at AT TIME ZONE 'America/Sao_Paulo' >= $1::date
      AND r.starts_at AT TIME ZONE 'America/Sao_Paulo' < $2::date
  )
  SELECT ledger.received::text, expected.receivable::text,
    ledger.deposit_received::text, ledger.deposit_refunded::text,
    (ledger.deposit_received-ledger.deposit_refunded)::text AS deposit_movement,
    deposits.deposit_held::text,
    CASE WHEN $3::boolean THEN ledger.expenses::text ELSE NULL END AS expenses,
    CASE WHEN $3::boolean THEN (ledger.received-ledger.expenses)::text ELSE NULL END AS operating_net,
    CASE WHEN $3::boolean THEN (ledger.received+ledger.deposit_received-ledger.deposit_refunded-ledger.expenses)::text ELSE NULL END AS cash_net
  FROM ledger CROSS JOIN expected CROSS JOIN deposits`, [from, until, includeExpenses])).rows[0];
  return { from, to: new Date(new Date(`${until}T00:00:00Z`).valueOf() - 86400000).toISOString().slice(0,10), received: row.received, receivable: row.receivable, depositReceived: row.deposit_received, depositRefunded: row.deposit_refunded, depositMovement: row.deposit_movement, depositHeld:row.deposit_held, expenses: row.expenses, operatingNet: row.operating_net, cashNet: row.cash_net };
}

function csvCell(value: string): string {
  const safe = /^[\t\r ]*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function reportCsv(report: FinanceReport, company = 'Empresa'): string {
  const brl = (amount: string | null) => amount === null ? 'Restrito' : exactMoney(amount);
  const lines: [string,string][] = [
    ['Empresa', company], ['Período', `${report.from} a ${report.to}`],
    ['Recebido líquido em BRL (data de lançamento)', brl(report.received)], ['A receber em BRL (data de início da reserva)', brl(report.receivable)],
    ['Cauções recebidas em BRL (movimento no período)', brl(report.depositReceived)], ['Cauções devolvidas em BRL (movimento no período)', brl(report.depositRefunded)],
    ['Variação de cauções retidas em BRL no período', brl(report.depositMovement)], ['Cauções retidas em BRL nas reservas do período', brl(report.depositHeld)], ['Despesas em BRL (data de lançamento)', brl(report.expenses)],
    ['Resultado operacional em BRL (recebido menos despesas)', brl(report.operatingNet)], ['Movimento de caixa em BRL incluindo cauções', brl(report.cashNet)],
  ];
  return lines.map(row => row.map(csvCell).join(';')).join('\r\n') + '\r\n';
}
