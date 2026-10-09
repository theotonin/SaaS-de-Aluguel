import { useRef, useState, useEffect } from "react";
import { Plus, Trash2, CalendarDays } from "lucide-react";
import { FormPanel, TextField, Field, value, cents, money } from "./components";
import { request } from "./api";
import { rentalDays, calculateTotal } from "../../../packages/domain/rental";
import type { Company, Item, Customer, Rental } from "./types";

type Base = { close: () => void; done: () => void };
export function CustomerForm({ close, done }: Base) {
  return (
    <FormPanel
      title="Novo cliente"
      close={close}
      submitLabel="Salvar cliente"
      submit={async (f) => {
        await request("/customers", "POST", {
          name: value(f, "name"),
          phone: value(f, "phone"),
          email: value(f, "email"),
          address: value(f, "address"),
        });
        done();
      }}
    >
      <div className="form-grid">
        <TextField
          label="Nome do cliente"
          name="name"
          required
          maxLength={120}
          autoFocus
        />
        <TextField
          label="Telefone"
          name="phone"
          required
          maxLength={40}
          type="tel"
        />
        <TextField label="E-mail" name="email" type="email" maxLength={254} />
        <TextField label="Endereço de entrega" name="address" maxLength={500} />
      </div>
    </FormPanel>
  );
}
export function ItemForm({ close, done, item }: Base & { item?: Item | null }) {
  return (
    <FormPanel
      title={item ? "Editar material" : "Novo material"}
      close={close}
      submitLabel="Salvar material"
      submit={async (f) => {
        await request(
          item ? "/items/" + item.id : "/items",
          item ? "PATCH" : "POST",
          {
            name: value(f, "name"),
            category: value(f, "category"),
            quantity: Number(value(f, "quantity")),
            unitPrice: cents(f, "price"),
            description: value(f, "description"),
          },
        );
        done();
      }}
    >
      <div className="form-grid">
        <TextField
          label="Nome do material"
          name="name"
          defaultValue={item?.name}
          required
          maxLength={160}
          autoFocus
        />
        <TextField
          label="Categoria"
          name="category"
          defaultValue={item?.category}
          required
          maxLength={80}
        />
        <TextField
          label="Quantidade total"
          name="quantity"
          type="number"
          min={0}
          max={100000}
          step={1}
          defaultValue={item?.quantity ?? 1}
          required
        />
        <TextField
          label="Valor da diária (R$)"
          name="price"
          type="number"
          min={0}
          max={1000000}
          step="0.01"
          defaultValue={item ? item.unit_price / 100 : ""}
          required
        />
        <Field label="Descrição">
          {(id) => (
            <textarea
              id={id}
              name="description"
              rows={3}
              maxLength={2000}
              defaultValue={item?.description}
            />
          )}
        </Field>
      </div>
    </FormPanel>
  );
}
export function MemberForm({ close, done }: Base) {
  return (
    <FormPanel
      title="Novo integrante"
      close={close}
      submitLabel="Criar acesso"
      submit={async (f) => {
        await request("/team", "POST", {
          name: value(f, "name"),
          email: value(f, "email"),
          password: value(f, "password"),
          role: value(f, "role"),
        });
        done();
      }}
    >
      <div className="form-grid">
        <TextField
          label="Nome"
          name="name"
          required
          maxLength={120}
          autoFocus
        />
        <TextField
          label="E-mail de acesso"
          name="email"
          type="email"
          required
        />
        <Field label="Permissão">
          {(id) => (
            <select id={id} name="role">
              <option value="attendant">Atendente</option>
              <option value="operator">Operador</option>
              <option value="admin">Administrador</option>
            </select>
          )}
        </Field>
        <TextField
          label="Senha inicial"
          name="password"
          type="password"
          required
          minLength={12}
          maxLength={128}
          autoComplete="new-password"
          help="Pelo menos 12 caracteres. Entregue a senha por um canal seguro."
        />
      </div>
    </FormPanel>
  );
}
export function CompanyForm({
  close,
  done,
  company,
}: Base & { company?: Company | null }) {
  return (
    <FormPanel
      title={company ? "Configurar empresa" : "Nova empresa"}
      close={close}
      submitLabel={company ? "Salvar configuração" : "Criar empresa"}
      submit={async (f) => {
        const common = {
          name: value(f, "name"),
          plan: value(f, "plan"),
          userLimit: Number(value(f, "userLimit")),
          itemLimit: Number(value(f, "itemLimit")),
        };
        await request(
          company ? "/admin/companies/" + company.id : "/admin/companies",
          company ? "PATCH" : "POST",
          company
            ? {
                ...common,
                accent: value(f, "accent"),
                status: value(f, "status"),
              }
            : {
                ...common,
                slug: value(f, "slug"),
                ownerName: value(f, "ownerName"),
                ownerEmail: value(f, "ownerEmail"),
                ownerPassword: value(f, "ownerPassword"),
              },
        );
        done();
      }}
    >
      <div className="form-grid">
        <TextField
          label="Nome da empresa"
          name="name"
          defaultValue={company?.name}
          required
          maxLength={120}
          autoFocus
        />
        {!company && (
          <TextField
            label="Identificador da empresa"
            name="slug"
            required
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            maxLength={60}
            help="Letras minúsculas e hífens. Não configura domínio automaticamente."
          />
        )}
        <TextField
          label="Plano"
          name="plan"
          defaultValue={company?.plan ?? "Piloto"}
          required
          maxLength={80}
        />
        <TextField
          label="Limite de usuários"
          name="userLimit"
          type="number"
          min={1}
          max={1000}
          defaultValue={company?.user_limit ?? 5}
          required
        />
        <TextField
          label="Limite de materiais"
          name="itemLimit"
          type="number"
          min={1}
          max={100000}
          defaultValue={company?.item_limit ?? 100}
          required
        />
        {company ? (
          <>
            <TextField
              label="Cor de destaque"
              name="accent"
              type="color"
              defaultValue={company.accent}
              required
            />
            <Field label="Acesso da empresa">
              {(id) => (
                <select id={id} name="status" defaultValue={company.status}>
                  <option value="active">Ativo</option>
                  <option value="suspended">Suspenso</option>
                </select>
              )}
            </Field>
          </>
        ) : (
          <>
            <TextField
              label="Nome do administrador"
              name="ownerName"
              required
              maxLength={120}
            />
            <TextField
              label="E-mail do administrador"
              name="ownerEmail"
              type="email"
              required
            />
            <TextField
              label="Senha inicial do administrador"
              name="ownerPassword"
              type="password"
              minLength={12}
              maxLength={128}
              required
              autoComplete="new-password"
              help="Mínimo de 12 caracteres. Sem senha padrão."
            />
          </>
        )}
      </div>
    </FormPanel>
  );
}

function inputDate(date: Date) {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return parts.replace(" ", "T");
}
// Convert a wall-clock date in São Paulo, independently of the browser's timezone.
function isoDate(input: string) {
  const desired = Date.parse(input + ":00Z");
  if (!Number.isFinite(desired))
    throw new Error("Informe retirada e retorno válidos.");
  let instant = desired;
  for (let i = 0; i < 2; i++) {
    const wall = Date.parse(inputDate(new Date(instant)) + ":00Z");
    instant += desired - wall;
  }
  return new Date(instant).toISOString();
}
export function RentalForm({
  close,
  done,
  customers,
  items,
}: {
  close: () => void;
  done: (rental: Rental) => void;
  customers: Customer[];
  items: Item[];
}) {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  const tomorrow = new Date(now.getTime() + 86400000);
  const [start, setStart] = useState(inputDate(now)),
    [end, setEnd] = useState(inputDate(tomorrow));
  const [lines, setLines] = useState([{ itemId: "", quantity: 1 }]);
  const [delivery, setDelivery] = useState("0"),
    [discount, setDiscount] = useState("0");
  const [available, setAvailable] = useState<Item[]>([]),
    [availabilityError, setAvailabilityError] = useState("");
  const operation = useRef(crypto.randomUUID());
  useEffect(() => {
    let active = true;
    setAvailable([]);
    setAvailabilityError("");
    const timer = setTimeout(() => {
      try {
        const from = isoDate(start),
          to = isoDate(end);
        rentalDays(from, to);
        request<Item[]>(
          "/availability?start=" +
            encodeURIComponent(from) +
            "&end=" +
            encodeURIComponent(to),
        )
          .then((d) => {
            if (active) setAvailable(d);
          })
          .catch((e) => {
            if (active) setAvailabilityError(e.message);
          });
      } catch (e) {
        if (active) setAvailabilityError((e as Error).message);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [start, end]);
  let days = 0,
    total = 0;
  try {
    days = rentalDays(isoDate(start), isoDate(end));
    total = calculateTotal(
      lines
        .filter((l) => l.itemId)
        .map((l) => ({
          quantity: l.quantity,
          unitPrice: items.find((i) => i.id === l.itemId)?.unit_price ?? 0,
        })),
      days,
      Math.round(Number(delivery) * 100),
      Math.round(Number(discount) * 100),
    );
  } catch {
    /* Form validation explains incomplete fields on submission. */
  }
  return (
    <FormPanel
      title="Novo orçamento"
      close={close}
      submitLabel="Salvar orçamento"
      submit={async (f) => {
        const rental = await request<Rental>(
          "/rentals",
          "POST",
          {
            customerId: value(f, "customer"),
            fulfillment: value(f, "fulfillment"),
            start: isoDate(start),
            end: isoDate(end),
            lines,
            delivery: Math.round(Number(delivery) * 100),
            discount: Math.round(Number(discount) * 100),
            notes: value(f, "notes"),
          },
          operation.current,
        );
        done(rental);
      }}
    >
      <div className="form-grid">
        <Field label="Cliente">
          {(id) => (
            <select id={id} name="customer" required autoFocus>
              <option value="">Selecione o cliente</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <div className="form-note">
          <CalendarDays size={18} />
          <span>
            Horários de São Paulo.
            <br />A reserva é garantida na confirmação.
          </span>
        </div>
        <Field label="Forma de retirada">
          {(id) => (
            <select id={id} name="fulfillment">
              <option value="pickup">Cliente retira na locadora</option>
              <option value="delivery">
                Locadora entrega no endereço do cliente
              </option>
            </select>
          )}
        </Field>
        <TextField
          label="Retirada"
          type="datetime-local"
          required
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
        <TextField
          label="Retorno previsto"
          type="datetime-local"
          required
          value={end}
          onChange={(e) => setEnd(e.target.value)}
        />
      </div>
      <div className="rental-lines">
        {lines.map((line, index) => (
          <div className="rental-line" key={index}>
            <Field label={"Material " + (index + 1)}>
              {(id) => (
                <select
                  id={id}
                  required
                  value={line.itemId}
                  onChange={(e) =>
                    setLines(
                      lines.map((l, i) =>
                        i === index ? { ...l, itemId: e.target.value } : l,
                      ),
                    )
                  }
                >
                  <option value="">Selecione um material</option>
                  {items
                    .filter(
                      (item) =>
                        item.id === line.itemId ||
                        !lines.some((l) => l.itemId === item.id),
                    )
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
              )}
            </Field>
            <TextField
              label={"Quantidade " + (index + 1)}
              type="number"
              min={1}
              max={100000}
              required
              value={line.quantity}
              onChange={(e) =>
                setLines(
                  lines.map((l, i) =>
                    i === index
                      ? { ...l, quantity: Number(e.target.value) }
                      : l,
                  ),
                )
              }
            />
            <div className="line-availability">
              <span>
                {line.itemId
                  ? money(
                      items.find((i) => i.id === line.itemId)?.unit_price ?? 0,
                    ) + " / diária"
                  : "Escolha o material"}
              </span>
              <small>
                {available.find((i) => i.id === line.itemId)?.available !==
                undefined
                  ? available.find((i) => i.id === line.itemId)!.available +
                    " disponíveis no período"
                  : "Disponibilidade por período"}
              </small>
            </div>
            {lines.length > 1 && (
              <button
                type="button"
                className="icon-button"
                aria-label={"Remover material " + (index + 1)}
                onClick={() => setLines(lines.filter((_, i) => i !== index))}
              >
                <Trash2 size={18} />
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          className="secondary"
          disabled={lines.length >= items.length}
          onClick={() => setLines([...lines, { itemId: "", quantity: 1 }])}
        >
          <Plus size={16} />
          Adicionar material
        </button>
      </div>
      {availabilityError && (
        <p className="error" role="alert">
          {availabilityError}
        </p>
      )}
      <div className="form-grid">
        <TextField
          label="Entrega e transporte (R$)"
          type="number"
          min={0}
          step="0.01"
          value={delivery}
          onChange={(e) => setDelivery(e.target.value)}
          required
        />
        <TextField
          label="Desconto (R$)"
          type="number"
          min={0}
          step="0.01"
          value={discount}
          onChange={(e) => setDiscount(e.target.value)}
          required
        />
        <Field label="Observações">
          {(id) => <textarea id={id} name="notes" rows={3} maxLength={2000} />}
        </Field>
      </div>
      <div className="quote-total">
        <span>{days || "—"} diária(s) · valor previsto</span>
        <strong>{money(total)}</strong>
      </div>
      <p className="muted">
        Salvar cria um orçamento. A disponibilidade será conferida novamente ao
        confirmar a reserva.
      </p>
    </FormPanel>
  );
}
