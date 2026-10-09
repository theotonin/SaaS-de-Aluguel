import { ArrowUpRight } from "lucide-react";

import { Badge, Empty, money, date } from "../components";

import type { Rental } from "../types";

export function RentalTable({
  rentals,
  open,
}: {
  rentals: Rental[];
  open: (r: Rental) => void;
}) {
  if (!rentals.length)
    return (
      <Empty title="Nenhuma reserva encontrada">
        Crie um orçamento ou ajuste os filtros para encontrar uma locação.
      </Empty>
    );
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Reserva</th>
            <th>Cliente</th>
            <th>Retirada</th>
            <th>Retorno</th>
            <th>Etapa</th>
            <th>Valor</th>
            <th>
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rentals.map((r) => (
            <tr key={r.id}>
              <td className="strong">#{r.number}</td>
              <td>{r.customer_name}</td>
              <td>{date(r.starts_at)}</td>
              <td>{date(r.ends_at)}</td>
              <td>
                <Badge status={r.status} />
              </td>
              <td className="numeric">{money(r.total)}</td>
              <td>
                <button
                  className="icon-button"
                  aria-label={"Abrir reserva " + r.number}
                  onClick={() => open(r)}
                >
                  <ArrowUpRight size={18} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
