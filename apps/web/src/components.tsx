import { useId, useState, type ReactNode, type FormEvent } from "react";
import { ArrowRight, PackageOpen, X } from "lucide-react";
export const money = (value: number | string) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(value) / 100,
  );
export function Pagination({page,pages,total,onPage}:{page:number;pages:number;total:number;onPage:(page:number)=>void}){
  if(pages<=1)return null;
  return <nav className="pagination" aria-label="Paginação"><span className="muted">Página {page} de {pages} · {total} registros</span><div><button className="secondary" disabled={page<=1} onClick={()=>onPage(page-1)}>Anterior</button><button className="secondary" disabled={page>=pages} onClick={()=>onPage(page+1)}>Próxima</button></div></nav>;
}
export const date = (value: string, time = true) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    ...(time ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
export const labels: Record<string, string> = {
  draft: "Orçamento",
  sent: "Enviado",
  confirmed: "Confirmada",
  separated: "Separada",
  delivered: "Entregue",
  returned: "Devolvida",
  closed: "Encerrada",
  canceled: "Cancelada",
  admin: "Administrador",
  attendant: "Atendente",
  operator: "Operador",
  superadmin: "Superadmin",
};
export function Badge({ status }: { status: string }) {
  return <span className={`badge ${status}`}>{labels[status] ?? status}</span>;
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: () => void;
}) {
  return (
    <div className="empty">
      <PackageOpen size={32} />
      <h3>{title}</h3>
      <p>{children}</p>
      {action && (
        <button className="secondary" onClick={action}>
          Começar cadastro <ArrowRight size={16} />
        </button>
      )}
    </div>
  );
}
export function Field({
  label,
  children,
  help,
}: {
  label: string;
  children: (id: string) => ReactNode;
  help?: string;
}) {
  const id = useId();
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      {children(id)}
      {help && <small>{help}</small>}
    </label>
  );
}
export function TextField({
  label,
  help,
  ...props
}: {
  label: string;
  help?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Field label={label} help={help}>
      {(id) => <input id={id} {...props} />}
    </Field>
  );
}
export function FormPanel({
  title,
  close,
  submit,
  submitLabel,
  children,
}: {
  title: string;
  close: () => void;
  submit: (form: FormData) => Promise<void>;
  submitLabel: string;
  children: ReactNode;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function handle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await submit(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="form-panel" aria-label={title}>
      <div className="panel-heading">
        <h2>{title}</h2>
        <button
          className="icon-button"
          onClick={close}
          aria-label="Fechar formulário"
        >
          <X size={20} />
        </button>
      </div>
      <form onSubmit={handle}>
        <fieldset disabled={busy}>
          {children}
          <div className="form-actions">
            <button type="button" className="secondary" onClick={close}>
              Cancelar
            </button>
            <button className="primary" type="submit">
              {busy ? "Salvando…" : submitLabel}
            </button>
          </div>
        </fieldset>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}
export const value = (form: FormData, name: string) =>
  String(form.get(name) ?? "").trim();
export const cents = (form: FormData, name: string) =>
  Math.round(Number(value(form, name).replace(",", ".")) * 100);
export function Heading({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}
