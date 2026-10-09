import type { IncomingMessage, ServerResponse } from "node:http";
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
} from "./rentals.ts";

type Options = { origin: string; production: boolean; trustedProxy?: string };
async function readBody(req: IncomingMessage): Promise<unknown> {
  if (!req.headers["content-type"]?.startsWith("application/json"))
    throw new DomainError("Envie o formulário em JSON.", 415);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 65536)
      throw new DomainError("O formulário excede o tamanho permitido.", 413);
    chunks.push(Buffer.from(chunk));
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString() || "{}");
  } catch {
    throw new DomainError("Não foi possível ler o formulário.");
  }
}
function send(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}
export function createApp(db: Database, options: Options) {
  const attempts = new Map<string, { count: number; until: number }>();
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
        const ip = clientAddress(
            req.socket.remoteAddress,
            req.headers["x-forwarded-for"],
            options.trustedProxy,
          ),
          now = Date.now();
        for (const [key, value] of attempts)
          if (value.until < now) attempts.delete(key);
        const attempt = attempts.get(ip) ?? {
          count: 0,
          until: now + 15 * 60_000,
        };
        if (attempt.count >= 10 || attempts.size >= 10000)
          throw new DomainError(
            "Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.",
            429,
          );
        attempt.count++;
        attempts.set(ip, attempt);
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
        attempts.delete(ip);
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
        if (path === "/api/customers" && method === "GET")
          return (
            await sql.query("SELECT * FROM customers ORDER BY name LIMIT 2000")
          ).rows;
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
        if (path === "/api/items" && method === "GET")
          return (
            await sql.query("SELECT * FROM items ORDER BY name LIMIT 2000")
          ).rows;
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
          const rows = (
            await sql.query("SELECT * FROM items ORDER BY name LIMIT 2000")
          ).rows;
          return Promise.all(
            rows.map(async (item) => ({
              ...item,
              available: availableQuantity(
                item.quantity,
                start,
                end,
                await occupations(sql, item.id),
                new Date().toISOString(),
              ),
            })),
          );
        }
        if (path === "/api/rentals" && method === "GET")
          return (
            await sql.query(
              `SELECT r.*,c.name AS customer_name FROM rentals r JOIN customers c ON c.id=r.customer_id AND c.organization_id=r.organization_id ORDER BY r.starts_at DESC LIMIT 2000`,
            )
          ).rows;
        if (path === "/api/rentals" && method === "POST") {
          can("admin", "attendant");
          status = 201;
          const key = z.uuid().parse(req.headers["idempotency-key"]);
          return idempotent(sql, user as any, key, { path, body }, () =>
            createRental(sql, user as any, body),
          );
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
