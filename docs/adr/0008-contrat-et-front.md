# ADR 0008 — Un seul contrat HTTP, partagé par le back et le front

- **Statut :** accepté
- **Date :** 2026-10-26
- **Contexte de l'audit :** ARC-08 (contrat HTTP incohérent), ARC-09 (front couplé à l'API brute), SEC-10 (détachement silencieux), OPS-02 (nom de paquet). Recommandation R8 de `docs/audit/audit-v2.md`.

## Contexte

Après l'étape 5, le contrat de l'API d'Expense.io restait en deux morceaux.

- **Deux formats d'erreur.**
  - Les routes migrées (décision, OCR, notifications) suivaient la RFC 9457.
  - `GET` et `POST /api/expense-notes`, `…/receipt-url` et les routes RH renvoyaient encore `{ error }`.
- **Des codes incohérents** pour la même situation.
  - Un mauvais rôle donnait 401 côté manager et 403 côté RH.
  - Un manager invalide donnait 409, alors que c'est une règle métier (422).
- **Une validation écrite à la main** dans chaque route : `typeof`, `instanceof File`, `parseDecisionRequest`.
- **Un détail de stockage exposé.** `receiptKey` (`receipts/{companyId}/{noteId}.png`) figurait dans chaque note renvoyée, sans qu'aucun client n'en ait besoin.
- **Un corps vide détachait l'employé de son manager en silence** (SEC-10).
- **Côté front :**
  - le type `ExpenseNote` était redéclaré dans 3 composants, et `CompanyUser` et `Notification` une fois chacun ;
  - les formatters de date et de montant étaient recopiés dans 4 fichiers, alors que `utils/format.ts` n'était importé nulle part ;
  - il restait 3 `eslint-disable` dans des `useEffect` ;
  - `AdminConsole` faisait 263 lignes et mêlait l'annuaire et la validation ;
  - le manager voyait `cd3b5e4e…` au lieu du nom de l'employé.

Rien ne liait les types du front à ceux du back : renommer un champ côté serveur cassait l'écran sans qu'aucune vérification ne le signale.

## Décision

**1. Une seule déclaration des formes JSON : `src/interface/http/dto.ts`.**
- Le fichier contient `ExpenseNoteDto`, `PendingApprovalDto`, `CompanyUserDto`, `NotificationDto`, `ReceiptSuggestionDto`, `ReceiptUrlDto`, `DecisionRequestDto`, `AssignManagerRequestDto` et `ProblemDto`. Ce sont les mêmes noms que les schémas d'OpenAPI.
- Le back les produit par un seul fichier de mappers (`mappers.ts`, qui remplace `expenseNoteDto.ts` et `receiptSuggestionDto.ts`).
- Le front les importe **en `import type`** : aucun code serveur n'est embarqué dans le bundle.
- Un champ renommé côté serveur fait donc échouer `npm run typecheck` sur l'écran qui l'utilise.

On n'a pas généré les types depuis OpenAPI (voir les alternatives) : le contrat YAML reste la source de vérité documentaire, et un test vérifie qu'il couvre exactement les routes implémentées.

**2. Validation d'entrée par zod (`schemas.ts`).**
- Les schémas valident la **forme** de l'entrée : types, champs connus, UUID.
- Chaque problème devient une entrée `errors[{ pointer, detail }]` d'un **seul** problem 400 (RFC 9457, quiz n°5).
- Les **règles métier** restent dans le domaine et donnent un 422 : montant positif, motif réservé au rejet, cycle hiérarchique.
- `satisfies z.ZodType<DecisionRequestDto>` garantit que le schéma et le DTO ne divergent pas.

**3. Des codes cohérents sur tout le contrat courant.**

| Situation | Code |
| --- | --- |
| Corps ou paramètre illisible | 400 |
| Pas de session | 401 |
| Session valide, rôle insuffisant | **403**, jamais 401 (A7) |
| Ressource inexistante ou invisible (autre entreprise) | 404 |
| Note déjà tranchée | 409 |
| Règle métier violée (manager d'une autre entreprise, cycle…) | **422** |
| Bug | 500, avec `correlationId` |

**4. Des routes neuves là où l'ancienne URL portait un rôle.** Les trois nouvelles routes renvoient leurs erreurs en RFC 9457.

| Nouvelle route | Remplace | Pourquoi |
| --- | --- | --- |
| `GET /api/expense-notes/pending` | `GET /api/manager/expense-notes`, `GET /api/hr/expense-notes` | Une seule file : l'`ApprovalPolicy` décide de ce que chacun peut trancher. L'URL décrit la ressource, pas le rôle de l'appelant. Chaque note porte `authorName`. |
| `GET /api/users` | `GET /api/hr/users` | Annuaire de l'entreprise, 403 hors RH. |
| `PUT /api/users/{id}/manager` | `PUT /api/hr/users/{id}/manager` | Un PUT est idempotent : il remplace le rattachement. Un cycle répond 422. |

- Les anciennes routes restent en place, comme **adaptateurs fins dépréciés** (`Deprecation`, `Link: rel="successor-version"`). Elles appellent les mêmes cas d'usage et gardent leurs codes historiques : 401 côté manager, 409 `Invalid manager`.
- Le front n'utilise plus que les nouvelles routes.

**5. Les routes dont l'URL est conservée passent à RFC 9457, sans casser leurs consommateurs.**
- `GET`/`POST /api/expense-notes` et `GET …/receipt-url` répondent en `application/problem+json`, avec leurs **codes historiques** : 400 pour un champ refusé et 404 pour une note invisible.
- Elles gardent le membre `error` d'origine (`Unauthorized`, `Champs invalides`, `Invalid sort`…) comme **extension** du problem (`legacyCompatibleProblem`).
- Un client qui lisait `body.error` continue de fonctionner, et un nouveau client lit `type`.

**6. `receiptKey` disparaît de toutes les réponses : contrat 2.0.0 (MAJOR).**
- Retirer un champ requis est un changement cassant (semver, cours n°3). Il est annoncé dans `CHANGELOG.md`.
- On l'assume parce que ce champ était lui-même une fuite d'implémentation : aucun écran ne le lisait, et le reçu s'obtient par `GET …/receipt-url`, qui contrôle l'accès.
- Le garder « déprécié » aurait prolongé la fuite pour un consommateur qui n'existe pas.

**7. Les cas d'usage sortent des dernières routes à SQL.**
- `ListCompanyUsers` et `AssignManager` remplacent le SQL écrit dans les routes RH.
- La règle n°6 vit dans le domaine, dans `ManagerAssignment` : RH seulement, cible et manager de la même entreprise, pas soi-même, pas de cycle.
- `UserRepository.saveManager` sérialise les rattachements d'une entreprise (`pg_advisory_xact_lock`) et revérifie l'absence de cycle dans la transaction. Deux rattachements concurrents A → B et B → A ne passent donc pas tous les deux (testé).
- Il ne reste plus de SQL dans `src/app/api`.

**8. Un petit client d'API côté front (`components/api/`).**
- `client.ts` est le seul endroit où l'UI appelle `fetch`. Il renvoie un `ApiResult<T>` (la donnée, ou un message tiré du `detail` du problem) et contient le polling OCR.
- Le hook `useApiResource` charge une ressource et ne modifie l'état que dans la réponse asynchrone. C'est ce qui supprime les 3 `eslint-disable react-hooks/set-state-in-effect`, sans contourner la règle.
- `AdminConsole` (263 → 18 lignes) se contente de composer `CompanyDirectory` (l'annuaire) et `PendingApprovalsPanel` (la file de validation). Ce dernier sert aussi à la page manager.
- Le formatage passe entièrement par `utils/format.ts`.

**9. Des garde-fous automatiques, exécutés en CI** (`tests/unit/frontContract.test.ts`, `tests/unit/openapi.test.ts`) :
- aucun `eslint-disable` dans `src/` ;
- aucun type de l'API redéclaré dans `src/components` ou `src/app` ;
- le front n'importe de `interface/http` que des types ;
- `docs/api/openapi.yaml` documente **exactement** les couples méthode + chemin implémentés (21 opérations sur 20 chemins), ni plus, ni moins.

**10. Le paquet est renommé `expense-io`** (OPS-02).

## Alternatives écartées

- **Générer les types depuis OpenAPI** (`openapi-typescript`). C'est le plus fidèle à *contract first*, mais cela ajoute une étape de build et un fichier généré à tenir synchronisé, pour 9 types. Le test qui confronte la spec aux routes, combiné aux DTO partagés, donne la même garantie pratique : un écart casse la CI. On y viendra si un second client apparaît (application mobile, partenaire).
- **Supprimer les anciennes routes.** Elles cassent les E2E des professeurs et les intégrations existantes (CLAUDE.md §9). Elles restent, dépréciées, et ne coûtent plus que quelques lignes chacune.
- **Faire passer les anciennes routes en RFC 9457.** Leurs consommateurs lisent `{ error }` : ce serait un changement cassant, sans bénéfice pour une route vouée à disparaître.
- **Garder `receiptKey` marqué `deprecated`.** Le changement serait resté non cassant, mais la clé de stockage aurait continué de fuiter vers le navigateur (point 6).
- **Une bibliothèque de données côté client** (SWR, TanStack Query). Elle apporte cache et revalidation, mais aussi une dépendance et un modèle à apprendre, pour 5 écrans qui chargent une liste chacun. Le hook fait 41 lignes (KISS) ; on basculera si la pagination ou le cache deviennent nécessaires.
- **Répondre 403 plutôt que 404 à un RH qui vise un utilisateur d'une autre entreprise.** Ce serait révéler que l'identifiant existe chez un autre client. Le 404 est la règle d'isolation de l'ADR 0005.

## Conséquences

- **Ticket rempli :**
  - aucun type dupliqué entre le front et le back ;
  - plus aucun `eslint-disable` dans `src/` (3 → 0) ;
  - le nom de l'auteur est affiché dans les files de validation.
  Ces trois points sont vérifiés par des tests.
- **Tests :**
  - `tests/integration/users.test.ts` couvre les nouvelles routes, les codes 400/401/403/404/422, le rattachement concurrent et les anciennes routes dépréciées ;
  - `tests/unit/domain/ManagerAssignment.test.ts` couvre la règle n°6 cas par cas ;
  - `tests/security/sec-10-silent-detach.test.ts` couvre SEC-10.
  Les tests de caractérisation des routes au format modifié vérifient maintenant le problem **et** le membre `error`.
- **Breaking change assumé**, et un seul : `receiptKey`. Le contrat passe à 2.0.0.
- **Reste à faire :**
  - la pagination des listes ;
  - un 429 HTTP : la limitation de débit de cette étape porte sur la connexion et l'inscription (ADR 0009), qui passent par des server actions et non par l'API REST.
