-- Shared login throttling. Only keyed digests are stored; raw client addresses
-- stay in the request process and never enter PostgreSQL.
CREATE FUNCTION loca_search_normalize(p_value text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT translate(lower(coalesce(p_value,'')), 'áàâãäåéèêëíìîïóòôõöúùûüçñ', 'aaaaaaeeeeiiiiooooouuuucn');
$$;
REVOKE ALL ON FUNCTION loca_search_normalize(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION loca_search_normalize(text) TO loca_runtime;

CREATE TABLE login_attempts (
  address_key text PRIMARY KEY CHECK (address_key ~ '^[0-9a-f]{64}$'),
  attempts integer NOT NULL CHECK (attempts > 0),
  window_started timestamptz NOT NULL,
  last_attempt timestamptz NOT NULL
);
CREATE INDEX login_attempts_expiry ON login_attempts(last_attempt);
REVOKE ALL ON login_attempts FROM PUBLIC, loca_runtime;

CREATE FUNCTION auth_login_attempt(p_key text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE count_now integer;
BEGIN
  IF p_key !~ '^[0-9a-f]{64}$' THEN RETURN false; END IF;
  -- Serialize only the small capacity check so hostile address churn cannot
  -- grow this table without bound.
  PERFORM pg_advisory_xact_lock(867432);
  DELETE FROM login_attempts WHERE address_key IN (
    SELECT address_key FROM login_attempts WHERE last_attempt < now()-interval '15 minutes'
    ORDER BY last_attempt LIMIT 500
  );
  IF NOT EXISTS (SELECT 1 FROM login_attempts WHERE address_key=p_key)
     AND (SELECT count(*) FROM login_attempts) >= 10000 THEN
    RETURN false;
  END IF;
  INSERT INTO login_attempts(address_key,attempts,window_started,last_attempt)
    VALUES(p_key,1,now(),now())
  ON CONFLICT(address_key) DO UPDATE SET
    attempts=CASE WHEN login_attempts.window_started <= now()-interval '15 minutes' THEN 1 ELSE LEAST(login_attempts.attempts+1,11) END,
    window_started=CASE WHEN login_attempts.window_started <= now()-interval '15 minutes' THEN now() ELSE login_attempts.window_started END,
    last_attempt=now()
  RETURNING attempts INTO count_now;
  RETURN count_now <= 10;
END $$;

CREATE FUNCTION auth_login_clear(p_key text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  DELETE FROM login_attempts WHERE address_key=p_key;
$$;
REVOKE ALL ON FUNCTION auth_login_attempt(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_login_clear(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_login_attempt(text),auth_login_clear(text) TO loca_runtime;
