import { Heading, Empty, date } from '../components';
import type { TodaySummary } from '../types';
import type { Rental } from '../types';

export function TodayScreen({ today, openRental }: { today: TodaySummary; openRental: (rental: Rental) => void }) {
  const groups = [
    ['Retiradas de hoje', today.pickups],
    ['Devoluções previstas hoje', today.returns],
    ['Devoluções atrasadas', today.overdue],
  ] as const;
  return <>
    <Heading title="Hoje" description="Retiradas, devoluções, atrasos e materiais que aguardam manutenção." />
    <div className="summary-strip"><div><span>Retiradas</span><strong>{today.pickups.length}</strong></div><div><span>Devoluções</span><strong>{today.returns.length}</strong></div><div><span>Atrasos</span><strong>{today.overdue.length}</strong></div><div><span>Materiais em manutenção</span><strong>{today.maintenance.length}</strong></div></div>
    {groups.map(([title, rentals]) => <section className="panel" key={title}><div className="panel-heading"><h2>{title}</h2></div>{rentals.length ? <div className="event-list">{rentals.map(r => <button className="event-row" key={r.id} onClick={() => openRental(r)}><div className="event-copy"><strong>{r.customer_name}</strong><span>Reserva #{r.number} · {date(title === 'Retiradas de hoje' ? r.starts_at : r.ends_at)}</span></div><span className="muted">Abrir reserva</span></button>)}</div> : <Empty title="Nenhuma reserva nesta lista">Os registros aparecem aqui conforme os horários e as devoluções.</Empty>}</section>)}
    <section className="panel"><div className="panel-heading"><h2>Materiais em manutenção</h2></div>{today.maintenance.length ? <div className="table-wrap"><table><thead><tr><th>Material</th><th>Categoria</th><th>Unidades fora do acervo</th></tr></thead><tbody>{today.maintenance.map(item=><tr key={item.id}><td className="strong">{item.name}</td><td>{item.category}</td><td>{item.remaining_quantity}</td></tr>)}</tbody></table></div> : <Empty title="Nenhum material em manutenção">Materiais registrados como avariados aparecem aqui até serem liberados.</Empty>}</section>
  </>;
}
