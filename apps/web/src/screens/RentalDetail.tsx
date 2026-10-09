import {mutationKey} from '../mutation-recovery';
import {ReturnForm} from './ReturnForm';
import {FinancePanel} from './FinancePanel';
import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Printer, Check } from "lucide-react";
import { request } from "../api";
import { Badge, Heading, TextField, money, date } from "../components";

import type { User, Rental } from "../types";

export function RentalDetail({
  rental,
  user,
  back,
  changed,
  onOperationLock,
}: {
  rental: Rental;
  user: User;
  back: () => void;
  changed: (r: Rental) => void;
  onOperationLock?: (locked:boolean)=>void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [cancel, setCancel] = useState(false),
    [reason, setReason] = useState("");
  const [operation, setOperation] = useState<{
    key: string;
    status: string;
    reason: string;
  } | null>(null);
  const [locks,setLocks]=useState({returns:false,finance:false});
  const returnLock=useCallback((value:boolean)=>setLocks(s=>s.returns===value?s:{...s,returns:value}),[]);
  const financeLock=useCallback((value:boolean)=>setLocks(s=>s.finance===value?s:{...s,finance:value}),[]);
  const locked=busy||!!operation||locks.returns||locks.finance;
  useEffect(()=>{onOperationLock?.(locked);return()=>onOperationLock?.(false);},[locked,onOperationLock]);
  useEffect(()=>{const resolved=(event:Event)=>{if((event as CustomEvent<{key:string}>).detail?.key===operation?.key)setOperation(null);};window.addEventListener('mutation-resolved',resolved);return()=>window.removeEventListener('mutation-resolved',resolved);},[operation?.key]);
  async function transition(status: string) {
    setBusy(true);
    setError("");
    const op = operation ?? { key: mutationKey('/rentals/'+rental.id+(status==='closed'?'/close':status==='reopened'?'/reopen':'/status')), status, reason };
    if (
      operation &&
      (operation.status !== status || operation.reason !== reason)
    ) {
      setError(
        "Confira o resultado da operação anterior antes de enviar outra alteração.",
      );
      setBusy(false);
      return;
    }
    setOperation(op);
    try {
      changed(
        await request(
          "/rentals/" + rental.id + (status==='closed'?'/close':status==='reopened'?'/reopen':'/status'),
          "POST",
          status==='closed'?{}:status==='reopened'?{reason}:{ status, reason },
          op.key,
        ),
      );
      setOperation(null);
      setCancel(false);
    } catch (e) {
      setError((e as Error).message);
      if (
        typeof (e as { status?: number }).status === "number" &&
        (e as { status: number }).status < 500 && ![401,408,429].includes((e as {status:number}).status)
      )
        setOperation(null);
    } finally {
      setBusy(false);
    }
  }
  const commercial = ["admin", "attendant"].includes(user.role),
    operational = ["admin", "operator"].includes(user.role);
  const next =
    rental.status === "draft" || rental.status === "sent"
      ? { status: "confirmed", label: "Confirmar reserva" }
      : rental.status === "confirmed"
        ? { status: "separated", label: "Marcar como separada" }
        : rental.status === "separated"
          ? { status: "delivered", label: "Registrar entrega" }
          : rental.status==='returned'?{status:'closed',label:'Encerrar reserva'}:null;
  return (
    <>
      <button className="text-button back" disabled={locked} onClick={back}>
        <ArrowLeft size={17} />
        Voltar às reservas
      </button>
      <Heading
        title={
          (rental.status === "draft" || rental.status === "sent"
            ? "Orçamento #"
            : "Reserva #") + rental.number
        }
        description={rental.customer_name}
      >
        <button className="secondary" onClick={() => window.print()}>
          <Printer size={17} />
          Imprimir reserva e extrato
        </button>
        {next &&
          (( ["confirmed","closed"].includes(next.status) && commercial) ||
            (!["confirmed","closed"].includes(next.status) && operational)) && (
            <button
              disabled={locked}
              className="primary"
              onClick={() => void transition(next.status)}
            >
              {busy ? "Atualizando…" : next.label}
              <Check size={17} />
            </button>
          )}
      </Heading>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <section className="panel rental-document">
        <div className="document-heading">
          <div>
            <h2>{user.organization?.name}</h2>
            <p>Orçamento de locação #{rental.number}</p>
          </div>
          <Badge status={rental.status} />
        </div>
        <div className="document-meta">
          <div>
            <span>Logística</span>
            <strong>
              {rental.fulfillment === "delivery"
                ? "Entrega pela locadora"
                : "Retirada pelo cliente"}
            </strong>
          </div>
          <div>
            <span>Cliente</span>
            <strong>{rental.customer_name}</strong>
            <small>{rental.customer_phone}</small>
          </div>
          <div>
            <span>Retirada</span>
            <strong>{date(rental.starts_at)}</strong>
          </div>
          <div>
            <span>Retorno previsto</span>
            <strong>{date(rental.ends_at)}</strong>
          </div>
          <div>
            <span>Período</span>
            <strong>{rental.days} diária(s)</strong>
          </div>
        </div>
        {rental.customer_address && (
          <p className="address">Endereço: {rental.customer_address}</p>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Material</th>
                <th>Quantidade</th>
                <th>Diária</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {rental.lines?.map((l) => (
                <tr key={l.item_id}>
                  <td className="strong">{l.name}</td>
                  <td>{l.quantity} un.</td>
                  <td>{money(l.unit_price)}</td>
                  <td>{money(l.quantity * l.unit_price * rental.days)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="document-bottom">
          <div>
            <h3>Observações</h3>
            <p>{rental.notes || "Nenhuma observação informada."}</p>
            <small>
              Valores de locação. Este documento não é um comprovante de
              pagamento.
            </small>
          </div>
          <dl className="totals">
            <div>
              <dt>Entrega e transporte</dt>
              <dd>{money(rental.delivery)}</dd>
            </div>
            <div>
              <dt>Desconto</dt>
              <dd>− {money(rental.discount)}</dd>
            </div>
            <div className="grand-total">
              <dt>Total</dt>
              <dd>{money(rental.total)}</dd>
            </div>
          </dl>
        </div>
      </section>
      <ReturnForm rental={rental} user={user} changed={changed} onOperationLock={returnLock}/>
      <FinancePanel rental={rental} user={user} changed={changed} onOperationLock={financeLock}/>
      {!!rental.reopenings?.length&&<section className="panel"><h2>Histórico de reaberturas</h2>{rental.reopenings.map(entry=><p key={entry.id}>{date(entry.created_at)} · {entry.reason}</p>)}</section>}
      {rental.status==='closed'&&user.role==='admin'&&<section className="panel close-actions"><h2>Reabrir conferência</h2><p>Use para registrar uma correção. O histórico anterior será preservado.</p><form onSubmit={e=>{e.preventDefault();void transition('reopened');}}><TextField label="Motivo da reabertura" required maxLength={500} value={reason} disabled={locked} onChange={e=>setReason(e.target.value)}/><button className="secondary" disabled={busy||locks.returns||locks.finance}>{operation?'Confirmar reabertura anterior':'Reabrir reserva'}</button></form></section>}
      {rental.status === "canceled" && (
        <p className="footnote">
          Motivo do cancelamento: {rental.cancellation_reason}
        </p>
      )}
      {commercial &&
        ["draft", "sent", "confirmed", "separated"].includes(rental.status) && (
          <div className="cancel-area">
            {cancel ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void transition("canceled");
                }}
              >
                <TextField
                  label="Motivo do cancelamento"
                  required
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                <div className="form-actions">
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() => setCancel(false)}
                  >
                    Manter reserva
                  </button>
                  <button className="danger" disabled={busy}>
                    {busy ? "Cancelando…" : "Confirmar cancelamento"}
                  </button>
                </div>
              </form>
            ) : (
              <button
                className="text-button danger-text"
                onClick={() => setCancel(true)}
              >
                Cancelar{" "}
                {rental.status === "draft" || rental.status === "sent"
                  ? "orçamento"
                  : "reserva"}
              </button>
            )}
          </div>
        )}
    </>
  );
}
