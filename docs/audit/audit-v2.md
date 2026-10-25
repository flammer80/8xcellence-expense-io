# Audit d'architecture v2 — Expense.io

> Audit du 25 octobre 2026, réalisé avec Claude Code sur le commit `265924b` (projet ARLA, EPITA SIGL 2027). Il est indépendant de l'audit v1 (`audit-v1.md`) : chaque constat de la v1 a été revérifié contre le code et classé confirmé, nuancé ou infirmé (voir §8 « Écarts avec la v1 »).

## Sommaire

1. Synthèse
2. Périmètre et méthode
3. Cartographie
4. Ce qui va bien
5. Ce qui ne va pas
6. Recommandations
7. Plan de refacto priorisé
8. Écarts avec la v1
9. Questions ouvertes

## 1. Synthèse

Expense.io est un monolithe Next.js de **2 492 lignes** réparties sur 44 fichiers (41 sous `src/`, 1 migration, 2 scripts). Il fonctionne pour la démo, mais **trois promesses implicites du produit ne sont pas tenues** :

1. **L'isolation entre clients n'est pas garantie.** L'application se connecte à Postgres en superutilisateur, la RLS ne couvre qu'**1 table sur 3**, et **11 requêtes métier** contournent `withUserScope`. Combinée à une injection SQL et à un secret JWT versionné, la fuite inter-entreprises (le « premier incident » du cours n°2) est atteignable par n'importe quel inscrit.
2. **Le workflow d'approbation ne marche pour aucun vrai client.** Le rôle `manager` n'est attribuable que par le script de seed : tout inscrit devient employé sans manager, et sa note reste en attente indéfiniment.
3. **L'architecture annoncée n'existe pas.** `domain/`, `ports/`, `adapters/` et `utils/` (8 fichiers, 136 lignes) ne sont importés par **aucun** fichier ; la règle « qui valide qui » est recopiée dans 4 routes quasi identiques (190 lignes).

**26 constats : 6 critiques, 12 majeurs, 8 mineurs.** Les 6 critiques sont des failles exploitables aujourd'hui ; les majeurs découlent presque tous de l'absence de couche application entre HTTP et la base.

**Recommandation directrice :** corriger les failles derrière un filet de tests, **puis** passer à un monolithe modulaire hexagonal (pas de microservices), en traitant l'isolation en base et la soumission atomique **dans la même étape**, car corriger l'une sans l'autre casse la création de note.

## 2. Périmètre et méthode

- **Périmètre :** `src/` (41 fichiers), `migrations/1700000000001_init-schema.sql`, `scripts/seed.mjs`, `scripts/ensure-bucket.mjs`, `docker-compose.yml`, `Makefile`, `package.json`, `tsconfig.json`, `eslint.config.mjs`, `next.config.ts`, `.env.example`, `README.md`.
- **Méthode :** lecture intégrale ligne à ligne, puis comptages outillés (`grep`, `wc`) pour chaque chiffre de ce document. Références au format `fichier:ligne`, chemins relatifs à `src/` sauf mention contraire.
- **Classement :** 4 axes (sécurité, architecture, données, exploitation et tests) × 3 gravités.
  - **Critique** : faille exploitable ou perte de données, à corriger avant tout le reste.
  - **Majeur** : bloque l'évolution ou la fiabilité du produit.
  - **Mineur** : dette de confort, traitée au fil de la refacto.
- **Limite assumée :** l'application n'a pas été exécutée et aucun code applicatif n'a été modifié pendant l'audit. Les failles sont démontrées par lecture ; chacune sera **prouvée par un test qui échoue avant le correctif** à l'étape 1 du plan (liste au §7).

## 3. Cartographie

### Chiffres clés

| Mesure | Valeur | Source |
| --- | --- | --- |
| Lignes de code (src + migration + scripts) | 2 492 | `wc -l` |
| Fichiers de routes API | 14 métier + 1 NextAuth | `app/api/**/route.ts` |
| Handlers HTTP métier | 15 (GET + POST sur `/api/expense-notes`) | idem |
| Tables / tables sous RLS | 3 / 1 | migration:4-40 |
| Appels `getPool().query` hors `withUserScope` | 12, dont 1 légitime (login) | grep |
| Routes renvoyant la stack au client | 13 sur 14 | `respondError` |
| Fichiers importés de `domain/ ports/ adapters/ utils/` | 0 sur 8 | grep |
| Copies du mapping note → JSON | 7 (3 fonctions + 4 inlinées) | routes |
| Déclarations du type des rôles | 6 | grep |
| Configurations du client S3 | 3 | `lib/storage.ts`, 2 scripts |
| `eslint-disable` | 3 | front |
| Tests automatisés / CI | 0 / 0 | `package.json` |
| Index secondaires en base | 0 | migration |

### Topologie actuelle

```
Navigateur (React 19, 3 composants clients)
   │  fetch brut, types redéclarés
   ▼
14 route handlers Next.js  ──►  lib/auth (JWT, secret en dur)
   │   auth + rôle + validation + SQL + S3 + mapping JSON dans chaque fichier
   ├──► lib/db ──► PostgreSQL 16 (connexion superutilisateur, RLS ignorée)
   ├──► lib/storage ──► S3 / LocalStack (URL pré-signées 5 min)
   └──► lib/ocr ──► Tesseract (synchrone, dans la requête)

domain/  ports/  adapters/  utils/   ← reliés à rien
```

Toutes les flèches partent de la couche HTTP. Aucune couche application ne s'intercale ; le bloc censé porter les règles métier est isolé. C'est le cas d'école du cours n°2 : **« terminologie valide mais métier couplé à l'infrastructure »**.

### Surface HTTP

| Préfixe | Routes | Rôle exigé | Code si mauvais rôle |
| --- | --- | --- | --- |
| `/api/expense-notes` | GET, POST, `[id]/receipt-url`, `receipt-suggestion` | connecté | — |
| `/api/manager/expense-notes` | liste, `approve`, `reject`, `receipt-url` | `manager` | 401 |
| `/api/hr/expense-notes` | liste, `approve`, `reject`, `receipt-url` | `hr_admin` | 403 |
| `/api/hr/users` | liste, `[id]/manager` (PUT) | `hr_admin` | 403 |

La même ressource (une note) est exposée sous 3 préfixes, un par rôle : l'organisation des routes reflète les rôles, pas le métier.

## 4. Ce qui va bien

| Point fort | Où | Pourquoi c'est un atout pour la refacto |
| --- | --- | --- |
| Stack récente et typée | `package.json`, `tsconfig.json` | Next.js 16, React 19, TypeScript `strict` : les régressions de types seront détectées. |
| Onboarding en une commande | `Makefile`, `scripts/seed.mjs` | `make dev` monte Postgres et LocalStack, migre et peuple 3 comptes ; le seed est idempotent. Réutilisable tel quel pour les tests d'intégration et la CI. |
| Requêtes paramétrées | 25 requêtes sur 26 | Seul `ORDER BY ${sort}` est concaténé. |
| Mots de passe | `app/actions/auth.ts:65`, `lib/auth.ts:37` | bcrypt coût 12 ; message de login générique, sans énumération de comptes. |
| Reçus privés | `lib/storage.ts:35-38` | Bucket non public, URL pré-signée de 5 minutes. |
| Contraintes SQL | migration:13-33 | `CHECK` sur rôle et statut, clés étrangères, montant en `numeric(10,2)`. |
| `withUserScope` bien écrit | `lib/db.ts:28-46` | Transaction, `set_config(..., true)` local à la transaction, `ROLLBACK` et `release` corrects : c'est la bonne brique, simplement pas utilisée partout. |
| Pages protégées côté serveur | `app/hr/page.tsx:6`, `app/manager/page.tsx:6` | Le contrôle de rôle des pages est fait en Server Component, pas seulement dans le front. |
| Dates sans piège de fuseau | `lib/db.ts:5` | Le type `date` est gardé en chaîne ISO. |
| Amorce de domaine | `domain/ExpenseNote.ts`, `domain/User.ts` | Entités immuables ; `approve()` porte déjà la règle « une seule décision ». Point de départ naturel du noyau. |
| Validation de l'upload de note | `api/expense-notes/route.ts:81-86` | Liste blanche MIME et 10 Mo maximum. |

## 5. Ce qui ne va pas

### 5.1 Sécurité

| ID | Constat | Où | Gravité | Impact métier | Reco |
| --- | --- | --- | --- | --- | --- |
| SEC-01 | **Injection SQL** : `sort` est concaténé dans `ORDER BY`, avec un commentaire qui justifie le choix. Le front n'envoie jamais ce paramètre. | `api/expense-notes/route.ts:39-47` | Critique | Tout inscrit lit la base entière. `users` n'ayant pas de RLS, même une connexion non superutilisateur laisserait fuir les hash de **toutes** les entreprises. | R1 |
| SEC-02 | **Secret JWT en dur et versionné** ; il prime sur l'`AUTH_SECRET` de l'environnement. Le rôle et l'id sont lus du jeton sans revérification. | `lib/auth.ts:6-11`, `:45-58` | Critique | Quiconque lit le dépôt forge un jeton `{ id, role: 'hr_admin' }` et devient RH de son entreprise, ou de n'importe laquelle avec un id obtenu via SEC-01. | R1 |
| SEC-03 | **Isolation multi-tenant non garantie par la base** : connexion superutilisateur (l'image Docker crée `POSTGRES_USER` ainsi), RLS sur `expense_notes` seulement, policies RH sans filtre d'entreprise, 11 requêtes métier hors `withUserScope`. | `docker-compose.yml:5`, migration:39-100, `lib/db.ts:11-20` | Critique | L'isolation présentée comme « garantie par PostgreSQL » (`lib/db.ts:22-27`) repose en réalité sur des `WHERE` écrits à la main, route par route. Un oubli = une fuite entre clients. | R2 |
| SEC-04 | **IDOR sur les reçus côté manager** : lecture de `receipt_key` par le seul `id`, sans contrôle de rattachement (« pas besoin de revérifier »). | `api/manager/expense-notes/[id]/receipt-url/route.ts:14-17` | Critique | Tout manager obtient le justificatif de n'importe quelle note de n'importe quel client. Il faut l'UUID de la note (non devinable), que SEC-01 fournit. | R1 |
| SEC-05 | **Rattachement de manager inter-entreprises et cycles** : la cible est filtrée par entreprise, pas le manager choisi ; aucun contrôle de cycle. | `api/hr/users/[id]/manager/route.ts:23-45` | Critique | Un RH rattache ses employés à un manager d'un autre client, qui voit et tranche leurs notes ; deux managers peuvent s'approuver mutuellement. | R1 |
| SEC-06 | **Prise de contrôle d'un tenant à l'inscription** : l'entreprise est déduite du domaine email, sans vérification d'adresse ; le premier inscrit d'un domaine en devient RH. | `app/actions/auth.ts:41-63` | Critique | Un inconnu s'inscrit en `ceo@client.com` avant le vrai client et devient RH de son espace (annuaire, notes des managers racine). Tous les `@gmail.com` partagent un même tenant. | R3 |
| SEC-07 | **Stack traces renvoyées au client** en 500 par 13 routes. | `lib/errors.ts:1-6` | Majeur | Expose SQL, chemins et versions ; transforme SEC-01 en injection par message d'erreur, plus rapide à exploiter. | R1 |
| SEC-08 | **OCR sans garde-fou** : aucune taille maximale, un worker Tesseract créé par requête, modèle de 707 Ko rechargé à chaque appel (`cacheMethod: 'none'`), exécution synchrone. | `lib/ocr.ts:106-121`, `api/expense-notes/receipt-suggestion/route.ts:12-19` | Majeur | Quelques uploads lourds saturent le CPU : déni de service à la portée de tout inscrit. | R7 |
| SEC-09 | Rôle figé dans le JWT (validité NextAuth par défaut : 30 jours), jamais relu en base. | `lib/auth.ts:45-58` | Mineur | Sans gravité aujourd'hui (aucun changement de rôle possible), mais devient majeur dès qu'on pourra rétrograder un manager : il gardera ses droits jusqu'à expiration. | R3 |
| SEC-10 | Un body absent ou mal formé **détache silencieusement** l'employé de son manager (`.catch(() => null)` puis `?? null`). | `api/hr/users/[id]/manager/route.ts:12-13` | Mineur | Une erreur d'intégration côté client efface la hiérarchie et bloque les notes du salarié, sans erreur visible. | R8 |
| SEC-11 | Hygiène : type MIME déclaré par le client, `expenseDate` non validée (une date invalide finit en 500 avec stack), email non normalisé (login sensible à la casse, doublons), aucune limitation de débit sur login et inscription. | `api/expense-notes/route.ts:65-86`, `app/actions/auth.ts:23-36` | Mineur | Surface d'attaque élargie (force brute), données invalides et comptes en double. | R8 |

### 5.2 Architecture

| ID | Constat | Où | Gravité | Impact métier | Reco |
| --- | --- | --- | --- | --- | --- |
| ARC-01 | **Hexagone de façade** : 0 import des 8 fichiers de `domain/`, `ports/`, `adapters/`, `utils/`. `ExpenseNote.approve()` n'est jamais appelé ; les entités n'ont même pas de notion d'entreprise. | `domain/*`, `ports/*`, `adapters/*`, `utils/*` | Majeur | Le code trompe le lecteur (humain ou LLM) : on croit la règle centralisée alors qu'elle est ailleurs, en 4 exemplaires. | R4 |
| ARC-02 | **Transaction Script** : chacune des 14 routes enchaîne session, rôle, validation, SQL, S3 et mapping JSON. Ni couche application ni repository. | `app/api/**` | Majeur | Règles métier testables uniquement avec Postgres et S3 ; tout changement de règle touche plusieurs fichiers. | R4 |
| ARC-03 | **Duplication** : 4 routes approve/reject (190 lignes) qui ne diffèrent que par le rôle, le `WHERE` et le statut ; mapping DTO copié 7 fois ; client S3 configuré 3 fois ; type des rôles déclaré 6 fois ; regex email 2 fois ; formatters monétaires et de date recopiés dans 3 composants. | routes, `scripts/`, `components/` | Majeur | Chaque correctif se réplique à la main, et l'oubli produit des failles : le contrôle de rattachement existe côté RH, pas côté manager (SEC-04). | R4 |
| ARC-04 | **Workflow d'approbation inutilisable en production** : le rôle `manager` n'est attribuable que par le seed (`README.md:48-49`) ; un employé sans manager, un RH ou un manager non racine sans manager valide n'ont aucun approbateur. | `app/actions/auth.ts:52-63`, `api/hr/expense-notes/route.ts:27-31` | Majeur | Pour un vrai client inscrit par `/signup`, **aucune note n'est jamais tranchée** : la fonctionnalité cœur du produit ne fonctionne pas. | R3, R5 |
| ARC-05 | **Double décision concurrente** : `SELECT`, contrôle du statut en JS, puis `UPDATE … WHERE id = $1` sans condition de statut. Deux requêtes simultanées passent toutes les deux ; la seconde écrase la première. | 4 routes approve/reject, l.14-31 | Majeur | Une note approuvée peut devenir rejetée (ou l'inverse) sans trace ; aucune trace de qui a décidé ni quand. | R5 |
| ARC-06 | **Soumission non atomique** : INSERT commité avec `receipt_key = ''`, puis upload S3, puis UPDATE hors transaction. Et surtout : **sous un rôle non superutilisateur, cet UPDATE ne touche aucune ligne** (aucune policy UPDATE pour le propriétaire), la route plante et laisse une note sans reçu. | `api/expense-notes/route.ts:88-108` | Majeur | Aujourd'hui, une panne S3 laisse une note sans justificatif, validable. Demain, la correction de SEC-03 casse la création de note si elle est faite seule. | R2 |
| ARC-07 | **Aucun échange asynchrone** : `NotificationPort` n'est jamais appelé, l'employé n'est jamais prévenu ; l'OCR, traitement lourd, s'exécute dans la requête HTTP. | `ports/NotificationPort.ts`, `lib/ocr.ts` | Majeur | Fonctionnalité attendue absente ; temps de réponse imprévisibles ; aucun point d'extension pour l'IA, la finance ou l'email (évolutions annoncées). | R7 |
| ARC-08 | **Contrat HTTP incohérent** : mauvais rôle en 401 sur 4 routes manager ; non connecté en **403** sur 6 routes RH ; manager invalide en 409 au lieu de 422 ; erreurs `{ error }` hors RFC 9457 ; `receiptKey` exposé dans 7 réponses ; aucune pagination ; aucune spec OpenAPI. | `app/api/**` | Mineur | API difficile à consommer, a fortiori par un agent IA qui lit le schéma littéralement ; fuite de détails de stockage. | R8 |
| ARC-09 | **Front couplé à l'API brute** : `fetch` dans `useEffect` avec 3 `eslint-disable`, interface `ExpenseNote` redéclarée 3 fois, `AdminConsole` de 269 lignes mêlant annuaire et approbations, `utils/format.ts` ignoré ; le manager voit un UUID tronqué au lieu du nom de l'employé. | `app/expenses/page.tsx:70`, `components/PendingApprovalsPanel.tsx:38,117`, `components/AdminConsole.tsx:224` | Mineur | Duplication côté client, UX dégradée pour le manager, aucun type partagé avec le back. | R8 |

### 5.3 Données

| ID | Constat | Où | Gravité | Impact métier | Reco |
| --- | --- | --- | --- | --- | --- |
| DAT-01 | **Schéma pauvre pour le métier** : pas de `company_id` sur `expense_notes` (tenant déduit par jointure), pas de `decided_by`, `decided_at`, `updated_at`, ni de devise ; **aucun index secondaire** (`users.manager_id`, `expense_notes.user_id`, `status`). | migration:11-34 | Majeur | Pas de piste d'audit pour des frais remboursés ; isolation plus difficile à exprimer ; requêtes en scan complet à mesure que le volume croît ; pas de base pour le multi-devise et le multi-région. | R6 |
| DAT-02 | **Inscription non transactionnelle** : entreprise puis utilisateur insérés séparément. Si le second INSERT échoue (inscriptions simultanées sur le même email), l'entreprise reste **sans RH, définitivement** : tous les inscrits suivants y entrent comme employés. La contrainte `UNIQUE` remonte en 500. | `app/actions/auth.ts:36-69` | Majeur | Tenant irrécupérable sans intervention en base. | R3, R6 |
| DAT-03 | `receipt_seq` séquentiel (révèle le volume de notes), `receipt_key` vide possible, migration *down* qui laisse l'extension `pgcrypto`. | migration:24-31, 102-105 | Mineur | Fuite d'information métier ; données incohérentes. | R6 |

### 5.4 Exploitation et tests

| ID | Constat | Où | Gravité | Impact métier | Reco |
| --- | --- | --- | --- | --- | --- |
| OPS-01 | **Zéro test, zéro CI** : aucun framework de test ni script `test`. Seuls `lint` et `typecheck` existent. | `package.json` | Majeur | Aucune refacto sereine ; aucune des failles critiques n'aurait passé un test d'autorisation. | R9 |
| OPS-02 | Logs `console` sans corrélation ; le `Makefile` annonce « génère AUTH_SECRET si besoin » mais se contente d'un `cp` ; paquet nommé `expense-io-version-b`. | `Makefile:13-14`, `lib/*`, `package.json:2` | Mineur | Diagnostic difficile en production ; documentation trompeuse. | R9 |
| OPS-03 | Dérive de configuration : `ensure-bucket` force `forcePathStyle: true` en ignorant `S3_FORCE_PATH_STYLE` ; le seed réécrit rôles et rattachements à chaque exécution ; mots de passe de démo de 6 caractères alors que l'inscription en exige 8. | `scripts/ensure-bucket.mjs:17`, `scripts/seed.mjs:61-64` | Mineur | Comportements différents entre local et cible ; seed destructif sur une base partagée. | R9 |

## 6. Recommandations

Cible : un **monolithe modulaire hexagonal** pour le contexte « notes de frais », avec une seule règle : *les dépendances pointent vers le domaine*. Next.js, Postgres, S3 et Tesseract deviennent des adaptateurs. On garde la stack : le problème est structurel, pas technologique.

### R1 — Colmater les failles applicatives

- **Quoi.** Liste blanche pour `sort` (`date_desc`, `date_asc`, `amount_desc`…) ; `AUTH_SECRET` lu depuis l'environnement, démarrage refusé s'il manque, ancien secret révoqué ; gestionnaire d'erreurs générique qui journalise la stack côté serveur avec un id de corrélation ; contrôle de rattachement sur le reçu manager ; manager vérifié dans la même entreprise et cycles refusés.
- **Pourquoi.** Exploitable aujourd'hui par tout inscrit ; chaque correctif part d'un test rouge.
- **Couvre :** SEC-01, SEC-02, SEC-04, SEC-05, SEC-07.
- **Cours :** sécurité des API (authentification vs autorisation, limites du JWT), RFC 9457 (jamais de stack côté client).

### R2 — Isolation garantie par la base, avec soumission atomique

- **Quoi.** Rôle Postgres applicatif `NOSUPERUSER NOBYPASSRLS`, distinct du propriétaire des migrations ; RLS sur les 3 tables avec filtre d'entreprise ; toutes les requêtes dans `withUserScope` ; **dans la même étape**, soumission « fichier d'abord (clé UUID), base ensuite (un seul INSERT) », avec suppression de l'objet si l'INSERT échoue.
- **Pourquoi.** La RLS devient une vraie défense en profondeur : un `WHERE` oublié ne fuit plus. Les deux chantiers sont couplés (ARC-06) : séparés, l'un casse l'autre.
- **Couvre :** SEC-03, ARC-06, DAT-03.
- **Cours :** « premier incident » du cours n°2 (fuite inter-clients), trade-off sécurité vs complexité.

### R3 — Onboarding et rôles (décision produit)

- **Quoi.** Remplacer l'entreprise déduite du domaine par une entreprise créée par un RH qui invite ses salariés (option complète) ou, a minima, refuser les domaines publics et vérifier l'email ; permettre au RH de **promouvoir un salarié manager** ; inscription transactionnelle ; rôle relu en base pour les actions sensibles.
- **Pourquoi.** Sans rôle manager attribuable, le cœur du produit est inutilisable ; sans vérification, un tenant se vole par simple inscription.
- **Couvre :** SEC-06, SEC-09, ARC-04, DAT-02.
- **Cours :** RACI (décision produit à faire valider, pas à trancher seul), build vs buy (l'onboarding est une commodité ; le workflow d'approbation est le différenciant).

### R4 — Noyau hexagonal réel

- **Quoi.** `domain/` (entités, value objects `Money`, `ExpenseDate`, erreurs métier), `application/` (un cas d'usage par intention : `SubmitExpenseNote`, `DecideExpenseNote`, `AssignManager`, `GetReceiptUrl`…), ports et adaptateurs Postgres, S3 et en mémoire, racine de composition. Les routes deviennent des adaptateurs de quelques lignes ; le SQL ne vit que dans `infrastructure/postgres`.
- **Pourquoi.** Cause racine d'ARC-01 à ARC-03 : sans couche application, chaque route réinvente la règle et les divergences deviennent des failles.
- **Couvre :** ARC-01, ARC-02, ARC-03.
- **Cours :** hexagonale vs Clean Architecture (testabilité, inversion des dépendances, évolutivité) ; choix de l'hexagonale, moins prescriptive, adaptée à une petite équipe ; KISS.

### R5 — Workflow d'approbation explicite

- **Quoi.** Une `ApprovalPolicy` du domaine, seule source de « qui tranche quoi » : le manager direct ; à défaut (manager racine, employé sans manager), un RH de l'entreprise ; une note de RH par un autre RH ; jamais soi-même. Mise à jour conditionnelle `WHERE status = 'pending'` (409 au second appel), `decided_by` et `decided_at` enregistrés. Une route `POST /api/expense-notes/{id}/decision` ; les 4 routes existantes deviennent des adaptateurs fins, dépréciés mais conservés.
- **Pourquoi.** C'est le cœur différenciant d'Expense.io ; il doit tenir dans un fichier testé règle par règle.
- **Couvre :** ARC-04, ARC-05.
- **Cours :** idempotence (même état final au rejeu), style POST Action localisé pour une action métier non CRUD, « pas de meilleur style ».

### R6 — Schéma prêt pour les évolutions

- **Quoi.** Nouvelle migration : `company_id` sur `expense_notes`, `decided_by`, `decided_at`, `updated_at`, `currency`, email en `citext`, index `users(company_id)`, `users(manager_id)`, `expense_notes(company_id, status)`, `expense_notes(user_id, created_at)` ; suppression de `receipt_seq`.
- **Pourquoi.** Piste d'audit des frais remboursés ; isolation simple à exprimer ; `company_id` et devise préparent le partitionnement par tenant ou par région (client international).
- **Couvre :** DAT-01, DAT-02, DAT-03.
- **Cours :** solution internationale et théorème CAP (partitionner par tenant plutôt que répliquer tout partout).

### R7 — Un seul protocole asynchrone

- **Quoi.** Événements de domaine versionnés `ExpenseNoteSubmitted` et `ExpenseNoteDecided` écrits dans une table `outbox` dans la même transaction que la note ; un worker unique adossé à Postgres (pg-boss) ; consommateurs idempotents, DLQ après N échecs, id de corrélation propagé. Notification de décision en premier consommateur ; OCR en job (`POST` → 202 + lien de suivi, puis polling), taille maximale et concurrence bornée.
- **Pourquoi.** Justifié ici par deux besoins réels (notification absente, OCR bloquant). Pas de Kafka ni de RabbitMQ : disproportionnés à cette échelle.
- **Couvre :** ARC-07, SEC-08.
- **Cours :** « la résilience du système est celle de son maillon le plus lent » ; outbox, ack, DLQ, idempotence, chorégraphie ; API asynchrones (202 + polling).

### R8 — Contrat HTTP et front

- **Quoi.** Spec OpenAPI écrite avant le code (`docs/api/openapi.yaml`) ; schémas zod en entrée ; erreurs RFC 9457 ; codes cohérents (401, 403, 404, 409, 422, 429) ; plus de `receiptKey` exposé ; pagination ; limitation de débit sur login et inscription. Côté client : DTO partagés, petit client d'API, `AdminConsole` découpé, nom de l'employé affiché.
- **Pourquoi.** Un contrat stable et typé des deux côtés supprime la duplication et rend les erreurs exploitables, y compris par un agent IA.
- **Couvre :** ARC-08, ARC-09, SEC-10, SEC-11.
- **Cours :** contract first, semver et dépréciation (`Sunset`), anatomie d'une requête, RFC 9457, « une API mal conçue fait échouer un agent ».

### R9 — Tests, CI et garde-fous

- **Quoi.** Vitest en trois niveaux (unitaires sur adaptateurs en mémoire, intégration sur Postgres Docker avec le rôle non superutilisateur, autorisation : un test par faille et par règle métier) ; GitHub Actions (lint, typecheck, tests) ; règle ESLint qui interdit à `domain/` d'importer l'extérieur et à `application/` d'importer l'infrastructure ou Next.js ; logs structurés (pino) ; README et `.env.example` corrigés.
- **Pourquoi.** Sans filet, chaque étape risque une régression silencieuse ; le garde-fou empêche le retour de l'hexagone de façade.
- **Couvre :** OPS-01, OPS-02, OPS-03.
- **Cours :** intégration et garde-fous (cours n°4), ADR comme livrable.

## 7. Plan de refacto priorisé

Ordre : le risque d'abord (sécurité), puis les dépendances (le domaine avant ce qui s'appuie dessus). Chaque étape est livrable seule, avec tests, lint et typecheck verts. **Contrainte transverse :** URLs, méthodes, formats de réponse et parcours UI existants sont préservés ; les routes unifiées restent en adaptateurs fins dépréciés. Seuls les comportements qui sont eux-mêmes des failles changent, et chaque changement est documenté.

| Étape | Contenu | Recos | Prérequis | Critère de fin |
| --- | --- | --- | --- | --- |
| 1. Filet et failles applicatives | Vitest + CI ; tests qui prouvent SEC-01, 02, 04, 05, 07 (rouges), puis correctifs | R1, R9 | — | 5 tests de faille verts ; CI verte |
| 2. Isolation en base + soumission atomique | Rôle applicatif, RLS sur 3 tables, `withUserScope` partout ; soumission fichier → INSERT unique | R2 | 1 | Test d'isolation entre 2 entreprises vert avec le rôle applicatif ; aucune note sans reçu |
| 3. Noyau hexagonal et workflow | Domaine, `ApprovalPolicy`, cas d'usage, repositories, composition ; route `decision` ; anciennes routes en adaptateurs | R4, R5 | 2 | Une seule implémentation de la règle ; 409 sur double décision ; 0 SQL dans les routes |
| 4. Schéma et onboarding | Migration audit, devise, index ; onboarding selon la décision produit ; promotion manager | R6, R3 | 3 + décision produit | Une entreprise créée par `/signup` peut faire valider une note de bout en bout |
| 5. Asynchrone unifié | Outbox, worker, notification de décision, OCR en job | R7 | 3, 4 | L'employé est notifié ; l'OCR ne bloque plus la requête |
| 6. Contrat et front | OpenAPI, zod, RFC 9457, DTO partagés, client d'API, découpage d'`AdminConsole` | R8 | 3 | Aucun type dupliqué front/back ; 0 `eslint-disable` |

**Preuves à produire aux étapes 1 et 2** (tests rouges avant correctif) :

- `GET /api/expense-notes?sort=(SELECT …)` exécute du SQL arbitraire.
- Un jeton signé avec le secret du dépôt et `role: 'hr_admin'` ouvre `/api/hr/users`.
- Un manager de l'entreprise A obtient l'URL du reçu d'une note de l'entreprise B.
- Un RH de A rattache un salarié à un manager de B ; un cycle A → B → A est accepté.
- Une erreur SQL renvoie `stack` au client.
- Avec le rôle applicatif, un utilisateur de A ne lit aucune ligne de B, sur les 3 tables.
- Deux décisions concurrentes sur la même note : une seule réussit.

## 8. Écarts avec la v1

Aucun constat de la v1 n'est infirmé. Huit sont nuancés (dont les chiffres de cadrage), et sept points manquaient.

### Vérification des constats v1

| v1 | Verdict | Commentaire v2 |
| --- | --- | --- |
| S1 injection `sort` | Confirmé | `route.ts:39-47`. Le front n'utilise pas `sort` : la liste blanche ne casse aucun parcours. → SEC-01 |
| S2 RLS inopérante | Confirmé, étendu | En plus : RLS sur 1 table sur 3, et sa correction seule casse la soumission. → SEC-03, ARC-06 |
| S3 IDOR reçu manager | Nuancé | Critique, mais exploitable surtout par chaînage avec S1 (UUID v4 non devinable). → SEC-04 |
| S4 secret JWT | Confirmé | Scénario précisé : forger `role: 'hr_admin'` avec son propre id suffit. → SEC-02, SEC-09 |
| S5 rattachement inter-entreprises | Confirmé | → SEC-05 |
| S6 stack traces | Nuancé | La synthèse v1 le range parmi les 5 critiques, le tableau v1 le classe majeur : incohérence. Majeur retenu. → SEC-07 |
| S7 entreprise par domaine | Nuancé (gravité) | Remonté en **critique** : prise de contrôle d'un tenant sans vérification. → SEC-06 |
| S8 OCR | Confirmé | Chiffré : modèle de 707 Ko rechargé à chaque requête. → SEC-08 |
| S9 hygiène | Nuancé | Les clés prévisibles n'exposent pas les fichiers (bucket privé), seulement le volume. → SEC-11, DAT-03 |
| A1 hexagone de façade | Nuancé (détail) | Le contrôle `pending` est en JS après le `SELECT`, pas « réécrit en SQL ». → ARC-01 |
| A2 Transaction Script | Confirmé | 14 fichiers de routes. → ARC-02 |
| A3 duplication | Confirmé, chiffré | Rôles déclarés 6 fois (pas 5) ; mapping 7 copies ; 190 lignes pour approve/reject. → ARC-03 |
| A4 workflow | Confirmé, aggravé | Le rôle manager est inatteignable hors seed. → ARC-04, ARC-05 |
| A5 asynchrone absent | Confirmé | → ARC-07 |
| A6 soumission non atomique | Confirmé, étendu | Couplage avec la correction RLS. → ARC-06 |
| A7 contrat HTTP | Confirmé, étendu | L'inverse existe aussi : RH en 403 pour un non-connecté ; 409 au lieu de 422. → ARC-08 |
| A8 front | Confirmé | → ARC-09 |
| D1 schéma | Confirmé | 0 index secondaire. → DAT-01 |
| D2 inscription | Nuancé (gravité) | Remonté en **majeur** : entreprise sans RH irrécupérable. → DAT-02 |
| O1 zéro test | Confirmé | `lint` et `typecheck` existent toutefois. → OPS-01 |
| O2 logs, doc | Nuancé | Ce n'est pas le README qui promet `AUTH_SECRET`, c'est le `Makefile:13`. → OPS-02 |
| Chiffres de cadrage | Nuancé | 41 fichiers sous `src/` (pas « environ 50 »), 2 492 lignes ; 14 routes métier + NextAuth. |

### Constats absents de la v1

1. **La correction de la RLS casse la création de note** si elle n'est pas faite avec la soumission atomique (ARC-06) : le plan v1 les plaçait aux étapes 1 et 4 ; la v2 les fusionne en étape 2.
2. **`users` et `companies` n'ont aucune RLS** : même avec une connexion non superutilisateur, SEC-01 fait fuir tous les hash (SEC-01, SEC-03).
3. **Le rôle `manager` n'est attribuable que par le seed** : le workflow ne marche pour aucun vrai client (ARC-04). C'est le constat le plus parlant pour un CTO.
4. **Un body vide détache le manager en silence** (SEC-10).
5. **Une entreprise peut rester sans RH à vie** après un échec d'inscription (DAT-02).
6. **Codes 401/403 inversés côté RH** et 409 au lieu de 422 (ARC-08).
7. **Dérives de configuration** : seed destructif, `ensure-bucket` qui ignore sa variable, pas de pagination (OPS-03, ARC-08).

### Changements de priorités

- S7 passe de majeur à **critique** (SEC-06), D2 de mineur à **majeur** (DAT-02), S6 est confirmé **majeur**.
- L'étape « isolation en base » est fusionnée avec la « soumission atomique ».
- La décision produit sur l'onboarding et l'attribution du rôle manager devient un **prérequis** de l'étape 4, et non une option de fin de projet.

## 9. Questions ouvertes

1. **Onboarding (décision produit).** Invitation par un RH (option complète) ou refus des domaines publics avec vérification d'email (option minimale) ? Et qui peut nommer un manager : le RH seul ?
2. **Note d'un RH quand l'entreprise n'a qu'un RH.** Elle reste en attente faute d'approbateur : accepte-t-on ce cas, documenté en ADR, ou faut-il un autre circuit ?
3. **Motif de rejet.** Obligatoire (recommandé pour la piste d'audit) ? Le rendre obligatoire sur les routes existantes serait un changement MAJOR du contrat.
4. **Codes HTTP des anciennes routes.** Passer le mauvais rôle de 401 à 403 côté manager est plus juste, mais peut faire échouer des tests E2E existants : corrige-t-on sur les anciennes routes ou seulement sur la nouvelle route `decision` ?
5. **OCR asynchrone.** Le front attend aujourd'hui la suggestion dans la réponse : conserve-t-on la route synchrone en adaptateur (avec taille bornée) le temps de migrer le front vers 202 + polling ?
6. **Barème.** La présentation compte-t-elle pour 3 ou 5 points ? À confirmer auprès des intervenants.
