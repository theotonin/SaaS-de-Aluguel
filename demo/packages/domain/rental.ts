export const statuses = [
  "draft",
  "sent",
  "confirmed",
  "separated",
  "delivered",
  "returned",
  "closed",
  "canceled",
] as const;
export type RentalStatus = (typeof statuses)[number];
export type Occupation = {
  start: string;
  end: string;
  quantity: number;
  status: string;
};

export class DomainError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export function rentalDays(start: string, end: string): number {
  const duration = Date.parse(end) - Date.parse(start);
  if (!Number.isFinite(duration) || duration <= 0)
    throw new DomainError(
      "Informe retirada e retorno válidos; o retorno deve ocorrer depois da retirada.",
    );
  return Math.ceil(duration / 86_400_000);
}

export function availableQuantity(
  total: number,
  start: string,
  end: string,
  reservations: Occupation[],
  now: string,
): number {
  rentalDays(start, end);
  const from = Date.parse(start),
    to = Date.parse(end);
  const events: [number, number][] = [];
  for (const reservation of reservations) {
    if (!["confirmed", "separated", "delivered"].includes(reservation.status))
      continue;
    const a = Date.parse(reservation.start);
    const b =
      reservation.status === "delivered" &&
      Date.parse(reservation.end) <= Date.parse(now)
        ? Infinity
        : Date.parse(reservation.end);
    if (a >= to || b <= from) continue;
    events.push(
      [Math.max(a, from), reservation.quantity],
      [Math.min(b, to), -reservation.quantity],
    );
  }
  // Returns at a boundary free capacity before a new withdrawal at that instant.
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let occupied = 0,
    peak = 0;
  for (const [, quantity] of events) {
    occupied += quantity;
    peak = Math.max(peak, occupied);
  }
  return Math.max(0, total - peak);
}

export function assertDeliveryWindow(
  start: string,
  end: string,
  now: string,
): void {
  rentalDays(start, end);
  const instant = Date.parse(now);
  if (
    !Number.isFinite(instant) ||
    instant < Date.parse(start) ||
    instant >= Date.parse(end)
  ) {
    throw new DomainError(
      "A entrega deve ocorrer dentro do período reservado. Confira as datas; se necessário, cancele a reserva antes da saída e crie um orçamento com o período correto.",
      409,
    );
  }
}

function integer(value: number, min: number): void {
  if (!Number.isSafeInteger(value) || value < min)
    throw new DomainError(
      "Informe quantidades e valores válidos, sem frações de centavo.",
    );
}

export function calculateTotal(
  lines: { quantity: number; unitPrice: number }[],
  days: number,
  delivery: number,
  discount: number,
): number {
  integer(days, 1);
  integer(delivery, 0);
  integer(discount, 0);
  if (!lines.length)
    throw new DomainError("Adicione pelo menos um item ao orçamento.");
  let total = delivery;
  for (const line of lines) {
    integer(line.quantity, 1);
    integer(line.unitPrice, 0);
    total += line.quantity * line.unitPrice * days;
    integer(total, 0);
  }
  if (discount > total)
    throw new DomainError("O desconto não pode exceder o valor do orçamento.");
  return total - discount;
}

const transitions: Record<RentalStatus, RentalStatus[]> = {
  draft: ["sent", "confirmed", "canceled"],
  sent: ["confirmed", "canceled"],
  confirmed: ["separated", "canceled"],
  separated: ["delivered", "canceled"],
  delivered: ["returned"],
  returned: ["closed"],
  closed: [],
  canceled: [],
};
export function assertTransition(from: RentalStatus, to: RentalStatus): void {
  if (!transitions[from]?.includes(to))
    throw new DomainError("Esta mudança de etapa não é permitida.", 409);
}
