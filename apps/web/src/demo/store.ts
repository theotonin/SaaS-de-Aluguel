import {returnInput,maintenanceInput,closeInput,reopenInput} from '../../../../packages/contracts/returns';
import {financeInput} from '../../../../packages/contracts/finance';
import {financeSummary,assertFinanceEntry} from '../../../../packages/domain/payments';
import {applyReturn} from '../../../../packages/domain/returns';
import {exactMoney} from '../../../../packages/domain/money';
import { matchesSearch } from '../search';
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
  capacityWindowStart,
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
  const encodeCursor = (value: unknown) =>
    btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  const decodeCursor = (value: string) => {
    try {
      const base = value.replace(/-/g, "+").replace(/_/g, "/");
      const padded = base + "=".repeat((4 - (base.length % 4)) % 4);
      const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new DomainError("Cursor inválido.", 400);
    }
  };
  const paged=<T extends {id:string;name?:string;starts_at?:string}>(all:T[],p:URLSearchParams,sort:'name'|'rental'='name')=>{const page=Number(p.get('page')??1),requested=Number(p.get('limit')??50);if(!Number.isInteger(page)||page<1||!Number.isInteger(requested)||requested<1)throw new DomainError('Página ou quantidade inválida.',400);const limit=Math.min(requested,100),search=p.get('search')??'',cursorRaw=p.get('cursor'),cursor=cursorRaw?decodeCursor(cursorRaw):null;if(cursor&&(!cursor||cursor.v!==1||cursor.sort!==sort||typeof cursor.key!=='string'||typeof cursor.id!=='string'))throw new DomainError('Cursor inválido.',400);const filtered=all.filter((row:any)=>matchesSearch(Object.values(row).filter(v=>typeof v==='string'||typeof v==='number').join(' '),search)).sort((a,b)=>sort==='rental'?(Date.parse(b.starts_at!)-Date.parse(a.starts_at!))||a.id.localeCompare(b.id):String(a.name??'').toLocaleLowerCase().localeCompare(String(b.name??'').toLocaleLowerCase())||a.id.localeCompare(b.id));const after=cursor?filtered.filter(row=>sort==='rental'?(Date.parse(row.starts_at!)<Date.parse(cursor.key)||(row.starts_at===cursor.key&&row.id>cursor.id)):String(row.name??'').toLocaleLowerCase()>cursor.key||(String(row.name??'').toLocaleLowerCase()===cursor.key&&row.id>cursor.id)):filtered.slice((page-1)*limit);const window=after.slice(0,limit+1),hasMore=window.length>limit,items=window.slice(0,limit),last=items.at(-1),nextCursor=hasMore&&last?encodeCursor({v:1,sort,key:sort==='rental'?last.starts_at:String(last.name??'').toLocaleLowerCase(),id:last.id}):null;return{items,total:filtered.length,page,limit,pages:Math.ceil(filtered.length/limit),hasMore,nextCursor};};
  const localDate=(value:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
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
          (route.endsWith("/status") &&
          ["separated", "delivered"].includes(input?.status)) || route.endsWith("/returns") || /\/maintenance\/[^/]+\/release$/.test(route)
        )
      )
        throw new DomainError("Este perfil não pode executar esta ação.", 403);
      const maintenanceQuantity=(id:string)=>data.rentals.flatMap(r=>r.maintenance??[]).filter(j=>j.item_id===id).reduce((sum,j)=>sum+j.remaining_quantity,0);
      const detail = (r: Rental) => ({
        ...r,
        lines:r.lines?.map(line=>({...line,received_quantity:(r.returns??[]).flatMap(event=>event.lines).filter(x=>x.item_id===line.item_id).reduce((sum,x)=>sum+x.received_quantity,0),damaged_quantity:(r.returns??[]).flatMap(event=>event.lines).filter(x=>x.item_id===line.item_id).reduce((sum,x)=>sum+x.damaged_quantity,0)})),
        returns:r.returns??[],maintenance:r.maintenance??[],reopenings:r.reopenings??[],
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
                returns:(r.returns??[]).flatMap(event=>event.lines.filter(x=>x.item_id===id).map(x=>({at:event.created_at,quantity:x.received_quantity}))),
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
        result = paged(data.customers,url.searchParams);
      else if (route === "/customers" && method === "POST") {
        result = { id: crypto.randomUUID(), ...customerInput.parse(input) };
        data.customers.push(result);
      } else if (route === "/items" && method === "GET") { const items=data.items.map(i=>({...i,maintenance_quantity:maintenanceQuantity(i.id)}));result=paged(items,url.searchParams); }
      else if (
        (route === "/items" && method === "POST") ||
        (route.startsWith("/items/") && method === "PATCH")
      ) {
        if (role !== "admin")
          throw new DomainError("Ação exclusiva do administrador.", 403);
        const d = itemInput.parse(input),
          found = data.items.find((i) => i.id === route.split("/").at(-1));
        if(found&&d.quantity<maintenanceQuantity(found.id))throw new DomainError("O acervo total não pode ficar abaixo da quantidade em manutenção.",409);
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
        const items = data.items.map((i) => ({
          ...i,
          maintenance_quantity:maintenanceQuantity(i.id),
          available: availableQuantity(
            i.quantity-maintenanceQuantity(i.id),
            url.searchParams.get("start")!,
            url.searchParams.get("end")!,
            occupation(i.id),
            new Date().toISOString(),
          ),
        }));
        result=paged(items,url.searchParams);
      } else if (route === "/rentals" && method === "GET") {
        const status=url.searchParams.get('status');if(status&&status!=='all'&&!['draft','sent','confirmed','separated','delivered','returned','closed','canceled'].includes(status))throw new DomainError('Etapa inválida.',400);
        const all=data.rentals.map(detail).filter(r=>!status||status==='all'||r.status===status);result=paged(all,url.searchParams,'rental');
      } else if(route==='/agenda'&&method==='GET'){
        result=paged(data.rentals.filter(r=>['confirmed','separated','delivered'].includes(r.status)).map(detail),url.searchParams,'rental');
      } else if(route==='/overview'&&method==='GET'){
        const active=data.rentals.filter(r=>['confirmed','separated','delivered'].includes(r.status));
        result={active_count:active.length,open_count:data.rentals.filter(r=>['draft','sent'].includes(r.status)).length,active_value:active.reduce((sum,r)=>sum+BigInt(String(r.total)),0n).toString(),materials:data.items.length,upcoming:data.rentals.filter(r=>['confirmed','separated'].includes(r.status)&&Date.parse(r.starts_at)>=Date.now()).sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at)).slice(0,5).map(detail),latest:data.rentals.slice().sort((a,b)=>Number(b.number)-Number(a.number)).slice(0,5).map(detail)};
      } else if(route==='/today'&&method==='GET'){
        const today=localDate(new Date().toISOString()),pickups=data.rentals.filter(r=>localDate(r.starts_at)===today&&['confirmed','separated'].includes(r.status)).map(detail),returns=data.rentals.filter(r=>localDate(r.ends_at)===today&&r.status==='delivered').map(detail),overdue=data.rentals.filter(r=>r.status==='delivered'&&Date.parse(r.ends_at)<Date.now()).map(detail),maintenance=data.items.map(i=>({id:i.id,name:i.name,category:i.category,remaining_quantity:maintenanceQuantity(i.id)})).filter(i=>i.remaining_quantity>0);result={pickups,returns,overdue,maintenance,counts:{pickups:pickups.length,returns:returns.length,overdue:overdue.length,maintenance:maintenance.length}};
      } else if(route==='/finance/report'&&method==='GET'){
        if(!['admin','attendant'].includes(role))throw new DomainError('Você não tem permissão para consultar o financeiro.',403);
        const from=url.searchParams.get('from'),to=url.searchParams.get('to');if(!from||!to||from>to||!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to))throw new DomainError('Informe um período válido usando as datas inicial e final.',400);
        const selected=data.rentals.filter(r=>['confirmed','separated','delivered','returned','closed','canceled'].includes(r.status)&&localDate(r.starts_at)>=from&&localDate(r.starts_at)<=to),allEntries=Object.values(data.finance??{}).flat();
        const within=allEntries.filter(e=>localDate(e.created_at)>=from&&localDate(e.created_at)<=to),sum=(entries:any[],kind:string):bigint=>entries.filter(e=>e.kind===kind).reduce((n,e)=>n+BigInt(String(e.amount)),0n);
        const received=sum(within,'payment')-sum(within,'refund'),depositReceived=sum(within,'deposit_received'),depositRefunded=sum(within,'deposit_refund'),expenses=role==='admin'?sum(within,'expense'):0n;
        let receivable=0n,depositHeld=0n;for(const rental of selected){const entries=data.finance?.[rental.id]??[];const charged=(rental.status==='canceled'?0n:BigInt(String(rental.total)))+sum(entries,'charge')-sum(entries,'charge_reversal');receivable+=charged-sum(entries,'payment')+sum(entries,'refund');if(['confirmed','separated','delivered','returned','canceled'].includes(rental.status))depositHeld+=sum(entries,'deposit_received')-sum(entries,'deposit_refund');}
        const report={from,to,received:received.toString(),receivable:(receivable>0n?receivable:0n).toString(),depositReceived:depositReceived.toString(),depositRefunded:depositRefunded.toString(),depositMovement:(depositReceived-depositRefunded).toString(),depositHeld:(depositHeld>0n?depositHeld:0n).toString(),expenses:role==='admin'?expenses.toString():null,operatingNet:role==='admin'?(received-expenses).toString():null,cashNet:role==='admin'?(received+depositReceived-depositRefunded-expenses).toString():null,dateRules:{ledger:'Lançamentos agrupados pela data de registro em São Paulo; período inicial/final inclusivo.',receivables:'Saldo calculado pelo valor da reserva e lançamentos atuais, agrupado pelo início da reserva em São Paulo.',deposits:'Cauções retidas pertencem às reservas ativas e devolvidas no período por data de lançamento; depósitos não são receita.'}};
        if(url.searchParams.get('format')==='csv'){const brl=(value:unknown)=>value===null||value===undefined?'Restrito':exactMoney(String(value));const rows=[['Empresa',org.name],['Período',`${from} a ${to}`],['Recebido líquido em BRL (data de lançamento)',brl(report.received)],['A receber em BRL (data de início da reserva)',brl(report.receivable)],['Cauções recebidas em BRL (movimento no período)',brl(report.depositReceived)],['Cauções devolvidas em BRL (movimento no período)',brl(report.depositRefunded)],['Variação de cauções retidas em BRL no período',brl(report.depositMovement)],['Cauções retidas em BRL nas reservas do período',brl(report.depositHeld)],['Despesas em BRL (data de lançamento)',brl(report.expenses)],['Resultado operacional em BRL (recebido menos despesas)',brl(report.operatingNet)],['Movimento de caixa em BRL incluindo cauções',brl(report.cashNet)]];result={csv:rows.map(row=>row.map(v=>{const s=String(v),safe=/^[\t\r ]*[=+\-@]/.test(s)?`'${s}`:s;return `"${safe.replaceAll('"','""')}"`;}).join(';')).join('\r\n')+'\r\n'};}else result=report;
      }
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
        const action=route.split('/')[3];
        if(action==='finance'){
          if(!['admin','attendant'].includes(role))throw new DomainError('Acesso comercial necessário.',403);
          const ledger=(data.finance??={})[id]??=[];
          if(method==='POST'){
            const entry=financeInput.parse(input);
            if(entry.kind==='expense'&&role!=='admin')throw new DomainError('Despesa exige administrador.',403);
            assertFinanceEntry(rental.total,rental.status,ledger,entry);
            ledger.push({...entry,id:crypto.randomUUID(),created_at:new Date().toISOString()});
          }else if(method!=='GET')throw new DomainError('Operação indisponível.',404);
          result={entries:ledger,summary:financeSummary(rental.total,rental.status,ledger)};
        } else if(action==='returns'&&method==='POST'){
          if(!['admin','operator'].includes(role))throw new DomainError('A conferência exige administrador ou operador.',403);
          if(rental.status!=='delivered')throw new DomainError('Somente uma reserva entregue com materiais pendentes pode receber devolução.',409);
          const d=returnInput.parse(input),current=detail(rental);
          for(const part of d.lines){const line=current.lines?.find(l=>l.item_id===part.itemId);if(!line)throw new DomainError('Material não encontrado nesta reserva.',404);applyReturn({quantity:line.quantity,receivedQuantity:line.received_quantity,damagedQuantity:line.damaged_quantity},part.receivedQuantity,part.damagedQuantity);}
          const created_at=new Date().toISOString();
          (rental.returns??=[]).push({id:crypto.randomUUID(),created_at,lines:d.lines.map(part=>({item_id:part.itemId,name:rental.lines!.find(l=>l.item_id===part.itemId)!.name,received_quantity:part.receivedQuantity,damaged_quantity:part.damagedQuantity,note:part.note}))});
          for(const part of d.lines)if(part.damagedQuantity)(rental.maintenance??=[]).push({id:crypto.randomUUID(),item_id:part.itemId,name:rental.lines!.find(l=>l.item_id===part.itemId)!.name,quantity:part.damagedQuantity,remaining_quantity:part.damagedQuantity,note:part.note,created_at});
          if(detail(rental).lines!.every(l=>l.received_quantity===l.quantity))rental.status='returned';
          result=detail(rental);
        } else if(action==='maintenance'&&method==='POST'&&route.endsWith('/release')){
          if(!['admin','operator'].includes(role))throw new DomainError('A manutenção exige administrador ou operador.',403);
          const job=rental.maintenance?.find(j=>j.id===route.split('/')[4]);if(!job)throw new DomainError('Registro de manutenção não encontrado.',404);
          const d=maintenanceInput.parse(input);if(d.quantity>job.remaining_quantity)throw new DomainError('A liberação não pode exceder a quantidade em manutenção.',409);
          job.remaining_quantity-=d.quantity;(job.releases??=[]).push({id:crypto.randomUUID(),quantity:d.quantity,note:d.note,created_at:new Date().toISOString()});result=detail(rental);
        } else if(action==='close'&&method==='POST'){
          closeInput.parse(input);
          if(!['admin','attendant'].includes(role))throw new DomainError('Encerramento exige acesso comercial.',403);
          if(rental.status!=='returned')throw new DomainError('Conclua a devolução de todos os materiais antes de encerrar.',409);
          const summary=financeSummary(rental.total,rental.status,data.finance?.[id]??[]);
          if(summary.balance||summary.credit||summary.depositHeld)throw new DomainError('Confira o saldo, o crédito do cliente e a caução antes de encerrar.',409);
          rental.status='closed';result=detail(rental);
        } else if(action==='reopen'&&method==='POST'){
          input=reopenInput.parse(input);
          if(role!=='admin')throw new DomainError('Reabertura exige administrador.',403);
          if(rental.status!=='closed'||typeof input?.reason!=='string'||!input.reason.trim()||input.reason.trim().length>500)throw new DomainError('Informe o motivo para reabrir uma reserva encerrada.',409);
          rental.status='returned';(rental.reopenings??=[]).push({id:crypto.randomUUID(),reason:input.reason.trim(),created_at:new Date().toISOString()});result=detail(rental);
        } else if (!action&&method === "GET") result = detail(rental);
        else if(action==='status'&&method==='POST') {
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
                item.quantity-maintenanceQuantity(item.id),
                capacityWindowStart(d.status,rental.starts_at,new Date().toISOString()),
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
        }else throw new DomainError("Operação indisponível nesta demonstração.",404);
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
