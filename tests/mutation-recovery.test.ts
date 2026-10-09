import {test} from 'node:test';import assert from 'node:assert/strict';
import {createMutationRecovery} from '../apps/web/src/mutation-recovery.ts';
const identity={userId:'a',organizationId:'org'};
test('uncertain mutation keeps exact payload and rejects duplicate new operation',()=>{
 const r=createMutationRecovery();r.setIdentity(identity);r.begin('/rentals/r/finance',{amount:100},'one');r.fail('one',500);
 assert.deepEqual(r.pending()?.body,{amount:100});assert.throws(()=>r.begin('/rentals/r/finance',{amount:100},'two'));
 assert.throws(()=>r.begin('/rentals/r/finance',{amount:101},'one'));
 r.begin('/rentals/r/finance',{amount:100},'one');r.complete('one');assert.equal(r.pending(),null);
});
test('401 and uncertain statuses preserve key through reauthentication; other identities are rejected',()=>{
 const r=createMutationRecovery();r.setIdentity(identity);r.begin('/rentals/r/returns',{lines:[]},'one');r.fail('one',401);r.setIdentity(null);
 assert.equal(r.pending()?.key,'one');r.setIdentity({userId:'b',organizationId:'org'});assert.throws(()=>r.begin('/rentals/r/returns',{lines:[]},'one'));
 r.setIdentity(identity);r.begin('/rentals/r/returns',{lines:[]},'one');r.fail('one',409);assert.equal(r.pending(),null);
});
test('persisted recovery stores references only and requires server reconciliation after reload',()=>{
 let raw:string|null=null;const storage={getItem:()=>raw,setItem:(_key:string,value:string)=>{raw=value;},removeItem:()=>{raw=null;}};
 const r=createMutationRecovery(storage);r.setIdentity(identity);r.begin('/rentals/r/finance',{amount:100,note:'Private customer note'},'one');r.fail('one');
 assert.doesNotMatch(raw!,/Private|amount|note/);
 const after=createMutationRecovery(storage);after.setIdentity(identity);assert.equal(after.pending()?.key,'one');assert.equal(after.pending()?.body,undefined);
 assert.throws(()=>after.begin('/rentals/r/finance',{amount:100},'one'));after.complete('one');assert.equal(raw,null);
});
test('missing server result never clears an uncertain operation',()=>{
 const r=createMutationRecovery();r.setIdentity(identity);r.begin('/rentals/r/finance',{amount:100},'one');r.fail('one');
 assert.throws(()=>r.confirmLookup('one',{found:false}),/confirmado/);assert.equal(r.pending()?.key,'one');
 r.confirmLookup('one',{found:true});assert.equal(r.pending(),null);
});

test('reloaded operation can reconstruct only its exact payload under the original key',async()=>{
 let raw:string|null=null;const storage={getItem:()=>raw,setItem:(_k:string,v:string)=>{raw=v;},removeItem:()=>{raw=null;}};
 const first=createMutationRecovery(storage);first.setIdentity(identity);first.begin('/rentals/r/finance',{amount:100,note:'Private'},'original');await first.seal('original');first.fail('original');assert.doesNotMatch(raw!,/Private|amount|note/);
 const loaded=createMutationRecovery(storage);loaded.setIdentity(identity);await assert.rejects(loaded.restoreBody('/rentals/r/finance',{amount:101,note:'Private'}));const formKey=loaded.keyFor('/rentals/r/finance');assert.equal(formKey,'original');assert.equal(await loaded.restoreBody('/rentals/r/finance',{amount:100,note:'Private'}),formKey);loaded.begin('/rentals/r/finance',{amount:100,note:'Private'},'original');loaded.fail(formKey);loaded.confirmLookup(formKey,{found:true});assert.equal(loaded.pending(),null);
});
