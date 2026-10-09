import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { recordFinance, financeDetails } from '../apps/api/payments.ts';
import type { SQL } from '../packages/database/index.ts';
test('financial ledger enforces tenancy, append-only grants, limits, and audit',async()=>{
 const db=new PGlite();
 try{
  await db.exec(await readFile(new URL('../packages/database/schema.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../packages/database/migrations/004-rental-finance.sql',import.meta.url),'utf8'));
  const org=(await db.query<{id:string}>("INSERT INTO organizations(name,slug) VALUES('One','one') RETURNING id")).rows[0].id;
  const other=(await db.query<{id:string}>("INSERT INTO organizations(name,slug) VALUES('Two','two') RETURNING id")).rows[0].id;
  const actor=(await db.query<{id:string}>("INSERT INTO users(organization_id,name,email,password_hash,role) VALUES($1,'Admin','test@example.test','unused','admin') RETURNING id",[org])).rows[0].id;
  const customer=(await db.query<{id:string}>("INSERT INTO customers(organization_id,name,phone) VALUES($1,'Client','123') RETURNING id",[org])).rows[0].id;
  const rental=(await db.query<{id:string}>("INSERT INTO rentals(organization_id,customer_id,starts_at,ends_at,days,total) VALUES($1,$2,now(),now()+interval '1 day',1,1000) RETURNING id",[org,customer])).rows[0].id;
  await db.exec('SET ROLE loca_runtime');
  await db.query("SELECT set_config('app.organization_id',$1,false)",[org]);
  const sql={query:async(text:string,values?:unknown[])=>db.query(text,values)} as unknown as SQL;
  const person={id:actor,organization_id:org,role:'admin'};
  const payment={kind:'payment',amount:1500,method:'pix',note:'Recebido'};
  const details=await recordFinance(sql,person,rental,payment);
  assert.equal(details.summary.credit,500);
  assert.equal(details.entries[0].amount,1500);
  assert.equal((await db.query<{count:string}>('SELECT count(*) FROM audit_log')).rows[0].count,1);
  await assert.rejects(recordFinance(sql,person,rental,{...payment,kind:'refund',amount:1501}),/exceder/);
  await assert.rejects(recordFinance(sql,{...person,role:'attendant'},rental,{...payment,kind:'expense'}),/permissão/);
  await assert.rejects(db.query('UPDATE rental_finance SET amount=1'),/permission denied/);
  await assert.rejects(db.query('DELETE FROM rental_finance'),/permission denied/);
  await db.query("SELECT set_config('app.organization_id',$1,false)",[other]);
  assert.equal((await db.query('SELECT * FROM rental_finance')).rows.length,0);
  await assert.rejects(financeDetails(sql,rental),/não encontrada/);
  await assert.rejects(db.query('INSERT INTO rental_finance(organization_id,rental_id,actor_id,kind,amount,method,note) VALUES($1,$2,$3,\'payment\',1,\'pix\',\'test\')',[org,rental,actor]),/row-level security/);
 }finally{await db.close();}
});
