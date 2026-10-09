import { Plus } from "lucide-react";

import { Heading, Empty, money } from "../components";
import { ItemForm } from "../forms";
import type { User, Item } from "../types";

import { SearchInput } from "./SearchInput";
export function MaterialsScreen({
  user,
  setEditingItem,
  setForm,
  form,
  editingItem,
  saved,
  items,
  matches,
  query,
  setQuery,
}: {
  user: User;
  setEditingItem: (item: Item | null) => void;
  setForm: (value: boolean) => void;
  form: boolean;
  editingItem: Item | null;
  saved: (message: string) => void;
  items: Item[];
  matches: (value: string) => boolean;
  query: string;
  setQuery: (value: string) => void;
}) {
  const visible = items.filter((i) => matches(`${i.name} ${i.category}`));
  return (
    <>
      <Heading
        title="Materiais"
        description="Seu acervo de locação, com quantidades e valores de referência."
      >
        {user.role === "admin" && (
          <button
            className="primary"
            onClick={() => {
              setEditingItem(null);
              setForm(true);
            }}
          >
            <Plus size={18} />
            Novo material
          </button>
        )}
      </Heading>
      {form && (
        <ItemForm
          key={editingItem?.id ?? "new"}
          item={editingItem}
          close={() => setForm(false)}
          done={() => saved("Material salvo.")}
        />
      )}
      <div className="toolbar">
        <SearchInput
          value={query}
          set={setQuery}
          placeholder="Buscar material ou categoria"
        />
        <span className="muted" role="status">
          {visible.length} de {items.length} materiais
        </span>
        <span className="muted">
          {items.length} de {user.organization?.item_limit} materiais do plano
        </span>
      </div>
      <section className="panel">
        {items.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Material</th>
                  <th>Categoria</th>
                  <th>Acervo total</th>
                  <th>Em manutenção</th>
                  <th>Diária</th>
                  <th>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <span className="strong">{i.name}</span>
                      <small className="cell-note">{i.description}</small>
                    </td>
                    <td>{i.category}</td>
                    <td>{i.quantity} un.</td>
                    <td>{i.maintenance_quantity??0} un.</td>
                    <td className="numeric">{money(i.unit_price)}</td>
                    <td>
                      {user.role === "admin" && (
                        <button
                          className="text-button"
                          onClick={() => {
                            setEditingItem(i);
                            setForm(true);
                            window.scrollTo({
                              top: 0,
                              behavior: "instant",
                            });
                          }}
                        >
                          Editar
                          <span className="sr-only"> {i.name}</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!visible.length && (
              <p className="no-results">
                Nenhum material encontrado para esta busca.
              </p>
            )}
          </div>
        ) : (
          <Empty
            title="Monte seu acervo"
            action={user.role === "admin" ? () => setForm(true) : undefined}
          >
            Cadastre os materiais que sua empresa aluga, a quantidade e o valor
            da diária.
          </Empty>
        )}
      </section>
      <p className="footnote">
        Acervo total é a quantidade cadastrada. Consulte a disponibilidade por
        período ao montar um orçamento.
      </p>
    </>
  );
}
