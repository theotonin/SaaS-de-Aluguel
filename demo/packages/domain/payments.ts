import { financeInput, type FinanceEntry, type FinanceInput, type FinanceSummary } from '../contracts/finance.ts';
import { DomainError } from './rental.ts';
function safe(value:number):number {
 if(!Number.isSafeInteger(value)||value<0) throw new DomainError('Os valores financeiros excedem o limite permitido.');
 return value;
}
function sum(entries:FinanceEntry[], kind:FinanceInput['kind']):number {
 return entries.filter(e=>e.kind===kind).reduce((n,e)=>safe(n+safe(e.amount)),0);
}
export function financeSummary(total:number|string,status:string,entries:FinanceEntry[]):FinanceSummary {
 const base=safe(Number(total));
 const charged=status==='canceled'?0:safe(safe(base+sum(entries,'charge'))-sum(entries,'charge_reversal'));
 const paid=safe(sum(entries,'payment')-sum(entries,'refund'));
 return {charged,paid,balance:Math.max(0,charged-paid),credit:Math.max(0,paid-charged),depositHeld:safe(sum(entries,'deposit_received')-sum(entries,'deposit_refund')),expenses:sum(entries,'expense')};
}
export function assertFinanceEntry(total:number|string,status:string,entries:FinanceEntry[],input:FinanceInput):void {
 const data=financeInput.parse(input);
 if(status==='closed') throw new DomainError('A reserva encerrada não aceita novos lançamentos.',409);
 if(status==='canceled' && data.kind==='charge') throw new DomainError('A reserva cancelada não aceita novas cobranças.',409);
 const summary=financeSummary(total,status,entries);
 if(data.kind==='refund' && data.amount>summary.paid) throw new DomainError('O estorno não pode exceder o pagamento recebido.',409);
 if(data.kind==='deposit_refund' && data.amount>summary.depositHeld) throw new DomainError('A devolução não pode exceder a caução retida.',409);
 if(data.kind==='charge_reversal' && data.amount>sum(entries,'charge')-sum(entries,'charge_reversal')) throw new DomainError('A reversão não pode exceder as cobranças adicionais.',409);
 financeSummary(total,status,[...entries,{...data,id:'validation',created_at:''}]);
}
