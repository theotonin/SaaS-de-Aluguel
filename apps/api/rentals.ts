import type { SQL } from "../../packages/database/index.ts";
import { rentalInput } from "../../packages/contracts/index.ts";
import {
  availableQuantity,
  capacityWindowStart,
  calculateTotal,
  rentalDays,
  assertTransition,
  assertDeliveryWindow,
  DomainError,
  type RentalStatus,
} from "../../packages/domain/rental.ts";
import { digest } from "./auth.ts";

export type Actor = { id: string; organization_id: string; role: string };
export async function audit(
  sql: SQL,
  actor: Actor,
  action: string,
  target: string,
): Promise<void> {
  await sql.query(
    "INSERT INTO audit_log(organization_id,actor_id,action,target_id) VALUES($1,$2,$3,$4)",
    [actor.organization_id, actor.id, action, target],
  );
}
export async function idempotent<T>(
  sql: SQL,
  actor: Actor,
  key: string,
  body: unknown,
  work: () => Promise<T>,
): Promise<T> {
  const fingerprint = digest(JSON.stringify(body));
  await sql.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    actor.organization_id + actor.id + key,
  ]);
  const existing = (
    await sql.query(
      "SELECT fingerprint,response FROM idempotency WHERE organization_id=$1 AND actor_id=$2 AND key=$3",
      [actor.organization_id, actor.id, key],
    )
  ).rows[0];
  if (existing) {
    if (existing.fingerprint !== fingerprint)
      throw new DomainError(
        "Esta operação já foi enviada com outros valores. Confira a reserva antes de tentar novamente.",
        409,
      );
    return existing.response;
  }
  const result = await work();
  await sql.query(
    "INSERT INTO idempotency(organization_id,actor_id,key,fingerprint,response) VALUES($1,$2,$3,$4,$5)",
    [actor.organization_id, actor.id, key, fingerprint, JSON.stringify(result)],
  );
  return result;
}

export async function rentalDetails(sql: SQL, id: string) {
  const rental = (
    await sql.query(
      `SELECT r.*,c.name AS customer_name,c.phone AS customer_phone,c.address AS customer_address
    FROM rentals r JOIN customers c ON c.id=r.customer_id AND c.organization_id=r.organization_id WHERE r.id=$1`,
      [id],
    )
  ).rows[0];
  if (!rental) throw new DomainError("Reserva não encontrada.", 404);
  rental.lines = (
    await sql.query(
      `SELECT l.*,coalesce((SELECT sum(x.received_quantity) FROM rental_return_lines x WHERE x.rental_id=l.rental_id AND x.item_id=l.item_id),0)::int AS received_quantity,
      coalesce((SELECT sum(x.damaged_quantity) FROM rental_return_lines x WHERE x.rental_id=l.rental_id AND x.item_id=l.item_id),0)::int AS damaged_quantity
      FROM rental_lines l WHERE l.rental_id=$1 ORDER BY l.name`,
      [id],
    )
  ).rows;
  rental.returns = (await sql.query(`SELECT h.id,h.created_at,jsonb_agg(jsonb_build_object('item_id',x.item_id,'name',l.name,'received_quantity',x.received_quantity,'damaged_quantity',x.damaged_quantity,'note',x.note) ORDER BY l.name) AS lines
    FROM rental_returns h JOIN rental_return_lines x ON x.return_id=h.id AND x.organization_id=h.organization_id
    JOIN rental_lines l ON l.rental_id=x.rental_id AND l.item_id=x.item_id AND l.organization_id=x.organization_id
    WHERE h.rental_id=$1 GROUP BY h.id ORDER BY h.created_at,h.id`,[id])).rows;
  rental.maintenance = (await sql.query(`SELECT m.*,i.name,coalesce((SELECT jsonb_agg(jsonb_build_object('id',x.id,'quantity',x.quantity,'note',x.note,'created_at',x.created_at) ORDER BY x.created_at,x.id) FROM maintenance_releases x WHERE x.maintenance_id=m.id AND x.organization_id=m.organization_id),'[]'::jsonb) AS releases FROM item_maintenance m JOIN items i ON i.id=m.item_id AND i.organization_id=m.organization_id WHERE m.rental_id=$1 ORDER BY m.created_at,m.id`,[id])).rows;
  rental.reopenings = (await sql.query('SELECT id,reason,created_at FROM rental_reopenings WHERE rental_id=$1 ORDER BY created_at,id',[id])).rows;
  return rental;
}
export async function maintenanceQuantity(sql: SQL, itemId: string): Promise<number> {
  return (await sql.query('SELECT coalesce(sum(remaining_quantity),0)::int AS quantity FROM item_maintenance WHERE item_id=$1',[itemId])).rows[0].quantity;
}
export async function occupations(sql: SQL, itemId: string, exclude?: string) {
  const { rows } = await sql.query(
    `SELECT r.starts_at,r.ends_at,r.status,l.quantity,
    coalesce((SELECT jsonb_agg(jsonb_build_object('at',h.created_at,'quantity',x.received_quantity) ORDER BY h.created_at,h.id)
    FROM rental_return_lines x JOIN rental_returns h ON h.id=x.return_id AND h.organization_id=x.organization_id WHERE x.rental_id=r.id AND x.item_id=l.item_id),'[]'::jsonb) AS returns
    FROM rental_lines l
    JOIN rentals r ON r.id=l.rental_id AND r.organization_id=l.organization_id
    WHERE l.item_id=$1 AND r.status IN ('confirmed','separated','delivered','returned','closed') AND ($2::uuid IS NULL OR r.id<>$2)`,
    [itemId, exclude ?? null],
  );
  return rows.map((row) => ({
    start: new Date(row.starts_at).toISOString(),
    end: new Date(row.ends_at).toISOString(),
    status: row.status,
    quantity: row.quantity,
    returns: row.returns.map((part: any) => ({ at: new Date(part.at).toISOString(), quantity: part.quantity })),
  }));
}
export async function createRental(sql: SQL, actor: Actor, input: unknown) {
  const data = rentalInput.parse(input),
    days = rentalDays(data.start, data.end);
  const customer = (
    await sql.query("SELECT id,address FROM customers WHERE id=$1", [
      data.customerId,
    ])
  ).rows[0];
  if (!customer) throw new DomainError("Cliente não encontrado.", 404);
  if (data.fulfillment === "delivery" && !customer.address.trim())
    throw new DomainError(
      "Cadastre o endereço do cliente antes de solicitar entrega pela locadora.",
    );
  const items = (
    await sql.query(
      "SELECT * FROM items WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",
      [data.lines.map((l) => l.itemId)],
    )
  ).rows;
  if (items.length !== data.lines.length)
    throw new DomainError("Um dos materiais não foi encontrado.", 404);
  const lines = data.lines.map((line) => ({
    ...line,
    name: items.find((i) => i.id === line.itemId)!.name,
    unitPrice: items.find((i) => i.id === line.itemId)!.unit_price,
  }));
  const total = calculateTotal(lines, days, data.delivery, data.discount);
  const rental = (
    await sql.query(
      `INSERT INTO rentals(organization_id,customer_id,starts_at,ends_at,days,delivery,discount,total,notes,fulfillment)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        actor.organization_id,
        data.customerId,
        data.start,
        data.end,
        days,
        data.delivery,
        data.discount,
        total,
        data.notes,
        data.fulfillment,
      ],
    )
  ).rows[0];
  for (const line of lines)
    await sql.query(
      "INSERT INTO rental_lines(organization_id,rental_id,item_id,name,quantity,unit_price) VALUES($1,$2,$3,$4,$5,$6)",
      [
        actor.organization_id,
        rental.id,
        line.itemId,
        line.name,
        line.quantity,
        line.unitPrice,
      ],
    );
  await audit(sql, actor, "rental.created", rental.id);
  return rentalDetails(sql, rental.id);
}
export async function transitionRental(
  sql: SQL,
  actor: Actor,
  id: string,
  status: RentalStatus,
  reason: string,
) {
  const rental = (
    await sql.query("SELECT * FROM rentals WHERE id=$1 FOR UPDATE", [id])
  ).rows[0];
  if (!rental) throw new DomainError("Reserva não encontrada.", 404);
  assertTransition(rental.status, status);
  if (status === "delivered") {
    assertDeliveryWindow(
      new Date(rental.starts_at).toISOString(),
      new Date(rental.ends_at).toISOString(),
      new Date().toISOString(),
    );
    if (rental.fulfillment === "delivery") {
      const customer = (
        await sql.query("SELECT address FROM customers WHERE id=$1", [
          rental.customer_id,
        ])
      ).rows[0];
      if (!customer?.address.trim())
        throw new DomainError(
          "Informe o endereço do cliente antes de registrar a entrega.",
        );
    }
  }
  if (status === "canceled" && !reason)
    throw new DomainError("Informe o motivo do cancelamento.");
  if (status === "confirmed" || status === "delivered") {
    const lines = (
      await sql.query(
        "SELECT * FROM rental_lines WHERE rental_id=$1 ORDER BY item_id",
        [id],
      )
    ).rows;
    const items = (
      await sql.query(
        "SELECT * FROM items WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",
        [lines.map((l) => l.item_id)],
      )
    ).rows;
    for (const line of lines) {
      const item = items.find((i) => i.id === line.item_id)!;
      const available = availableQuantity(
        item.quantity - await maintenanceQuantity(sql, item.id),
        capacityWindowStart(status,new Date(rental.starts_at).toISOString(),new Date().toISOString()),
        new Date(rental.ends_at).toISOString(),
        await occupations(sql, item.id, id),
        new Date().toISOString(),
      );
      if (available < line.quantity)
        throw new DomainError(
          `${item.name}: apenas ${available} unidade(s) disponíveis neste período. Revise as reservas e devoluções pendentes.`,
          409,
        );
    }
  }
  await sql.query(
    "UPDATE rentals SET status=$1,cancellation_reason=$2 WHERE id=$3",
    [status, reason, id],
  );
  await audit(sql, actor, `rental.${status}`, id);
  return rentalDetails(sql, id);
}
