import type { SQL } from '../../packages/database/index.ts';
import { financeInput, type FinanceDetails, type FinanceEntry } from '../../packages/contracts/finance.ts';
import { financeSummary, assertFinanceEntry } from '../../packages/domain/payments.ts';
import { DomainError } from '../../packages/domain/rental.ts';
import { audit, type Actor } from './rentals.ts';
async function entries(sql:SQL,id:string):Promise<FinanceEntry[]> {
 const result=await sql.query('SELECT id,kind,amount,method,note,created_at FROM rental_finance WHERE rental_id=$1 ORDER BY created_at,id',[id]);
 return result.rows.map(row=>({...row,amount:Number(row.amount),created_at:new Date(row.created_at).toISOString()})) as FinanceEntry[];
}
export async function financeDetails(sql:SQL,id:string):Promise<FinanceDetails> {
 const rental=(await sql.query('SELECT total,status FROM rentals WHERE id=$1',[id])).rows[0];
 if(!rental) throw new DomainError('Reserva não encontrada.',404);
 const ledger=await entries(sql,id);
 return {entries:ledger,summary:financeSummary(rental.total,rental.status,ledger)};
}
export async function recordFinance(sql:SQL,actor:Actor,id:string,input:unknown):Promise<FinanceDetails> {
 const data=financeInput.parse(input);
 if(!['admin','attendant'].includes(actor.role) || (data.kind==='expense' && actor.role!=='admin')) throw new DomainError('Você não tem permissão para este lançamento.',403);
 const rental=(await sql.query('SELECT total,status,organization_id FROM rentals WHERE id=$1 FOR UPDATE',[id])).rows[0];
 if(!rental || rental.organization_id!==actor.organization_id) throw new DomainError('Reserva não encontrada.',404);
 const ledger=await entries(sql,id);
 assertFinanceEntry(rental.total,rental.status,ledger,data);
 await sql.query('INSERT INTO rental_finance(organization_id,rental_id,actor_id,kind,amount,method,note) VALUES($1,$2,$3,$4,$5,$6,$7)',[actor.organization_id,id,actor.id,data.kind,data.amount,data.method,data.note]);
 await audit(sql,actor,`rental.finance.${data.kind}`,id);
 return financeDetails(sql,id);
}
