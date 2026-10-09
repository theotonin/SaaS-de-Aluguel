-- Migration 001. Execute as schema owner; application connects as loca_runtime.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='loca_runtime') THEN
    CREATE ROLE loca_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  accent text NOT NULL DEFAULT '#acd5bd' CHECK (accent ~ '^#[0-9a-fA-F]{6}$'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  plan text NOT NULL DEFAULT 'Piloto', user_limit integer NOT NULL DEFAULT 5 CHECK(user_limit>0),
  item_limit integer NOT NULL DEFAULT 100 CHECK(item_limit>0), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid REFERENCES organizations(id),
  name text NOT NULL, email text NOT NULL UNIQUE, password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('superadmin','admin','attendant','operator')),
  active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((role='superadmin') = (organization_id IS NULL)), UNIQUE(organization_id,id)
);
CREATE TABLE sessions (
  token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf text NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL, phone text NOT NULL, email text NOT NULL DEFAULT '', address text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id,id)
);
CREATE TABLE items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL, category text NOT NULL, description text NOT NULL DEFAULT '',
  quantity integer NOT NULL CHECK(quantity>=0), unit_price integer NOT NULL CHECK(unit_price>=0),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id,id)
);
CREATE TABLE rentals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), number bigint GENERATED ALWAYS AS IDENTITY,
  organization_id uuid NOT NULL REFERENCES organizations(id), customer_id uuid NOT NULL,
  fulfillment text NOT NULL DEFAULT 'pickup' CHECK(fulfillment IN ('pickup','delivery')),
  starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL CHECK(ends_at>starts_at),
  days integer NOT NULL CHECK(days>0), delivery integer NOT NULL DEFAULT 0 CHECK(delivery>=0),
  discount integer NOT NULL DEFAULT 0 CHECK(discount>=0), total bigint NOT NULL CHECK(total>=0),
  notes text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'draft'
    CHECK(status IN ('draft','sent','confirmed','separated','delivered','returned','closed','canceled')),
  cancellation_reason text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,id), FOREIGN KEY(organization_id,customer_id) REFERENCES customers(organization_id,id)
);
CREATE TABLE rental_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
  rental_id uuid NOT NULL, item_id uuid NOT NULL, name text NOT NULL,
  quantity integer NOT NULL CHECK(quantity>0), unit_price integer NOT NULL CHECK(unit_price>=0),
  UNIQUE(rental_id,item_id),
  FOREIGN KEY(organization_id,rental_id) REFERENCES rentals(organization_id,id),
  FOREIGN KEY(organization_id,item_id) REFERENCES items(organization_id,id)
);
CREATE INDEX rentals_period ON rentals(organization_id,starts_at,ends_at);
CREATE INDEX rental_lines_item ON rental_lines(organization_id,item_id);
CREATE TABLE idempotency (
  organization_id uuid NOT NULL REFERENCES organizations(id), actor_id uuid NOT NULL,
  key uuid NOT NULL, fingerprint text NOT NULL, response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(organization_id,actor_id,key),
  FOREIGN KEY(organization_id,actor_id) REFERENCES users(organization_id,id)
);
CREATE TABLE audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid REFERENCES organizations(id),
  actor_id uuid NOT NULL REFERENCES users(id), action text NOT NULL, target_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['customers','items','rentals','rental_lines','idempotency','audit_log'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY schema_owner ON %I TO CURRENT_USER USING (true) WITH CHECK (true)', t);
    EXECUTE format('CREATE POLICY tenant ON %I TO loca_runtime USING (organization_id = nullif(current_setting(''app.organization_id'',true),'''')::uuid) WITH CHECK (organization_id = nullif(current_setting(''app.organization_id'',true),'''')::uuid)', t);
  END LOOP;
END $$;
GRANT USAGE ON SCHEMA public TO loca_runtime;
GRANT SELECT,INSERT,UPDATE ON customers,items,rentals,rental_lines TO loca_runtime;
GRANT SELECT,INSERT ON idempotency,audit_log TO loca_runtime;
GRANT USAGE ON SEQUENCE rentals_number_seq TO loca_runtime;

-- Narrow security-definer functions expose authentication without table access.
CREATE FUNCTION auth_find_user(p_email text) RETURNS TABLE(id uuid,password_hash text,active boolean)
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT id,password_hash,active FROM users WHERE email=p_email;
$$;
CREATE FUNCTION auth_save_session(p_hash text,p_user uuid,p_csrf text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
  DELETE FROM sessions WHERE expires_at < now();
  INSERT INTO sessions(token_hash,user_id,csrf,expires_at) VALUES(p_hash,p_user,p_csrf,now()+interval '12 hours');
END $$;
CREATE FUNCTION auth_session(p_hash text) RETURNS TABLE(id uuid,name text,email text,role text,organization_id uuid,csrf text,organization jsonb)
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT u.id,u.name,u.email,u.role,u.organization_id,s.csrf,
    CASE WHEN o.id IS NULL THEN NULL ELSE to_jsonb(o) END
  FROM sessions s JOIN users u ON u.id=s.user_id LEFT JOIN organizations o ON o.id=u.organization_id
  WHERE s.token_hash=p_hash AND s.expires_at>now() AND u.active;
$$;
CREATE FUNCTION auth_logout(p_hash text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DELETE FROM sessions WHERE token_hash=p_hash; $$;

CREATE FUNCTION admin_companies(p_token text) RETURNS SETOF organizations
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM auth_session(p_token) WHERE role='superadmin') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT * FROM organizations ORDER BY created_at DESC;
END $$;
CREATE FUNCTION admin_create_company(p_token text,p_data jsonb,p_password text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE org uuid; actor uuid; BEGIN
  SELECT id INTO actor FROM auth_session(p_token) WHERE role='superadmin';
  IF actor IS NULL THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  INSERT INTO organizations(name,slug,plan,user_limit,item_limit)
    VALUES(p_data->>'name',p_data->>'slug',p_data->>'plan',(p_data->>'userLimit')::integer,(p_data->>'itemLimit')::integer) RETURNING id INTO org;
  INSERT INTO users(organization_id,name,email,password_hash,role)
    VALUES(org,p_data->>'ownerName',p_data->>'ownerEmail',p_password,'admin');
  INSERT INTO audit_log(organization_id,actor_id,action,target_id) VALUES(org,actor,'company.created',org);
  RETURN org;
END $$;
CREATE FUNCTION admin_update_company(p_token text,p_id uuid,p_data jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE actor uuid; updated uuid; BEGIN
  SELECT id INTO actor FROM auth_session(p_token) WHERE role='superadmin';
  IF actor IS NULL THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  UPDATE organizations SET name=p_data->>'name',accent=p_data->>'accent',status=p_data->>'status',plan=p_data->>'plan',
    user_limit=(p_data->>'userLimit')::integer,item_limit=(p_data->>'itemLimit')::integer WHERE id=p_id RETURNING id INTO updated;
  INSERT INTO audit_log(organization_id,actor_id,action,target_id) SELECT updated,actor,'company.updated',updated WHERE updated IS NOT NULL;
  RETURN updated;
END $$;
CREATE FUNCTION team_members(p_token text) RETURNS TABLE(id uuid,name text,email text,role text,active boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE org uuid; BEGIN
  SELECT s.organization_id INTO org FROM auth_session(p_token) s WHERE s.role='admin' AND s.organization->>'status'='active';
  IF org IS NULL THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT u.id,u.name,u.email,u.role,u.active FROM users u WHERE u.organization_id=org ORDER BY u.name;
END $$;
CREATE FUNCTION team_create_member(p_token text,p_data jsonb,p_password text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE org uuid; uid uuid; actor uuid; lim integer; BEGIN
  SELECT s.organization_id,s.id INTO org,actor FROM auth_session(p_token) s WHERE s.role='admin' AND s.organization->>'status'='active';
  IF org IS NULL THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  SELECT user_limit INTO lim FROM organizations WHERE id=org FOR UPDATE;
  IF (SELECT count(*) FROM users WHERE organization_id=org AND active)>=lim THEN RAISE EXCEPTION 'Limite de usuários atingido' USING ERRCODE='23514'; END IF;
  IF p_data->>'role' NOT IN ('admin','attendant','operator') THEN RAISE EXCEPTION 'Invalid role' USING ERRCODE='23514'; END IF;
  INSERT INTO users(organization_id,name,email,password_hash,role) VALUES(org,p_data->>'name',p_data->>'email',p_password,p_data->>'role') RETURNING id INTO uid;
  INSERT INTO audit_log(organization_id,actor_id,action,target_id) VALUES(org,actor,'team.created',uid);
  RETURN uid;
END $$;
CREATE FUNCTION admin_audit(p_token text) RETURNS TABLE(action text,created_at timestamptz,company text,actor text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM auth_session(p_token) WHERE role='superadmin') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT a.action,a.created_at,o.name,u.name FROM audit_log a
    LEFT JOIN organizations o ON o.id=a.organization_id JOIN users u ON u.id=a.actor_id
    WHERE a.action LIKE 'company.%' ORDER BY a.created_at DESC LIMIT 100;
END $$;
CREATE FUNCTION organization_lock(p_token text) RETURNS organizations
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE org uuid; result organizations; BEGIN
  SELECT s.organization_id INTO org FROM auth_session(p_token) s WHERE s.organization->>'status'='active';
  IF org IS NULL THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO result FROM organizations WHERE id=org FOR UPDATE;
  RETURN result;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO loca_runtime;
