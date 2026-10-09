import { test } from "node:test";
import assert from "node:assert/strict";
import { createDemo } from "../apps/web/src/demo/store.ts";

test("demo persists edits, protects capacity and keeps companies separate", async () => {
  let saved = "";
  const storage = {
    getItem: () => saved || null,
    setItem: (_key: string, value: string) => {
      saved = value;
    },
    removeItem: () => {
      saved = "";
    },
  };
  const demo = createDemo(storage);
  const customers = (await demo.request("/customers")).items;
  const items = (await demo.request("/items")).items;
  const item = items.find((i: any) => i.quantity > 0);
  const payload = {
    customerId: customers[0].id,
    start: "2027-01-10T12:00:00Z",
    end: "2027-01-11T12:00:00Z",
    lines: [{ itemId: item.id, quantity: item.quantity }],
  };
  const key = crypto.randomUUID();
  const rental = await demo.request("/rentals", "POST", payload, key);
  assert.equal(
    (await demo.request("/rentals", "POST", payload, key)).id,
    rental.id,
  );
  await demo.request(
    `/rentals/${rental.id}/status`,
    "POST",
    { status: "confirmed" },
    crypto.randomUUID(),
  );
  const second = await demo.request(
    "/rentals",
    "POST",
    payload,
    crypto.randomUUID(),
  );
  await assert.rejects(
    demo.request(
      `/rentals/${second.id}/status`,
      "POST",
      { status: "confirmed" },
      crypto.randomUUID(),
    ),
    /disponíveis/,
  );
  assert.equal(
    (await createDemo(storage).request("/rentals")).items.some(
      (r: any) => r.id === rental.id,
    ),
    true,
  );
  demo.selectRole("superadmin");
  const company = await demo.request("/admin/companies", "POST", {
    name: "Outra locadora",
    slug: "outra",
    ownerName: "Outro",
    ownerEmail: "outro@example.test",
    ownerPassword: "SenhaFicticia123!",
    userLimit: 5,
    itemLimit: 100,
    plan: "Piloto",
  });
  demo.selectCompany(company.id);
  assert.equal((await demo.request("/items")).items.length, 0);
  assert.equal((await demo.request("/customers")).items.length, 0);
});
test("damaged demo storage resets safely instead of crashing", async () => {
  const storage = {
    getItem: () => "{broken",
    setItem: () => {},
    removeItem: () => {},
  };
  assert.ok((await createDemo(storage).request("/items")).items.length > 0);
});

test('demo provides bounded searchable pages and matching today and finance views locally', async () => {
  const demo=createDemo({getItem:()=>null,setItem:()=>{},removeItem:()=>{}});
  const page=await demo.request('/customers?page=1&limit=1&search=Marina');
  assert.equal(page.total,1);
  assert.equal(page.items.length,1);
  assert.match(page.items[0].name,/Marina/);
  const today=await demo.request('/today');
  assert.deepEqual(Object.keys(today).sort(),['maintenance','overdue','pickups','returns']);
  const report=await demo.request('/finance/report?from=2027-01-01&to=2027-01-31');
  assert.equal(report.from,'2027-01-01');
  assert.equal(typeof report.received,'string');
  assert.equal(typeof report.depositMovement,'string');
  demo.selectRole('operator');
  await assert.rejects(demo.request('/finance/report?from=2027-01-01&to=2027-01-31'),/permissão/);
});
