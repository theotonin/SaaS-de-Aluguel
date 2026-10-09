import { useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { Heading, Empty } from '../components';
import { request } from '../api';
import { exactMoney } from '../../../../packages/domain/money';

type Report = { from:string; to:string; received:string; receivable:string; depositReceived:string; depositRefunded:string; depositMovement:string; depositHeld:string; expenses:string|null; operatingNet:string|null; cashNet:string|null; dateRules:{ledger:string;receivables:string;deposits:string} };
const today = new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
const monthStart = `${today.slice(0,7)}-01`;

export function FinanceReportScreen() {
  const [from,setFrom]=useState(monthStart),[to,setTo]=useState(today),[report,setReport]=useState<Report|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function load(){setBusy(true);setError('');try{setReport(await request<Report>(`/finance/report?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function download(){try{const result=await request<{csv:string}>(`/finance/report?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&format=csv`);const url=URL.createObjectURL(new Blob([result.csv],{type:'text/csv;charset=utf-8'}));const anchor=document.createElement('a');anchor.href=url;anchor.download='tonin-loca-financeiro.csv';anchor.click();URL.revokeObjectURL(url);}catch(e){setError((e as Error).message);}}
  const values=report?[['Recebido líquido',report.received],['A receber',report.receivable],['Cauções recebidas',report.depositReceived],['Cauções devolvidas',report.depositRefunded],['Variação de cauções retidas',report.depositMovement],['Cauções retidas nas reservas do período',report.depositHeld],...(report.expenses===null?[]:[['Despesas',report.expenses] as const]),...(report.operatingNet===null?[]:[['Resultado operacional',report.operatingNet] as const]),...(report.cashNet===null?[]:[['Movimento de caixa com cauções',report.cashNet] as const])] as const:[];
  return <>
    <Heading title="Financeiro" description="Entradas realizadas, valores a receber e despesas por período." />
    <section className="panel"><form className="toolbar" onSubmit={e=>{e.preventDefault();void load();}}><label>De <input type="date" value={from} onChange={e=>setFrom(e.target.value)} required /></label><label>Até <input type="date" value={to} onChange={e=>setTo(e.target.value)} required /></label><button className="primary" disabled={busy}>{busy?'Calculando…':'Gerar relatório'}</button></form>{error&&<p className="error" role="alert">{error}</p>}</section>
    {report ? <>
      <section className="summary-strip finance-report-values">{values.map(([label,value])=><div key={label}><span>{label}</span><strong>{exactMoney(value)}</strong></div>)}</section>
      <section className="panel"><div className="panel-heading"><div><h2>Período de {report.from} a {report.to}</h2><p className="muted">Valores em centavos, apresentados em reais.</p></div><div className="toolbar"><button className="secondary" onClick={()=>void download()}><Download size={16}/> Exportar CSV</button><button className="secondary" onClick={()=>window.print()}><Printer size={16}/> Imprimir</button></div></div><div className="quiet-note"><p>{report.dateRules.ledger}</p><p>{report.dateRules.receivables}</p><p>{report.dateRules.deposits}</p></div></section>
    </> : <section className="panel"><Empty title="Escolha um período">O relatório separa lançamentos registrados, saldos a receber e movimentos de caução.</Empty></section>}
  </>;
}
