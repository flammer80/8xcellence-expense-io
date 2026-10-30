-- Up Migration

-- Observabilité (ADR 0011).

-- 1. Contexte de trace W3C de la requête qui a produit le message : le worker
--    traite le message dans la même trace que la requête d'origine.
ALTER TABLE outbox ADD COLUMN traceparent text;

-- 2. Métrique « notes en attente depuis longtemps » : le rôle du worker, qui
--    publie les métriques de fond, ne lit aucune table métier (ADR 0007).
--    Cette fonction ne lui donne que des **compteurs** agrégés, toutes
--    entreprises confondues : aucune note, aucun identifiant.
CREATE FUNCTION app_pending_notes_by_age()
  RETURNS TABLE (age_bucket text, notes bigint)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT bucket, count(*)
  FROM (
    SELECT CASE
      WHEN created_at > now() - interval '1 day' THEN 'lt_1d'
      WHEN created_at > now() - interval '3 days' THEN '1d_3d'
      WHEN created_at > now() - interval '7 days' THEN '3d_7d'
      ELSE 'gt_7d'
    END AS bucket
    FROM expense_notes
    WHERE status = 'pending'
  ) pending
  GROUP BY bucket
$$;

REVOKE ALL ON FUNCTION app_pending_notes_by_age() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_pending_notes_by_age() TO expense_worker;

-- Down Migration
DROP FUNCTION app_pending_notes_by_age();
ALTER TABLE outbox DROP COLUMN traceparent;
