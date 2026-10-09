-- Additive physical return ledger. Existing delivered rentals remain occupied.
ALTER TABLE rental_lines ADD CONSTRAINT rental_lines_tenant_item UNIQUE(organization_id,rental_id,item_id);
CREATE TABLE rental_returns (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 rental_id uuid NOT NULL, actor_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(organization_id,id), UNIQUE(organization_id,id,rental_id), FOREIGN KEY(organization_id,rental_id) REFERENCES rentals(organization_id,id),
 FOREIGN KEY(organization_id,actor_id) REFERENCES users(organization_id,id)
);
CREATE TABLE rental_return_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 return_id uuid NOT NULL, rental_id uuid NOT NULL, item_id uuid NOT NULL,
 received_quantity integer NOT NULL CHECK(received_quantity>0),
 damaged_quantity integer NOT NULL DEFAULT 0 CHECK(damaged_quantity>=0 AND damaged_quantity<=received_quantity),
 note text NOT NULL DEFAULT '' CHECK(length(note)<=500), UNIQUE(return_id,item_id), UNIQUE(organization_id,id), UNIQUE(organization_id,id,rental_id,item_id),
 FOREIGN KEY(organization_id,return_id,rental_id) REFERENCES rental_returns(organization_id,id,rental_id),
 FOREIGN KEY(organization_id,rental_id,item_id) REFERENCES rental_lines(organization_id,rental_id,item_id),
 CHECK(damaged_quantity=0 OR length(trim(note))>0)
);
CREATE TABLE item_maintenance (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 return_line_id uuid NOT NULL UNIQUE, rental_id uuid NOT NULL, item_id uuid NOT NULL,
 quantity integer NOT NULL CHECK(quantity>0), remaining_quantity integer NOT NULL CHECK(remaining_quantity>=0 AND remaining_quantity<=quantity),
 note text NOT NULL CHECK(length(trim(note))>0 AND length(note)<=500), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(organization_id,id), FOREIGN KEY(organization_id,return_line_id,rental_id,item_id) REFERENCES rental_return_lines(organization_id,id,rental_id,item_id),
 FOREIGN KEY(organization_id,rental_id,item_id) REFERENCES rental_lines(organization_id,rental_id,item_id)
);
CREATE TABLE maintenance_releases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 maintenance_id uuid NOT NULL, actor_id uuid NOT NULL, quantity integer NOT NULL CHECK(quantity>0),
 note text NOT NULL CHECK(length(trim(note))>0 AND length(note)<=500), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(organization_id,maintenance_id) REFERENCES item_maintenance(organization_id,id),
 FOREIGN KEY(organization_id,actor_id) REFERENCES users(organization_id,id)
);
CREATE INDEX return_lines_rental_item ON rental_return_lines(organization_id,rental_id,item_id);
CREATE INDEX maintenance_item_pending ON item_maintenance(organization_id,item_id) WHERE remaining_quantity>0;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['rental_returns','rental_return_lines','item_maintenance','maintenance_releases'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY schema_owner ON %I TO CURRENT_USER USING(true) WITH CHECK(true)',t);
  EXECUTE format('CREATE POLICY tenant ON %I TO loca_runtime USING(organization_id=nullif(current_setting(''app.organization_id'',true),'''')::uuid) WITH CHECK(organization_id=nullif(current_setting(''app.organization_id'',true),'''')::uuid)',t);
 END LOOP;
END $$;
GRANT SELECT,INSERT ON rental_returns,rental_return_lines,item_maintenance,maintenance_releases TO loca_runtime;
GRANT UPDATE(remaining_quantity) ON item_maintenance TO loca_runtime;
