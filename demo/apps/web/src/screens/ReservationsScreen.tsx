import { Plus } from "lucide-react";

import { Heading, labels } from "../components";

import type { Rental } from "../types";
import type { Screen } from "../types";
import { RentalTable } from "./RentalTable";
import { SearchInput } from "./SearchInput";
export function ReservationsScreen({
  canQuote,
  go,
  query,
  setQuery,
  statusFilter,
  setStatusFilter,
  rentals,
  matches,
  openRental,
}: {
  canQuote: boolean;
  go: (screen: Screen) => void;
  query: string;
  setQuery: (value: string) => void;
  statusFilter: string;
  setStatusFilter: (value: string) => void;
  rentals: Rental[];
  matches: (value: string) => boolean;
  openRental: (rental: Rental) => void;
}) {
  return (
    <>
      <Heading
        title="Reservas e orçamentos"
        description="Da proposta à saída dos materiais, cada evento no seu lugar."
      >
        {canQuote && (
          <button className="primary" onClick={() => go("quote")}>
            <Plus size={18} />
            Novo orçamento
          </button>
        )}
      </Heading>
      <div className="toolbar">
        <SearchInput
          value={query}
          set={setQuery}
          placeholder="Buscar cliente ou número"
        />
        <select
          aria-label="Filtrar etapa"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">Todas as etapas</option>
          {Object.entries(labels)
            .filter(([key]) =>
              [
                "draft",
                "sent",
                "confirmed",
                "separated",
                "delivered",
                "canceled",
                "returned",
                "closed",
              ].includes(key),
            )
            .map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
        </select>
      </div>
      <section className="panel">
        <RentalTable
          rentals={rentals.filter(
            (r) =>
              matches(r.customer_name + " " + r.number) &&
              (statusFilter === "all" || r.status === statusFilter),
          )}
          open={openRental}
        />
      </section>
    </>
  );
}
