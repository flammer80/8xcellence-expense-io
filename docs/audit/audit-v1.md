# Audit d'architecture v1 — Expense.io

> Transcription de l'audit v1 (sections 6 à 8 de `CLAUDE.md`) : constats, recommandations R1 à R9 et plan de refacto. Les références `fichier:ligne` renvoient au commit `265924b`. Ce document est figé ; le second audit est dans `audit-v2.md`.

*Audit du 5 octobre 2026, par @Timoldo.*

## Synthèse

Expense.io fonctionne, mais son architecture n'existe que sur le papier. Toute la logique métier vit dans 15 route handlers Next.js qui parlent directement à Postgres et S3, tandis que les dossiers `domain/`, `ports/`, `adapters/` et `utils/` ne sont importés par aucun fichier.

Le code est petit (environ 50 fichiers source, une seule migration) et lisible, ce qui rend la refacto réaliste. Mais l'audit relève **5 failles de sécurité bloquantes**, dont une injection SQL. L'isolation multi-entreprise ne tient pas non plus : l'application se connecte à Postgres en superutilisateur et contourne donc toutes les policies RLS.

Les trois chantiers prioritaires :

1. **Corriger les failles critiques** : injection SQL sur `sort`, IDOR sur les reçus côté manager, secret JWT en dur, fuite des stack traces, rattachement de manager inter-entreprises.
2. **Passer en architecture hexagonale réelle** : extraire les cas d'usage (soumettre, approuver, rejeter, assigner un manager) dans une couche application qui utilise le domaine et des ports, et réduire les routes à de simples adaptateurs HTTP.
3. **Rendre l'asynchrone explicite** : la notification de décision n'est jamais envoyée et l'OCR bloque la requête HTTP. Un événement de domaine `ExpenseNoteDecided` et une file de traitement unifient ces échanges.

Aucun test automatisé n'existe : la refacto doit commencer par poser un filet de tests sur les cas d'usage.

## Périmètre et méthode

L'audit porte sur le dépôt `expense-io` (commit initial `265924b`), identique à ce jour à `8xcellence-expense-io`. Tout le code a été lu ligne à ligne : `src/`, la migration SQL, les scripts, `docker-compose.yml`, le `Makefile` et la configuration.

Chaque constat est classé selon quatre axes (sécurité, architecture, qualité du code, exploitation et tests) et trois niveaux de gravité (critique, majeur, mineur, définis au §5 de `CLAUDE.md`).

Les références `fichier:ligne` renvoient au dépôt d'origine. L'application n'a pas été exécutée : les failles sont déduites de la lecture du code et devront être démontrées par un test lors de la refacto.

## Ce qui va bien

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

## Ce qui ne va pas

**21 constats : 5 critiques, 11 majeurs, 5 mineurs.** Les failles critiques sont toutes dans la couche sécurité ; les majeurs viennent presque tous d'une même cause, l'absence de couche application entre HTTP et la base.

### Sécurité

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

### Architecture

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

### Données

| ID | Constat | Où | Gravité | Impact |
| --- | --- | --- | --- | --- |
| D1 | Schéma pauvre pour le métier : pas de `company_id` sur `expense_notes` (le tenant se déduit par jointure), pas de `decided_by` / `decided_at` / `updated_at`, pas de devise, aucun index sur `users.manager_id` ni sur `expense_notes(user_id, status)`. | `migrations/1700000000001_init-schema.sql` | Majeur | Pas d'historique d'audit (indispensable pour des frais remboursés), requêtes qui ralentiront avec le volume, isolation plus fragile. |
| D2 | Inscription non transactionnelle : test d'existence puis INSERT sans transaction ; la contrainte `UNIQUE` remonte en erreur 500 avec stack. `receipt_seq` séquentiel révèle le volume de notes. | `actions/auth.ts:36-69`, migration | Mineur | Comptes ou entreprises incohérents sous concurrence ; fuite d'information métier. |

### Exploitation et tests

| ID | Constat | Où | Gravité | Impact |
| --- | --- | --- | --- | --- |
| O1 | **Zéro test** et aucune CI : pas de script `test`, pas de framework installé. | `package.json` | Majeur | Aucune refacto ne peut être faite sereinement ; les failles ci-dessus n'auraient jamais passé un test d'autorisation. |
| O2 | Logs via `console` uniquement, sans corrélation ; le README annonce `AUTH_SECRET` via `.env` alors que le code l'ignore ; nom de paquet `expense-io-version-b`. | `lib/*`, `README.md`, `package.json` | Mineur | Diagnostic difficile en production ; documentation trompeuse. |

## Recommandations (R1 à R9)

La cible est une **architecture hexagonale (ports & adapters) pour le contexte « notes de frais »**, avec une seule règle : **les dépendances pointent vers le domaine**. Next.js, Postgres, S3 et Tesseract deviennent des adaptateurs interchangeables ; les règles métier vivent à un seul endroit et se testent sans infrastructure. On garde Next.js : le choix est structurel, pas technologique.

### Arborescence cible

```
src/
  domain/              entités et règles pures, sans import externe
    ExpenseNote.ts       approve/reject, état, événements émis
    User.ts              rôle, rattachement, entreprise
    ApprovalPolicy.ts    qui peut trancher quelle note (règles du §3 de CLAUDE.md)
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

**Attention (§9 de `CLAUDE.md`) :** les anciennes routes restent en place comme adaptateurs fins vers le même cas d'usage, pour ne pas casser les tests E2E.

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

## Plan de refacto priorisé

Six étapes, chacune livrable seule et couverte par des tests. L'ordre suit le risque (sécurité d'abord), puis les dépendances (le domaine avant ce qui s'appuie dessus).

| Étape | Contenu | Recos | Prérequis | Critère de fin |
| --- | --- | --- | --- | --- |
| 1. Filet de sécurité | Vitest + CI ; tests d'autorisation qui démontrent S1 à S5, puis correctifs ciblés ; rôle Postgres non superutilisateur ; secret via `.env` ; gestionnaire d'erreurs | R1, R8 | aucun | Les 5 tests de faille passent ; CI verte |
| 2. Noyau hexagonal | Domaine enrichi (value objects, `ApprovalPolicy`, erreurs), ports, repositories Postgres, racine de composition ; migration d'une première route pilote (`GET /api/expense-notes`) | R2 | 1 | Cas d'usage testés avec adaptateurs en mémoire ; plus de SQL dans la route pilote |
| 3. Workflow d'approbation | `DecideExpenseNote` + route unique de décision et de reçu ; les 4 routes approve/reject et les 3 routes receipt-url deviennent des adaptateurs fins (conservées pour les E2E) | R3 | 2 | Une seule implémentation de la règle ; double décision refusée en 409 |
| 4. Schéma et soumission | Migration (`company_id`, audit, index, `citext`) ; `SubmitExpenseNote` atomique avec clé UUID | R5, R6 | 2 | Aucune note sans reçu possible ; policies RLS testées par entreprise |
| 5. Asynchrone unifié | Événements de domaine, table `outbox`, worker unique ; notification de décision ; OCR en job | R4 | 3, 4 | L'employé est notifié ; l'OCR ne bloque plus la requête |
| 6. Contrat et front | Schémas zod, DTO partagés, codes HTTP cohérents, client d'API, découpage d'`AdminConsole` ; onboarding selon la décision R9 | R7, R9 | 3 | Aucun type dupliqué front/back ; plus de `eslint-disable` |

