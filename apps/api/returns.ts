import type {SQL} from '../../packages/database/index.ts';
import {returnInput,maintenanceInput,closeInput,reopenInput} from '../../packages/contracts/returns.ts';
import {applyReturn} from '../../packages/domain/returns.ts';
import {DomainError} from '../../packages/domain/rental.ts';
import {audit,rentalDetails,type Actor} from './rentals.ts';
import {financeDetails} from './payments.ts';

async function lockRental(sql:SQL,actor:Actor,id:string){
 const r=(await sql.query('SELECT * FROM rentals WHERE id=$1 FOR UPDATE',[id])).rows[0];
 if(!r||r.organization_id!==actor.organization_id)throw new DomainError('Reserva não encontrada.',404);
 return r;
}
function operational(actor:Actor){if(!['admin','operator'].includes(actor.role))throw new DomainError('A conferência exige administrador ou operador.',403);}
export async function recordReturn(sql:SQL,actor:Actor,id:string,input:unknown){
 operational(actor);const data=returnInput.parse(input);const rental=await lockRental(sql,actor,id);
 if(rental.status!=='delivered')throw new DomainError('Somente uma reserva entregue com materiais pendentes pode receber devolução.',409);
 const lines=(await sql.query(`SELECT l.*,coalesce((SELECT sum(x.received_quantity) FROM rental_return_lines x WHERE x.rental_id=l.rental_id AND x.item_id=l.item_id),0)::int AS received_quantity,
 coalesce((SELECT sum(x.damaged_quantity) FROM rental_return_lines x WHERE x.rental_id=l.rental_id AND x.item_id=l.item_id),0)::int AS damaged_quantity FROM rental_lines l WHERE l.rental_id=$1 ORDER BY l.item_id`,[id])).rows;
 await sql.query('SELECT id FROM items WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',[data.lines.map(l=>l.itemId)]);
 for(const part of data.lines){
  const line=lines.find(l=>l.item_id===part.itemId);if(!line)throw new DomainError('Material não encontrado nesta reserva.',404);
  applyReturn({quantity:line.quantity,receivedQuantity:line.received_quantity,damagedQuantity:line.damaged_quantity},part.receivedQuantity,part.damagedQuantity);
 }
 const event=(await sql.query('INSERT INTO rental_returns(organization_id,rental_id,actor_id) VALUES($1,$2,$3) RETURNING id',[actor.organization_id,id,actor.id])).rows[0];
 for(const part of data.lines){
  const result=(await sql.query('INSERT INTO rental_return_lines(organization_id,return_id,rental_id,item_id,received_quantity,damaged_quantity,note) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[actor.organization_id,event.id,id,part.itemId,part.receivedQuantity,part.damagedQuantity,part.note])).rows[0];
  if(part.damagedQuantity)await sql.query('INSERT INTO item_maintenance(organization_id,return_line_id,rental_id,item_id,quantity,remaining_quantity,note) VALUES($1,$2,$3,$4,$5,$5,$6)',[actor.organization_id,result.id,id,part.itemId,part.damagedQuantity,part.note]);
 }
 const details=await rentalDetails(sql,id);
 if(details.lines.every((l:any)=>l.received_quantity===l.quantity))await sql.query("UPDATE rentals SET status='returned' WHERE id=$1",[id]);
 await audit(sql,actor,'rental.returned.partial',event.id);
 return rentalDetails(sql,id);
}
export async function releaseMaintenance(sql:SQL,actor:Actor,id:string,jobId:string,input:unknown){
 operational(actor);const data=maintenanceInput.parse(input);await lockRental(sql,actor,id);
 const job=(await sql.query('SELECT * FROM item_maintenance WHERE id=$1 AND rental_id=$2',[jobId,id])).rows[0];
 if(!job)throw new DomainError('Registro de manutenção não encontrado.',404);
 await sql.query('SELECT id FROM items WHERE id=$1 FOR UPDATE',[job.item_id]);
 const current=(await sql.query('SELECT * FROM item_maintenance WHERE id=$1 FOR UPDATE',[jobId])).rows[0];
 if(data.quantity>current.remaining_quantity)throw new DomainError('A liberação não pode exceder a quantidade em manutenção.',409);
 await sql.query('INSERT INTO maintenance_releases(organization_id,maintenance_id,actor_id,quantity,note) VALUES($1,$2,$3,$4,$5)',[actor.organization_id,jobId,actor.id,data.quantity,data.note]);
 await sql.query('UPDATE item_maintenance SET remaining_quantity=remaining_quantity-$1 WHERE id=$2',[data.quantity,jobId]);
 await audit(sql,actor,'maintenance.released',jobId);
 return rentalDetails(sql,id);
}
export async function closeRental(sql:SQL,actor:Actor,id:string,input:unknown){
 if(!['admin','attendant'].includes(actor.role))throw new DomainError('Encerramento exige acesso comercial.',403);
 closeInput.parse(input);const rental=await lockRental(sql,actor,id);
 if(rental.status!=='returned')throw new DomainError('Conclua a devolução de todos os materiais antes de encerrar.',409);
 const {summary}=await financeDetails(sql,id);
 if(summary.balance||summary.credit||summary.depositHeld)throw new DomainError('Confira o saldo, o crédito do cliente e a caução antes de encerrar.',409);
 await sql.query("UPDATE rentals SET status='closed' WHERE id=$1",[id]);await audit(sql,actor,'rental.closed',id);return rentalDetails(sql,id);
}
export async function reopenRental(sql:SQL,actor:Actor,id:string,input:unknown){
 if(actor.role!=='admin')throw new DomainError('Reabertura exige administrador.',403);
 const {reason}=reopenInput.parse(input);const rental=await lockRental(sql,actor,id);
 if(rental.status!=='closed')throw new DomainError('Somente uma reserva encerrada pode ser reaberta.',409);
 await sql.query("UPDATE rentals SET status='returned' WHERE id=$1",[id]);
 await sql.query('INSERT INTO rental_reopenings(organization_id,rental_id,actor_id,reason) VALUES($1,$2,$3,$4)',[actor.organization_id,id,actor.id,reason]);
 await audit(sql,actor,'rental.reopened',id);return rentalDetails(sql,id);
}
