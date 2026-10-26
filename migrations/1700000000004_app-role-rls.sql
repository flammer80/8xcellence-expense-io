-- Up Migration

-- Isolation garantie par PostgreSQL (SEC-03, ADR 0005).
--
-- Partage des responsabilités :
-- - la RLS garantit l'entreprise (règle n°7) et une visibilité grossière par
--   rôle : sa note, celles de ses subordonnés directs, toutes pour un RH ;
-- - la règle fine « qui tranche quoi » reste dans `ApprovalPolicy` (domaine),
--   pour ne pas l'écrire deux fois.

-- 1. Rôle applicatif, soumis à la RLS. Il est commun au cluster (dev et test) :
--    on ne le recrée pas s'il existe. Il naît sans droit de connexion ; le
--    mot de passe vient de l'environnement (scripts/ensure-app-role.mjs).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'expense_app') THEN
    CREATE ROLE expense_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

-- 2. Privilèges minimaux. Les colonnes sont listées une à une :
--    - `users.password_hash` n'est lisible que par `app_find_credentials` ;
--    - une note ne se modifie que par une décision ;
--    - un utilisateur ne se modifie que par son rattachement ;
--    - aucune suppression.
GRANT USAGE ON SCHEMA public TO expense_app;
GRANT SELECT ON companies, expense_notes TO expense_app;
GRANT SELECT (id, company_id, name, email, role, manager_id, created_at) ON users TO expense_app;
GRANT INSERT ON expense_notes TO expense_app;
GRANT UPDATE (status, decided_by, decided_at, rejection_reason) ON expense_notes TO expense_app;
GRANT UPDATE (manager_id) ON users TO expense_app;

-- 3. Contexte de session, relu en base et non dans le JWT. Ces fonctions
--    tournent avec les droits du propriétaire (SECURITY DEFINER) : une policy
--    de `users` qui lirait `users` bouclerait sur elle-même.
CREATE FUNCTION app_current_user_id() RETURNS uuid
  LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('app.current_user_id', true), '')::uuid $$;

CREATE FUNCTION app_current_company_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$ SELECT company_id FROM users WHERE id = app_current_user_id() $$;

CREATE FUNCTION app_current_role() RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$ SELECT role FROM users WHERE id = app_current_user_id() $$;

-- 4. Les deux seuls accès avant authentification, quand aucun utilisateur
--    n'est encore connu : le login et l'inscription. Plutôt qu'une connexion
--    « système » capable de tout lire, deux fonctions au périmètre fermé.

-- Login : identifiants d'un seul compte, par email exact (insensible à la casse).
CREATE FUNCTION app_find_credentials(p_email citext)
  RETURNS TABLE (id uuid, email citext, password_hash text, role text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT u.id, u.email, u.password_hash, u.role FROM users u WHERE u.email = p_email
$$;

-- Inscription, en une transaction (DAT-02). Règle inchangée en attendant la
-- décision produit sur l'onboarding (R9) : l'entreprise est déduite du domaine
-- de l'email ; le premier inscrit devient RH, les suivants employés.
-- Lève `unique_violation` (23505) si l'email est déjà pris.
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

REVOKE ALL ON FUNCTION
  app_current_user_id(), app_current_company_id(), app_current_role(),
  app_find_credentials(citext), app_register_user(text, citext, text)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  app_current_user_id(), app_current_company_id(), app_current_role(),
  app_find_credentials(citext), app_register_user(text, citext, text)
TO expense_app;

-- 5. Policies. Toutes commencent par le filtre d'entreprise.

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies FORCE ROW LEVEL SECURITY;

CREATE POLICY companies_own_select ON companies
  FOR SELECT
  USING (id = app_current_company_id());

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;

-- L'annuaire de son entreprise : nécessaire pour résoudre auteur et validateur.
CREATE POLICY users_same_company_select ON users
  FOR SELECT
  USING (company_id = app_current_company_id());

-- Seul un RH rattache, et seulement dans son entreprise (règle n°6). Le
-- contrôle de cycle reste applicatif (route `PUT /api/hr/users/{id}/manager`).
CREATE POLICY users_hr_update ON users
  FOR UPDATE
  USING (company_id = app_current_company_id() AND app_current_role() = 'hr_admin')
  WITH CHECK (company_id = app_current_company_id());

-- Les policies de la migration initiale ne connaissaient que les managers
-- racine côté RH et ne filtraient pas par entreprise : elles contredisaient
-- l'`ApprovalPolicy` (ADR 0003) sans que personne s'en aperçoive, la
-- connexion superutilisateur les contournant toutes.
DROP POLICY expense_notes_owner_select ON expense_notes;
DROP POLICY expense_notes_owner_insert ON expense_notes;
DROP POLICY expense_notes_manager_select ON expense_notes;
DROP POLICY expense_notes_manager_update ON expense_notes;
DROP POLICY expense_notes_hr_root_manager_select ON expense_notes;
DROP POLICY expense_notes_hr_root_manager_update ON expense_notes;

CREATE POLICY expense_notes_select ON expense_notes
  FOR SELECT
  USING (
    company_id = app_current_company_id()
    AND (
      user_id = app_current_user_id()
      OR app_current_role() = 'hr_admin'
      OR EXISTS (
        SELECT 1 FROM users u
        WHERE u.id = expense_notes.user_id AND u.manager_id = app_current_user_id()
      )
    )
  );

-- On ne soumet que pour soi, dans son entreprise.
CREATE POLICY expense_notes_insert ON expense_notes
  FOR INSERT
  WITH CHECK (user_id = app_current_user_id() AND company_id = app_current_company_id());

-- Trancher : jamais sa propre note (règle n°4), seulement manager direct ou
-- RH, et la décision est enregistrée au nom de celui qui la prend.
CREATE POLICY expense_notes_decide ON expense_notes
  FOR UPDATE
  USING (
    company_id = app_current_company_id()
    AND user_id <> app_current_user_id()
    AND (
      app_current_role() = 'hr_admin'
      OR EXISTS (
        SELECT 1 FROM users u
        WHERE u.id = expense_notes.user_id AND u.manager_id = app_current_user_id()
      )
    )
  )
  WITH CHECK (company_id = app_current_company_id() AND decided_by = app_current_user_id());

-- Down Migration
DROP POLICY expense_notes_decide ON expense_notes;
DROP POLICY expense_notes_insert ON expense_notes;
DROP POLICY expense_notes_select ON expense_notes;

CREATE POLICY expense_notes_owner_select ON expense_notes
  FOR SELECT
  USING (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid);

CREATE POLICY expense_notes_owner_insert ON expense_notes
  FOR INSERT
  WITH CHECK (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid);

CREATE POLICY expense_notes_manager_select ON expense_notes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = expense_notes.user_id
        AND u.manager_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
  );

CREATE POLICY expense_notes_manager_update ON expense_notes
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = expense_notes.user_id
        AND u.manager_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
  );

CREATE POLICY expense_notes_hr_root_manager_select ON expense_notes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = expense_notes.user_id
        AND u.role = 'manager'
        AND u.manager_id IS NULL
    )
    AND EXISTS (
      SELECT 1 FROM users hr
      WHERE hr.id = nullif(current_setting('app.current_user_id', true), '')::uuid
        AND hr.role = 'hr_admin'
    )
  );

CREATE POLICY expense_notes_hr_root_manager_update ON expense_notes
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = expense_notes.user_id
        AND u.role = 'manager'
        AND u.manager_id IS NULL
    )
    AND EXISTS (
      SELECT 1 FROM users hr
      WHERE hr.id = nullif(current_setting('app.current_user_id', true), '')::uuid
        AND hr.role = 'hr_admin'
    )
  );

DROP POLICY users_hr_update ON users;
DROP POLICY users_same_company_select ON users;
ALTER TABLE users NO FORCE ROW LEVEL SECURITY;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

DROP POLICY companies_own_select ON companies;
ALTER TABLE companies NO FORCE ROW LEVEL SECURITY;
ALTER TABLE companies DISABLE ROW LEVEL SECURITY;

DROP FUNCTION app_register_user(text, citext, text);
DROP FUNCTION app_find_credentials(citext);
DROP FUNCTION app_current_role();
DROP FUNCTION app_current_company_id();
DROP FUNCTION app_current_user_id();

-- Le rôle est commun au cluster (d'autres bases peuvent l'utiliser) : on
-- retire ses droits ici sans le supprimer.
REVOKE ALL ON companies, users, expense_notes FROM expense_app;
REVOKE USAGE ON SCHEMA public FROM expense_app;
