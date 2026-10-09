import { useEffect, useState } from 'react';
import {mutationKey} from '../mutation-recovery';
import { request } from '../api';
import { Field, TextField, money, date } from '../components';
import type { Rental, User } from '../types';
import { financeInput, type FinanceDetails, type FinanceInput } from '../../../../packages/contracts/finance.ts';
const kinds:Record<FinanceInput['kind'],string>={payment:'Pagamento recebido',refund:'Estorno de pagamento',deposit_received:'Caução recebida',deposit_refund:'Devolução de caução',expense:'Despesa da locadora',charge:'Cobrança adicional',charge_reversal:'Reversão de cobrança adicional'};
const methods:Record<FinanceInput['method'],string>={cash:'Dinheiro',pix:'Pix',card:'Cartão',transfer:'Transferência',other:'Outro'};
type Operation={key:string;input:FinanceInput};
export function FinancePanel({rental,user,changed,onOperationLock}:{rental:Rental;user:User;changed:(r:Rental)=>void;onOperationLock?:(locked:boolean)=>void}) {
 const [details,setDetails]=useState<FinanceDetails|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [operation,setOperation]=useState<Operation|null>(null);
 const [kind,setKind]=useState<FinanceInput['kind']>(operation?.input.kind??'payment'),[amount,setAmount]=useState(operation?String(operation.input.amount/100):''),[method,setMethod]=useState<FinanceInput['method']>(operation?.input.method??'pix'),[note,setNote]=useState(operation?.input.note??'');
 const commercial=['admin','attendant'].includes(user.role);
 useEffect(()=>{onOperationLock?.(Boolean(operation)||busy);},[operation,busy,onOperationLock]);
 useEffect(()=>{
  if(!operation)return;
  const key=operation.key;
  function resolved(event:Event){
   if((event as CustomEvent<{key:string}>).detail?.key!==key)return;
   setOperation(null);
   request<FinanceDetails>('/rentals/'+rental.id+'/finance').then(setDetails).catch(()=>setError('Lançamento confirmado. Atualize o financeiro para conferir o histórico.'));
  }
  window.addEventListener('mutation-resolved',resolved);
  return()=>window.removeEventListener('mutation-resolved',resolved);
 },[operation?.key,rental.id]);

 useEffect(()=>{if(!commercial)return;let active=true;setDetails(null);request<FinanceDetails>('/rentals/'+rental.id+'/finance').then(data=>{if(active)setDetails(data);}).catch(e=>{if(active)setError((e as Error).message);});return()=>{active=false;};},[rental.id,rental.status,commercial]);
 async function load(){setBusy(true);setError('');try{setDetails(await request('/rentals/'+rental.id+'/finance'));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 function clearOperation(){setOperation(null);}
 async function submit(){
  if(busy)return;
  setError('');let op=operation;
  if(!op){
   const normalized=amount.trim().replace(',','.');
   if(!/^\d+(\.\d{1,2})?$/.test(normalized)){setError('Informe um valor positivo com até duas casas decimais.');return;}
   const parsed=financeInput.safeParse({kind,amount:Math.round(Number(normalized)*100),method,note});
   if(!parsed.success){setError('Confira o valor e informe uma descrição de até 500 caracteres.');return;}
   op={key:mutationKey('/rentals/'+rental.id+'/finance'),input:parsed.data};
   setOperation(op);
  }
  setBusy(true);
  try{
   const result=await request<FinanceDetails>('/rentals/'+rental.id+'/finance','POST',op.input,op.key);
   setDetails(result);clearOperation();setAmount('');setNote('');
   try{changed(await request('/rentals/'+rental.id));}catch{setError('Lançamento registrado. Atualize a reserva para conferir sua etapa.');}
  }catch(e){
   setError((e as Error).message);
   const status=(e as {status?:number}).status;
   if(status && status>=400 && status<500 && status!==401 && status!==408 && status!==429)clearOperation();
  }finally{setBusy(false);}
 }
 if(!commercial)return null;
 const locked=busy||Boolean(operation);
 return <section className="panel finance-panel" aria-label="Financeiro da reserva">
  <div className="panel-heading"><div><h2>Financeiro da reserva</h2><p>Registre valores recebidos e devolvidos. Este registro não substitui documentos fiscais.</p></div><button className="secondary" disabled={busy} onClick={()=>void load()}>Atualizar</button></div>
  {error&&<p className="error" role="alert">{error}</p>}
  {!details?<p role="status">{error?'Não foi possível carregar o financeiro. Use Atualizar para tentar novamente.':'Carregando financeiro…'}</p>:<>
   <div className="document-meta">{([['Cobrado',details.summary.charged],['Recebido líquido',details.summary.paid],['Saldo a receber',details.summary.balance],['Crédito do cliente',details.summary.credit],['Caução retida',details.summary.depositHeld],['Despesas',details.summary.expenses]] as const).map(([label,value])=><div key={label}><span>{label}</span><strong>{money(value)}</strong></div>)}</div>
   <p className="footnote">Caução e despesas são registradas separadamente do pagamento da locação.</p>
   <div className="table-wrap"><table><thead><tr><th>Data</th><th>Lançamento</th><th>Valor</th><th>Forma</th><th>Descrição</th></tr></thead><tbody>{details.entries.map(entry=><tr key={entry.id}><td>{date(entry.created_at)}</td><td>{kinds[entry.kind]}</td><td>{money(entry.amount)}</td><td>{methods[entry.method]}</td><td>{entry.note}</td></tr>)}</tbody></table>{!details.entries.length&&<p>Nenhum lançamento registrado.</p>}</div>
  </>}
  {operation&&<p role="status">O resultado do envio anterior precisa ser confirmado. Tente novamente com os mesmos valores para evitar duplicidade.</p>}
  {(rental.status!=='closed'||operation)&&<form onSubmit={e=>{e.preventDefault();void submit();}}>
   <fieldset disabled={locked}><Field label="Tipo de lançamento">{id=><select id={id} value={kind} onChange={e=>setKind(e.target.value as FinanceInput['kind'])}>{Object.entries(kinds).filter(([key])=>(key!=='expense'||user.role==='admin')&&(key!=='charge'||rental.status!=='canceled')).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>}</Field>
   <TextField label="Valor (R$)" inputMode="decimal" required value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0,00"/>
   <Field label="Forma de pagamento">{id=><select id={id} value={method} onChange={e=>setMethod(e.target.value as FinanceInput['method'])}>{Object.entries(methods).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>}</Field>
   <TextField label="Descrição / motivo" required maxLength={500} value={note} onChange={e=>setNote(e.target.value)}/></fieldset>
   <div className="form-actions"><button className="primary" disabled={busy||(!details&&!operation)}>{busy?'Registrando…':operation?'Confirmar envio anterior':'Registrar lançamento'}</button></div>
  </form>}
  {rental.status==='closed'&&!operation&&<p className="footnote">Reserva encerrada: o histórico financeiro está disponível para consulta.</p>}
 </section>;
}
