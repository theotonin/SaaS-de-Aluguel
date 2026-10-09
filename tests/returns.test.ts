import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyReturn} from '../packages/domain/returns.ts';
import {availableQuantity} from '../packages/domain/rental.ts';

test('partial return frees only reusable materials and preserves unreturned units',()=>{
 assert.deepEqual(applyReturn({quantity:10,receivedQuantity:0,damagedQuantity:0},6,2),{receivedQuantity:6,damagedQuantity:2,remainingQuantity:4,reusableQuantity:4});
 assert.deepEqual(applyReturn({quantity:10,receivedQuantity:6,damagedQuantity:2},4,0),{receivedQuantity:10,damagedQuantity:2,remainingQuantity:0,reusableQuantity:4});
});
test('returns reject excessive, fractional and inconsistent quantities',()=>{
 for(const [received,damaged] of [[11,0],[1,2],[1.5,0],[0,0],[-1,0],[1,-1]])assert.throws(()=>applyReturn({quantity:10,receivedQuantity:0,damagedQuantity:0},received,damaged));
 assert.throws(()=>applyReturn({quantity:10,receivedQuantity:6,damagedQuantity:2},5,0));
});
test('availability keeps the occupied quantity until the actual return instant',()=>{
 const start='2030-01-01T10:00:00Z',end='2030-01-02T10:00:00Z',at='2030-01-01T15:00:00Z';
 const occupations=[{start,end,status:'delivered',quantity:10,returns:[{at,quantity:6}]}];
 assert.equal(availableQuantity(8,'2030-01-01T16:00:00Z','2030-01-01T17:00:00Z',occupations,at),4);
 assert.equal(availableQuantity(10,'2030-01-01T11:00:00Z','2030-01-01T12:00:00Z',occupations,at),0);
 assert.equal(availableQuantity(8,'2030-01-02T11:00:00Z','2030-01-02T12:00:00Z',occupations,'2030-01-02T11:00:00Z'),4);
 const complete=[{...occupations[0],status:'returned',returns:[{at,quantity:10}]}];
 assert.equal(availableQuantity(10,'2030-01-01T16:00:00Z','2030-01-01T17:00:00Z',complete,at),10);
 assert.equal(availableQuantity(10,'2030-01-01T11:00:00Z','2030-01-01T12:00:00Z',complete,at),0);
});
test('delivery evaluates remaining interval without double counting past damaged returns',async()=>{
 const {capacityWindowStart}=await import('../packages/domain/rental.ts');
 const start='2030-01-01T09:00:00Z',end='2030-01-01T18:00:00Z',now='2030-01-01T13:00:00Z';
 const previous=[{start,end,status:'returned',quantity:5,returns:[{at:'2030-01-01T12:00:00Z',quantity:5}]}];
 assert.equal(capacityWindowStart('delivered',start,now),now);
 assert.equal(capacityWindowStart('confirmed',start,now),start);
 assert.equal(availableQuantity(5,capacityWindowStart('delivered',start,now),end,previous,now),5);
});
