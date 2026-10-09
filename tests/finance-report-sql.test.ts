import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { migrate } from '../packages/database/migrate.ts';
import { tenant, type Database } from '../packages/database/index.ts';
import { loadFinanceReport } from '../apps/api/finance-report.ts';

test('finance report separates posting-date cash flows from reservation-date receivables exactly', async () => {
  const pg=new PGlite();
  const db:Database={query:(q,v)=>v?pg.query(q,v):pg.exec(q).then(r=>r.at(-1) as any),transaction:work=>pg.transaction(tx=>work({query:(q,v)=>v?tx.query(q,v):tx.exec(q).then(r=>r.at(-1) as any)})),close:()=>pg.close()};
  const org='00000000-0000-4000-8000-000000000001',actor='10000000-0000-4000-8000-000000000001',customer='20000000-0000-4000-8000-000000000001',rental='30000000-0000-4000-8000-000000000001';
  try{
    await migrate(db);
    await pg.query("INSERT INTO organizations(id,name,slug) VALUES($1,'Empresa','empresa')",[org]);
    await pg.query("INSERT INTO users(id,organization_id,name,email,password_hash,role) VALUES($2,$1,'Admin','admin@example.test','x','admin')",[org,actor]);
    await pg.query("INSERT INTO customers(id,organization_id,name,phone) VALUES($2,$1,'Cliente','1')",[org,customer]);
    await pg.query("INSERT INTO rentals(id,organization_id,customer_id,starts_at,ends_at,days,total,status) VALUES($2,$1,$3,'2026-10-01T13:00:00Z','2026-10-02T13:00:00Z',1,1000,'confirmed')",[org,rental,customer]);
    for(const [kind,amount,note,created] of [['payment',500,'Pagamento','2026-10-02T13:00:00Z'],['refund',100,'Estorno','2026-10-31T23:30:00-03:00'],['deposit_received',200,'Caução','2026-10-03T13:00:00Z'],['deposit_refund',75,'Devolução','2026-11-01T03:30:00Z'],['expense',50,'Despesa','2026-10-04T13:00:00Z'],['charge',100,'Acréscimo','2026-09-30T13:00:00Z']] as const)
      await pg.query('INSERT INTO rental_finance(organization_id,rental_id,actor_id,kind,amount,method,note,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[org,rental,actor,kind,amount,kind==='expense'?'cash':'pix',note,created]);
    const report=await tenant(db,org,sql=>loadFinanceReport(sql,'2026-10-01','2026-11-01',true));
    assert.deepEqual([report.received,report.receivable,report.depositReceived,report.depositRefunded,report.depositMovement,report.depositHeld,report.expenses,report.operatingNet,report.cashNet],['400','700','200','0','200','125','50','350','550']);
  }finally{await db.close();}
});
