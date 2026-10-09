import {recordReturn,releaseMaintenance,closeRental,reopenRental} from './returns.ts';
import {financeDetails,recordFinance} from './payments.ts';
import type { IncomingMessage, ServerResponse } from "node:http";
import { createHmac } from 'node:crypto';
import { readJson as readBody } from "./read-json.ts";
import { clientAddress } from "./client-address.ts";
import { z } from "zod";
import type { Database } from "../../packages/database/index.ts";
import { tenant } from "../../packages/database/index.ts";
import {
  loginInput,
  companyInput,
  brandingInput,
  customerInput,
  itemInput,
  memberInput,
  transitionInput,
} from "../../packages/contracts/index.ts";
import {
  DomainError,
  availableQuantity,
} from "../../packages/domain/rental.ts";
import {
  digest,
  opaqueToken,
  hashPassword,
  verifyPassword,
  sameToken,
} from "./auth.ts";
import {
  createRental,
  transitionRental,
  rentalDetails,
  idempotent,
  audit,
  occupations,
  maintenanceQuantity,
} from "./rentals.ts";
import { pageResult, parsePage, searchPredicate } from './list-query.ts';
import { loadFinanceReport, parseReportPeriod, reportCsv } from './finance-report.ts';

type Options = { origin: string; production: boolean; trustedProxy?: string; clientIp?: (req: IncomingMessage) => string; loginLimitSecret?: string };

function send(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}
export function createApp(db: Database, options: Options) {
  const rateLimitSecret = options.loginLimitSecret ?? 'loca-development-only-login-throttle-secret';
  if(options.production&&(!options.loginLimitSecret||Buffer.byteLength(options.loginLimitSecret)<32))throw new Error('LOGIN_RATE_LIMIT_SECRET precisa ter pelo menos 32 bytes em produção.');
  const dummy = hashPassword(opaqueToken());
  const cookieName = options.production ? "__Host-loca" : "loca_session";
  const cookie = (value: string, expire = false) =>
    `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Lax; ${options.production ? "Secure; " : ""}Max-Age=${expire ? 0 : 43200}`;
  return async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    try {
      const url = new URL(req.url ?? "/", options.origin),
        path = url.pathname,
        method = req.method ?? "GET";
      if (path === "/api/health" && method === "GET") {
        await db.query("SELECT 1");
        send(res, 200, { status: "ok" });
        return;
      }
      const mutates = !["GET", "HEAD"].includes(method);
      if (mutates && req.headers.origin !== options.origin)
        throw new DomainError(
          "Origem da solicitação não autorizada. Reabra o sistema no endereço configurado.",
          403,
        );
      if (path === "/api/auth/login" && method === "POST") {
        const ip = options.clientIp?.(req) ?? clientAddress(
            req.socket.remoteAddress,
            req.headers["x-forwarded-for"],
            options.trustedProxy,
          ),
          key = createHmac('sha256', rateLimitSecret).update(ip).digest('hex');
        const throttled = (await db.query<{ allowed: boolean }>('SELECT auth_login_attempt($1) AS allowed', [key])).rows[0];
        if (!throttled?.allowed)
          throw new DomainError(
            "Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.",
            429,
          );
        const data = loginInput.parse(await readBody(req));
        const found = (
          await db.query("SELECT * FROM auth_find_user($1)", [data.email])
        ).rows[0];
        const valid = await verifyPassword(
          data.password,
          found?.password_hash ?? (await dummy),
        );
        if (!found?.active || !valid)
          throw new DomainError("E-mail ou senha incorretos.", 401);
        await db.query('SELECT auth_login_clear($1)', [key]);
        const token = opaqueToken(),
          csrf = opaqueToken();
        await db.query("SELECT auth_save_session($1,$2,$3)", [
          digest(token),
          found.id,
          csrf,
        ]);
        res.setHeader("Set-Cookie", cookie(token));
        const user = (
          await db.query("SELECT * FROM auth_session($1)", [digest(token)])
        ).rows[0];
        send(res, 200, user);
        return;
      }
      const rawCookie =
        req.headers.cookie
          ?.split(";")
          .map((v) => v.trim())
          .find((v) => v.startsWith(cookieName + "="))
          ?.slice(cookieName.length + 1) ?? "";
      if (!rawCookie || rawCookie.length > 128)
        throw new DomainError("Entre na sua conta para continuar.", 401);
      const token = digest(rawCookie);
      const user = (await db.query("SELECT * FROM auth_session($1)", [token]))
        .rows[0];
      if (!user)
        throw new DomainError("Sua sessão expirou. Entre novamente.", 401);
      if (
        mutates &&
        !sameToken(String(req.headers["x-csrf-token"] ?? ""), user.csrf)
      )
        throw new DomainError(
          "Sessão do formulário inválida. Atualize a página e tente novamente.",
          403,
        );
      if (path === "/api/auth/me" && method === "GET") {
        send(res, 200, user);
        return;
      }
      if (path === "/api/auth/logout" && method === "POST") {
        await db.query("SELECT auth_logout($1)", [token]);
        res.setHeader("Set-Cookie", cookie("", true));
        send(res, 200, { ok: true });
        return;
      }
      if (path.startsWith("/api/admin/")) {
        if (user.role !== "superadmin")
          throw new DomainError("Acesso exclusivo do superadmin.", 403);
        if (path === "/api/admin/companies" && method === "GET") {
          send(
            res,
            200,
            (await db.query("SELECT * FROM admin_companies($1)", [token])).rows,
          );
          return;
        }
        if (path === "/api/admin/companies" && method === "POST") {
          const data = companyInput.parse(await readBody(req));
          const password = await hashPassword(data.ownerPassword);
          const { ownerPassword: _, ...safe } = data;
          const row = (
            await db.query("SELECT admin_create_company($1,$2,$3) AS id", [
              token,
              JSON.stringify(safe),
              password,
            ])
          ).rows[0];
          send(res, 201, row);
          return;
        }
        const match = path.match(/^\/api\/admin\/companies\/([^/]+)$/);
        if (match && method === "PATCH") {
          const id = z.uuid().parse(match[1]),
            data = brandingInput.parse(await readBody(req));
          const row = (
            await db.query("SELECT admin_update_company($1,$2,$3) AS id", [
              token,
              id,
              JSON.stringify(data),
            ])
          ).rows[0];
          if (!row.id) throw new DomainError("Empresa não encontrada.", 404);
          send(res, 200, row);
          return;
        }
        if (path === "/api/admin/audit" && method === "GET") {
          send(
            res,
            200,
            (await db.query("SELECT * FROM admin_audit($1)", [token])).rows,
          );
          return;
        }
        throw new DomainError("Página não encontrada.", 404);
      }
      if (!user.organization_id || user.organization?.status !== "active")
        throw new DomainError(
          user.role === "superadmin"
            ? "Escolha uma função administrativa. Dados das locadoras têm acesso próprio."
            : "O acesso desta empresa está suspenso. Entre em contato com a Tonin.",
          403,
        );
      const can = (...roles: string[]) => {
        if (!roles.includes(user.role))
          throw new DomainError("Você não tem permissão para esta ação.", 403);
      };
      if (path === "/api/team") {
        can("admin");
        if (method === "GET") {
          send(
            res,
            200,
            (await db.query("SELECT * FROM team_members($1)", [token])).rows,
          );
          return;
        }
        if (method === "POST") {
          const data = memberInput.parse(await readBody(req)),
            password = await hashPassword(data.password);
          const { password: _, ...safe } = data;
          send(
            res,
            201,
            (
              await db.query("SELECT team_create_member($1,$2,$3) AS id", [
                token,
                JSON.stringify(safe),
                password,
              ])
            ).rows[0],
          );
          return;
        }
      }
      const body = mutates ? await readBody(req) : undefined;
      let status = 200;
      const result = await tenant(db, user.organization_id, async (sql) => {
        const recovery=path.match(/^\/api\/operations\/([^/]+)$/);
        if(recovery&&method==='GET'){
          const key=z.uuid().parse(recovery[1]);
          await sql.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[user.organization_id+user.id+key]);
          const row=(await sql.query('SELECT response FROM idempotency WHERE organization_id=$1 AND actor_id=$2 AND key=$3',[user.organization_id,user.id,key])).rows[0];
          return {found:!!row,result:row?.response??null};
        }
        if (path === "/api/customers" && method === "GET") {
          const page = parsePage(url.searchParams), filter=searchPredicate(['name',"regexp_replace(phone,'[^0-9]','','g')",'email']);
          if(page.cursor&&page.cursor.sort!=='name')throw new DomainError('Cursor incompatível com esta lista.',400);
          const total = Number((await sql.query(`SELECT count(*)::int AS total FROM customers WHERE ${filter}`, [page.search])).rows[0].total);
          const cursor=page.cursor, cursorSql=cursor?'AND (lower(name)>$2 OR (lower(name)=$2 AND id>$3))':'';
          const rows = (await sql.query(`SELECT *,lower(name) AS "__cursorKey" FROM customers WHERE ${filter} ${cursorSql} ORDER BY lower(name),id LIMIT $${cursor?4:2}${cursor?'':' OFFSET $3'}`, cursor?[page.search,cursor.key,cursor.id,page.limit+1]:[page.search,page.limit+1,page.offset])).rows;
          return pageResult(rows,total,page,'name');
        }
        if (path === '/api/overview' && method === 'GET') {
          const summary = (await sql.query(`SELECT
            count(*) FILTER(WHERE status IN ('confirmed','separated','delivered'))::int AS active_count,
            count(*) FILTER(WHERE status IN ('draft','sent'))::int AS open_count,
            COALESCE(sum(total) FILTER(WHERE status IN ('confirmed','separated','delivered')),0)::text AS active_value
            FROM rentals`)).rows[0];
          const materials = Number((await sql.query('SELECT count(*)::int AS count FROM items')).rows[0].count);
          const upcoming = (await sql.query(`SELECT r.*,c.name AS customer_name FROM rentals r JOIN customers c ON c.id=r.customer_id AND c.organization_id=r.organization_id WHERE r.status IN ('confirmed','separated') AND r.starts_at>=now() ORDER BY r.starts_at,r.id LIMIT 5`)).rows;
          const latest = (await sql.query(`SELECT r.*,c.name AS customer_name FROM rentals r JOIN customers c ON c.id=r.customer_id AND c.organization_id=r.organization_id ORDER BY r.number DESC,r.id LIMIT 5`)).rows;
          return { ...summary, materials, upcoming, latest };
        }
        if (path === "/api/customers" && method === "POST") {
          can("admin", "attendant");
          const d = customerInput.parse(body);
          status = 201;
          const row = (
            await sql.query(
              "INSERT INTO customers(organization_id,name,phone,email,address) VALUES($1,$2,$3,$4,$5) RETURNING *",
              [user.organization_id, d.name, d.phone, d.email, d.address],
            )
          ).rows[0];
          await audit(sql, user as any, "customer.created", row.id);
          return row;
        }
        if (path === "/api/items" && method === "GET") {
          const page = parsePage(url.searchParams), filter=searchPredicate(['i.name','i.category','i.description']);
          if(page.cursor&&page.cursor.sort!=='name')throw new DomainError('Cursor incompatível com esta lista.',400);
          const total = Number((await sql.query(`SELECT count(*)::int AS total FROM items i WHERE ${filter}`, [page.search])).rows[0].total);
          const cursor=page.cursor, cursorSql=cursor?'AND (lower(i.name)>$2 OR (lower(i.name)=$2 AND i.id>$3))':'';
          const rows = (await sql.query(`SELECT i.*,coalesce((SELECT sum(m.remaining_quantity) FROM item_maintenance m WHERE m.item_id=i.id),0)::int AS maintenance_quantity,lower(i.name) AS "__cursorKey" FROM items i WHERE ${filter} ${cursorSql} ORDER BY lower(i.name),i.id LIMIT $${cursor?4:2}${cursor?'':' OFFSET $3'}`, cursor?[page.search,cursor.key,cursor.id,page.limit+1]:[page.search,page.limit+1,page.offset])).rows;
          return pageResult(rows,total,page,'name');
        }
        if (path === "/api/items" && method === "POST") {
          can("admin");
          const d = itemInput.parse(body);
          const org = (
            await sql.query("SELECT * FROM organization_lock($1)", [token])
          ).rows[0];
          const count = (
            await sql.query("SELECT count(*)::int AS count FROM items")
          ).rows[0].count;
          if (count >= org.item_limit)
            throw new DomainError(
              "Limite de materiais do plano atingido. Contate a Tonin.",
              409,
            );
          status = 201;
          const row = (
            await sql.query(
              "INSERT INTO items(organization_id,name,category,quantity,unit_price,description) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
              [
                user.organization_id,
                d.name,
                d.category,
                d.quantity,
                d.unitPrice,
                d.description,
              ],
            )
          ).rows[0];
          await audit(sql, user as any, "item.created", row.id);
          return row;
        }
        const itemMatch = path.match(/^\/api\/items\/([^/]+)$/);
        if (itemMatch && method === "PATCH") {
          can("admin");
          const id = z.uuid().parse(itemMatch[1]),
            d = itemInput.parse(body);
          const current = (
            await sql.query("SELECT * FROM items WHERE id=$1 FOR UPDATE", [id])
          ).rows[0];
          if (!current) throw new DomainError("Material não encontrado.", 404);
          const maintenance = await maintenanceQuantity(sql, id);
          if (d.quantity < maintenance) throw new DomainError("O acervo total não pode ficar abaixo da quantidade em manutenção.",409);
          const committed = await occupations(sql, id);
          if (
            d.quantity < current.quantity &&
            committed.some(
              (o) => o.status === "delivered" || Date.parse(o.end) > Date.now(),
            )
          )
            throw new DomainError(
              "Há reservas ativas para este material. Resolva as reservas antes de reduzir a quantidade.",
              409,
            );
          const row = (
            await sql.query(
              "UPDATE items SET name=$1,category=$2,quantity=$3,unit_price=$4,description=$5 WHERE id=$6 RETURNING *",
              [d.name, d.category, d.quantity, d.unitPrice, d.description, id],
            )
          ).rows[0];
          await audit(sql, user as any, "item.updated", id);
          return row;
        }
        if (path === "/api/availability" && method === "GET") {
          const start = z.iso
              .datetime({ offset: true })
              .parse(url.searchParams.get("start")),
            end = z.iso
              .datetime({ offset: true })
              .parse(url.searchParams.get("end"));
          const page = parsePage(url.searchParams), filter=searchPredicate(['i.name','i.category','i.description']);
          if(page.cursor&&page.cursor.sort!=='name')throw new DomainError('Cursor incompatível com esta lista.',400);
          const total = Number((await sql.query(`SELECT count(*)::int AS total FROM items i WHERE ${filter}`, [page.search])).rows[0].total);
          const cursor=page.cursor, cursorSql=cursor?'AND (lower(i.name)>$2 OR (lower(i.name)=$2 AND i.id>$3))':'';
          const rows = (await sql.query(`SELECT i.*,coalesce((SELECT sum(m.remaining_quantity) FROM item_maintenance m WHERE m.item_id=i.id),0)::int AS maintenance_quantity,lower(i.name) AS "__cursorKey" FROM items i WHERE ${filter} ${cursorSql} ORDER BY lower(i.name),i.id LIMIT $${cursor?4:2}${cursor?'':' OFFSET $3'}`, cursor?[page.search,cursor.key,cursor.id,page.limit+1]:[page.search,page.limit+1,page.offset])).rows;
          const items = await Promise.all(
            rows.map(async (item) => ({
              ...item,
              id: item.id,
              __cursorKey: item.__cursorKey,
              available: availableQuantity(
                item.quantity - item.maintenance_quantity,
                start,
                end,
                await occupations(sql, item.id),
                new Date().toISOString(),
              ),
            })),
          );
          return pageResult(items,total,page,'name');
        }
        if (path === "/api/rentals" && method === "GET") {
          const page = parsePage(url.searchParams), rawStatus = url.searchParams.get('status'), search=searchPredicate(['c.name','r.number::text']);
          if(page.cursor&&page.cursor.sort!=='rental')throw new DomainError('Cursor incompatível com esta lista.',400);
          const status = rawStatus && rawStatus !== 'all' ? z.enum(['draft','sent','confirmed','separated','delivered','returned','closed','canceled']).parse(rawStatus) : null;
          const total = Number((await sql.query(`SELECT count(*)::int AS total FROM rentals r JOIN customers c ON c.id=r.customer_id AND c.organization_id=r.organization_id WHERE ${search} AND ($2::text IS NULL OR r.status=$2)`, [page.search,status])).rows[0].total);
          const cursor=page.cursor, cursorSql=cursor?'AND (r.starts_at<$3::timestamptz OR (r.starts_at=$3::timestamptz AND r.id>$4))':'';
          const rows = (await sql.query(`SELECT r.*,c.name AS customer_name,r.starts_at AS "__cursorKey" FROM rentals r JOIN customers c ON c.id=r.customer_id AND c.organization_id=r.organization_id WHERE ${search} AND ($2::text IS NULL OR r.status=$2) ${cursorSql} ORDER BY r.starts_at DESC,r.id LIMIT $${cursor?5:3}${cursor?'':' OFFSET $4'}`, cursor?[page.search,status,cursor.key,cursor.id,page.limit+1]:[page.search,status,page.limit+1,page.offset])).rows;
          return pageResult(rows,total,page,'rental');
        }
        if (path === '/api/today' && method === 'GET') {
          const pickups = (await sql.query(`SELECT r.*,c.name AS customer_name FROM rentals r JOIN customers c ON c.id=r.customer_id AND c.organization_id=r.organization_id WHERE (r.starts_at AT TIME ZONE 'America/Sao_Paulo')::date=(now() AT TIME ZONE 'America/Sao_Paulo')::date AND r.status IN ('confirmed','separated') ORDER BY r.starts_at,r.id LIMIT 100`)).rows;
          const returnsToday = (await sql.query(`SELECT r.*,c.name AS customer_name FROM rentals r JOIN customers c ON c.id=r.customer_id AND c.organization_id=r.organization_id WHERE (r.ends_at AT TIME ZONE 'America/Sao_Paulo')::date=(now() AT TIME ZONE 'America/Sao_Paulo')::date AND r.status='delivered' ORDER BY r.ends_at,r.id LIMIT 100`)).rows;
          const overdue = (await sql.query(`SELECT r.*,c.name AS customer_name FROM rentals r JOIN customers c ON c.id=r.customer_id AND c.organization_id=r.organization_id WHERE r.status='delivered' AND r.ends_at<now() ORDER BY r.ends_at,r.id LIMIT 100`)).rows;
          const maintenance = (await sql.query(`SELECT i.id,i.name,i.category,sum(m.remaining_quantity)::int AS remaining_quantity FROM item_maintenance m JOIN items i ON i.id=m.item_id AND i.organization_id=m.organization_id WHERE m.remaining_quantity>0 GROUP BY i.id,i.name,i.category ORDER BY lower(i.name),i.id LIMIT 100`)).rows;
          const counts = (await sql.query(`SELECT
            (SELECT count(*)::int FROM rentals WHERE (starts_at AT TIME ZONE 'America/Sao_Paulo')::date=(now() AT TIME ZONE 'America/Sao_Paulo')::date AND status IN ('confirmed','separated')) AS pickups,
            (SELECT count(*)::int FROM rentals WHERE (ends_at AT TIME ZONE 'America/Sao_Paulo')::date=(now() AT TIME ZONE 'America/Sao_Paulo')::date AND status='delivered') AS returns,
            (SELECT count(*)::int FROM rentals WHERE status='delivered' AND ends_at<now()) AS overdue,
            (SELECT count(DISTINCT i.id)::int FROM item_maintenance m JOIN items i ON i.id=m.item_id AND i.organization_id=m.organization_id WHERE m.remaining_quantity>0) AS maintenance`)).rows[0];
          return { pickups, returns: returnsToday, overdue, maintenance, counts };
        }
        if (path === '/api/agenda' && method === 'GET') {
          const page=parsePage(url.searchParams);
          if(page.cursor&&page.cursor.sort!=='rental')throw new DomainError('Cursor incompatível com esta lista.',400);
          const active="status IN ('confirmed','separated','delivered')";
          const total=Number((await sql.query(`SELECT count(*)::int AS total FROM rentals WHERE ${active}`)).rows[0].total);
          const cursor=page.cursor,cursorSql=cursor?'AND (starts_at<$1::timestamptz OR (starts_at=$1::timestamptz AND id>$2))':'';
          const rows=(await sql.query(`SELECT r.*,c.name AS customer_name,r.starts_at AS "__cursorKey" FROM rentals r JOIN customers c ON c.id=r.customer_id AND c.organization_id=r.organization_id WHERE r.${active} ${cursorSql} ORDER BY r.starts_at DESC,r.id LIMIT $${cursor?3:1}${cursor?'':' OFFSET $2'}`,cursor?[cursor.key,cursor.id,page.limit+1]:[page.limit+1,page.offset])).rows;
          return pageResult(rows,total,page,'rental');
        }
        if (path === "/api/rentals" && method === "POST") {
          can("admin", "attendant");
          status = 201;
          const key = z.uuid().parse(req.headers["idempotency-key"]);
          return idempotent(sql, user as any, key, { path, body }, () =>
            createRental(sql, user as any, body),
          );
        }
        const physical = path.match(/^\/api\/rentals\/([^/]+)\/(returns|close|reopen)$/);
        const maintenance = path.match(/^\/api\/rentals\/([^/]+)\/maintenance\/([^/]+)\/release$/);
        if ((physical || maintenance) && method === "POST") {
          const id=z.uuid().parse((physical || maintenance)![1]);
          const action=physical?.[2] ?? "maintenance";
          if(action==='returns'||action==='maintenance')can('admin','operator');
          else if(action==='reopen')can('admin');else can('admin','attendant');
          const key=z.uuid().parse(req.headers['idempotency-key']);
          return idempotent(sql,user as any,key,{path,body},()=> action==='returns'?recordReturn(sql,user as any,id,body):action==='maintenance'?releaseMaintenance(sql,user as any,id,z.uuid().parse(maintenance![2]),body):action==='close'?closeRental(sql,user as any,id,body):reopenRental(sql,user as any,id,body));
        }
        const finance=path.match(/^\/api\/rentals\/([^/]+)\/finance$/);
        if(finance){
          can('admin','attendant');const id=z.uuid().parse(finance[1]);
          if(method==='GET')return financeDetails(sql,id);
          if(method==='POST'){
            const key=z.uuid().parse(req.headers['idempotency-key']);
            return idempotent(sql,user as any,key,{path,body},()=>recordFinance(sql,user as any,id,body));
          }
        }
        if (path === '/api/finance/report' && method === 'GET') {
          can('admin','attendant');
          const period = parseReportPeriod(url.searchParams);
          const report = await loadFinanceReport(sql, period.from, period.until, user.role === 'admin');
          if (url.searchParams.get('format') === 'csv')
            return { csv: reportCsv(report, user.organization?.name ?? 'Locadora') };
          return { ...report, dateRules: { ledger: 'Lançamentos agrupados pela data de registro em São Paulo; período inicial/final inclusivo.', receivables: 'Saldo calculado pelo valor da reserva e lançamentos atuais, agrupado pelo início da reserva em São Paulo.', deposits: 'Entradas e devoluções de caução aparecem como movimentos do período e não compõem a receita operacional.' } };
        }
        const rentalMatch = path.match(/^\/api\/rentals\/([^/]+)(\/status)?$/);
        if (rentalMatch) {
          const id = z.uuid().parse(rentalMatch[1]);
          if (!rentalMatch[2] && method === "GET")
            return rentalDetails(sql, id);
          if (rentalMatch[2] && method === "POST") {
            const d = transitionInput.parse(body);
            if (["confirmed", "sent", "canceled"].includes(d.status))
              can("admin", "attendant");
            else can("admin", "operator");
            const key = z.uuid().parse(req.headers["idempotency-key"]);
            return idempotent(sql, user as any, key, { path, body }, () =>
              transitionRental(sql, user as any, id, d.status, d.reason),
            );
          }
        }
        throw new DomainError("Página não encontrada.", 404);
      });
      if (result && typeof result === 'object' && 'csv' in result) {
        res.writeHead(status, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="tonin-loca-financeiro.csv"' });
        res.end((result as { csv: string }).csv);
        return;
      }
      send(res, status, result);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        send(res, 400, {
          error: "Revise os campos informados.",
          fields: error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        });
        return;
      }
      if (error instanceof DomainError) {
        send(res, error.status, { error: error.message });
        return;
      }
      if (error.code === "23505") {
        send(res, 409, {
          error:
            "Já existe um cadastro com este e-mail ou endereço. Confira os dados.",
        });
        return;
      }
      if (error.code === "23514") {
        send(res, 409, {
          error:
            "Limite do plano atingido ou valor inválido. Confira os dados e limites da empresa.",
        });
        return;
      }
      if (error.code === "42501") {
        send(res, 403, { error: "Ação não autorizada." });
        return;
      }
      console.error("request_failed", {
        code: error.code ?? "unknown",
        name: error.name,
      });
      send(res, 500, {
        error:
          "Não foi possível concluir. Confira a conexão e tente novamente.",
      });
    }
  };
}
