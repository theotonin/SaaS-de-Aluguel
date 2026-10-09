DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='loca_runtime'
    AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication)) THEN
    RAISE EXCEPTION 'loca_runtime deve ser um papel restrito, sem privilégios administrativos';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname='loca_runtime') THEN
    RAISE EXCEPTION 'loca_runtime não pode ser membro de outros papéis';
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS customers_company_name ON customers(organization_id,name);
CREATE INDEX IF NOT EXISTS items_company_name ON items(organization_id,name);
CREATE INDEX IF NOT EXISTS audit_company_time ON audit_log(organization_id,created_at DESC);
