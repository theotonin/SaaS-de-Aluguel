import {
  CalendarDays,
  Plus,
  ArrowUpRight,
  ChevronRight,
  Boxes,
} from "lucide-react";

import { Badge, Heading, Empty, money, date } from "../components";

import type { Item, Rental } from "../types";
import type { Screen } from "../types";
import { RentalTable } from "./RentalTable";

export function OverviewScreen({
  canQuote,
  go,
  activeRentals,
  rentals,
  items,
  upcoming,
  openRental,
}: {
  canQuote: boolean;
  go: (screen: Screen) => void;
  activeRentals: Rental[];
  rentals: Rental[];
  items: Item[];
  upcoming: Rental[];
  openRental: (rental: Rental) => void;
}) {
  return (
    <>
      <Heading
        title="Visão geral"
        description="Reservas, materiais e próximos compromissos da sua locadora."
      >
        {canQuote && (
          <button className="primary" onClick={() => go("quote")}>
            <Plus size={18} />
            Novo orçamento
          </button>
        )}
      </Heading>
      <div className="summary-strip">
        <div>
          <span>Reservas em andamento</span>
          <strong>{activeRentals.length}</strong>
        </div>
        <div>
          <span>Orçamentos abertos</span>
          <strong>
            {rentals.filter((r) => ["draft", "sent"].includes(r.status)).length}
          </strong>
        </div>
        <div>
          <span>Materiais cadastrados</span>
          <strong>{items.length}</strong>
        </div>
        <div>
          <span>Valor das reservas ativas</span>
          <strong>
            {money(activeRentals.reduce((a, r) => a + Number(r.total), 0))}
          </strong>
        </div>
      </div>
      <div className="overview-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>Próximas saídas</h2>
            <button className="text-button" onClick={() => go("agenda")}>
              Ver agenda
              <ArrowUpRight size={16} />
            </button>
          </div>
          {upcoming.length ? (
            <div className="event-list">
              {upcoming.slice(0, 5).map((r) => (
                <button
                  className="event-row"
                  key={r.id}
                  onClick={() => void openRental(r)}
                >
                  <div className="date-tile">
                    <strong>
                      {new Intl.DateTimeFormat("pt-BR", {
                        day: "2-digit",
                        timeZone: "America/Sao_Paulo",
                      }).format(new Date(r.starts_at))}
                    </strong>
                    <span>
                      {new Intl.DateTimeFormat("pt-BR", {
                        month: "short",
                        timeZone: "America/Sao_Paulo",
                      }).format(new Date(r.starts_at))}
                    </span>
                  </div>
                  <div className="event-copy">
                    <strong>{r.customer_name}</strong>
                    <span>
                      Reserva #{r.number} · {date(r.starts_at)}
                    </span>
                  </div>
                  <Badge status={r.status} />
                  <ChevronRight size={18} />
                </button>
              ))}
            </div>
          ) : (
            <Empty title="Nenhuma saída programada">
              As reservas confirmadas aparecem aqui.
            </Empty>
          )}
        </section>
        <section className="panel operation-note">
          <Boxes size={28} />
          <h2>
            Antes de confirmar,
            <br />
            confira o período.
          </h2>
          <p>
            O mesmo material pode atender vários eventos. A disponibilidade
            considera retirada, retorno e reservas que acontecem ao mesmo tempo.
          </p>
          <button className="secondary" onClick={() => go("items")}>
            Consultar materiais
            <ArrowUpRight size={16} />
          </button>
          <div className="quiet-note">
            <CalendarDays size={18} />
            <span>Horários apresentados no fuso de São Paulo.</span>
          </div>
        </section>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h2>Últimos orçamentos</h2>
          <button className="text-button" onClick={() => go("rentals")}>
            Ver todos
            <ArrowUpRight size={16} />
          </button>
        </div>
        <RentalTable
          rentals={[...rentals]
            .sort((a, b) => Number(b.number) - Number(a.number))
            .slice(0, 5)}
          open={openRental}
        />
      </section>
    </>
  );
}
