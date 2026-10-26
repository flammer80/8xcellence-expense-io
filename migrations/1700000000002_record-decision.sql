-- Up Migration

-- Piste d'audit des décisions (ADR 0003) : qui a tranché, quand, et pourquoi
-- en cas de rejet. Colonnes facultatives : les notes tranchées avant cette
-- migration n'ont pas d'historique, et une note en attente n'en a pas encore.
ALTER TABLE expense_notes
  ADD COLUMN decided_by uuid REFERENCES users(id),
  ADD COLUMN decided_at timestamptz,
  ADD COLUMN rejection_reason text,
  ADD CONSTRAINT expense_notes_reason_only_when_rejected
    CHECK (rejection_reason IS NULL OR status = 'rejected'),
  ADD CONSTRAINT expense_notes_pending_is_undecided
    CHECK (status <> 'pending' OR (decided_by IS NULL AND decided_at IS NULL));

-- Down Migration
ALTER TABLE expense_notes
  DROP CONSTRAINT expense_notes_pending_is_undecided,
  DROP CONSTRAINT expense_notes_reason_only_when_rejected,
  DROP COLUMN rejection_reason,
  DROP COLUMN decided_at,
  DROP COLUMN decided_by;
