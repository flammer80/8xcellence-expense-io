-- Up Migration

-- Onboarding (décision R9, ADR 0009) et limitation des tentatives
-- d'authentification (S9). L'entreprise reste déduite du domaine de l'email,
-- mais un compte inscrit doit prouver qu'il possède son adresse avant de se
-- connecter : sans cela, le premier inscrit en `@acme.fr` deviendrait RH
-- d'Acme sans en faire partie (S7).

-- 1. Adresse vérifiée. Les comptes existants, et ceux créés hors inscription
--    (seed, fixtures, futur back-office), sont réputés vérifiés : seule
--    l'inscription publique pose `NULL` explicitement.
ALTER TABLE users ADD COLUMN email_verified_at timestamptz DEFAULT now();
GRANT SELECT (email_verified_at) ON users TO expense_app;

-- 2. Jetons de vérification. Seule l'empreinte SHA-256 est stockée : une
--    fuite de la table ne permet pas de valider un compte.
CREATE TABLE email_verifications (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
CREATE INDEX email_verifications_user_idx ON email_verifications (user_id);
-- Aucun accès direct pour l'application : uniquement via les fonctions ci-dessous.
ALTER TABLE email_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_verifications FORCE ROW LEVEL SECURITY;

-- 3. Tentatives d'authentification, par clé (`login:<email>`, `signup:<ip>`).
CREATE TABLE auth_attempts (
  id bigserial PRIMARY KEY,
  key text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_attempts_key_time_idx ON auth_attempts (key, attempted_at);
ALTER TABLE auth_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_attempts FORCE ROW LEVEL SECURITY;

-- 4. Identifiants : la fonction renvoie aussi l'état de vérification.
DROP FUNCTION app_find_credentials(citext);
CREATE FUNCTION app_find_credentials(p_email citext)
  RETURNS TABLE (id uuid, email citext, password_hash text, role text, email_verified boolean)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT u.id, u.email, u.password_hash, u.role, u.email_verified_at IS NOT NULL
  FROM users u WHERE u.email = p_email
$$;

-- 5. Inscription, en une transaction : entreprise (si nouvelle), compte non
--    vérifié, jeton, et message `EmailVerificationRequested` v1 dans l'outbox
--    (ADR 0007). Si une étape échoue, rien n'existe.
--    Le jeton en clair ne voyage que dans le message, lu par le seul rôle
--    worker, le temps d'envoyer l'email (ADR 0009).
--    Lève `unique_violation` (23505) si l'email est déjà pris.
DROP FUNCTION app_register_user(text, citext, text);
CREATE FUNCTION app_register_user(
  p_name text,
  p_email citext,
  p_password_hash text,
  p_verification_token text,
  p_correlation_id text
)
  RETURNS TABLE (user_id uuid, user_role text)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_domain text := lower(split_part(p_email::text, '@', 2));
  v_company_id uuid;
  v_role text := 'hr_admin';
BEGIN
  IF v_domain = '' THEN
    RAISE EXCEPTION 'email sans domaine' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF length(p_verification_token) < 32 THEN
    RAISE EXCEPTION 'jeton de vérification trop court' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  INSERT INTO companies (name, email_domain)
  VALUES (split_part(v_domain, '.', 1), v_domain)
  ON CONFLICT (email_domain) DO NOTHING
  RETURNING id INTO v_company_id;

  IF v_company_id IS NULL THEN
    SELECT c.id INTO v_company_id FROM companies c WHERE c.email_domain = v_domain;
    v_role := 'employee';
  END IF;

  INSERT INTO users (name, email, password_hash, company_id, role, email_verified_at)
  VALUES (p_name, p_email, p_password_hash, v_company_id, v_role, NULL)
  RETURNING id INTO user_id;

  INSERT INTO email_verifications (token_hash, user_id, expires_at)
  VALUES (encode(sha256(convert_to(p_verification_token, 'UTF8')), 'hex'), user_id, now() + interval '24 hours');

  INSERT INTO outbox (id, company_id, type, version, payload, correlation_id, occurred_at)
  VALUES (
    gen_random_uuid(), v_company_id, 'EmailVerificationRequested', 1,
    jsonb_build_object('userId', user_id, 'email', p_email::text, 'name', p_name, 'token', p_verification_token),
    p_correlation_id, now()
  );

  user_role := v_role;
  RETURN NEXT;
END
$$;

-- 6. Vérification : un jeton valide (non expiré) vérifie le compte. Rejouer
--    le même lien pendant sa validité reste sans effet supplémentaire.
CREATE FUNCTION app_verify_email(p_token text)
  RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  UPDATE email_verifications
  SET used_at = coalesce(used_at, now())
  WHERE token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
    AND expires_at > now()
  RETURNING user_id INTO v_user_id;

  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;
  UPDATE users SET email_verified_at = coalesce(email_verified_at, now()) WHERE id = v_user_id;
  RETURN true;
END
$$;

-- 7. Limitation des tentatives : enregistre une tentative pour `p_key` et
--    dit si elle reste dans la limite (`p_max` sur `p_window_seconds`). Le
--    compteur vit en base : il vaut pour toutes les instances et survit à un
--    redémarrage. Les tentatives sorties de la fenêtre sont purgées au passage.
CREATE FUNCTION app_consume_auth_attempt(p_key text, p_max integer, p_window_seconds integer)
  RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  DELETE FROM auth_attempts
  WHERE key = p_key AND attempted_at < now() - make_interval(secs => p_window_seconds);
  INSERT INTO auth_attempts (key) VALUES (p_key);
  SELECT count(*) INTO v_count FROM auth_attempts WHERE key = p_key;
  RETURN v_count <= p_max;
END
$$;

REVOKE ALL ON FUNCTION
  app_find_credentials(citext),
  app_register_user(text, citext, text, text, text),
  app_verify_email(text),
  app_consume_auth_attempt(text, integer, integer)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  app_find_credentials(citext),
  app_register_user(text, citext, text, text, text),
  app_verify_email(text),
  app_consume_auth_attempt(text, integer, integer)
TO expense_app;

-- Down Migration
DROP FUNCTION app_consume_auth_attempt(text, integer, integer);
DROP FUNCTION app_verify_email(text);
DROP FUNCTION app_register_user(text, citext, text, text, text);
DROP FUNCTION app_find_credentials(citext);

CREATE FUNCTION app_find_credentials(p_email citext)
  RETURNS TABLE (id uuid, email citext, password_hash text, role text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT u.id, u.email, u.password_hash, u.role FROM users u WHERE u.email = p_email
$$;

CREATE FUNCTION app_register_user(p_name text, p_email citext, p_password_hash text)
  RETURNS TABLE (user_id uuid, user_role text)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_domain text := lower(split_part(p_email::text, '@', 2));
  v_company_id uuid;
  v_role text := 'hr_admin';
BEGIN
  IF v_domain = '' THEN
    RAISE EXCEPTION 'email sans domaine' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  INSERT INTO companies (name, email_domain)
  VALUES (split_part(v_domain, '.', 1), v_domain)
  ON CONFLICT (email_domain) DO NOTHING
  RETURNING id INTO v_company_id;

  IF v_company_id IS NULL THEN
    SELECT c.id INTO v_company_id FROM companies c WHERE c.email_domain = v_domain;
    v_role := 'employee';
  END IF;

  INSERT INTO users (name, email, password_hash, company_id, role)
  VALUES (p_name, p_email, p_password_hash, v_company_id, v_role)
  RETURNING id INTO user_id;

  user_role := v_role;
  RETURN NEXT;
END
$$;

REVOKE ALL ON FUNCTION app_find_credentials(citext), app_register_user(text, citext, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_find_credentials(citext), app_register_user(text, citext, text) TO expense_app;

DROP TABLE auth_attempts;
DROP TABLE email_verifications;
REVOKE SELECT (email_verified_at) ON users FROM expense_app;
ALTER TABLE users DROP COLUMN email_verified_at;
