CREATE TABLE rental_finance (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id),
 rental_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('payment','refund','deposit_received','deposit_refund','expense','charge','charge_reversal')),
 amount integer NOT NULL CHECK(amount BETWEEN 1 AND 100000000),
 method text NOT NULL CHECK(method IN ('cash','pix','card','transfer','other')),
 note text NOT NULL CHECK(length(note) BETWEEN 1 AND 500 AND note=btrim(note)),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(organization_id,rental_id) REFERENCES rentals(organization_id,id),
 FOREIGN KEY(organization_id,actor_id) REFERENCES users(organization_id,id)
);
CREATE INDEX rental_finance_rental_time ON rental_finance(organization_id,rental_id,created_at,id);
ALTER TABLE rental_finance ENABLE ROW LEVEL SECURITY;
ALTER TABLE rental_finance FORCE ROW LEVEL SECURITY;
CREATE POLICY schema_owner ON rental_finance TO CURRENT_USER USING(true) WITH CHECK(true);
CREATE POLICY tenant ON rental_finance TO loca_runtime
 USING(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);
REVOKE ALL ON rental_finance FROM loca_runtime;
GRANT SELECT,INSERT ON rental_finance TO loca_runtime;

CREATE TABLE rental_reopenings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations(id),rental_id uuid NOT NULL,actor_id uuid NOT NULL,
 reason text NOT NULL CHECK(length(trim(reason))>0 AND length(reason)<=500),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(organization_id,rental_id) REFERENCES rentals(organization_id,id),FOREIGN KEY(organization_id,actor_id) REFERENCES users(organization_id,id)
);
ALTER TABLE rental_reopenings ENABLE ROW LEVEL SECURITY;
ALTER TABLE rental_reopenings FORCE ROW LEVEL SECURITY;
CREATE POLICY schema_owner ON rental_reopenings TO CURRENT_USER USING(true) WITH CHECK(true);
CREATE POLICY tenant ON rental_reopenings TO loca_runtime USING(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid) WITH CHECK(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);
GRANT SELECT,INSERT ON rental_reopenings TO loca_runtime;
