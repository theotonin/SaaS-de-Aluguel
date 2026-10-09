import {
  companyInput,
  brandingInput,
  customerInput,
  itemInput,
  rentalInput,
  memberInput,
  transitionInput,
} from "../../../../packages/contracts/index";
import {
  rentalDays,
  calculateTotal,
  availableQuantity,
  assertTransition,
  assertDeliveryWindow,
  DomainError,
  type RentalStatus,
} from "../../../../packages/domain/rental";
import type { User, Rental } from "../types";
import { seed, type DemoState } from "./seed";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;
const key = "tonin-loca-demo-v1";
function load(storage: Storage): DemoState {
  try {
    const raw = storage.getItem(key);
    if (raw) {
      const s = JSON.parse(raw);
      if (
        s.version === 1 &&
        Array.isArray(s.organizations) &&
        s.organizations.length &&
        s.data &&
        s.operations &&
        Array.isArray(s.audit) &&
        s.organizations.every(
          (o: any) =>
            typeof o.id === "string" &&
            Array.isArray(s.data[o.id]?.items) &&
            Array.isArray(s.data[o.id]?.customers) &&
            Array.isArray(s.data[o.id]?.rentals) &&
            Array.isArray(s.data[o.id]?.members),
        )
      )
        return s;
    }
  } catch {
    /* Corrupt or unavailable browser storage starts a fresh demonstration. */
  }
  return seed();
}
export function createDemo(storage: Storage) {
  let state = load(storage),
    companyId = state.organizations[0].id;
  let role: User["role"] = "admin";
  const session = (): User => ({
    id: "demo-" + role,
    name: role === "superadmin" ? "Superadmin Tonin" : "Gestor da demonstração",
    email: "demo@example.test",
    role,
    organization_id: role === "superadmin" ? null : companyId,
    organization:
      role === "superadmin"
        ? null
        : state.organizations.find((o) => o.id === companyId)!,
    csrf: "demo",
  });
  return {
    session,
    selectRole(next: User["role"]) {
      role = next;
    },
    selectCompany(id: string) {
      if (!state.data[id]) throw new Error("Empresa não encontrada.");
      companyId = id;
      role = "admin";
    },
    reset() {
      storage.removeItem(key);
      state = seed();
      companyId = state.organizations[0].id;
      role = "admin";
    },
    async request(
      path: string,
      method = "GET",
      input?: any,
      operationKey?: string,
    ): Promise<any> {
      const next = method === "GET" ? state : structuredClone(state);
      const org = next.organizations.find((o) => o.id === companyId)!;
      const data = next.data[companyId];
      const url = new URL(path, "https://demo.example.test"),
        route = url.pathname;
      if (route === "/auth/me") return session();
      if (route.startsWith("/admin/") && role !== "superadmin")
        throw new DomainError("Acesso exclusivo do superadmin.", 403);
      if (
        !route.startsWith("/admin/") &&
        (role === "superadmin" || org.status !== "active")
      )
        throw new DomainError(
          "Escolha uma locadora ativa para explorar esta operação.",
          403,
        );
      if (
        method !== "GET" &&
        role === "operator" &&
        !(
          route.endsWith("/status") &&
          ["separated", "delivered"].includes(input?.status)
        )
      )
        throw new DomainError("Este perfil não pode executar esta ação.", 403);
      const detail = (r: Rental) => ({
        ...r,
        customer_name:
          data.customers.find((c) => c.id === r.customer_id)?.name ??
          r.customer_name,
        customer_phone: data.customers.find((c) => c.id === r.customer_id)
          ?.phone,
        customer_address: data.customers.find((c) => c.id === r.customer_id)
          ?.address,
      });
      const occupation = (id: string, exclude?: string) =>
        data.rentals
          .filter((r) => r.id !== exclude)
          .flatMap((r) =>
            (r.lines ?? [])
              .filter((l) => l.item_id === id)
              .map((l) => ({
                start: r.starts_at,
                end: r.ends_at,
                status: r.status,
                quantity: l.quantity,
              })),
          );
      const operationId = companyId + ":" + role + ":" + operationKey;
      const fingerprint = JSON.stringify({ path, input });
      if (operationKey && next.operations[operationId]) {
        const op = next.operations[operationId];
        if (op.fingerprint !== fingerprint)
          throw new DomainError(
            "Esta operação já foi enviada com outros valores.",
            409,
          );
        return structuredClone(op.result);
      }
      let result: any;
      if (route === "/admin/companies" && method === "GET")
        result = next.organizations;
      else if (route === "/admin/audit" && method === "GET")
        result = next.audit;
      else if (route === "/admin/companies" && method === "POST") {
        const d = companyInput.parse(input);
        if (next.organizations.some((o) => o.slug === d.slug))
          throw new DomainError("Este endereço já está cadastrado.", 409);
        const company = {
          id: crypto.randomUUID(),
          name: d.name,
          slug: d.slug,
          accent: "#acd5bd",
          status: "active" as const,
          plan: d.plan,
          user_limit: d.userLimit,
          item_limit: d.itemLimit,
          created_at: new Date().toISOString(),
        };
        next.organizations.push(company);
        next.data[company.id] = {
          customers: [],
          items: [],
          rentals: [],
          members: [
            {
              id: crypto.randomUUID(),
              name: d.ownerName,
              email: d.ownerEmail,
              role: "admin",
              active: true,
            },
          ],
        };
        next.audit.unshift({
          action: "company.created",
          company: company.name,
          actor: "Superadmin Tonin",
          created_at: new Date().toISOString(),
        });
        result = { id: company.id };
      } else if (route.startsWith("/admin/companies/") && method === "PATCH") {
        const d = brandingInput.parse(input),
          found = next.organizations.find(
            (o) => o.id === route.split("/").at(-1),
          );
        if (!found) throw new DomainError("Empresa não encontrada.", 404);
        Object.assign(found, {
          name: d.name,
          accent: d.accent,
          status: d.status,
          plan: d.plan,
          user_limit: d.userLimit,
          item_limit: d.itemLimit,
        });
        next.audit.unshift({
          action: "company.updated",
          company: found.name,
          actor: "Superadmin Tonin",
          created_at: new Date().toISOString(),
        });
        result = { id: found.id };
      } else if (route === "/customers" && method === "GET")
        result = data.customers;
      else if (route === "/customers" && method === "POST") {
        result = { id: crypto.randomUUID(), ...customerInput.parse(input) };
        data.customers.push(result);
      } else if (route === "/items" && method === "GET") result = data.items;
      else if (
        (route === "/items" && method === "POST") ||
        (route.startsWith("/items/") && method === "PATCH")
      ) {
        if (role !== "admin")
          throw new DomainError("Ação exclusiva do administrador.", 403);
        const d = itemInput.parse(input),
          found = data.items.find((i) => i.id === route.split("/").at(-1));
        if (method === "PATCH" && !found)
          throw new DomainError("Material não encontrado.", 404);
        if (
          found &&
          d.quantity < found.quantity &&
          occupation(found.id).some(
            (o) =>
              ["confirmed", "separated", "delivered"].includes(o.status) &&
              (o.status === "delivered" || Date.parse(o.end) > Date.now()),
          )
        )
          throw new DomainError(
            "Há reservas ativas para este material. Resolva as reservas antes de reduzir a quantidade.",
            409,
          );
        if (method === "POST" && data.items.length >= org.item_limit)
          throw new DomainError("Limite de materiais do plano atingido.", 409);
        result = {
          id: found?.id ?? crypto.randomUUID(),
          name: d.name,
          category: d.category,
          description: d.description,
          quantity: d.quantity,
          unit_price: d.unitPrice,
        };
        if (found) Object.assign(found, result);
        else data.items.push(result);
      } else if (route === "/availability") {
        result = data.items.map((i) => ({
          ...i,
          available: availableQuantity(
            i.quantity,
            url.searchParams.get("start")!,
            url.searchParams.get("end")!,
            occupation(i.id),
            new Date().toISOString(),
          ),
        }));
      } else if (route === "/rentals" && method === "GET")
        result = data.rentals.map(detail);
      else if (route === "/rentals" && method === "POST") {
        const d = rentalInput.parse(input),
          days = rentalDays(d.start, d.end);
        const customer = data.customers.find((c) => c.id === d.customerId);
        if (!customer) throw new DomainError("Cliente não encontrado.", 404);
        if (d.fulfillment === "delivery" && !customer.address.trim())
          throw new DomainError(
            "Cadastre o endereço do cliente antes de solicitar entrega pela locadora.",
          );
        const lines = d.lines.map((l) => {
          const i = data.items.find((i) => i.id === l.itemId);
          if (!i) throw new DomainError("Material não encontrado.", 404);
          return {
            item_id: i.id,
            name: i.name,
            quantity: l.quantity,
            unit_price: i.unit_price,
          };
        });
        const total = calculateTotal(
          lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unit_price })),
          days,
          d.delivery,
          d.discount,
        );
        result = {
          id: crypto.randomUUID(),
          number:
            Math.max(1000, ...data.rentals.map((r) => Number(r.number))) + 1,
          customer_id: customer.id,
          customer_name: customer.name,
          starts_at: d.start,
          ends_at: d.end,
          days,
          delivery: d.delivery,
          discount: d.discount,
          total,
          status: "draft",
          notes: d.notes,
          fulfillment: d.fulfillment,
          cancellation_reason: "",
          lines,
        };
        data.rentals.push(result);
      } else if (route.startsWith("/rentals/")) {
        const id = route.split("/")[2],
          rental = data.rentals.find((r) => r.id === id);
        if (!rental) throw new DomainError("Reserva não encontrada.", 404);
        if (method === "GET") result = detail(rental);
        else {
          const d = transitionInput.parse(input);
          assertTransition(rental.status as RentalStatus, d.status);
          if (d.status === "delivered") {
            assertDeliveryWindow(
              rental.starts_at,
              rental.ends_at,
              new Date().toISOString(),
            );
            if (
              rental.fulfillment === "delivery" &&
              !data.customers
                .find((c) => c.id === rental.customer_id)
                ?.address.trim()
            )
              throw new DomainError(
                "Informe o endereço do cliente antes de registrar a entrega.",
              );
          }
          if (d.status === "canceled" && !d.reason)
            throw new DomainError("Informe o motivo do cancelamento.");
          if (d.status === "confirmed" || d.status === "delivered")
            for (const l of rental.lines ?? []) {
              const item = data.items.find((i) => i.id === l.item_id)!;
              const available = availableQuantity(
                item.quantity,
                rental.starts_at,
                rental.ends_at,
                occupation(item.id, rental.id),
                new Date().toISOString(),
              );
              if (available < l.quantity)
                throw new DomainError(
                  `${item.name}: apenas ${available} unidade(s) disponíveis neste período.`,
                  409,
                );
            }
          rental.status = d.status;
          rental.cancellation_reason = d.reason;
          result = detail(rental);
        }
      } else if (route === "/team" && method === "GET") {
        if (role !== "admin")
          throw new DomainError("Acesso exclusivo do administrador.", 403);
        result = data.members;
      } else if (route === "/team" && method === "POST") {
        if (role !== "admin")
          throw new DomainError("Acesso exclusivo do administrador.", 403);
        const d = memberInput.parse(input);
        if (data.members.length >= org.user_limit)
          throw new DomainError("Limite de usuários atingido.", 409);
        if (data.members.some((m) => m.email === d.email))
          throw new DomainError("E-mail já cadastrado.", 409);
        result = {
          id: crypto.randomUUID(),
          name: d.name,
          email: d.email,
          role: d.role,
          active: true,
        };
        data.members.push(result);
      } else
        throw new DomainError("Operação indisponível nesta demonstração.", 404);
      if (method !== "GET") {
        if (operationKey)
          next.operations[operationId] = { fingerprint, result };
        try {
          storage.setItem(key, JSON.stringify(next));
        } catch {
          throw new DomainError(
            "O navegador não conseguiu salvar a demonstração. Libere espaço ou permita o armazenamento local.",
          );
        }
        state = next;
      }
      return structuredClone(result);
    },
  };
}
