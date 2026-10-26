-- Up Migration

-- Schéma prêt pour l'isolation et la piste d'audit (audit v2 R6, ADR 0005).

-- 1. Emails insensibles à la casse (S9) : « Alice@x.com » et « alice@x.com »
--    désignent le même compte. On refuse de migrer si des doublons existent
--    déjà, plutôt que de laisser l'index unique échouer sans explication.
CREATE EXTENSION IF NOT EXISTS citext;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM users GROUP BY lower(email) HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Des comptes ne diffèrent que par la casse de leur email : fusionnez-les avant de migrer.';
  END IF;
END $$;

ALTER TABLE users ALTER COLUMN email TYPE citext;

-- 2. Entreprise portée par la note (DAT-01) : l'isolation s'exprime sans
--    jointure, et un futur partitionnement par tenant ou par région devient
--    possible. La clé étrangère composite garantit, en base, qu'une note
--    appartient à l'entreprise de son auteur.
ALTER TABLE users ADD CONSTRAINT users_id_company_key UNIQUE (id, company_id);

ALTER TABLE expense_notes ADD COLUMN company_id uuid;
UPDATE expense_notes n SET company_id = u.company_id FROM users u WHERE u.id = n.user_id;
ALTER TABLE expense_notes
  ALTER COLUMN company_id SET NOT NULL,
  ADD CONSTRAINT expense_notes_author_company_fkey
    FOREIGN KEY (user_id, company_id) REFERENCES users (id, company_id);

-- 3. Devise (clients internationaux) et date de dernière modification.
--    La devise n'est pas encore exposée par l'API : tout est en euros.
ALTER TABLE expense_notes
  ADD COLUMN currency char(3) NOT NULL DEFAULT 'EUR'
    CONSTRAINT expense_notes_currency_iso CHECK (currency ~ '^[A-Z]{3}$'),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

UPDATE expense_notes SET updated_at = COALESCE(decided_at, created_at);

CREATE FUNCTION set_updated_at() RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$$;

CREATE TRIGGER expense_notes_set_updated_at
  BEFORE UPDATE ON expense_notes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4. Plus de compteur séquentiel : la clé du reçu est désormais dérivée de
--    l'UUID de la note (ADR 0006). `receipt_seq` révélait le volume de notes
--    et imposait deux écritures à la création (ARC-06, DAT-03).
ALTER TABLE expense_notes DROP COLUMN receipt_seq;

-- 5. Index des requêtes réelles : annuaire d'une entreprise, subordonnés d'un
--    manager, historique d'un auteur, file d'attente d'une entreprise.
CREATE INDEX users_company_id_idx ON users (company_id);
CREATE INDEX users_manager_id_idx ON users (manager_id);
CREATE INDEX expense_notes_user_status_idx ON expense_notes (user_id, status);
CREATE INDEX expense_notes_company_status_idx ON expense_notes (company_id, status);

-- Down Migration
DROP INDEX expense_notes_company_status_idx;
DROP INDEX expense_notes_user_status_idx;
DROP INDEX users_manager_id_idx;
DROP INDEX users_company_id_idx;

-- Les anciennes clés `receipts/{seq}` ne sont pas reconstruites : le compteur
-- repart de 1 pour les notes existantes.
ALTER TABLE expense_notes ADD COLUMN receipt_seq serial;

DROP TRIGGER expense_notes_set_updated_at ON expense_notes;
DROP FUNCTION set_updated_at();

ALTER TABLE expense_notes
  DROP COLUMN updated_at,
  DROP COLUMN currency,
  DROP CONSTRAINT expense_notes_author_company_fkey,
  DROP COLUMN company_id;

ALTER TABLE users DROP CONSTRAINT users_id_company_key;
ALTER TABLE users ALTER COLUMN email TYPE text;
