import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../packages/database/migrate.ts";
import { createServer } from "node:http";
import { createApp } from "../apps/api/app.ts";
import { hashPassword } from "../apps/api/auth.ts";
import type { Database, SQL } from "../packages/database/index.ts";
import { databaseFromPool } from '../packages/database/index.ts';

test("HTTP workflow protects authentication, CSRF, tenant access and reservation capacity", async () => {
  const pg = new PGlite();
  const owner:Database={query:(q,v)=>v?pg.query(q,v):pg.exec(q).then(r=>r.at(-1) as any),transaction:work=>pg.transaction(tx=>work({query:(q,v)=>v?tx.query(q,v):tx.exec(q).then(r=>r.at(-1) as any)})),close:()=>pg.close()};
  await migrate(owner);
  const hash = await hashPassword("UmaSenhaSegura123!");
  await pg.query(
    `INSERT INTO users(name,email,password_hash,role) VALUES('Tonin','root@example.test',$1,'superadmin')`,
    [hash],
  );
  // The Prisma profile starts with an owner connection and restricts every transaction.
  const query = (text: string, params?: any[]) => pg.query<any>(text, params);
  const db = databaseFromPool({ query, connect: async () => ({ query, release() {} }), end: () => pg.close() }, { role: 'loca_runtime' });
  const server = createServer(
    createApp(db, { origin: "http://localhost:5173", production: false }),
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}/api`;
  let cookie = "",
    csrf = "";
  const request = async (
    path: string,
    method = "GET",
    body?: unknown,
    extra: Record<string, string> = {},
  ) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:5173",
        cookie,
        "x-csrf-token": csrf,
        ...extra,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json();
    return { res, data };
  };
  const login = async (email: string) => {
    const { res, data } = await request("/auth/login", "POST", {
      email,
      password: "UmaSenhaSegura123!",
    });
    assert.equal(res.status, 200);
    cookie = res.headers.get("set-cookie")!.split(";")[0];
    csrf = data.csrf;
    return data;
  };
  try {
    assert.equal((await request("/items")).res.status, 401);
    assert.equal(
      (
        await request("/auth/login", "POST", {
          email: "root@example.test",
          password: "wrong",
        })
      ).res.status,
      401,
    );
    await login("root@example.test");
    assert.equal(
      (await request("/admin/companies", "POST", {}, { "x-csrf-token": "bad" }))
        .res.status,
      403,
    );
    const createCompany = (name: string, slug: string, ownerEmail: string) =>
      request("/admin/companies", "POST", {
        name,
        slug,
        ownerName: "Gestor",
        ownerEmail,
        ownerPassword: "UmaSenhaSegura123!",
        plan: "Piloto",
        userLimit: 3,
        itemLimit: 2,
      });
    const a = await createCompany("Locadora A", "locadora-a", "a@example.test");
    assert.equal(a.res.status, 201);
    const b = await createCompany("Locadora B", "locadora-b", "b@example.test");
    assert.equal(b.res.status, 201);
    assert.equal(
      (await request("/items")).res.status,
      403,
      "superadmin does not read operational data",
    );
    await login("a@example.test");
    assert.equal((await request("/admin/companies")).res.status, 403);
    const customer = await request("/customers", "POST", {
      name: "João Cliente A",
      phone: "11999999999",
    });
    assert.equal(customer.res.status, 201);
    const customerPage=await request('/customers?page=1&limit=1&search=joao');
    assert.equal(customerPage.res.status,200);
    assert.deepEqual({total:customerPage.data.total,page:customerPage.data.page,limit:customerPage.data.limit,count:customerPage.data.items.length},{total:1,page:1,limit:1,count:1});
    assert.equal((await request('/customers?search=119999')).data.total,1,'numeric searches match normalized phone digits');
    const item = await request("/items", "POST", {
      name: "Cadeira",
      category: "Mobiliário",
      quantity: 10,
      unitPrice: 500,
    });
    assert.equal(item.res.status, 201);
    const flexibleItems=await request('/items?page=1&limit=1&search=CAdeira%20Mobiliario');
    assert.equal(flexibleItems.data.total,1);
    assert.equal(flexibleItems.data.items[0].id,item.data.id);
    const payload = {
      customerId: customer.data.id,
      start: "2026-12-20T12:00:00Z",
      end: "2026-12-21T12:00:00Z",
      lines: [{ itemId: item.data.id, quantity: 8 }],
    };
    const key = crypto.randomUUID();
    assert.equal(
      (
        await request(
          "/rentals",
          "POST",
          { ...payload, fulfillment: "delivery" },
          { "idempotency-key": crypto.randomUUID() },
        )
      ).res.status,
      400,
      "delivery requires a destination address",
    );
    const rental = await request("/rentals", "POST", payload, {
      "idempotency-key": key,
    });
    assert.equal(rental.res.status, 201);
    assert.equal(Number(rental.data.total), 4000);
    const retry = await request("/rentals", "POST", payload, {
      "idempotency-key": key,
    });
    assert.equal(retry.data.id, rental.data.id);
    assert.equal(
      (
        await request(
          "/rentals",
          "POST",
          { ...payload, notes: "different" },
          { "idempotency-key": key },
        )
      ).res.status,
      409,
    );
    assert.equal(
      (
        await request(
          `/rentals/${rental.data.id}/status`,
          "POST",
          { status: "confirmed" },
          { "idempotency-key": crypto.randomUUID() },
        )
      ).res.status,
      200,
    );
    const overview=await request('/overview');
    assert.equal(overview.data.active_count,1);
    assert.equal(overview.data.active_value,'4000');
    assert.equal(overview.data.latest.length,1);
    const today=await request('/today');
    assert.deepEqual(Object.keys(today.data).sort(),['maintenance','overdue','pickups','returns']);
    const financeReport=await request('/finance/report?from=2026-12-01&to=2026-12-31');
    assert.equal(financeReport.data.receivable,'4000');
    assert.equal(financeReport.data.depositMovement,'0');
    const second = await request("/rentals", "POST", payload, {
      "idempotency-key": crypto.randomUUID(),
    });
    assert.equal(
      (
        await request(
          `/rentals/${second.data.id}/status`,
          "POST",
          { status: "confirmed" },
          { "idempotency-key": crypto.randomUUID() },
        )
      ).res.status,
      409,
    );
    assert.equal(
      (
        await request("/items/" + item.data.id, "PATCH", {
          name: "Cadeira",
          category: "Mobiliário",
          quantity: 5,
          unitPrice: 500,
        })
      ).res.status,
      409,
    );
    await request("/team", "POST", {
      name: "Operador",
      email: "op@example.test",
      password: "UmaSenhaSegura123!",
      role: "operator",
    });
    await login("op@example.test");
    assert.equal((await request('/finance/report?from=2026-12-01&to=2026-12-31')).res.status,403);
    assert.equal(
      (await request("/customers", "POST", { name: "Bloqueado", phone: "1" }))
        .res.status,
      403,
    );
    assert.equal(
      (
        await request(
          `/rentals/${rental.data.id}/status`,
          "POST",
          { status: "canceled", reason: "Teste" },
          { "idempotency-key": crypto.randomUUID() },
        )
      ).res.status,
      403,
    );
    await login("b@example.test");
    const isolatedPage=await request('/items?page=1&limit=20');
    assert.deepEqual({total:isolatedPage.data.total,items:isolatedPage.data.items.length},{total:0,items:0});
    assert.equal((await request(`/rentals/${rental.data.id}`)).res.status, 404);
    assert.equal(
      (
        await request("/rentals", "POST", payload, {
          "idempotency-key": crypto.randomUUID(),
        })
      ).res.status,
      404,
    );
    await login("root@example.test");
    await request("/admin/companies/" + a.data.id, "PATCH", {
      name: "Locadora A",
      accent: "#acd5bd",
      status: "suspended",
      plan: "Piloto",
      userLimit: 3,
      itemLimit: 2,
    });
    await login("a@example.test");
    assert.equal((await request("/items")).res.status, 403);
    await request("/auth/logout", "POST");
    assert.equal((await request("/auth/me")).res.status, 401);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
    await pg.close();
  }
});
