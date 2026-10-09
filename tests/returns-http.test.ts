import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {createServer} from 'node:http';
import {migrate} from '../packages/database/migrate.ts';
import {createApp} from '../apps/api/app.ts';
import {hashPassword} from '../apps/api/auth.ts';
import type {Database,SQL} from '../packages/database/index.ts';

test('HTTP physical returns, maintenance, finance and closure enforce isolation, permissions and replay',async()=>{
 const pg=new PGlite();
 const adapt=(p:Pick<PGlite,'query'|'exec'>):SQL=>({query:(q,v)=>v?p.query(q,v):p.exec(q).then(rs=>rs.at(-1) as any)});
 const owner:Database={...adapt(pg),transaction:fn=>pg.transaction(tx=>fn(adapt(tx))),close:()=>pg.close()};
 await migrate(owner);
 const hash=await hashPassword('SeguroParaTestes123!');
 const org=(await pg.query("INSERT INTO organizations(name,slug) VALUES('A','a') RETURNING id")).rows[0] as any;
 const other=(await pg.query("INSERT INTO organizations(name,slug) VALUES('B','b') RETURNING id")).rows[0] as any;
 for(const [role,email,organization] of [['admin','a@example.test',org.id],['operator','op@example.test',org.id],['attendant','att@example.test',org.id],['admin','b@example.test',other.id]]) await pg.query('INSERT INTO users(organization_id,name,email,password_hash,role) VALUES($1,$2,$3,$4,$2)',[organization,role,email,hash]);
 const db:Database={...adapt(pg),transaction:fn=>pg.transaction(async tx=>{await tx.exec('SET LOCAL ROLE loca_runtime');return fn(adapt(tx));}),close:()=>pg.close()};
 const server=createServer(createApp(db,{origin:'http://localhost:5173',production:false}));await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 let cookie='',csrf='';
 const call=async(path:string,method='GET',body?:unknown,key?:string)=>{
  const r=await fetch(`http://127.0.0.1:${(server.address() as any).port}/api${path}`,{method,headers:{origin:'http://localhost:5173',cookie,'content-type':'application/json','x-csrf-token':csrf,...(key?{'idempotency-key':key}:{})},body:body===undefined?undefined:JSON.stringify(body)});return{status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')};
 };
 const login=async(email:string)=>{const r=await call('/auth/login','POST',{email,password:'SeguroParaTestes123!'});assert.equal(r.status,200);cookie=r.cookie!.split(';')[0];csrf=r.data.csrf;};
 try{
  await login('a@example.test');
  const customer=(await call('/customers','POST',{name:'Cliente',phone:'1'})).data;
  const item=(await call('/items','POST',{name:'Mesa',category:'Acervo',quantity:10,unitPrice:100})).data;
  const start=new Date(Date.now()-3600000).toISOString(),end=new Date(Date.now()+3600000).toISOString();
  let rental=(await call('/rentals','POST',{customerId:customer.id,start,end,lines:[{itemId:item.id,quantity:10}]},crypto.randomUUID())).data;
  for(const status of ['confirmed','separated','delivered']){const r=await call(`/rentals/${rental.id}/status`,'POST',{status},crypto.randomUUID());assert.equal(r.status,200);rental=r.data;}
  const body={lines:[{itemId:item.id,receivedQuantity:6,damagedQuantity:2,note:'Duas mesas com avaria'}]},key=crypto.randomUUID();
  const first=await call(`/rentals/${rental.id}/returns`,'POST',body,key);assert.equal(first.status,200);
  const lookup=await call('/operations/'+key);assert.equal(lookup.data.found,true);assert.deepEqual(lookup.data.result,first.data);assert.equal((await call('/operations/'+crypto.randomUUID())).data.found,false);
  assert.equal(first.data.status,'delivered');assert.equal(first.data.lines[0].received_quantity,6);assert.equal(first.data.maintenance[0].remaining_quantity,2);
  const replay=await call(`/rentals/${rental.id}/returns`,'POST',body,key);assert.equal(replay.status,200);assert.deepEqual(replay.data,first.data);
  assert.equal((await call(`/rentals/${rental.id}/returns`,'POST',{lines:[{itemId:item.id,receivedQuantity:5,damagedQuantity:0}]},crypto.randomUUID())).status,409);
  const availability=await call(`/availability?start=${encodeURIComponent(new Date().toISOString())}&end=${encodeURIComponent(end)}`);assert.equal(availability.data[0].available,4);
  assert.equal((await call(`/rentals/${rental.id}/close`,'POST',{},crypto.randomUUID())).status,409);
  await login('att@example.test');assert.equal((await call('/operations/'+key)).data.found,false);assert.equal((await call(`/rentals/${rental.id}/returns`,'POST',{lines:[{itemId:item.id,receivedQuantity:4,damagedQuantity:0}]},crypto.randomUUID())).status,403);
  await login('b@example.test');assert.equal((await call(`/rentals/${rental.id}`)).status,404);assert.equal((await call(`/rentals/${rental.id}/finance`)).status,404);
  assert.equal((await call(`/rentals/${rental.id}/returns`,'POST',body,crypto.randomUUID())).status,404);
  await login('op@example.test');
  assert.equal((await call(`/rentals/${rental.id}/finance`)).status,403);
  const complete=await call(`/rentals/${rental.id}/returns`,'POST',{lines:[{itemId:item.id,receivedQuantity:4,damagedQuantity:0}]},crypto.randomUUID());assert.equal(complete.status,200);assert.equal(complete.data.status,'returned');
  const job=first.data.maintenance[0];
  assert.equal((await call(`/rentals/${rental.id}/maintenance/${job.id}/release`,'POST',{quantity:3,note:'Conferida'},crypto.randomUUID())).status,409);
  const release=await call(`/rentals/${rental.id}/maintenance/${job.id}/release`,'POST',{quantity:1,note:'Uma mesa reparada'},crypto.randomUUID());assert.equal(release.status,200);assert.equal(release.data.maintenance[0].remaining_quantity,1);
  await login('a@example.test');
  assert.equal((await call(`/rentals/${rental.id}/close`,'POST',{},crypto.randomUUID())).status,409);
  const payment=await call(`/rentals/${rental.id}/finance`,'POST',{kind:'payment',amount:Number(rental.total),method:'pix',note:'Conferido manualmente'},crypto.randomUUID());assert.equal(payment.status,200);assert.equal(payment.data.summary.balance,0);
  const deposit=await call(`/rentals/${rental.id}/finance`,'POST',{kind:'deposit_received',amount:100,method:'cash',note:'Caução'},crypto.randomUUID());assert.equal(deposit.status,200);assert.equal(deposit.data.summary.depositHeld,100);
  assert.equal((await call(`/rentals/${rental.id}/close`,'POST',{},crypto.randomUUID())).status,409);
  assert.equal((await call(`/rentals/${rental.id}/finance`,'POST',{kind:'deposit_refund',amount:100,method:'cash',note:'Caução devolvida'},crypto.randomUUID())).status,200);
  const closed=await call(`/rentals/${rental.id}/close`,'POST',{},crypto.randomUUID());assert.equal(closed.status,200);assert.equal(closed.data.status,'closed');
  assert.equal((await call(`/rentals/${rental.id}/finance`,'POST',{kind:'expense',amount:100,method:'cash',note:'Despesa tardia'},crypto.randomUUID())).status,409);
  const reopen=await call(`/rentals/${rental.id}/reopen`,'POST',{reason:'Conferir lançamento'},crypto.randomUUID());assert.equal(reopen.status,200);assert.equal(reopen.data.status,'returned');
  assert.equal((await pg.query('SELECT * FROM rental_returns')).rows.length,2);
  assert.equal((await pg.query('SELECT * FROM maintenance_releases')).rows.length,1);
 } finally {await new Promise<void>(r=>server.close(()=>r()));await pg.close();}
});
