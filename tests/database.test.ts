import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';

test('runtime RLS hides other companies and rejects cross-company writes', async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile(new URL('../packages/database/schema.sql', import.meta.url), 'utf8'));
    await db.exec(`INSERT INTO organizations(id,name,slug) VALUES
      ('00000000-0000-4000-8000-000000000001','Empresa A','empresa-a'),
      ('00000000-0000-4000-8000-000000000002','Empresa B','empresa-b');
      INSERT INTO customers(organization_id,name,phone) VALUES
      ('00000000-0000-4000-8000-000000000001','Cliente A','11999999999'),
      ('00000000-0000-4000-8000-000000000002','Cliente B','11988888888');
      SET ROLE loca_runtime;`);
    assert.equal((await db.query('SELECT * FROM customers')).rows.length, 0);
    await db.exec(`BEGIN; SELECT set_config('app.organization_id','00000000-0000-4000-8000-000000000001',true);`);
    const visible = await db.query<{ name: string }>('SELECT name FROM customers');
    assert.deepEqual(visible.rows.map(r => r.name), ['Cliente A']);
    await assert.rejects(db.exec(`INSERT INTO customers(organization_id,name,phone) VALUES ('00000000-0000-4000-8000-000000000002','Invasão','1')`));
    await db.exec('ROLLBACK;');
    assert.equal((await db.query('SELECT * FROM customers')).rows.length, 0);
    await assert.rejects(db.exec('SELECT * FROM users'));
    await assert.rejects(db.exec('ALTER TABLE customers DISABLE ROW LEVEL SECURITY'));
  } finally { await db.close(); }
});

test('composite foreign keys reject relationships across companies and quantities cannot be negative', async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile(new URL('../packages/database/schema.sql', import.meta.url), 'utf8'));
    await db.exec(`INSERT INTO organizations(id,name,slug) VALUES
      ('00000000-0000-4000-8000-000000000001','A','a'),
      ('00000000-0000-4000-8000-000000000002','B','b');
      INSERT INTO customers(id,organization_id,name,phone) VALUES
      ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Cliente','1');`);
    await assert.rejects(db.exec(`INSERT INTO rentals(organization_id,customer_id,starts_at,ends_at,days,total) VALUES
      ('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',now(),now()+interval '1 day',1,100)`));
    await assert.rejects(db.exec(`INSERT INTO items(organization_id,name,category,quantity,unit_price) VALUES
      ('00000000-0000-4000-8000-000000000001','Mesa','Móveis',-1,100)`));
  } finally { await db.close(); }
});
