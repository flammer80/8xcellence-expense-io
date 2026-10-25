# ADR 0001 — Stratégie de tests et filet de sécurité

- **Statut :** accepté
- **Date :** 2026-10-25
- **Contexte de l'audit :** OPS-01 (zéro test, zéro CI), failles SEC-01, 02, 04, 05, 07 (`docs/audit/audit-v2.md`)

## Contexte

Expense.io n'avait aucun test ni aucune CI. Or la refacto à venir (noyau hexagonal, workflow d'approbation, RLS) touche toutes les routes, et la soutenance exige que **100 % des tests E2E existants passent toujours**. Il faut donc figer le comportement observable *avant* de le restructurer, et prouver chaque faille par un test qui échoue avant son correctif.

Aujourd'hui, les règles métier vivent dans les route handlers (Transaction Script) : il n'existe pas encore de couche testable sans base de données.

## Décision

1. **Vitest**, en deux projets :
   - `unit` : sans base, pour le code pur (`lib/errors`) et la configuration d'authentification (vraie bibliothèque NextAuth, jeton forgé) ;
   - `integration` : les **route handlers réels** sont appelés directement, contre un **vrai Postgres** (base dédiée `expense_io_test`, recréée et migrée à chaque exécution).
2. **Ce qui est simulé, et seulement ça :** la session (`auth()`), l'envoi et la signature S3, l'OCR. Le SQL, lui, n'est jamais simulé : c'est là que vivent les règles d'autorisation, donc là que se cachent les failles.
3. **Deux familles de tests d'intégration :**
   - `tests/integration/` : **caractérisation** — codes HTTP, formats de réponse et filtrage par rôle et par entreprise des 14 routes, tels qu'ils sont. Y compris les incohérences connues (401 côté manager, 403 côté RH pour un non-connecté), qui seront corrigées explicitement dans l'étape « contrat HTTP » ;
   - `tests/security/` : **un fichier par faille**, rouge avant le correctif, vert après.
4. **CI GitHub Actions** : lint, typecheck et tests à chaque push et PR, avec un service Postgres 16.

## Alternatives écartées

- **Mocker `pg`** : rapide, mais les failles d'autorisation (SEC-04, SEC-05) sont précisément dans les `WHERE` ; un mock les aurait reproduites au lieu de les révéler.
- **Testcontainers** : isole chaque exécution, mais ajoute une dépendance et un démarrage de conteneur par suite ; le Postgres du `docker-compose` (et le service de la CI) suffit à cette taille. *KISS.*
- **E2E navigateur (Playwright) dès maintenant** : utile plus tard pour les parcours UI, mais trop lent et trop fragile comme premier filet ; les route handlers sont le contrat que la refacto doit préserver.
- **PGlite (Postgres en WASM)** : sans Docker, mais ne reproduit pas fidèlement les rôles et la RLS, au cœur de l'étape d'isolation à venir.

## Conséquences

- La refacto peut avancer par petits pas : toute régression de contrat casse un test de caractérisation.
- Les tests d'intégration exigent Docker en local (`make test` démarre Postgres). Les fichiers s'exécutent en série, car ils partagent une base.
- Les tests de caractérisation devront être **mis à jour volontairement** quand un comportement change par décision (par exemple 401 → 403) : c'est voulu, chaque changement de contrat devient visible dans le diff.
- Quand le noyau hexagonal existera, les règles métier seront testées en unitaire avec des adaptateurs en mémoire ; ces tests d'intégration resteront le filet du contrat HTTP.
