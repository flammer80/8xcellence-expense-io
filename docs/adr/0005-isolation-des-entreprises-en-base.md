# ADR 0005 — Isolation des entreprises garantie par PostgreSQL

- **Statut :** accepté
- **Date :** 2026-10-26
- **Contexte de l'audit :** SEC-03 (RLS inopérante), DAT-01 (pas de `company_id` sur les notes), DAT-02 (inscription non transactionnelle), S9 (emails sensibles à la casse) — `docs/audit/audit-v2.md`

## Contexte

Une fuite de données entre deux clients est le pire incident possible pour un SaaS B2B : c'est le « premier incident » du cours n°2. Avant cette étape, l'isolation d'Expense.io ne reposait que sur les `WHERE` écrits à la main dans chaque requête :

- l'application se connectait avec `expense`, que l'image Docker crée **superutilisateur**. Un superutilisateur ignore toute policy RLS, même avec `FORCE ROW LEVEL SECURITY` ;
- **12 requêtes** passaient de toute façon hors `withUserScope` : login (1), inscription (4), routes `hr/users` (6), mise à jour du reçu (1). `PostgresUserRepository` en ajoutait 2 ;
- `users` et `companies` n'avaient aucune policy, et celles de `expense_notes` ne filtraient jamais par entreprise ;
- ces policies contredisaient en plus l'`ApprovalPolicy` de l'ADR 0003 : le RH n'y voyait que les managers racine. Personne ne s'en apercevait, puisqu'elles ne s'appliquaient pas.

Un `WHERE` oublié dans une future route suffisait donc à exposer les notes d'une autre entreprise.

## Décision

**1. Deux rôles Postgres.**

| Rôle | Utilisé par | Pouvoirs |
| --- | --- | --- |
| `expense` (propriétaire) | migrations, seed (`MIGRATION_DATABASE_URL`) | tout |
| `expense_app` | l'application (`DATABASE_URL`) | `NOSUPERUSER NOBYPASSRLS`, privilèges minimaux, soumis à la RLS |

- La migration `1700000000004_app-role-rls.sql` crée `expense_app` **sans droit de connexion**. `scripts/ensure-app-role.mjs` (`make ensure-app-role`, appelé par `make dev`) l'ouvre avec le mot de passe de `DATABASE_URL`. Aucun secret n'est versionné.
- Les privilèges sont accordés colonne par colonne :
  - `users.password_hash` n'est pas lisible par l'application ;
  - une note ne se modifie que dans ses colonnes de décision ;
  - un utilisateur ne se modifie que dans son rattachement (`manager_id`) ;
  - aucun `DELETE`.

**2. La RLS garantit l'entreprise, le domaine garde la règle fine.** C'est le partage retenu entre deux options :

| | RLS | `ApprovalPolicy` (domaine) |
| --- | --- | --- |
| Rôle | Défense en profondeur : ce qu'une requête *peut* voir ou modifier | Règle métier : qui *doit* trancher quoi |
| `expense_notes`, lecture | Même entreprise **et** (sa note, ou celle d'un subordonné direct, ou toutes pour un RH) | — |
| `expense_notes`, écriture | Pour soi uniquement à l'insertion ; décision par manager direct ou RH, jamais sur sa propre note, enregistrée à son nom (`decided_by` = soi) | Manager direct ; à défaut un RH ; une note de RH par un autre RH |
| `users` / `companies` | Son entreprise ; rattachement par un RH de l'entreprise | Contrôle de cycle (route RH) |

Les policies portent les règles n°4 (pas d'auto-décision) et n°7 (isolation), qui ne doivent **jamais** être contournées. Elles restent volontairement plus larges que l'`ApprovalPolicy` : par exemple, un RH peut *techniquement* modifier la note d'un employé qui a un manager, et c'est le domaine qui l'en empêche (403).

**3. Le contexte est relu en base, pas dans le JWT.** Les policies appellent `app_current_company_id()` et `app_current_role()`. Ces fonctions `SECURITY DEFINER` relisent `users` à partir de `app.current_user_id`, posé par `withUserScope`. Elles s'exécutent avec les droits du propriétaire, ce qui évite qu'une policy de `users` qui lirait `users` boucle sur elle-même.

**4. Login et inscription passent par deux fonctions au périmètre fermé.** Avant l'authentification, aucun utilisateur n'est connu, donc aucune policy ne peut filtrer.
- `app_find_credentials(email)` renvoie les identifiants d'**un** compte.
- `app_register_user(name, email, hash)` crée le compte et, si besoin, son entreprise, **en une transaction** (DAT-02).
- La règle d'inscription ne change pas (entreprise déduite du domaine de l'email). Elle attend la décision produit R9.

**5. `company_id` est porté par la note.** Une clé étrangère composite `(user_id, company_id) → users(id, company_id)` garantit en base que la note appartient à l'entreprise de son auteur. L'isolation s'exprime alors sans jointure.

**6. Les emails passent en `citext` et sont normalisés en minuscules** (`domain/Email.ts`), au login comme à l'inscription.

## Alternatives écartées

- **Recopier toute l'`ApprovalPolicy` en SQL dans les policies.** Ce serait plus strict, mais la règle existerait en deux exemplaires, qui finiraient par diverger. C'est exactement le défaut ARC-01/ARC-03 qu'on corrige, et la divergence passée des policies (contexte ci-dessus) le prouve.
- **Une seconde connexion « système » qui contourne la RLS, pour le login et l'inscription.** C'est plus simple, mais l'application détiendrait en permanence un identifiant capable de tout lire. La moindre injection ou le moindre oubli sur ce chemin annulerait l'isolation.
- **Garder le superutilisateur et compter sur les `WHERE`.** C'est la situation de départ, celle qui a produit SEC-04 et SEC-05.
- **Une base ou un schéma par entreprise.** L'isolation serait maximale, mais migrations, connexions et onboarding seraient lourds. C'est disproportionné pour une PME (KISS, cours n°2). La colonne `company_id` laisse cette porte ouverte, ou celle d'un partitionnement par région (CAP, cours n°2).

## Conséquences

- **Un `WHERE` oublié ne fuit plus** : `tests/security/sec-03-tenant-isolation.test.ts` lance des `SELECT` sans filtre avec le rôle applicatif, sur les 3 tables et pour les 4 rôles d'une entreprise. Toute la suite d'intégration tourne désormais avec ce rôle, comme en production.
- **Changement visible sur la route de décision** : un manager qui n'est pas le manager direct reçoit **404** au lieu de 403, car la RLS lui cache la note et on ne révèle pas son existence (même logique que les reçus, SEC-04). Le 403 reste renvoyé quand l'utilisateur voit la note sans en être le validateur : sa propre note, ou un RH sur la note d'un employé rattaché. Cela amende le point 7 de l'ADR 0003.
- **Configuration** : deux URL de connexion au lieu d'une. `make env` complète un `.env` existant. Un déploiement doit fournir un propriétaire capable de `CREATE ROLE` pour la migration 0004.
- **Coût** : chaque policy appelle des fonctions `STABLE` qui relisent `users`. C'est négligeable à cette échelle. Si les volumes grandissent, on pourra poser le `company_id` dans le contexte de session.
- **Dette restante** : le contrôle de cycle du rattachement reste dans la route `PUT /api/hr/users/{id}/manager`. Il sera extrait dans un cas d'usage `AssignManager` avec le reste des routes RH.
