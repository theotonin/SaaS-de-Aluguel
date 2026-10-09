import { useEffect, useState } from "react";
import {mutationKey} from '../mutation-recovery';
import { request } from "../api";
import { date, TextField } from "../components";
import type { Rental, User } from "../types";

type ReturnLine = { itemId: string; receivedQuantity: number; damagedQuantity: number; note: string };
type Operation = { key: string; path: string; body: { lines: ReturnLine[] } | { quantity: number; note: string }; jobId?: string };
const pendingOperations = new Map<string, Operation>();

export function ReturnForm({ rental, user, changed, onOperationLock }: {
  rental: Rental; user: User; changed: (r: Rental) => void;
  onOperationLock?: (locked: boolean) => void;
}) {
  const scope = `${user.organization_id}:${user.id}:${rental.id}`;
  const [operation, setOperation] = useState<Operation | null>(() => pendingOperations.get(scope) ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Record<string, { received: string; damaged: string; note: string }>>({});
  const [repairs, setRepairs] = useState<Record<string, { quantity: string; note: string }>>({});
  const operational = ["admin", "operator"].includes(user.role);
  const lines = rental.lines ?? [];
  const outstanding = lines.filter(line => line.quantity > (line.received_quantity ?? 0));
  const jobs = (rental.maintenance ?? []).filter(job => job.remaining_quantity > 0);
  const locked = busy || !!operation;
  useEffect(() => { onOperationLock?.(locked); }, [locked, onOperationLock]);
  useEffect(() => {
    const resolved = (event: Event) => {
      const key = (event as CustomEvent<{ key: string }>).detail?.key;
      if (!key) return;
      const pending = pendingOperations.get(scope);
      if (pending?.key === key) pendingOperations.delete(scope);
      setOperation(current => current?.key === key ? null : current);
      if (pending?.key === key) onOperationLock?.(false);
    };
    window.addEventListener("mutation-resolved", resolved);
    return () => window.removeEventListener("mutation-resolved", resolved);
  }, [scope, onOperationLock]);

  async function send(op: Operation) {
    if (busy) return;
    setBusy(true); setError("");
    pendingOperations.set(scope, op); setOperation(op); onOperationLock?.(true);
    let updated: Rental;
    try {
      updated = await request<Rental>(op.path, "POST", op.body, op.key);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível concluir a conferência.");
      const status = (cause as { status?: number }).status;
      if (typeof status === "number" && status < 500 && ![401, 408, 429].includes(status)) {
        pendingOperations.delete(scope); setOperation(null); onOperationLock?.(false);
      }
      setBusy(false);
      return;
    }
    // The mutation is confirmed. A later refresh failure must never restore its key.
    pendingOperations.delete(scope); setOperation(null); setBusy(false); onOperationLock?.(false);
    setDraft({}); setRepairs({});
    changed(updated);
  }

  function submitReturn() {
    if (operation) { void send(operation); return; }
    const payload: ReturnLine[] = [];
    for (const line of outstanding) {
      const entry = draft[line.item_id];
      const receivedQuantity = Number(entry?.received ?? 0), damagedQuantity = Number(entry?.damaged ?? 0);
      const note = entry?.note.trim() ?? "";
      if (!Number.isInteger(receivedQuantity) || receivedQuantity < 0 || receivedQuantity > line.quantity - (line.received_quantity ?? 0)
        || !Number.isInteger(damagedQuantity) || damagedQuantity < 0 || damagedQuantity > receivedQuantity) {
        setError("Confira as quantidades recebidas e com avaria."); return;
      }
      if (damagedQuantity > 0 && !note) { setError("Descreva a avaria dos materiais antes de registrar."); return; }
      if (note.length > 500) { setError("A observação deve ter até 500 caracteres."); return; }
      if (receivedQuantity > 0) payload.push({ itemId: line.item_id, receivedQuantity, damagedQuantity, note });
    }
    if (!payload.length) { setError("Informe ao menos uma unidade recebida."); return; }
    void send({ key: mutationKey(`/rentals/${rental.id}/returns`), path: `/rentals/${rental.id}/returns`, body: { lines: payload } });
  }

  function submitRepair(jobId: string, remaining: number) {
    if (operation) { void send(operation); return; }
    const entry = repairs[jobId];
    const quantity = Number(entry?.quantity ?? 0), note = entry?.note.trim() ?? "";
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > remaining || !note || note.length > 500) {
      setError("Informe a quantidade reparada e descreva a conferência da manutenção."); return;
    }
    void send({ key: mutationKey(`/rentals/${rental.id}/maintenance/${jobId}/release`), path: `/rentals/${rental.id}/maintenance/${jobId}/release`, body: { quantity, note }, jobId });
  }

  if (!["delivered", "returned", "closed"].includes(rental.status) && !rental.returns?.length && !jobs.length) return null;
  return <section className="panel returns-panel" aria-label="Devolução e conferência">
    <div className="panel-heading"><div><h2>Devolução e conferência</h2><p>Confira o retorno físico. As avarias ficam em manutenção até o reparo ser conferido.</p></div></div>
    {error && <p className="error" role="alert">{error}</p>}
    {operation && !busy && <p role="status">O resultado ainda não foi confirmado. Reenvie a mesma conferência para consultar e concluir com segurança.</p>}
    <div className="table-wrap"><table><thead><tr><th>Material</th><th>Entregue</th><th>Recebido</th><th>Pendente</th><th>Reutilizável</th></tr></thead><tbody>
      {lines.map(line => <tr key={line.item_id}><td className="strong">{line.name}</td><td>{line.quantity} un.</td><td>{line.received_quantity ?? 0} un.</td><td>{line.quantity - (line.received_quantity ?? 0)} un. pendentes</td><td>{(line.received_quantity ?? 0) - (line.damaged_quantity ?? 0) + (rental.maintenance ?? []).filter(job=>job.item_id===line.item_id).reduce((sum,job)=>sum+job.quantity-job.remaining_quantity,0)} un. reutilizáveis</td></tr>)}
    </tbody></table></div>
    {operational && rental.status === "delivered" && outstanding.length > 0 && <form noValidate={!!operation} onSubmit={event => { event.preventDefault(); submitReturn(); }}>
      <fieldset disabled={locked} className="return-lines">
        {outstanding.map(line => {
          const entry = draft[line.item_id] ?? { received: "0", damaged: "0", note: "" };
          const change = (field: keyof typeof entry, value: string) => setDraft(current => ({ ...current, [line.item_id]: { ...entry, [field]: value } }));
          return <div key={line.item_id}><h3>{line.name}</h3>
            <TextField label={`Recebido — ${line.name}`} type="number" min={0} max={line.quantity - (line.received_quantity ?? 0)} step={1} value={entry.received} onChange={event => change("received", event.target.value)} />
            <TextField label={`Com avaria — ${line.name}`} help="Incluído no total recebido." type="number" min={0} max={Number(entry.received)} step={1} value={entry.damaged} onChange={event => change("damaged", event.target.value)} />
            <TextField label={`Observação da avaria — ${line.name}`} required={Number(entry.damaged) > 0} maxLength={500} value={entry.note} onChange={event => change("note", event.target.value)} />
          </div>;
        })}
      </fieldset>
      <div className="form-actions"><button className="primary" disabled={busy || !!operation?.jobId}>{busy && !operation?.jobId ? "Registrando…" : operation && !operation.jobId ? "Confirmar mesma devolução" : "Registrar devolução"}</button></div>
    </form>}
    {!!rental.returns?.length && <div><h3>Histórico de devoluções</h3><div className="table-wrap"><table><thead><tr><th>Conferência</th><th>Material</th><th>Recebido</th><th>Com avaria</th><th>Observação</th></tr></thead><tbody>
      {rental.returns.map(event => event.lines.map(line => <tr key={`${event.id}:${line.item_id}`}><td>{date(event.created_at)}</td><td>{line.name}</td><td>{line.received_quantity} un.</td><td>{line.damaged_quantity} un.</td><td>{line.note || "—"}</td></tr>))}
    </tbody></table></div></div>}
    {(rental.maintenance ?? []).some(job=>job.releases?.length) && <div><h3>Histórico de manutenção</h3><div className="table-wrap"><table><thead><tr><th>Conferência</th><th>Material</th><th>Liberado</th><th>Observação</th></tr></thead><tbody>{rental.maintenance?.flatMap(job=>(job.releases ?? []).map(release=><tr key={release.id}><td>{date(release.created_at)}</td><td>{job.name}</td><td>{release.quantity} un.</td><td>{release.note}</td></tr>))}</tbody></table></div></div>}
    {!!jobs.length && <div><h3>Materiais em manutenção</h3>{jobs.map(job => {
      const entry = repairs[job.id] ?? { quantity: "", note: "" };
      const change = (field: keyof typeof entry, value: string) => setRepairs(current => ({ ...current, [job.id]: { ...entry, [field]: value } }));
      return <div key={job.id}><h4>{job.name}</h4><p>{job.remaining_quantity} un. em manutenção</p><p>{job.note}</p><small>Entrada: {date(job.created_at)}</small>
        {operational && <form noValidate={!!operation} onSubmit={event => { event.preventDefault(); submitRepair(job.id, job.remaining_quantity); }}><fieldset disabled={locked}>
          <TextField label={`Quantidade liberada — ${job.name}`} required type="number" min={1} max={job.remaining_quantity} step={1} value={entry.quantity} onChange={event => change("quantity", event.target.value)} />
          <TextField label={`Conferência da manutenção — ${job.name}`} required maxLength={500} value={entry.note} onChange={event => change("note", event.target.value)} />
        </fieldset><div className="form-actions"><button className="primary" disabled={busy || (!!operation && operation.jobId !== job.id)}>{busy && operation?.jobId === job.id ? "Liberando…" : operation?.jobId === job.id ? "Confirmar mesma liberação" : "Liberar material reparado"}</button></div></form>}
      </div>;
    })}</div>}
  </section>;
}
