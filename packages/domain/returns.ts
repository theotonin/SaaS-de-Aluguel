import {DomainError} from './rental.ts';
export function applyReturn(line:{quantity:number;receivedQuantity:number;damagedQuantity:number},received:number,damaged:number){
 const values=[line.quantity,line.receivedQuantity,line.damagedQuantity,received,damaged];
 if(values.some(v=>!Number.isSafeInteger(v)||v<0)||received<1||line.receivedQuantity>line.quantity||line.damagedQuantity>line.receivedQuantity||damaged>received||line.receivedQuantity+received>line.quantity)
  throw new DomainError('Confira as quantidades: a devolução não pode exceder o material entregue e a avaria deve fazer parte do recebido.',409);
 return {receivedQuantity:line.receivedQuantity+received,damagedQuantity:line.damagedQuantity+damaged,remainingQuantity:line.quantity-line.receivedQuantity-received,reusableQuantity:received-damaged};
}
