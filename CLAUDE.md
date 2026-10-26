# CLAUDE.md — Expense.io (projet ARLA, EPITA SIGL promo 2027)

> Ce fichier donne à Claude Code **tout le contexte** du projet : la mission, le barème, les règles métier, la stack, l'audit déjà réalisé (v1, intégral), l'architecture cible, le plan de refacto, et le contenu des trois cours ARLA. Les décisions et la soutenance doivent s'appuyer sur ces concepts.
> **Lis-le en entier avant toute action.**

---

## Sommaire

1. Contexte et mission
2. Soutenance et barème détaillé
3. Règles métier (source de vérité)
4. Stack technique et cartographie
5. Consignes pour le second audit (par Claude Code)
6. Audit v1 — transcription intégrale
7. Recommandations de l'audit v1 (R1 à R9)
8. Plan de refacto priorisé
9. Contraintes non négociables pendant la refacto
10. Conventions d'API à appliquer
11. Asynchrone : règles à appliquer
12. Tests, outillage, garde-fous
13. Préparer le live coding
14. Façon de travailler (pour Claude Code)
15. Annexe A — Cours n°1 « Terminologie et Responsabilités »
16. Annexe B — Cours n°2 « Principes d'Architecture » (étude de cas Expense.io)
17. Annexe C — Cours n°3 « Deep Dive sur les APIs »
18. Annexe D — Quiz du cours n°3 et réponses argumentées
19. Annexe E — Glossaire

---

## 1. Contexte et mission

**Cours :** ARLA — Architecture Logicielle, EPITA, majeure SIGL, promo 2027.
**Intervenants :** Nathan Prats (Senior Software Engineer @ Numspot, SIGL 2022) et Mathieu Bouchet (Site Reliability Engineer @ Theodo Cloud, SIGL 2022).
**Repo d'origine :** https://github.com/NathanPrats/expense-io (à forker ; le lien du fork est envoyé par mail à nathan.prats@epita.fr).

**Plan des cours :**

1. Terminologie et responsabilités — débat
2. Principes d'architecture — étude de cas
3. Deep dive sur les API — quiz
4. Intégration et garde-fous — TP
5. MCO et dette technique — préparation à la soutenance

Le cours est noté uniquement sur le projet rendu et sa soutenance.

**L'histoire (fictive) :** Manu, tout juste sorti d'école de commerce, lance la start-up **Expense.io**, un SaaS B2B de notes de frais. Il a entièrement vibecodé l'application avec son abonnement Claude Pro Max et ne maîtrise pas les principes fondamentaux de l'architecture logicielle. La codebase fournie est donc une « vraie » codebase (fictive) : désordonnée.

**Énoncé officiel (slide 49, cours 1 et 2) :**
> Faire un audit de l'architecture logicielle d'Expense.io, puis mettre en pratique des recommandations en refacto technique des différents composants de l'application, en suivant les guidelines et concepts appris en cours.
> Exemples : refacto de la partie facturation en clean archi / hexagonale, unification des protocoles d'échanges asynchrones, etc.

**Notre mission, en deux temps :**

1. **Auditer** l'architecture (déjà fait une première fois, voir §6 ; **à refaire par Claude Code**, voir §5).
2. **Refactorer** le code selon les recommandations de l'audit et les concepts du cours.

Une partie de la dernière séance est réservée aux questions sur la codebase ; on peut aussi en poser par mail ou en fin de cours.

---

## 2. Soutenance et barème détaillé

### 2.1 Déroulé (30 min)

- **15 min — Présentation de l'audit.** Chaque choix est expliqué à la lumière des concepts du cours **et** de l'état réel de la codebase.
- **15 min — AI-assisted live coding.** Une nouvelle fonctionnalité (inconnue à l'avance) est codée en direct en suivant les guidelines du cours. On détaille au maximum les prompts. Si le temps le permet, les profs testent en live que la fonctionnalité marche avec le reste de la codebase.

### 2.2 Barème

Les points ci-dessous sont ceux communiqués par le groupe. La slide 38 du cours n°3 donne /3 pour la présentation (total 20) ; le groupe indique 5. **À confirmer.**

| Critère | Points |
| --- | --- |
| Qualité de l'audit | 5 |
| Qualité de la présentation | 5 (slide : /3) |
| Qualité des réponses aux questions | 4 |
| Code en live (co-conception assistée par IA) | 3 |
| Qualité du code (respect des contraintes techniques) | 5 |

### 2.3 Grille détaillée (slide 38, cours n°3)

**Qualité de l'audit de code (/5)**

| Note | Attendu |
| --- | --- |
| 5 | Propositions techniques cohérentes avec les **évolutions métier futures** d'Expense.io. Hiérarchie des problématiques claire et réfléchie. **Rapports chiffrés.** |
| 3-4 | Propositions majoritairement cohérentes malgré certaines imprécisions. Quelques chiffres plus ou moins bien employés. |
| 1-2 | Bonnes pratiques génériques reprises **sans remise en contexte** du cas d'étude. |
| 0 | Contenu techniquement pauvre et hors sujet par rapport à Expense.io. |

**Qualité de la présentation (/3 selon la slide)**

| Note | Attendu |
| --- | --- |
| 3 | Visuels clairs et compréhensibles. Niveau de langage adapté à une **discussion avec un CTO**. **Positionnement d'architecte logiciel maîtrisé.** |
| 2 | Visuels autoportants. Positionnement légèrement trop (ou pas assez) technique / haut niveau. |
| 1 | Présentation décousue. Positionnement à revoir. |
| 0 | N'a pas compris l'exercice. |

**Qualité des réponses aux questions (/4)**

| Note | Attendu |
| --- | --- |
| 4 | Maîtrise les sujets **au-delà de ce qui est présenté**. Capable d'approfondir une notion non présentée pendant l'audit. |
| 3 | Répond aux questions posées dans le cadre de sa présentation. |
| 1-2 | Justifications incomplètes ou partiellement fausses. |
| 0 | Incapable de justifier les choix présentés. |

**Qualité de la phase de co-conception assistée par IA (/3)**

| Note | Attendu |
| --- | --- |
| 3 | L'output demandé fonctionne. La **décision d'architecture / d'intégration** est bonne. **L'outillage permet d'être serein.** |
| 2 | L'output fonctionne à peu près. La décision prise est critiquable. L'outillage pourrait être perfectionné. |
| 1 | L'intégration relève plus du vibe-coding que de la décision architecturale. Pas de harnais de validation. |
| 0 | N'a pas compris l'exercice. |

**Respect des contraintes techniques / qualité technique du projet (/5)**

| Note | Attendu |
| --- | --- |
| 5 | **100 % des tests E2E fonctionnent toujours.** L'outillage est qualitatif. Le code est propre, lisible et documenté **aussi bien pour l'humain que pour un LLM**. |
| 3-4 | Quelques tests échouent. Le code est visiblement plus clair qu'avant l'audit, mais certaines parties restent à revoir. |
| 1-2 | Plus de 50 % des tests échouent. Des choses ont été faites mais on ne sait pas vraiment quoi ; peu de choses sont documentées. |
| 0 | Le projet n'a pas été modifié, ou l'a été pour être encore moins performant. |

**Conséquences pour le travail de Claude Code :**

- Les profs ont probablement leurs propres tests E2E : **le comportement observable** (routes, méthodes, formats de réponse, pages, parcours) **doit être préservé**. Voir §9.
- Chaque décision doit être **justifiée et documentée** (ADR) pour pouvoir être défendue à l'oral.
- L'outillage (tests, CI, garde-fous d'architecture) fait partie de la note du live coding.
- L'audit doit être **chiffré** et **contextualisé** : jamais de bonne pratique générique sans lien avec le code d'Expense.io.

---

## 3. Règles métier (source de vérité)

**Rôles :** `employee`, `manager`, `hr_admin` (RH). Chaque utilisateur appartient à **une seule entreprise** (tenant).

**Parcours :** un employé soumet une note avec un reçu ; son manager l'approuve ou la rejette ; le RH tranche les notes des managers racine et rattache les employés à leur manager.

1. **Tout le monde peut créer une note de frais** (employé, manager, RH), avec un reçu.
2. **Un manager ne peut approuver ou rejeter que les notes de ses subordonnés directs** (`users.manager_id = manager.id`), dans la même entreprise.
3. **Les notes d'un manager racine** (manager au plus haut niveau, sans manager au-dessus) **sont tranchées par le RH** de son entreprise.
4. **Personne ne peut trancher sa propre note**, ni un manager ni un RH.
5. Une note ne se tranche **qu'une seule fois** : `pending` → `approved` ou `rejected`, état final.
6. Le RH rattache les employés à leur manager, **uniquement dans sa propre entreprise**, sans créer de cycle (A manage B et B manage A, ou toute boucle plus longue).
7. **Aucune donnée ne traverse les entreprises.** L'isolation multi-tenant est stricte ; une fuite entre deux clients est le pire incident possible pour un SaaS B2B (cf. cours n°2, « premier incident »).

**Cas à trancher, à documenter dans une ADR :**

- **Employé sans manager** (aujourd'hui, tout nouvel inscrit est dans ce cas) : par défaut, il est traité comme un manager racine et sa note est tranchée par un RH de l'entreprise.
- **Note d'un RH** : tranchée par un **autre** RH de la même entreprise. S'il n'y a qu'un seul RH, la note reste en attente. Signaler ce cas et ne pas inventer de règle sans l'écrire.
- **Rejet** : décider si un motif est obligatoire (recommandé pour l'audit trail).

**Où vivent ces règles :** à **un seul endroit**, une `ApprovalPolicy` du domaine, couverte par des tests unitaires (au moins un test par règle et par cas limite).

**Fonctionnalités initiales prévues par le « produit »** (cours n°2) : création d'un compte par entreprise, connexion à son espace, soumission d'une note, soumission du scan d'un reçu, consultation de l'historique, facturation de l'abonnement Expense.io. **Évolutions métier évoquées dans le cours**, à garder en tête pour que l'audit soit « cohérent avec les évolutions futures » : rôle finance qui clôture les notes, traitement et catégorisation des notes par IA, notifications asynchrones, clients internationaux (multi-région), facturation (Stripe).

---

## 4. Stack technique et cartographie

Expense.io est un **monolithe Next.js**.

| Couche | Technologie | Fichiers |
| --- | --- | --- |
| Front | React 19 (composants client), Tailwind 4 | `app/*/page.tsx`, `components/` |
| HTTP | Next.js 16 route handlers + server actions | 15 routes sous `app/api/`, `app/actions/auth.ts` |
| Auth | NextAuth v5, identifiants + JWT | `lib/auth.ts`, `proxy.ts` |
| Données | PostgreSQL 16 via `pg`, RLS, node-pg-migrate | `lib/db.ts`, 1 migration, 3 tables |
| Fichiers | S3 (LocalStack en local), URL pré-signées | `lib/storage.ts` |
| OCR | Tesseract.js, modèle français embarqué | `lib/ocr.ts`, `tessdata/` |

- Taille : environ 50 fichiers source, une seule migration (`migrations/1700000000001_init-schema.sql`), 3 tables.
- Lancement local : `make dev` monte Postgres et S3 local (LocalStack), migre, crée le bucket et peuple 3 comptes de démo (`scripts/seed.mjs`, idempotent).
- TypeScript est en mode `strict` : ne jamais l'assouplir, pas de `any` ni de `@ts-ignore` sans justification écrite.
- Nom de paquet actuel : `expense-io-version-b`.
- Dossiers `domain/`, `ports/`, `adapters/`, `utils/` présents mais **importés par aucun fichier** (hexagone de façade).

**Topologie actuelle :** toutes les flèches partent de la couche HTTP (routes), qui parle directement à Postgres et à S3. Aucune couche application ne s'intercale, et le bloc qui devrait porter les règles métier (`domain/`) n'est relié à rien.

---

## 5. Consignes pour le second audit (par Claude Code)

Un premier audit existe (§6, également à placer dans `docs/audit/audit-v1.md`). **On refait l'audit une seconde fois, avec Claude Code, dans le repo.**

1. **Lire tout le code**, ligne à ligne : `src/`, migrations, scripts, `docker-compose.yml`, `Makefile`, configuration, `README.md`, `package.json`.
2. Faire l'audit **indépendamment** : ne pas recopier la v1.
3. **Vérifier chaque constat de la v1** contre le code (`fichier:ligne`) et le marquer **confirmé**, **infirmé** ou **nuancé**.
4. Chercher ce que la v1 a **manqué**.
5. **Tout chiffrer** : nombre de routes, de duplications, de lignes, de fichiers touchés, de requêtes hors `withUserScope`, de `eslint-disable`, etc.
6. Classer chaque constat par **axe** (sécurité / architecture / données / exploitation-tests) et par **gravité** :
   - **Critique** : faille exploitable ou perte de données, à corriger avant tout le reste.
   - **Majeur** : bloque l'évolution ou la fiabilité du produit.
   - **Mineur** : dette de confort, à traiter au fil de la refacto.
7. Pour chaque constat, donner l'**impact métier** (pourquoi un CTO devrait s'en soucier).
8. Relier chaque constat à une **recommandation** et chaque recommandation aux **concepts du cours** (annexes A à C).
9. Quand c'est possible, **prouver une faille par un test** qui échoue avant le correctif et passe après.
10. Écrire le résultat dans `docs/audit/audit-v2.md`, avec une section **« Écarts avec la v1 »**.
11. **Pendant l'audit, ne pas modifier le code applicatif.**

Structure attendue de `audit-v2.md` : synthèse ; périmètre et méthode ; cartographie ; ce qui va bien ; ce qui ne va pas (tableaux par axe) ; recommandations (quoi / pourquoi / couvre) ; plan de refacto priorisé ; écarts avec la v1 ; questions ouvertes.

---

## 6. Audit v1 — transcription intégrale

*Audit du 5 octobre 2026, par @Timoldo.*

### 6.1 Synthèse

Expense.io fonctionne, mais son architecture n'existe que sur le papier. Toute la logique métier vit dans 15 route handlers Next.js qui parlent directement à Postgres et S3, tandis que les dossiers `domain/`, `ports/`, `adapters/` et `utils/` ne sont importés par aucun fichier.

Le code est petit (environ 50 fichiers source, une seule migration) et lisible, ce qui rend la refacto réaliste. Mais l'audit relève **5 failles de sécurité bloquantes**, dont une injection SQL. L'isolation multi-entreprise ne tient pas non plus : l'application se connecte à Postgres en superutilisateur et contourne donc toutes les policies RLS.

Les trois chantiers prioritaires :

1. **Corriger les failles critiques** : injection SQL sur `sort`, IDOR sur les reçus côté manager, secret JWT en dur, fuite des stack traces, rattachement de manager inter-entreprises.
2. **Passer en architecture hexagonale réelle** : extraire les cas d'usage (soumettre, approuver, rejeter, assigner un manager) dans une couche application qui utilise le domaine et des ports, et réduire les routes à de simples adaptateurs HTTP.
3. **Rendre l'asynchrone explicite** : la notification de décision n'est jamais envoyée et l'OCR bloque la requête HTTP. Un événement de domaine `ExpenseNoteDecided` et une file de traitement unifient ces échanges.

Aucun test automatisé n'existe : la refacto doit commencer par poser un filet de tests sur les cas d'usage.

### 6.2 Périmètre et méthode

L'audit porte sur le dépôt `expense-io` (commit initial `265924b`), identique à ce jour à `8xcellence-expense-io`. Tout le code a été lu ligne à ligne : `src/`, la migration SQL, les scripts, `docker-compose.yml`, le `Makefile` et la configuration.

Chaque constat est classé selon quatre axes (sécurité, architecture, qualité du code, exploitation et tests) et trois niveaux de gravité (critique, majeur, mineur, définis au §5).

Les références `fichier:ligne` renvoient au dépôt d'origine. L'application n'a pas été exécutée : les failles sont déduites de la lecture du code et devront être démontrées par un test lors de la refacto.

### 6.3 Ce qui va bien

Le socle technique est sain et moderne ; ce sont les choix de structure, pas les outils, qui posent problème.

| Point fort | Où | Pourquoi c'est bien |
| --- | --- | --- |
| Stack à jour et typée | `package.json`, `tsconfig.json` | Next.js 16, React 19, TypeScript en mode `strict` : bonne base pour refactorer sans régression de types. |
| Onboarding en une commande | `Makefile`, `docker-compose.yml`, `scripts/seed.mjs` | `make dev` monte Postgres et S3 local, migre, crée le bucket et peuple 3 comptes de démo ; le seed est idempotent. |
| Requêtes paramétrées | toutes les routes sauf une | Les valeurs passent par `$1, $2…`, ce qui ferme l'injection SQL, à une exception près (S1). |
| Mots de passe hachés | `actions/auth.ts:65` | bcrypt avec un coût de 12 ; messages d'erreur de login génériques (pas d'énumération de comptes). |
| Reçus privés | `lib/storage.ts:35` | Le bucket n'est pas public : les reçus sont servis par URL pré-signée valable 5 minutes. |
| Contraintes en base | `migrations/…init-schema.sql` | `CHECK` sur `role` et `status`, clés étrangères, montant en `numeric(10,2)` et non en flottant. |
| Intention de défense en profondeur | migration, `lib/db.ts:28` | Les policies RLS et `withUserScope` visent à isoler les données au niveau de Postgres : bonne idée, mal branchée (S2). |
| Amorce de domaine et de ports | `domain/`, `ports/`, `adapters/` | `ExpenseNote` porte déjà la règle « une note ne se tranche qu'une fois » et est immuable ; les ports S3 et notification existent. C'est le point de départ naturel de la refacto. |
| Validation des uploads | `api/expense-notes/route.ts:81` | Liste blanche de types MIME et taille max de 10 Mo à la création d'une note. |
| Front simple | `app/`, `components/` | Pas de librairie d'état superflue, Tailwind, mode sombre, états de chargement et d'erreur gérés. |

### 6.4 Ce qui ne va pas

**21 constats : 5 critiques, 11 majeurs, 5 mineurs.** Les failles critiques sont toutes dans la couche sécurité ; les majeurs viennent presque tous d'une même cause, l'absence de couche application entre HTTP et la base.

#### Sécurité

| ID | Constat | Où | Gravité | Impact |
| --- | --- | --- | --- | --- |
| S1 | **Injection SQL** : le paramètre `sort` est concaténé tel quel dans `ORDER BY ${sort}`. Le commentaire justifie ce choix au lieu d'utiliser une liste blanche. | `api/expense-notes/route.ts:42-46` | Critique | N'importe quel utilisateur connecté peut lire toute la base (hash de mots de passe, notes des autres entreprises). Comme la connexion est superutilisateur (S2), la portée va jusqu'au serveur. |
| S2 | **RLS inopérante** : l'app se connecte avec `POSTGRES_USER=expense`, que l'image Docker crée superutilisateur. Un superutilisateur ignore la RLS, même avec `FORCE`. Plusieurs requêtes passent en plus par `getPool()` hors `withUserScope`, et les policies ne filtrent jamais par entreprise. | `docker-compose.yml:6`, migration, `lib/db.ts` | Critique | L'isolation entre utilisateurs et entre entreprises, présentée comme « garantie par PostgreSQL », ne repose en réalité que sur les `WHERE` écrits à la main dans chaque route. |
| S3 | **IDOR sur les reçus manager** : la route lit `receipt_key` par le seul `id`, sans vérifier que la note appartient à un subordonné (commentaire : « pas besoin de revérifier »). | `api/manager/expense-notes/[id]/receipt-url/route.ts:14-17` | Critique | Tout manager peut obtenir le reçu de n'importe quelle note de n'importe quelle entreprise à partir de son UUID. |
| S4 | **Secret JWT en dur et versionné** ; l'`AUTH_SECRET` du `.env` est ignoré. Le rôle est lu depuis le JWT sans revérification en base. | `lib/auth.ts:8-11` | Critique | Quiconque lit le dépôt peut forger une session `hr_admin` ou `manager` pour n'importe quel utilisateur. |
| S5 | **Rattachement de manager inter-entreprises** : le `managerId` choisi n'est pas filtré sur l'entreprise (le commentaire suppose que l'UI le garantit). Aucun contrôle de cycle (A manage B, B manage A). | `api/hr/users/[id]/manager/route.ts:35-45` | Critique | Un RH peut rattacher ses employés à un manager d'une autre entreprise, qui verra et validera leurs notes ; deux managers peuvent s'approuver mutuellement. |
| S6 | **Fuite d'erreurs internes** : toute exception renvoie `message` et `stack` au client en HTTP 500. | `lib/errors.ts:1-6` | Majeur | Expose le SQL, les chemins et les versions ; facilite l'exploitation de S1 (injection par message d'erreur). |
| S7 | **Entreprise déduite du domaine email**, sans vérification d'adresse : le premier compte `@gmail.com` devient RH de l'entreprise « gmail », tous les suivants y entrent comme employés. | `app/actions/auth.ts:41-63` | Majeur | Prise de contrôle d'une entreprise par simple inscription ; mélange d'inconnus dans le même tenant. |
| S8 | **OCR sans garde-fou** : aucune limite de taille, un worker Tesseract créé par requête et exécuté de façon synchrone (le commentaire le reconnaît). | `lib/ocr.ts:106-121`, `api/expense-notes/receipt-suggestion` | Majeur | Quelques uploads volumineux suffisent à saturer le CPU du serveur (déni de service). |
| S9 | Hygiène : type MIME lu depuis le client sans vérifier les octets du fichier, `expenseDate` non validée, email non normalisé en minuscules, pas de limitation de débit sur login et signup, clés de reçu prévisibles `receipts/{seq}`. | routes, `lib/storage.ts:25` | Mineur | Surface d'attaque élargie, doublons de comptes, données invalides en base. |

#### Architecture

| ID | Constat | Où | Gravité | Impact |
| --- | --- | --- | --- | --- |
| A1 | **Hexagone de façade** : `domain/`, `ports/`, `adapters/` et `utils/` ne sont importés nulle part. `ExpenseNote.approve()` n'est jamais appelé ; sa règle est réécrite en SQL dans 4 routes. | `src/domain`, `src/ports`, `src/adapters` | Majeur | Le domaine trompe le lecteur : on croit la règle centralisée alors qu'elle est dupliquée et peut diverger. |
| A2 | **Contrôleurs obèses (Transaction Script)** : chaque route enchaîne authentification, autorisation, validation, SQL, S3 et mapping JSON. Ni couche application, ni repository. | `src/app/api/**` (15 routes) | Majeur | Logique métier couplée à Next.js et à `pg` ; impossible à tester sans base ; tout changement de règle touche plusieurs fichiers. |
| A3 | **Duplication massive** : approve/reject × manager/RH = 4 fichiers quasi identiques ; mapping `toExpenseNote` copié 3 fois et inliné 4 fois ; configuration S3 écrite 3 fois (et `ensure-bucket` ignore `S3_FORCE_PATH_STYLE`) ; type des rôles déclaré 5 fois ; regex email 2 fois. | routes, `scripts/`, `types/` | Majeur | Chaque correctif doit être répliqué à la main ; S3 en est la preuve (le contrôle existe pour le RH, pas pour le manager). |
| A4 | **Workflow d'approbation implicite et incomplet** : la règle « qui valide qui » est éparpillée entre des `WHERE` et des policies. Les notes d'un RH ou d'un employé sans manager (cas de tout inscrit) restent en attente pour toujours. Lecture puis écriture sans verrou : deux décisions concurrentes passent toutes les deux. | routes approve/reject, `actions/auth.ts:66` | Majeur | Notes bloquées sans issue, décision écrasée, aucune trace de qui a décidé ni quand. |
| A5 | **Aucun échange asynchrone** : `NotificationPort` n'est jamais appelé, l'employé n'est jamais prévenu d'une décision. L'OCR, traitement lourd, tourne dans la requête HTTP. | `ports/NotificationPort.ts`, `lib/ocr.ts` | Majeur | Fonctionnalité attendue absente ; temps de réponse imprévisibles ; pas de point d'extension pour l'email, la comptabilité ou l'audit. |
| A6 | **Création de note non atomique** : INSERT dans une transaction, puis upload S3, puis UPDATE via `getPool()` hors transaction. Le nommage par `receipt_seq` impose ces deux écritures. | `api/expense-notes/route.ts:88-106` | Majeur | Si S3 échoue, une note avec `receipt_key = ''` reste en base, visible et validable sans justificatif. |
| A7 | **Contrat HTTP incohérent** : un mauvais rôle donne 401 côté manager, 403 côté RH ; la même ressource est exposée sous 3 préfixes (`/expense-notes`, `/manager`, `/hr`) ; `receiptKey` (détail de stockage) est renvoyé au client ; pas de schéma de validation. | `src/app/api/**` | Mineur | API difficile à consommer et à faire évoluer ; fuite de détails d'implémentation. |
| A8 | **Front couplé à l'API brute** : `fetch` dans `useEffect` avec la règle ESLint désactivée 3 fois, type `ExpenseNote` redéclaré dans 3 composants, `AdminConsole` de 269 lignes mêlant deux fonctionnalités, `utils/format.ts` ignoré au profit de formatters recopiés. Le manager voit un UUID tronqué au lieu du nom de l'employé. | `app/expenses/page.tsx`, `components/*` | Mineur | Duplication côté client, UX dégradée, pas de partage de types avec le back. |

#### Données

| ID | Constat | Où | Gravité | Impact |
| --- | --- | --- | --- | --- |
| D1 | Schéma pauvre pour le métier : pas de `company_id` sur `expense_notes` (le tenant se déduit par jointure), pas de `decided_by` / `decided_at` / `updated_at`, pas de devise, aucun index sur `users.manager_id` ni sur `expense_notes(user_id, status)`. | `migrations/1700000000001_init-schema.sql` | Majeur | Pas d'historique d'audit (indispensable pour des frais remboursés), requêtes qui ralentiront avec le volume, isolation plus fragile. |
| D2 | Inscription non transactionnelle : test d'existence puis INSERT sans transaction ; la contrainte `UNIQUE` remonte en erreur 500 avec stack. `receipt_seq` séquentiel révèle le volume de notes. | `actions/auth.ts:36-69`, migration | Mineur | Comptes ou entreprises incohérents sous concurrence ; fuite d'information métier. |

#### Exploitation et tests

| ID | Constat | Où | Gravité | Impact |
| --- | --- | --- | --- | --- |
| O1 | **Zéro test** et aucune CI : pas de script `test`, pas de framework installé. | `package.json` | Majeur | Aucune refacto ne peut être faite sereinement ; les failles ci-dessus n'auraient jamais passé un test d'autorisation. |
| O2 | Logs via `console` uniquement, sans corrélation ; le README annonce `AUTH_SECRET` via `.env` alors que le code l'ignore ; nom de paquet `expense-io-version-b`. | `lib/*`, `README.md`, `package.json` | Mineur | Diagnostic difficile en production ; documentation trompeuse. |

---

## 7. Recommandations de l'audit v1 (R1 à R9)

La cible est une **architecture hexagonale (ports & adapters) pour le contexte « notes de frais »**, avec une seule règle : **les dépendances pointent vers le domaine**. Next.js, Postgres, S3 et Tesseract deviennent des adaptateurs interchangeables ; les règles métier vivent à un seul endroit et se testent sans infrastructure. On garde Next.js : le choix est structurel, pas technologique.

### Arborescence cible

```
src/
  domain/              entités et règles pures, sans import externe
    ExpenseNote.ts       approve/reject, état, événements émis
    User.ts              rôle, rattachement, entreprise
    ApprovalPolicy.ts    qui peut trancher quelle note (règles du §3)
    Money.ts, ExpenseDate.ts, ReceiptKey.ts   value objects
    events.ts            ExpenseNoteSubmitted, ExpenseNoteDecided
    errors.ts            NotFound, Forbidden, AlreadyDecided, InvalidInput
  application/         cas d'usage, un fichier = une intention
    SubmitExpenseNote.ts, DecideExpenseNote.ts, ListPendingApprovals.ts
    GetReceiptUrl.ts, AssignManager.ts, SuggestFromReceipt.ts
    ports/             ExpenseNoteRepository, UserRepository, ReceiptStorage,
                       OcrService, EventPublisher, UnitOfWork
  infrastructure/      adaptateurs secondaires (le SQL ne vit QUE ici)
    postgres/            repositories + outbox, connexion non superutilisateur
    s3/  ocr/  notifications/
    in-memory/           adaptateurs de test
  interface/http/      adaptateurs primaires : schémas zod, mappers DTO, gestion d'erreurs
  app/                 routes Next.js réduites à 3 lignes : parser, appeler le cas d'usage, répondre
  composition.ts       racine de composition : câble ports et adaptateurs
```

### R1 — Colmater les failles avant de refactorer

**Quoi.**
- Liste blanche pour `sort` (`{ date_desc: 'created_at DESC', … }`).
- Rôle Postgres applicatif `NOSUPERUSER NOBYPASSRLS`, distinct du propriétaire qui lance les migrations.
- Toutes les requêtes passent par `withUserScope`, et les policies filtrent par entreprise.
- `AUTH_SECRET` lu depuis l'environnement, démarrage refusé s'il manque, secret actuel révoqué.
- Gestionnaire d'erreurs qui renvoie un message générique et journalise la stack côté serveur.
- Manager vérifié dans la même entreprise, cycles refusés.

**Pourquoi.** Ces failles sont exploitables aujourd'hui par n'importe quel utilisateur inscrit. Les corriger d'abord, chacune avec un test de non-régression, donne le filet de sécurité sur lequel la refacto s'appuiera. La RLS devient une vraie défense en profondeur : même un `WHERE` oublié ne fuit plus.

**Couvre** S1 à S6.

### R2 — Architecture hexagonale réelle

**Quoi.** Brancher le domaine existant au lieu de le contourner. Chaque route appelle un cas d'usage, qui charge les entités via un repository, applique la règle du domaine, persiste et publie un événement. Les routes ne contiennent plus de SQL ; le SQL ne vit que dans `infrastructure/postgres`.

**Pourquoi.** C'est la cause racine de A1 à A3 : sans couche application, chaque route réinvente la règle, et les divergences produisent des failles (S3). L'hexagone donne un seul endroit par règle, des tests unitaires sans base grâce aux adaptateurs en mémoire, et un couplage au framework limité aux adaptateurs primaires.

**Couvre** A1, A2, A3.

### R3 — Unifier le workflow d'approbation

**Quoi.**
- Un seul cas d'usage `DecideExpenseNote(noteId, decision, actor)` et une seule route `POST /api/expense-notes/{id}/decision`, au lieu de 4 fichiers.
- Une `ApprovalPolicy` du domaine décide qui tranche : le manager direct ; à défaut (manager racine, employé sans manager, RH), un RH de la même entreprise ; jamais soi-même.
- Mise à jour conditionnelle `WHERE status = 'pending'` pour bloquer la double décision.
- Enregistrement de `decided_by` et `decided_at`.
- Même principe pour une route unique de reçu.

**Attention (§9) :** les anciennes routes restent en place comme adaptateurs fins vers le même cas d'usage, pour ne pas casser les tests E2E.

**Pourquoi.** La règle « qui valide qui » est le cœur métier de l'application ; elle doit être lisible en un fichier et testée cas par cas. La politique explicite supprime les notes bloquées sans issue, et la mise à jour conditionnelle rend la décision atomique sans verrou applicatif.

**Couvre** A4, A7, S3.

### R4 — Un seul protocole asynchrone : événements + outbox

**Quoi.**
- Le domaine émet `ExpenseNoteSubmitted` et `ExpenseNoteDecided`.
- Le cas d'usage les écrit dans une table `outbox`, dans la même transaction que la note.
- Un worker unique (par exemple pg-boss, adossé au Postgres existant) les distribue aux consommateurs : notification de l'employé via `NotificationPort`, et plus tard comptabilité ou audit.
- L'OCR devient un job de la même file, avec taille maximale et concurrence bornée.

**Pourquoi.** Aujourd'hui, aucun échange asynchrone n'existe : la notification est absente et l'OCR bloque le serveur. Le pattern outbox garantit qu'aucun événement n'est perdu ni publié pour une transaction annulée. Réutiliser Postgres comme file évite d'ajouter Kafka ou RabbitMQ, disproportionnés pour cette taille, tout en gardant un contrat unique pour tout l'asynchrone.

**Couvre** A5, S8.

### R5 — Soumission atomique d'une note

**Quoi.**
- Générer une clé de reçu opaque (UUID) avant tout, uploader le fichier, puis insérer la note en une seule écriture.
- Si l'insertion échoue, supprimer l'objet orphelin (compensation).
- Supprimer `receipt_seq`.
- Vérifier le type réel du fichier par ses premiers octets (magic bytes).

**Pourquoi.** Une note ne doit jamais exister sans justificatif. Une clé non devinable et l'ordre « fichier d'abord, base ensuite » rendent l'opération sûre sans transaction distribuée.

**Couvre** A6, S9, D2.

### R6 — Faire évoluer le schéma

**Quoi.** Nouvelle migration : `company_id` sur `expense_notes` ; `decided_by`, `decided_at`, `updated_at`, `currency` ; email en `citext` ; index sur `users(manager_id)` et `expense_notes(user_id, status)` ; policies réécrites avec le filtre entreprise.

**Pourquoi.** Des frais remboursés exigent une piste d'audit ; le `company_id` direct rend l'isolation simple à exprimer et à vérifier ; les index préparent la montée en charge.

**Couvre** D1, D2, S2.

### R7 — Contrat HTTP et front

**Quoi.**
- Côté API : schémas zod en entrée, mapper DTO unique, codes cohérents (401 non connecté, 403 interdit, 404, 409 déjà tranchée, 422 invalide), plus de `receiptKey` exposé.
- Côté client : types DTO partagés, un petit client d'API, `AdminConsole` découpé, `utils/format.ts` réutilisé, nom de l'employé affiché.

**Pourquoi.** Un contrat stable et typé des deux côtés supprime la duplication front et rend les erreurs exploitables par l'UI.

**Couvre** A7, A8.

### R8 — Tests et CI

**Quoi.**
- Vitest.
- Tests unitaires du domaine et des cas d'usage avec adaptateurs en mémoire.
- Tests d'intégration des repositories et des policies RLS contre un Postgres Docker.
- Un test d'autorisation par faille S1 à S5.
- GitHub Actions : lint, typecheck et tests à chaque push.

**Pourquoi.** Sans filet, chaque étape de refacto risque une régression silencieuse. L'hexagone rend justement ces tests rapides à écrire.

**Couvre** O1, O2.

### R9 — Décision produit à trancher : l'onboarding

Le rattachement automatique par domaine email (S7) relève d'un choix produit.
- **Option minimale** : refuser les domaines publics (gmail, outlook…) et exiger une vérification d'email.
- **Option complète** : l'entreprise est créée par un RH, puis les employés sont invités.

À valider avec l'équipe avant la refacto de `signup`.

---

## 8. Plan de refacto priorisé

Six étapes, chacune livrable seule et couverte par des tests. L'ordre suit le risque (sécurité d'abord), puis les dépendances (le domaine avant ce qui s'appuie dessus).

| Étape | Contenu | Recos | Prérequis | Critère de fin |
| --- | --- | --- | --- | --- |
| 1. Filet de sécurité | Vitest + CI ; tests d'autorisation qui démontrent S1 à S5, puis correctifs ciblés ; rôle Postgres non superutilisateur ; secret via `.env` ; gestionnaire d'erreurs | R1, R8 | aucun | Les 5 tests de faille passent ; CI verte |
| 2. Noyau hexagonal | Domaine enrichi (value objects, `ApprovalPolicy`, erreurs), ports, repositories Postgres, racine de composition ; migration d'une première route pilote (`GET /api/expense-notes`) | R2 | 1 | Cas d'usage testés avec adaptateurs en mémoire ; plus de SQL dans la route pilote |
| 3. Workflow d'approbation | `DecideExpenseNote` + route unique de décision et de reçu ; les 4 routes approve/reject et les 3 routes receipt-url deviennent des adaptateurs fins (conservées pour les E2E) | R3 | 2 | Une seule implémentation de la règle ; double décision refusée en 409 |
| 4. Schéma et soumission | Migration (`company_id`, audit, index, `citext`) ; `SubmitExpenseNote` atomique avec clé UUID | R5, R6 | 2 | Aucune note sans reçu possible ; policies RLS testées par entreprise |
| 5. Asynchrone unifié | Événements de domaine, table `outbox`, worker unique ; notification de décision ; OCR en job | R4 | 3, 4 | L'employé est notifié ; l'OCR ne bloque plus la requête |
| 6. Contrat et front | Schémas zod, DTO partagés, codes HTTP cohérents, client d'API, découpage d'`AdminConsole` ; onboarding selon la décision R9 | R7, R9 | 3 | Aucun type dupliqué front/back ; plus de `eslint-disable` |

---

## 9. Contraintes non négociables pendant la refacto

1. **Ne pas casser le comportement observable.** URLs, méthodes, formats de réponse, pages et parcours UI existants doivent continuer de marcher (« 100 % des tests E2E fonctionnent toujours »). Si on unifie des routes, les anciennes restent comme **adaptateurs fins** appelant le même cas d'usage ; on les marque dépréciées (en-têtes `Deprecation` / `Sunset`, cf. cours n°3), on ne les supprime pas.
   - **Exception :** un comportement qui est lui-même une faille (ex. renvoyer la stack, accepter un `sort` arbitraire, servir un reçu d'une autre entreprise) est corrigé, et le changement est documenté.
   - Avant de modifier un format de réponse, vérifier si l'UI ou un test en dépend. Rendre un champ obligatoire ou renommer une valeur d'enum est un **changement MAJOR** (semver).
2. **Sécurité d'abord** : S1 à S5 sont corrigés avant toute refacto structurelle, chacun avec un test de non-régression.
3. **Tests avant refacto** : poser un filet de tests (Vitest) sur le comportement actuel, puis refactorer.
4. **Petits pas** : une étape = un commit cohérent, avec tests, `lint` et `typecheck` verts.
5. **Pas de secret dans le code** : tout passe par l'environnement, et `.env.example` est tenu à jour.
6. **Chaque décision structurante** fait l'objet d'une ADR dans `docs/adr/NNNN-titre.md` (contexte, décision, alternatives écartées, conséquences, trade-offs). Les ADR servent de support pour la soutenance.
7. **KISS** : pas d'abstraction sans besoin réel, pas de Kafka ni de microservices pour une app de cette taille. « L'absence d'architecture spécifique doit toujours être un choix » (cours n°2), et un choix justifié.
8. **Ne jamais affaiblir** TypeScript strict, les contraintes SQL existantes, ni le hachage bcrypt.

---

## 10. Conventions d'API à appliquer

D'après le cours n°3 (annexe C) :

- **Contract first** : une spec OpenAPI dans `docs/api/openapi.yaml`, source de vérité, mise à jour **avant** chaque changement de route. Générer les types quand c'est pertinent.
- **Versionnement** semver du contrat ; tout breaking change est rare, annoncé (changelog, en-tête `Sunset`, période de transition) et vérifié automatiquement (oasdiff en CI si possible).
- **Anatomie d'une requête** : ce qui *identifie* va dans le path, ce qui *filtre / trie / pagine* dans la query, ce qui *décrit* la requête (auth, format, traçabilité) dans les headers, la *donnée métier* dans le body (jamais dans un GET).
- **Codes de succès** : 200 lecture avec body ; 201 création + header `Location` ; 202 traitement asynchrone accepté + lien de suivi ; 204 succès sans body.
- **Codes d'erreur** : 400 requête illisible ; 401 non authentifié ; 403 authentifié mais interdit ; 404 introuvable ; 409 conflit avec l'état (note déjà tranchée) ; 422 syntaxe valide mais règle métier violée ; 429 rate limit ; 500 bug ; 503 indisponible. **Jamais de 200 avec une erreur dans le body.**
- **Erreurs au format RFC 9457** :
  - `Content-Type: application/problem+json` ;
  - `type` : URI stable, **le champ sur lequel le client réagit automatiquement** ;
  - `title` : résumé lisible, stable pour un `type` donné ;
  - `status` : **entier**, identique au code HTTP ;
  - `detail` : explication propre à cette occurrence ;
  - `instance` : URI de l'occurrence ;
  - erreurs de validation multiples : **un seul** problem avec une extension `errors: [{ pointer: "#/champ", detail: "…" }]`.
  - **Jamais de stack trace côté client** : elle est journalisée côté serveur avec un id de corrélation.
- **Idempotence** : une décision rejouée ne produit pas de double effet (mise à jour conditionnelle `WHERE status = 'pending'`, 409 au second appel). Pour la création de note (POST non idempotent), accepter un header `Idempotency-Key` dédupliqué côté serveur. C'est d'autant plus critique qu'un agent IA peut rejouer un appel sans jugement humain.
- **Ne pas exposer de détails d'implémentation** (ex. `receiptKey`, chemins S3).
- **Choix de style** : REST pour les ressources (`GET /api/expense-notes`, `GET /api/expense-notes/{id}`). L'action métier non-CRUD « trancher une note » peut être modélisée en sous-ressource `POST /api/expense-notes/{id}/decision` (style POST Action localisé). Justifier ce choix dans une ADR, en citant « Pas de meilleur style » (annexe C).
- **Sécurité** : session NextAuth (JWT), secret depuis l'env, **rôle et rattachement revérifiés en base** pour les actions sensibles (le JWT est difficile à révoquer avant expiration). Rate limiting sur login et signup (429).

---

## 11. Asynchrone : règles à appliquer

D'après le cours n°2, partie (3), et le cours n°3 :

- **Questionner son utilité d'abord** : l'asynchrone est par nature plus complexe. Ici, il est justifié pour la notification (fonctionnalité absente) et pour l'OCR (traitement lourd qui bloque la requête, cf. « la résilience du système est celle de son maillon le plus lent »).
- **Événements de domaine** : `ExpenseNoteSubmitted`, `ExpenseNoteDecided`, avec un **contrat versionné** (le contrat d'un message ne change pas sans implications lourdes pour les consommateurs).
- **Pattern outbox** : l'événement est écrit dans la table `outbox` dans la même transaction que l'état métier ; un worker unique le publie et le distribue.
- **File adossée à Postgres** (ex. pg-boss), pas de broker supplémentaire. Justifier dans une ADR (Kafka et RabbitMQ disproportionnés à cette échelle).
- **Consommateurs idempotents** : un worker peut crasher et un événement être rejoué ; pas de doublon, pas de double notification.
- **Ack** : un message non acquitté est redistribué.
- **DLQ** (Dead Letter Queue) après N échecs, pour traitement manuel (ex. une image qui n'est pas un ticket de caisse).
- **Traçabilité** : id de corrélation propagé de la requête HTTP jusqu'au worker, présent dans tous les logs.
- **API asynchrone pour l'OCR** : `POST` → **202 Accepted** avec un identifiant et un lien de suivi, puis **polling** (`GET` jusqu'à un état final). Le webhook est plutôt réservé aux intégrations tierces. Distinguer l'erreur d'acceptation de la requête de l'erreur du traitement asynchrone.
- **Coordination** : préférer la **chorégraphie** (chaque consommateur réagit à l'événement) tant qu'il n'y a pas de workflow multi-étapes nécessitant un orchestrateur.

---

## 12. Tests, outillage, garde-fous

- **Vitest**, en trois niveaux :
  - **unitaires** : domaine et cas d'usage avec adaptateurs en mémoire (rapides, sans Docker) ;
  - **intégration** : repositories, outbox et **policies RLS** contre un vrai Postgres (Docker), dont un test d'isolation entre deux entreprises exécuté avec le rôle applicatif non superutilisateur ;
  - **autorisation / sécurité** : un test par faille S1 à S5, et un test par règle métier du §3 (manager → subordonné OK, manager → non-subordonné 403, manager racine → RH, auto-approbation interdite, double décision 409, rattachement inter-entreprise refusé, cycle refusé).
- **E2E** : si le temps le permet, quelques parcours Playwright (soumettre, approuver, rejeter, rattacher) pour vérifier qu'on n'a rien cassé.
- **Scripts** attendus dans `package.json` : `test`, `test:unit`, `test:integration`, `lint`, `typecheck`, et éventuellement `test:e2e`.
- **CI GitHub Actions** : lint, typecheck et tests à chaque push et PR.
- **Garde-fou d'architecture** : une règle automatique (dependency-cruiser, ou ESLint `no-restricted-imports` / `import/no-restricted-paths`) qui fait échouer la CI si `domain/` importe quoi que ce soit d'externe, ou si `application/` importe de l'infrastructure ou de Next.js.
- **Logs structurés** (ex. pino) avec id de corrélation, à la place de `console`.
- **Documentation** : README à jour (démarrage, variables d'env, scripts, architecture), `docs/adr/`, `docs/api/openapi.yaml`, `docs/audit/`, `docs/HOW_TO_ADD_A_FEATURE.md`.

---

## 13. Préparer le live coding

L'objectif : ajouter une fonctionnalité doit être **mécanique et sûr**, en 15 minutes, devant les profs, avec des prompts explicites. Maintenir `docs/HOW_TO_ADD_A_FEATURE.md` avec cette checklist :

1. Écrire la règle métier dans `domain/`, avec ses tests unitaires.
2. Créer le cas d'usage dans `application/`, avec ses tests sur adaptateurs en mémoire.
3. Ajouter ou étendre un port si besoin, puis son adaptateur réel (Postgres / S3 / notification) **et** son adaptateur en mémoire.
4. Si le schéma change, écrire une migration node-pg-migrate et mettre à jour les policies RLS.
5. Mettre à jour `docs/api/openapi.yaml` (contract first), puis ajouter la route (adaptateur fin) avec son schéma zod et ses erreurs RFC 9457.
6. Brancher dans `composition.ts`.
7. Ajouter l'UI si nécessaire, via le client d'API typé et les DTO partagés.
8. Lancer `lint`, `typecheck`, `test` ; écrire une ADR si la décision est structurante.

**Exemples de fonctionnalités probables** (pour s'entraîner) : rôle finance qui clôture une note approuvée ; catégorisation d'une note ; motif de rejet obligatoire ; plafond de montant par catégorie ; export CSV des notes approuvées ; délégation d'approbation pendant une absence ; notification par email ; historique des décisions ; devise et conversion ; pièce jointe multiple ; commentaire sur une note.

**Protocole pendant le live :**
1. Reformuler la fonctionnalité en règle métier et cas limites.
2. **Proposer un plan court** : fichiers touchés, règle du domaine, cas d'usage, contrat HTTP, migration éventuelle. Le faire valider.
3. Implémenter en TDD (test rouge → code → test vert).
4. Lancer toute la suite de tests et montrer la CI verte.

---

## 14. Façon de travailler (pour Claude Code)

- Avant une tâche non triviale, **présenter un plan** et attendre validation.
- Citer les références `fichier:ligne` dans les explications.
- **Ne jamais lancer d'opération destructive** (`DROP`, `git reset --hard`, `rm -rf`, force push, suppression de migrations existantes) sans accord explicite. Ne jamais modifier une migration déjà appliquée : en écrire une nouvelle.
- Si une règle métier est ambiguë ou en conflit avec ce fichier, **demander** plutôt que supposer.
- Commentaires, docs et ADR **en français** ; noms de code (variables, fonctions, fichiers, types) **en anglais**.
- Code lisible par un humain **et** par un LLM : noms explicites, fonctions courtes, une responsabilité par fichier, JSDoc sur chaque port et chaque cas d'usage (rôle, préconditions, erreurs possibles).
- Messages de commit clairs (type Conventional Commits : `fix(security): …`, `refactor(domain): …`, `test: …`, `docs(adr): …`).
- Après chaque étape du plan de refacto, mettre à jour : la checklist d'avancement (ci-dessous), le README si besoin, et les ADR.

### Avancement

- [x] Audit v2 rédigé (`docs/audit/audit-v2.md`)
- [x] Étape 1 — Filet de sécurité (tests, CI, SEC-01/02/04/05/07 ; l'isolation RLS est rattachée à l'étape « schéma et soumission », cf. audit v2 §7)
- [x] Étape 2 — Noyau hexagonal (route pilote `GET /api/expense-notes`, garde-fou ESLint ; `UnitOfWork`, `UserRepository` et `ReceiptKey` reportés aux étapes 3-4, cf. ADR 0002)
- [x] Étape 3 — Workflow d'approbation (`ApprovalPolicy`, `POST /api/expense-notes/{id}/decision`, anciennes routes gardées en adaptateurs dépréciés, cf. ADR 0003 et 0004)
- [x] Étape 4 — Schéma et soumission (rôle `expense_app` + RLS par entreprise, `company_id`/`currency`/`updated_at`/`citext`/index, `SubmitExpenseNote` atomique avec clé UUID et vérification des magic bytes, cf. ADR 0005 et 0006)
- [ ] Étape 5 — Asynchrone unifié
- [ ] Étape 6 — Contrat et front
- [ ] `HOW_TO_ADD_A_FEATURE.md` prêt pour le live coding

---

## 15. Annexe A — Cours n°1 « Terminologie et Responsabilités »

### A.1 Principes du cours

- Toute question mérite d'être posée ; les échanges nourrissent le contenu.
- **Il n'y a pas de vérité universelle en architecture**, seulement des solutions adaptées à des contraintes réelles.
- Citation fil rouge : « Mal nommer les choses, c'est ajouter au malheur du monde » (A. Camus).

### A.2 Définitions (contexte technique)

- **Logiciel** (Larousse) : ensemble des programmes, procédés et règles, et éventuellement de la documentation, relatifs au fonctionnement d'un ensemble de traitement de données.
- **Application** : unité logicielle **déployable**.
- **Service** : capacité fonctionnelle spécifique **exposée via une interface**.
- **Produit** : solution métier complète livrée à un client.

Ces mots changent de sens selon le contexte (technique, business, fonctionnel) ; dans le cours, on se place dans le contexte technique.

### A.3 Périmètre de l'architecte logiciel

Sur un axe Métier ↔ Technique :

| Rôle | Position | Sujets |
| --- | --- | --- |
| Architecte d'entreprise | côté métier | TOGAF, stratégie business, organisation |
| Architecte SI | intermédiaire | intégrations / flux, stratégie SI, principes directeurs |
| **Architecte logiciel** (« vous êtes ici ») | côté technique | choix tech / framework / outils, **design applicatif**, méthodologie de développement |
| Architecte plateforme | côté technique | cloud / infra, developer experience, haute disponibilité / sizing |

Vue BearingPoint (horizon de planification × profondeur technologique × largeur du périmètre) : Enterprise Architect « the Planner » (stratégique, large, peu profond) ; Domain Architect « the Owner » ; Solution Architect « the Coordinator » ; Technology Architect « the Designer » (opérationnel, étroit, très profond).

### A.4 Qui est responsable de l'architecture ?

Ça dépend surtout de la taille de l'entreprise :
- **Start-up** : aucun poste dédié ; le Tech Lead prend les décisions architecturales (c'est le cas d'Expense.io).
- **Scale-up** : quelques architectes logiciels dédiés, en petite équipe transverse ou rattachés à une équipe produit.
- **Grand groupe** : une armada d'architectes, une équipe par BU (et chaque décision prend une éternité).
- Ces profils sont souvent externalisés (indépendants, ESN).

En bref : aucune vérité générale, et un domaine souvent délaissé à tort.

### A.5 RACI

R = Responsable, A = Approbateur, C = Consulté, I = Informé.

| Activité | Software Engineer | Software Architect | Tech Lead / CTO |
| --- | --- | --- | --- |
| Analyser le besoin fonctionnel | R | C | I |
| Concevoir une fonctionnalité | R | I | C |
| Implémenter, tester et maintenir le code | R/A | I | C |
| Arbitrer les trade-offs technique/coût (complexité vs performance, build vs buy) | C | R/A | C |
| Concevoir l'architecture technique (composants, interfaces/API, patterns, technos) | R | A | C |
| Définir le découpage en services | C | R/A | I |
| Définir les interactions entre services | R | A | C |
| Valider la scalabilité et la résilience de la solution | C | A | R |
| Garantir perf, sécurité, dette technique et stratégie de déploiement | R | A | I |
| Arbitrer les choix techniques structurants (stack, priorisation dette vs feature) | C | C | R/A |
| Documenter et faire évoluer l'architecture (ADR) | R | A | C |

### A.6 Quotidien de l'architecte logiciel

**Décider → Concevoir → Standardiser → Accompagner.**

- **Concevoir et décider** : documenter les choix (ADR, HLD, LLD, DAT) ; étudier la faisabilité (PoC, prototypes, benchmarks) ; concevoir (composants, flux, interactions, résilience, scalabilité) ; arbitrer les compromis (coût, complexité, performance, sécurité, time-to-market).
- **Structurer le SI** : gérer les composants transverses (API Gateway, messaging, IAM, observabilité, cache…) ; définir les frontières (services, domaines, responsabilités, interfaces) ; faire évoluer l'urbanisation (intégration, dépendances, trajectoires de migration, DDD).
- **Définir et faire respecter les standards** : de développement (frameworks, TDD, patterns, conventions, BMAD), d'architecture (API, événements, synchronisation, résilience), de qualité (sécurité, observabilité, performance, CI/CD).
- **Accompagner les équipes** : challenger les conceptions, faire des revues d'architecture / design, partager la connaissance (ateliers, mentoring, tech talks), aligner les parties prenantes (métier, produit, sécurité, ops, développeurs).

### A.7 Livrables de l'architecture logicielle

| Livrable | Question | Niveau |
| --- | --- | --- |
| **ADR** — Architecture Decision Record | Pourquoi avons-nous fait ce choix ? | Décision |
| **HLD** — High-Level Design | Quelle architecture allons-nous construire ? | Système |
| **LLD** — Low-Level Design | Comment allons-nous la construire ? | Composant |
| **DAT** — Document d'Architecture Technique | Quelle est l'architecture technique globale ? | Projet |

Vue Microsoft Azure Architecture Guide : HLD (le « quoi et pourquoi » : diagramme conceptuel, décisions clés type microservices vs monolithe, stratégie HA/DR et sécurité, RTO/RPO) → LLD (le « comment » : specs détaillées des services, topologie réseau, IaC et plan de déploiement) → documentation technique vivante (ADR versionnées, runbooks, détection de drift).

**Pour le projet :** l'audit v2 joue le rôle d'un état des lieux et d'un HLD de la cible ; les ADR tracent les décisions ; `HOW_TO_ADD_A_FEATURE.md` sert de LLD opérationnel.

### A.8 Débat

« L'architecte logiciel est-il le dernier métier de production logicielle d'ici 2030 ? » Contexte : baisse des recrutements de développeurs juniors depuis fin 2022, montée des agents de code. Le cours y répond implicitement : l'IA rend le *build* moins cher, mais **les décisions, les trade-offs et la maintenance** restent humains.

---

## 16. Annexe B — Cours n°2 « Principes d'Architecture » (étude de cas Expense.io)

### B.1 Comment prendre une (bonne) décision d'architecture : les trade-offs

Triangle qualité / délais / coûts (scope au centre). Questions à se poser :
- **Deadline, time to market** : quelles échéances business ?
- **Coûts** : que peut-on se permettre de payer (infra, licences, équipe) ?
- **Maturité de l'équipe** : qui opère ce qu'on s'apprête à choisir ?
- **Souveraineté et conformité** : où vivent les données ? Quelles réglementations s'appliquent ?
- **Sécurité** : quel niveau de risque si ça tourne mal ?
- **Scalabilité** : 100 utilisateurs ou 10 millions ? Maintenant ou dans 2 ans ?

« All models are wrong, but some are useful » (George E. P. Box).

**Rappel gestion de projet :** projet prédictif = périmètre fixe, coûts et délais variables ; projet agile = coûts et délais fixes, périmètre variable.

### B.2 Build vs Buy

- Matrice priorité stratégique × urgence : **Build** (prioritaire, peu urgent : renforce une capacité interne stratégique) ; **Partner** (prioritaire et urgent) ; **Buy** (urgent, peu stratégique : capacité rapide) ; **De-prioritise**.
- Pyramide OCTO (Ludovic Cinquin, 2012) : **spécifique** (unique, différenciant, atout concurrentiel → build) ; **progiciel** (commun au secteur, atout de production) ; **BPO** (commun à toutes les entreprises, simple ressource → externaliser).
- **IA : le build est beaucoup plus abordable qu'avant, mais le maintenir coûte toujours aussi cher (for now).**

Application à Expense.io : l'auth (NextAuth), le stockage (S3), la facturation (Stripe) et l'OCR sont des commodités (buy / lib) ; le **workflow d'approbation** est le cœur différenciant (build, soigné, testé).

### B.3 L'histoire d'Expense.io, étape par étape

**(1) Fonctionnalités initiales et architecture de base.** Compte par entreprise, connexion, soumission d'une note et d'un reçu, historique, facturation de l'abonnement. Architecture : un **monolithe Next.js sur Vercel** qui appelle en HTTP Supabase (IAM DB + Expense DB, Postgres), AWS S3 (file storage) et Stripe (billing).

**(2) Premiers retours clients → ajout de rôles.** Les clients veulent un workflow de validation : l'employé soumet, son manager hiérarchique valide, la finance clôture. Manu l'ajoute « à la va-vite » : des vérifications `if (user.role === 'manager')` **copiées-collées dans chaque route**, et un **filtrage par client fait dans l'app** sur les requêtes Supabase.
→ **Premier incident** : un employé de l'entreprise A consulte, via une requête mal filtrée, des notes de l'entreprise B. **Fuite de données entre deux clients du même SaaS, le pire incident possible pour un produit B2B.**
→ Deux réponses possibles :
  - **Monolithe modulaire** : un seul déployable, mais des modules (Submission, Validation, Approval) qui passent par des **ports** vers un *Expense Service* et un *Permissions Service*, eux-mêmes reliés par ports aux bases.
  - **Microservices** : Presentation Service, Expense Service, Permission Service déployés séparément, chacun avec son API. Coût : **architecture distribuée, donc déploiements et monitoring plus complexes.**
→ Quel que soit le choix, une architecture durable **découple ses domaines fonctionnels** ; l'approche communément admise est le **Domain-Driven Design** (Eric Evans). Les implémentations plus précises viennent ensuite : Clean Architecture, hexagonale, ports/adapters.

**C'est exactement la situation du repo** : la vérification de rôle et le filtrage par tenant sont dupliqués dans les routes (A2, A3), et l'isolation ne tient pas (S2, S3, S5). La réponse adaptée à la taille d'Expense.io est un **monolithe modulaire hexagonal**, pas des microservices.

**(3) L'app se tourne vers l'IA.** La note est stockée, puis traitée et catégorisée via un appel à OpenAI ; un développeur à plein temps est recruté pour l'intégration et la refacto. Le flux est **séquentiel** : upload S3 → appel OpenAI → écriture en base → réponse.
→ **L'app devient lente** : réponses HTTP qui n'arrivent jamais (ambiguïté sur le traitement), timeouts côté front sur Vercel, explosion des retries sur la console OpenAI.
→ « **La résilience du système est celle de son maillon le plus lent.** »
→ Passage à l'**asynchrone** : le service stocke le reçu, publie « Reçu déposé » sur un **bus de messages**, répond tout de suite ; un **Worker Service** consomme le message, appelle OpenAI, écrit en base et notifie l'utilisateur (SMTP).

**Correspondance avec le repo** : l'OCR Tesseract synchrone dans la requête (S8, A5) reproduit ce problème ; la solution est la même (job asynchrone, 202 + polling, notification).

**(4) Solution internationale.** Premier client international ; l'app n'est déployée qu'en Europe, d'où de la latence pour les Américains. « Il suffit de répliquer la BDD sur plusieurs régions, non ? » Mais un manager international doit valider des notes d'une équipe répartie sur plusieurs continents, donc sur plusieurs bases.
→ **Théorème CAP** : un système de base de données distribué fournit au plus 2 des 3 garanties : **Consistency** (tous les nœuds voient la même donnée au même moment), **Availability** (toute requête reçoit une réponse), **Partition tolerance** (le système continue d'opérer malgré un incident entre nœuds). PostgreSQL et MySQL sont classés CA ; Redis et MongoDB, CP ; CouchDB et Cassandra, AP.

**Pour l'audit** : ajouter `company_id` et une devise prépare un futur partitionnement par tenant ou par région ; c'est un argument « cohérent avec les évolutions futures ».

**(5) Phase de run, début du legacy.** Un nouveau tech lead trouve une codebase aux pratiques multiples et décide d'imposer une architecture « type » dans une codebase template. Quel design choisir ?

### B.4 Clean Architecture vs Hexagonale

- **Clean Architecture** (Robert C. Martin) : cercles concentriques. Au centre, les **Entities** (règles métier de l'entreprise) ; puis les **Use Cases** (règles métier de l'application) ; puis les **Interface Adapters** (controllers, presenters, gateways) ; à l'extérieur, **Frameworks & Drivers** (web, UI, DB, devices, interfaces externes). Flux : Controller → Use Case Input Port → Use Case Interactor → Use Case Output Port → Presenter.
- **Architecture hexagonale** (ports / adapters) : le **domaine** au centre, entouré de **ports** ; des **adapters** primaires (REST controller, message queue adapter, GUI, web app) qui pilotent le domaine, et des adapters secondaires (Postgres, MongoDB, email, SMS) pilotés par lui.
- **Ce qu'il faut retenir :**
  - *Niveau de guidage* : l'hexagonale est moins guidée ; la Clean est **fortement** guidée (règles précises comme « un port = un fichier », « screaming architecture »).
  - *Terminologie* : server port vs gateway ; application vs entity ; adapter vs controller.
  - *Principes communs, l'essentiel* : **testabilité** du cœur métier (mock de l'infrastructure) ; **inversion des dépendances** (le métier ne dépend pas de la technique) ; **évolutivité** d'un composant indépendamment de son implémentation.
  - Référence : https://12factor.net/
- **En pratique** :
  - on retrouve souvent les idées mal implémentées : **« terminologie valide mais métier couplé à l'infrastructure »**, c'est exactement le cas d'Expense.io (A1) ;
  - être pragmatique, **KISS** : du code qui fonctionne ne vaut pas toujours le coup d'être touché ;
  - toujours s'adapter aux contraintes (langage, infra, équipe) ;
  - **l'absence d'architecture spécifique doit toujours être un choix, et ne doit pas prendre plus d'une demi-journée de discussion.**

**Notre choix** : hexagonale (moins prescriptive, adaptée à une petite équipe et à Next.js), avec le vocabulaire *domain / application / ports / infrastructure / interface*. À justifier dans `docs/adr/0001-architecture-hexagonale.md`.

### B.5 Vocabulaire de l'asynchrone

- **Broker / bus de messages** : réceptionne le message et le rend disponible pour le consumer.
- **Worker / consumer** : récupère le message, le traite, puis envoie un ack au broker.
- **Ack (accusé de réception)** : confirmation qu'un message a bien été traité ; sans ack, le message est redistribué.
- **Pub/Sub** : un émetteur diffuse un message à un ensemble de workers abonnés, via le broker.
- **Émetteur / producer** : composant qui produit le message et l'envoie au broker.
- **Chorégraphie vs orchestration** : coordination pair à pair, ou hub-and-spoke avec un orchestrateur.
- Ressource : https://www.gentlydownthe.stream/ (Kafka expliqué).

### B.6 Bonnes pratiques de l'asynchrone

- **Dead Letter Queue (DLQ)** : contient les messages qui échouent encore après X retries ; c'est le signe d'un traitement impossible, qui peut déclencher une opération manuelle (ex. l'image envoyée n'a rien à voir avec un ticket de caisse).
- **Idempotence** : un worker peut crasher et un événement être rejoué ; il ne faut ni doublon ni re-notification.
- **Contract first** : une fois établi, le contrat d'un message ne peut être changé sans implications lourdes pour les consommateurs.
- **Traçabilité** : en synchrone, une erreur donne une stack trace unique ; en asynchrone, on ne sait pas quel worker a géré le message, il faut donc des moyens de remonter l'information.
- **L'asynchrone est par nature plus complexe : il faut toujours questionner son utilité.**

---

## 17. Annexe C — Cours n°3 « Deep Dive sur les APIs »

### C.1 Définitions

- **API (Application Programming Interface)** :
  - (CNIL) interface logicielle qui permet de connecter un logiciel ou service à un autre afin d'échanger des données et des fonctionnalités, sans forcément connaître sa logique sous-jacente ;
  - (vision architecte) **frontière architecturale** et mécanisme de **découplage** entre composants, qui sert de **contrat d'interface explicite** au sein d'un système.
- **Une API sépare toujours son contrat d'interface (promis, stable) de son implémentation (cachée, libre de changer).**
- **Rôles** :
  - **contrat** : accord formel qui définit exactement comment les deux systèmes communiquent (formats de requêtes et de réponses, rôles et responsabilités) ;
  - **consommateur** : utilise l'API et s'engage à envoyer des requêtes conformes ;
  - **fournisseur** : crée, héberge et maintient l'API, s'engage à respecter la structure et à garantir la rétrocompatibilité.
- **Audience** : API publique (grand public), partenaire (intégrateurs tiers), interne (au sein d'un même système).
- **Protocole** : RPC, SOAP, HTTP(S). **Attention : REST, GraphQL et POST Action ne sont pas des protocoles, mais des styles architecturaux.**
- **Niveau d'abstraction** : bas niveau proche de l'OS (syscalls `open()`, `read()`) ; intermédiaire (API réseau entre deux systèmes) ; haut niveau (SDK, services tiers packagés).

### C.2 Pourquoi les API

- **Frontière et porte à sens unique** : l'API est la méthode privilégiée d'échange entre équipes, une frontière (contrat public) entre elles.
- **Mandat Bezos (Amazon, 2002)** : toute fonctionnalité doit être exposée via une interface, zéro accès direct aux données d'une autre équipe. Conséquence inattendue : cela a rendu possible AWS.
- **Corollaire** : une fois publiée, une API est une **promesse**. Le code derrière se refactore librement ; le contrat devant ne se casse pas, car on ne contrôle ni qui l'appelle, ni combien.
- C'est une **« one-way door »** : facile à ouvrir, coûteuse à refermer.
- Concevoir une API, c'est concevoir une **relation entre équipes**, connues (API privée) ou non (API publique).
- **L'API comme produit** : pour Stripe, Twilio ou Plaid, l'API *est* le produit ; la DX (expérience développeur) devient un argument de vente.
- **Le client change** : hier des développeurs humains, demain des **agents IA autonomes**. Face à l'ambiguïté, l'humain lit la doc, tolère, contourne un bug ; l'agent interprète le schéma littéralement et peut halluciner. L'humain agit avec le code, la doc et son expérience ; l'agent, **uniquement via l'API** (MCP / tools).
- **Une API mal conçue gêne un développeur, mais fait échouer un agent en autonomie.** La qualité d'une API était un avantage concurrentiel côté humain ; c'est une **condition de fonctionnement** côté agent IA.
- L'API est l'exemple parfait des décisions d'un architecte : enjeux techniques, enjeux métier (usage, maintenance, évolutions), enjeux organisationnels (**loi de Conway**).

### C.3 Les styles d'API

| | REST | GraphQL | POST Action | gRPC |
| --- | --- | --- | --- | --- |
| Contrat | OpenAPI | Schéma SDL | OpenAPI, sémantique RPC | Fichier `.proto` |
| Transport | HTTP + JSON | HTTP + JSON, endpoint unique | HTTP POST + JSON | HTTP/2 + Protobuf (binaire) |
| Usage principal | API publiques, CRUD | Front web et mobile, BFF | Actions métier non-CRUD | Service à service, microservices |
| Origine / exemple | Roy Fielding, 2000 | Facebook, 2012 | API web de Slack | Google, 2015 |
| Principe | Tout est ressource identifiée par une URL ; verbes HTTP ; codes de statut standards ; requêtes **stateless** | Le client décrit exactement les champs voulus ; schéma typé ; queries, mutations, subscriptions | Des **actions nommées** : un endpoint = un verbe métier appelé en POST, paramètres dans le body ; RPC sur HTTP | Appel d'une fonction distante comme une fonction locale ; client et serveur générés depuis le `.proto` ; streaming bidirectionnel |
| Points forts | Cache HTTP natif (GET, ETag, CDN) ; standard, universel, « discoverable » ; outillage mature (OpenAPI, curl, navigateur) | Données exactes ; un seul aller-retour pour plusieurs ressources ; schéma typé et introspection | Simple à concevoir et à comprendre ; colle aux intentions métier ; pas de débat sur le « bon » verbe | Haute performance ; typage fort et code généré ; streaming natif |
| Limites | Over/under-fetching ; multiples allers-retours ; actions non-CRUD difficiles à modéliser | Pas de cache HTTP natif (tout en POST) ; complexité N+1 ; coût des requêtes (profondeur) à maîtriser | Perd le cache HTTP ; perd l'idempotence implicite des verbes ; peu standardisé | Peu lisible et peu débogable ; support web limité (gRPC-Web + proxy) ; couplage fort au `.proto` |
| À privilégier | API publique orientée ressources | Plusieurs clients aux besoins de données différents | Opération qui est une action métier hors CRUD | Communication interne entre services, quand la performance compte |

Même besoin (« récupérer une commande et son détail ») dans les 4 styles :
- REST : `GET /orders/42` puis `GET /orders/42/items`
- GraphQL : `query { order(id: 42) { id status items { id sku qty } } }`
- POST Action : `POST /getOrderDetails { "orderId": 42 }`
- gRPC : `service OrderService { rpc GetOrder (GetOrderRequest) returns (Order); }`

**Pas de « meilleur style »** : le choix dépend de **qui consomme** et de **la nature de l'opération**.
- Navigateur ou app mobile → GraphQL ; partenaire externe → REST ; service interne → gRPC.
- Lecture flexible → GraphQL ; action métier → POST Action ; communication interne à basse latence → gRPC.
- Un cinquième consommateur apparaît, **l'agent IA**, qui se comporte souvent comme un client POST Action (il déclenche des actions nommées plutôt que de naviguer des ressources).
- En pratique, une même plateforme combine plusieurs styles (REST en public, gRPC en interne).

**Pour Expense.io** : REST pour les ressources (notes, utilisateurs, reçus) ; sous-ressource d'action `POST /expense-notes/{id}/decision` pour l'action métier « trancher ». Pas de GraphQL ni de gRPC : un seul client web, un monolithe.

### C.4 Anatomie d'une requête REST

```
POST /users/42/orders?dryRun=true HTTP/1.1
Host: api.exemple.com
Authorization: Bearer 7f9c3a1e-4b2d…
Content-Type: application/json

{ "sku": "ABC-123", "qty": 2 }
```

- **Méthode** : l'intention (GET, POST, PUT, PATCH, DELETE).
- **Path parameters** : identifient la ressource ; obligatoires, ils font partie de l'URL.
- **Query parameters** : options (filtres, tri, pagination) ; facultatifs.
- **Headers** : métadonnées (authentification, format, cache, traçabilité).
- **Body** : la donnée métier, souvent en JSON ; absent d'un GET.
- Règle : **ce qui identifie va dans le path, ce qui filtre dans la query, ce qui décrit la requête dans les headers.**

### C.5 API asynchrones

- L'API reçoit la requête mais le traitement se poursuit en arrière-plan. Réponse immédiate : **202 Accepted** (requête acceptée, résultat pas encore disponible).
- **Gestion des erreurs** : distinguer l'erreur d'acceptation de la requête de l'erreur du traitement asynchrone.
- **Polling** : `POST /vms { cpu: 42 }` → `202 { vmId: 123, endpoint: /vms/:vmId }` ; puis `GET /vms/:vmId` → `200 { state: CREATING | RUNNING | FAILED | … }`, répété jusqu'à un état final. C'est **le client qui revient demander** où en est le traitement.
- **Webhook** : `POST /vms { cpu: 42, webhook: my.api/vms }` → 202 ; plus tard le serveur appelle `POST my.api/vms { vmId: 123, state: CREATED }` → 200. C'est **le serveur qui rappelle le client** à l'adresse fournie. L'état envoyé est un « resting state » (état stable).

### C.6 Bonnes pratiques (liste non exhaustive)

**Contract first.** Quelle que soit la nature technique de l'API, on définit d'abord son contrat, puis on génère certaines parties idiomatiques du code.
- REST → spécification **OpenAPI** en `.json` ou `.yaml` ; RPC → fichier **`.proto`**.
- Ces fichiers génèrent client, serveur, types, SDK et documentation (Swagger) dans n'importe quel langage.
- Le contrat devient la **source de vérité unique**, pas un sous-produit du code.
- Découplage : les équipes **travaillent en parallèle** dès que le contrat est figé, sans attendre l'implémentation.
- Une **revue de contrat coûte bien moins cher** qu'une revue de code après coup ; c'est un workflow qui s'intègre parfaitement à la programmation agentique.
- Outils : oapi-codegen (Go), progenitor (Rust), protoc-gen-go, grpc-tools (Node).

**Semver (Semantic Versioning).** `MAJOR.MINOR.PATCH` : MAJOR = breaking change ; MINOR = ajout non cassant ; PATCH = correctif.
- Une API publiée est une promesse : un bump MAJOR doit être rare et accompagné d'une **politique de dépréciation** (changelog, en-tête `Sunset`, période de transition).
- Piège classique : un changement qui semble mineur (**renommer une valeur d'enum, rendre obligatoire un champ optionnel**) est en réalité MAJOR.
- Outils de vérification : oasdiff, openapi-changes.

**Sécurité des API.** Authentification = *qui es-tu ?* ; autorisation = *qu'as-tu le droit de faire ?*

| Mécanisme | Transport | Cas d'usage | Compromis | Exemple |
| --- | --- | --- | --- | --- |
| Session cookie | Cookie | Application web classique | Simple, mais nécessite un **état serveur partagé** | `Set-Cookie: sessionId=…; HttpOnly; Secure; SameSite=Lax` |
| Bearer opaque | `Authorization: Bearer` | API internes | Révocation immédiate, mais **lookup serveur à chaque appel** | `Authorization: Bearer 7f9c3a1e-…` |
| JWT | `Authorization: Bearer` | API distribuées / microservices | Stateless, mais **révocation difficile avant expiration** | `Authorization: Bearer eyJhbGciOi…` |
| OAuth 2.0 + OIDC | Tokens via flow OAuth | Délégation d'identité, « Se connecter avec… » | Standard et flexible, mais **plus complexe** | `{ "access_token": "…", "token_type": "Bearer", "expires_in": 3600, "scope": "notes.read notes.write" }` |
| mTLS | Certificat client | B2B / haute sécurité | Authentification forte, mais gestion et rotation des certificats | `Subject: CN=expense-service.internal, O=Expense.io` (négocié au niveau TLS) |
| HMAC | Signature dans les headers | Webhooks / intégrations | Pas de secret transmis, mais crypto à sécuriser | `Stripe-Signature: t=…,v1=…` |
| API key | Header ou query param | Machine-to-machine / API publique | Simple, mais généralement **pas d'expiration native** | `X-API-Key: sk_live_…` |
| Basic auth | `Authorization: Basic` | Legacy / API interne | Très simple, mais **identifiants transmis à chaque requête** | `Authorization: Basic dXNlcm5hbWU6cGFzc3dvcmQ=` |

Référence : https://learn.openapis.org/specification/security.html

**OAuth 2.0** = autorisation **déléguée**, pas authentification (« cette application peut agir en mon nom, avec ces droits précis »). Flux : (1) l'application demande l'autorisation, l'utilisateur consent, le serveur d'autorisation renvoie un code ; (2) l'application échange le code contre un access token ; (3) elle appelle le serveur de ressources (l'API protégée) avec l'access token.

**Pour Expense.io** : session NextAuth en JWT. Les risques propres au JWT (révocation difficile) aggravent S4 (secret en dur → tokens forgeables) et justifient de revérifier le rôle en base pour les actions sensibles.

**Idempotence.** Rejouer N fois une requête produit le même **état final** qu'une seule fois ; idempotent ne veut pas dire « même réponse à chaque fois ».

| Méthode | Safe (sans effet de bord) | Idempotente |
| --- | --- | --- |
| GET / HEAD / OPTIONS | oui | oui |
| PUT | non | oui (remplace tout) |
| DELETE | non | oui (état final : absent) |
| POST | non | non (sauf `Idempotency-Key` géré côté serveur) |
| PATCH | non | ça dépend de l'opération (`replace` idempotent, `$inc` non) |

Pour les POST non idempotents par nature (paiement, envoi d'email), le pattern **`Idempotency-Key`** en header permet au client de rejouer sans risque en cas de doute réseau (le serveur déduplique par clé). Ce réflexe devient encore plus critique face à un agent IA, qui peut retenter un appel de façon autonome.

**Error reporting — RFC 9457 (Problem Details).** Standardiser les erreurs, c'est mieux comprendre son système et mieux informer ses utilisateurs.

```
HTTP/1.1 403 Forbidden
Content-Type: application/problem+json

{
  "type": "https://exemple.com/errors/solde-insuffisant",
  "title": "Solde insuffisant",
  "status": 403,
  "detail": "Solde de 30€ pour un montant de 50€.",
  "instance": "/comptes/12345/transactions/abc"
}
```

`type` : URI vers la documentation de l'erreur ; `detail` : détail de l'occurrence. **Le code HTTP reste la source de vérité ultime** ; il en existe presque un pour chaque cas, donc choisir le plus adapté.

**Codes de succès.**
- 200 OK (réponse dans le body) ; 201 Created (URL dans le header `Location`) ; 202 Accepted (traitement asynchrone) ; 204 No Content (succès sans body : DELETE, PUT).
- 301 Moved Permanently ; 303 See Other (résultat à une autre URL) ; 304 Not Modified (cache à jour).
- GET réussi → 200 + ressource ; POST qui crée → 201 + `Location` ; DELETE réussi → 204 ; traitement long → 202 + lien de suivi.
- 200 a un body, 204 n'en a pas ; 201 : c'est créé, 202 : c'est seulement accepté ; 304 n'est pas une erreur.
- Un bon code de succès dit **ce qui a été fait** : lu, créé, accepté, ou fait sans rien à renvoyer.

**Codes d'erreur.**
- 4xx (le client doit corriger) : 400 Bad Request (mal formée) ; 401 Unauthorized (non authentifié) ; 403 Forbidden (authentifié mais pas le droit) ; 404 Not Found ; 409 Conflict (doublon, version périmée) ; 422 Unprocessable Content (syntaxe valide, règle métier violée) ; 429 Too Many Requests (rate limiting).
- 5xx (problème serveur, le client peut réessayer plus tard) : 500 Internal Server Error ; 502 Bad Gateway ; 503 Service Unavailable ; 504 Gateway Timeout.
- 401 = qui es-tu ? 403 = tu n'as pas le droit. 400 = illisible ; 422 = lisible mais refusée. **Jamais de 200 avec une erreur dans le body.**

**Pour Expense.io** : A7 (401 côté manager vs 403 côté RH pour un mauvais rôle) est une violation directe de ces règles ; le bon code est 403. S6 (stack trace en 500) viole RFC 9457 et la sécurité.

---

## 18. Annexe D — Quiz du cours n°3 et réponses argumentées

Réponses proposées pour préparer les questions de soutenance ; à confronter avec les réponses données en cours.

**Q1 — Quelle proposition est « la plus RESTful », et pourquoi ?**
A. `POST /readUserOrders { "userId": 42 }` · B. `GET /users/42/orders` · C. `POST /users/42/orders/search { "status": "shipped" }` · D. `GET /orders?userId=42&status=shipped`

→ **B** (et D, très proche). B identifie une ressource (les commandes de l'utilisateur 42) dans le path et utilise GET (safe, idempotent, cacheable). D est aussi RESTful : une collection filtrée via la query (« ce qui filtre va dans la query »). A est du RPC / POST Action (verbe dans l'URL, POST pour une lecture). C est un compromis pragmatique (recherche complexe en POST) mais perd cache et idempotence.

**Q2 — `DELETE /users/toto`, mais toto n'existe déjà plus. 204 ou 404 ?**
→ Les deux se défendent, car **l'idempotence porte sur l'état final, pas sur la réponse**. 204 dit « le but est atteint » ; 404 dit « rien à supprimer ». Le plus courant et le plus informatif est souvent **404**, qui reste idempotent puisque l'état final est identique. L'important : être cohérent et le documenter dans le contrat.

**Q3 — Quelle réponse respecte RFC 9457 ?**
A. `200 { "success": false, … }` · B. `403 { "error": …, "detail": … }` · C. `403` + `application/problem+json` + `{ type, title, status: 403, detail }` · D. `500 { "message": … }`
→ **C.** A met une erreur dans un 200 ; B n'a ni le bon content-type ni les membres standard ; D utilise un 5xx pour une erreur métier et un format non standard.

**Q4 — Sur quel champ le client doit-il s'appuyer pour réagir automatiquement à « solde insuffisant » ?**
→ **`type`** (URI stable, identifiant machine du type d'erreur). `title` est destiné à l'humain et peut être traduit ; `detail` est propre à l'occurrence ; `instance` identifie l'occurrence, pas le type.

**Q5 — Formulaire soumis avec 3 champs invalides : quelle réponse suit le mieux RFC 9457 ?**
→ **A** : un seul problem `400` avec une extension `errors: [{ pointer, detail }]`. B renvoie un tableau de problems (non conforme : un problem est un objet) ; C met un 200 ; D concatène tout dans `detail`, illisible pour une machine.

**Q6 — Une seule réponse respecte vraiment RFC 9457 : laquelle ?**
→ **B** : `403`, `application/problem+json`, `status: 403` (entier, cohérent avec le code HTTP). A a un `status` (403) qui contredit le code HTTP (400) ; C a un `status` en chaîne ; D a le mauvais content-type (`application/json`).

---

## 19. Annexe E — Glossaire

- **ADR** : Architecture Decision Record, fiche courte qui trace une décision (contexte, décision, alternatives, conséquences).
- **Adapter (adaptateur)** : implémentation concrète d'un port (Postgres, S3, HTTP…). Primaire = pilote le domaine (route HTTP) ; secondaire = piloté par le domaine (repository).
- **Ack** : accusé de réception d'un message par un consumer.
- **BFF** : Backend For Frontend.
- **CAP** : Consistency, Availability, Partition tolerance ; on en garantit au plus deux.
- **Cas d'usage (use case)** : une intention métier orchestrée par la couche application.
- **Chorégraphie / orchestration** : coordination pair à pair vs centralisée.
- **Composition root** : endroit unique où les ports sont câblés à leurs adaptateurs.
- **Contract first** : le contrat d'API est écrit avant le code et fait foi.
- **DDD** : Domain-Driven Design (Eric Evans).
- **DLQ** : Dead Letter Queue.
- **DTO** : Data Transfer Object, forme des données exposées par l'API.
- **IDOR** : Insecure Direct Object Reference ; accès à un objet par son identifiant sans contrôle d'autorisation.
- **Idempotence** : rejouer N fois produit le même état final.
- **KISS** : Keep It Stupid Simple.
- **Loi de Conway** : l'architecture d'un système reflète la structure de communication de l'organisation qui le produit.
- **MCO** : Maintien en Condition Opérationnelle.
- **Outbox** : table où les événements sont écrits dans la même transaction que l'état métier, puis publiés par un worker.
- **Port** : interface définie par le domaine ou l'application, implémentée par un adaptateur.
- **RLS** : Row-Level Security de PostgreSQL ; ignorée par un superutilisateur ou un rôle `BYPASSRLS`.
- **RFC 9457** : Problem Details for HTTP APIs.
- **Semver** : Semantic Versioning, `MAJOR.MINOR.PATCH`.
- **Tenant** : une entreprise cliente dans un SaaS multi-entreprises.
- **Transaction Script** : anti-pattern ici, où chaque route contient toute la logique de bout en bout.
- **Value object** : objet immuable défini par sa valeur (ex. `Money`, `ExpenseDate`).
