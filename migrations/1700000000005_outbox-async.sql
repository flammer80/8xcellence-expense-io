-- Up Migration

-- Asynchrone unifié (audit v2 R7, ADR 0007) : une seule file, la table
-- `outbox`, pour les événements de domaine et les jobs (OCR).

-- 1. Rôle du worker. Il lit l'outbox de toutes les entreprises, et rien
--    d'autre : pour traiter un message, il agit au nom du destinataire avec
--    le rôle applicatif, sous RLS. Comme `expense_app`, il naît sans droit de
--    connexion ; le mot de passe vient de l'environnement.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'expense_worker') THEN
    CREATE ROLE expense_worker NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO expense_worker;

-- 2. Outbox. Un message est écrit dans la même transaction que l'état
--    métier : s'il y a rollback, il n'existe pas. Le worker le réclame avec
--    un bail (`locked_until`) : sans acquittement (`processed_at`) avant
--    l'expiration du bail, il est redistribué. Après N échecs, il part en
--    lettre morte (`dead_at`) pour traitement manuel.
CREATE TABLE outbox (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id),
  -- Contrat du message : `type` + `version`. Un consommateur ne lit que les
  -- versions qu'il connaît ; changer un payload = nouvelle version.
  type text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  payload jsonb NOT NULL,
  correlation_id text,
  occurred_at timestamptz NOT NULL,
  available_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_error text,
  processed_at timestamptz,
  dead_at timestamptz,
  CONSTRAINT outbox_single_final_state CHECK (processed_at IS NULL OR dead_at IS NULL)
);

CREATE INDEX outbox_ready_idx ON outbox (available_at)
  WHERE processed_at IS NULL AND dead_at IS NULL;

ALTER TABLE outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox FORCE ROW LEVEL SECURITY;

-- L'application ne fait qu'écrire, pour sa propre entreprise ; elle ne relit
-- jamais l'outbox (pas de SELECT : aucun payload d'une autre entreprise).
GRANT INSERT ON outbox TO expense_app;
CREATE POLICY outbox_app_insert ON outbox
  FOR INSERT TO expense_app
  WITH CHECK (company_id = app_current_company_id());

-- Le worker lit tout et ne modifie que l'état de livraison.
GRANT SELECT ON outbox TO expense_worker;
GRANT UPDATE (attempts, locked_until, last_error, available_at, processed_at, dead_at)
  ON outbox TO expense_worker;
CREATE POLICY outbox_worker_all ON outbox
  FOR ALL TO expense_worker
  USING (true) WITH CHECK (true);

-- 3. Notifications de l'employé (premier consommateur de
--    `ExpenseNoteDecided`). `event_id` unique : rejouer l'événement ne crée
--    pas de seconde notification (consommateur idempotent).
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL UNIQUE,
  user_id uuid NOT NULL,
  company_id uuid NOT NULL,
  note_id uuid NOT NULL REFERENCES expense_notes(id),
  note_description text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('approved', 'rejected')),
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (user_id, company_id) REFERENCES users (id, company_id)
);

CREATE INDEX notifications_user_created_idx ON notifications (user_id, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON notifications TO expense_app;
-- On ne lit et n'écrit que ses propres notifications ; le worker les écrit
-- en agissant au nom du destinataire.
CREATE POLICY notifications_own ON notifications
  FOR ALL TO expense_app
  USING (user_id = app_current_user_id() AND company_id = app_current_company_id())
  WITH CHECK (user_id = app_current_user_id() AND company_id = app_current_company_id());

-- 4. Suggestions de saisie par OCR, traitées en job (202 puis polling).
CREATE TABLE receipt_suggestions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  company_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'failed')),
  -- Fichier temporaire dans le stockage objet, supprimé après traitement.
  file_key text NOT NULL,
  content_type text NOT NULL,
  amount numeric(10, 2),
  expense_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  FOREIGN KEY (user_id, company_id) REFERENCES users (id, company_id),
  CONSTRAINT receipt_suggestions_completed_iff_final CHECK ((status = 'pending') = (completed_at IS NULL))
);

ALTER TABLE receipt_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_suggestions FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON receipt_suggestions TO expense_app;
GRANT UPDATE (status, amount, expense_date, completed_at) ON receipt_suggestions TO expense_app;
CREATE POLICY receipt_suggestions_own ON receipt_suggestions
  FOR ALL TO expense_app
  USING (user_id = app_current_user_id() AND company_id = app_current_company_id())
  WITH CHECK (user_id = app_current_user_id() AND company_id = app_current_company_id());

-- Down Migration
DROP TABLE receipt_suggestions;
DROP TABLE notifications;
DROP TABLE outbox;
-- Le rôle est commun au cluster : on retire ses droits sans le supprimer.
REVOKE USAGE ON SCHEMA public FROM expense_worker;
