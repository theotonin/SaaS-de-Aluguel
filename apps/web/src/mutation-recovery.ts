type Identity={userId:string;organizationId:string};
export type PendingMutation={identity:Identity;path:string;key:string;body?:unknown;fingerprint?:string;inFlight:boolean};
type Storage=Pick<globalThis.Storage,'getItem'|'setItem'|'removeItem'>;
const storageKey='tonin-loca-pending-reference-v1';
export function createMutationRecovery(storage?:Storage){
 let identity:Identity|null=null,pending:PendingMutation|null=null;
 const listeners=new Set<()=>void>();
 try{const raw=storage?.getItem(storageKey);if(raw){const value=JSON.parse(raw);if(value.version===1&&typeof value.key==='string'&&typeof value.path==='string'&&typeof value.identity?.userId==='string'&&typeof value.identity?.organizationId==='string')pending={identity:value.identity,path:value.path,key:value.key,fingerprint:typeof value.fingerprint==='string'?value.fingerprint:undefined,inFlight:false};}}catch{/* Unavailable browser storage cannot hide the application. */}
 const emit=()=>{for(const fn of listeners)fn();};
 const persist=()=>{if(!storage)return;if(pending)storage.setItem(storageKey,JSON.stringify({version:1,key:pending.key,path:pending.path,identity:pending.identity,fingerprint:pending.fingerprint}));else storage.removeItem(storageKey);};
 const fingerprint=async(body:unknown)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(body))))).map(b=>b.toString(16).padStart(2,'0')).join('');
 const same=(a:Identity|null,b:Identity)=>a?.userId===b.userId&&a.organizationId===b.organizationId;
 return {
  pending:()=>pending,
  keyFor:(path:string)=>pending?.path===path?pending.key:crypto.randomUUID(),
  identityMatches:(value:Identity)=>!pending||same(value,pending.identity),
  setIdentity:(value:Identity|null)=>{identity=value;},
  subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};},
  begin(path:string,body:unknown,key:string){
   if(!identity)throw new Error('Entre novamente com a conta da operação pendente.');
   if(pending&&(!same(identity,pending.identity)||pending.key!==key||pending.path!==path||pending.body===undefined||JSON.stringify(pending.body)!==JSON.stringify(body)))throw new Error('Confira a operação pendente antes de registrar outra alteração.');
   if(pending?.inFlight)throw new Error('Aguarde o resultado do envio atual.');
   const next={identity:{...identity},path,key,body:structuredClone(body),inFlight:true};
   const before=pending;pending=next;
   try{persist();}catch{pending=before;throw new Error('Não foi possível guardar a referência da operação. Permita o armazenamento da sessão antes de enviar.');}
   emit();
  },
  async seal(key:string){if(pending?.key!==key)return;pending={...pending,fingerprint:await fingerprint(pending.body)};try{persist();}catch{this.fail(key,400);throw new Error('Não foi possível guardar a confirmação do envio.');}},
  async restoreBody(path:string,body:unknown){const op=pending;if(!op||op.path!==path||!same(identity,op.identity)||op.body!==undefined||!op.fingerprint||await fingerprint(body)!==op.fingerprint)throw new Error('Reconstitua exatamente os valores do envio anterior para conferir com a mesma chave.');if(pending!==op)throw new Error('A operação mudou durante a conferência.');pending={...op,body:structuredClone(body)};return op.key;},
  confirmLookup(key:string,result:{found:boolean}){if(!result.found)throw new Error('O envio ainda não foi confirmado. Preserve a operação e confira novamente ou reenvie a mesma chave.');this.complete(key);},
  complete(key:string){if(pending?.key!==key)return;pending=null;try{persist();}catch{/* Server already confirmed; never turn success into an uncertain mutation. */}emit();},
  fail(key:string,status?:number){if(pending?.key!==key)return;if(status&&status>=400&&status<500&&![401,408,429].includes(status)){pending=null;try{persist();}catch{}}else pending={...pending,inFlight:false};emit();},
 };
}
let storage:Storage|undefined;
try{if(typeof window!=='undefined')storage=window.sessionStorage;}catch{}
export const mutationRecovery=createMutationRecovery(storage);
export function trackedMutation(path:string,method:string){return method==='POST'&&/^\/rentals\/[^/]+\/(finance|returns|close|reopen|maintenance\/[^/]+\/release)$/.test(path);}

export const mutationKey=(path:string)=>mutationRecovery.keyFor(path);
