import { RotateCcw, ChevronRight, Truck } from "lucide-react";

import { Badge, Heading, Empty, date, Pagination } from "../components";

import type { Rental, PageInfo } from "../types";

export function AgendaScreen({
  activeRentals,
  pageInfo,
  onPage,
  openRental,
}: {
  activeRentals: Rental[];
  pageInfo: PageInfo;
  onPage: (page: number) => void;
  openRental: (rental: Rental) => void;
}) {
  return (
    <>
      <Heading
        title="Agenda de locações"
        description="Acompanhe saídas e retornos previstos das reservas confirmadas."
      />
      <section className="panel">
        <div className="panel-heading">
          <h2>Saídas e retornos</h2>
          <span className="muted">{pageInfo.total} reservas ativas · horários de São Paulo</span>
        </div>
        {activeRentals.length ? (
          <div className="timeline">
            {activeRentals
              .flatMap((r) => [
                {
                  r,
                  when: r.starts_at,
                  kind: "Retirada / entrega",
                  icon: Truck,
                },
                {
                  r,
                  when: r.ends_at,
                  kind: "Retorno previsto",
                  icon: RotateCcw,
                },
              ])
              .sort((a, b) => Date.parse(a.when) - Date.parse(b.when))
              .map(({ r, when, kind, icon: Icon }) => (
                <button
                  className="timeline-row"
                  key={r.id + kind}
                  onClick={() => void openRental(r)}
                >
                  <span className="timeline-icon">
                    <Icon size={20} />
                  </span>
                  <div>
                    <strong>{date(when)}</strong>
                    <small>{kind}</small>
                  </div>
                  <div className="event-copy">
                    <strong>{r.customer_name}</strong>
                    <span>Reserva #{r.number}</span>
                  </div>
                  <Badge status={r.status} />
                  <ChevronRight size={18} />
                </button>
              ))}
          </div>
        ) : (
          <Empty title="A agenda está livre">
            Confirme uma reserva para organizar as saídas e retornos.
          </Empty>
        )}
      </section>
      <Pagination {...pageInfo} onPage={onPage}/>
    </>
  );
}
