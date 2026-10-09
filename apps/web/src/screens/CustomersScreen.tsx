import { Plus } from "lucide-react";

import { Heading, Empty } from "../components";
import { CustomerForm } from "../forms";
import type { Customer } from "../types";

import { SearchInput } from "./SearchInput";
export function CustomersScreen({
  canQuote,
  setForm,
  form,
  saved,
  customers,
  matches,
  query,
  setQuery,
}: {
  canQuote: boolean;
  setForm: (value: boolean) => void;
  form: boolean;
  saved: (message: string) => void;
  customers: Customer[];
  matches: (value: string) => boolean;
  query: string;
  setQuery: (value: string) => void;
}) {
  return (
    <>
      <Heading
        title="Clientes"
        description="Contatos e endereços para organizar cada locação."
      >
        {canQuote && (
          <button className="primary" onClick={() => setForm(true)}>
            <Plus size={18} />
            Novo cliente
          </button>
        )}
      </Heading>
      {form && (
        <CustomerForm
          close={() => setForm(false)}
          done={() => saved("Cliente cadastrado.")}
        />
      )}
      <div className="toolbar">
        <SearchInput
          value={query}
          set={setQuery}
          placeholder="Buscar nome ou telefone"
        />
      </div>
      <section className="panel">
        {customers.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Telefone</th>
                  <th>E-mail</th>
                  <th>Endereço</th>
                </tr>
              </thead>
              <tbody>
                {customers
                  .filter((c) => matches(c.name + c.phone))
                  .map((c) => (
                    <tr key={c.id}>
                      <td className="strong">{c.name}</td>
                      <td>{c.phone}</td>
                      <td>{c.email || "—"}</td>
                      <td>{c.address || "Não informado"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {!customers.some((c) => matches(c.name + c.phone)) && (
              <p className="no-results">
                Nenhum cliente encontrado para esta busca.
              </p>
            )}
          </div>
        ) : (
          <Empty
            title="Seu primeiro cliente começa aqui"
            action={canQuote ? () => setForm(true) : undefined}
          >
            Guarde o contato e o endereço para agilizar os próximos orçamentos.
          </Empty>
        )}
      </section>
    </>
  );
}
