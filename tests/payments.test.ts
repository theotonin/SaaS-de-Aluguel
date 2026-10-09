import test from 'node:test';
import assert from 'node:assert/strict';
import { financeInput, type FinanceEntry } from '../packages/contracts/finance.ts';
import { financeSummary, assertFinanceEntry } from '../packages/domain/payments.ts';
const entry = (kind: FinanceEntry['kind'], amount: number): FinanceEntry => ({id:crypto.randomUUID(),kind,amount,method:'pix',note:'Registro',created_at:new Date().toISOString()});
const input = (kind: FinanceEntry['kind'], amount:number) => ({kind,amount,method:'pix' as const,note:'Registro'});
test('ledger keeps deposits and expenses separate from customer receivable',()=>{
 assert.deepEqual(financeSummary('10000','returned',[entry('payment',12000),entry('refund',1000),entry('deposit_received',3000),entry('deposit_refund',500),entry('expense',400),entry('charge',2000),entry('charge_reversal',1000)]),{charged:11000,paid:11000,balance:0,credit:0,depositHeld:2500,expenses:400});
 assert.equal(financeSummary(10000,'canceled',[entry('payment',12000),entry('charge',1000)]).credit,12000);
});
test('refund, deposit return and charge reversal cannot exceed remaining ledger amounts',()=>{
 const entries=[entry('payment',1000),entry('refund',500),entry('deposit_received',1000),entry('deposit_refund',500),entry('charge',1000),entry('charge_reversal',500)];
 for(const kind of ['refund','deposit_refund','charge_reversal'] as const){assert.doesNotThrow(()=>assertFinanceEntry(10000,'returned',entries,input(kind,500)));assert.throws(()=>assertFinanceEntry(10000,'returned',entries,input(kind,501)));}
});
test('closed finance is immutable and canceled rentals reject new charges',()=>{
 assert.throws(()=>assertFinanceEntry(10000,'closed',[],input('payment',100)));
 assert.throws(()=>assertFinanceEntry(10000,'canceled',[],input('charge',100)));
 assert.doesNotThrow(()=>assertFinanceEntry(10000,'canceled',[entry('payment',100)],input('refund',100)));
});
test('finance contract is strict and requires integer cents and a reason',()=>{
 assert.equal(financeInput.parse({...input('payment',100),note:'  recebido  '}).note,'recebido');
 for(const change of [{amount:0},{amount:0.5},{amount:100000001},{note:' '},{note:'x'.repeat(501)},{method:'crypto'},{unexpected:true}]) assert.equal(financeInput.safeParse({...input('payment',100),...change}).success,false);
});
test('summary refuses unsafe numeric totals and sums',()=>{
 assert.throws(()=>financeSummary('9007199254740993','returned',[]));
 assert.throws(()=>financeSummary(Number.MAX_SAFE_INTEGER,'returned',[entry('charge',1)]));
});
