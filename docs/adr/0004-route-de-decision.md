# ADR 0004 — Route unique de décision, erreurs RFC 9457 et dépréciation des anciennes routes

- **Statut :** accepté
- **Date :** 2026-10-26
- **Contexte de l'audit :** ARC-03 (4 routes approve/reject, 3 routes `receipt-url`), ARC-07/08 (contrat HTTP incohérent) — `docs/audit/audit-v2.md`

## Contexte

Trancher une note passait par **4 routes** : `/api/{manager|hr}/expense-notes/{id}/{approve|reject}`. Le reçu passait par **3 routes** : `/api/expense-notes`, `/api/manager` et `/api/hr`. Chaque route avait sa propre règle et ses propres codes : un mauvais rôle donnait 401 côté manager et 403 côté RH. L'UI les appelait directement, et les tests E2E des profs les appellent probablement aussi.

## Décision

**1. Style : une sous-ressource d'action, `POST /api/expense-notes/{id}/decision`**, de corps `{ "decision": "approved" | "rejected", "reason"?: string }`.

Il n'y a **pas de meilleur style** (cours n°3) : le choix dépend du consommateur et de la nature de l'opération.
- Trancher est une **action métier hors CRUD**. On la nomme comme telle (POST Action) mais sous la ressource qu'elle concerne : l'identifiant reste dans le chemin et la donnée métier dans le corps.
- Un seul endroit sert les deux validateurs. C'est la politique qui sait qui tranche, pas le préfixe d'URL.
- Le corps typé se prête aux agents IA : une action nommée, un schéma strict qui refuse les champs inconnus, et des erreurs typées.

**2. Contract first.** La route est d'abord décrite dans `docs/api/openapi.yaml` (v1.1.0), puis implémentée.

**3. Erreurs au format RFC 9457 sur la nouvelle route.**
- `Content-Type: application/problem+json`, avec `type` (URI stable), `title`, `status` entier, `detail` et `instance`.
- Toutes les erreurs de validation tiennent dans **un seul** problem, avec l'extension `errors: [{ pointer, detail }]`.
- Codes : 400 corps illisible, 401 sans session, 403 pas le validateur désigné, 404 introuvable ou autre entreprise, 409 déjà tranchée, 422 règle métier (motif sur une approbation), 500 avec `correlationId` et sans stack.

**4. La route unique des reçus est l'URL existante `GET /api/expense-notes/{id}/receipt-url`.** Elle s'ouvre au validateur désigné, en plus de l'auteur. C'est un élargissement, pas une rupture : le format reste `{ url }` / `{ error }`.

**5. Les anciennes routes sont gardées comme adaptateurs fins et dépréciées, pas supprimées.** C'est un écart volontaire avec le ticket, qui demandait de supprimer les 7 routes.
- Chaque route fait quelques lignes : contrôle du rôle de session pour conserver le code historique, appel du **même** cas d'usage, traduction des erreurs au format historique (`{ error }` ; 404 pour « interdit », comme avant).
- Elles portent `Deprecation: true` et `Link: </nouvelle/route>; rel="successor-version"`, et sont marquées `deprecated: true` dans le contrat.
- **Pas encore d'en-tête `Sunset`.** Une date de fin serait une promesse ; elle sera fixée quand aucun consommateur connu ne les appellera plus.
- L'UI est déjà passée aux nouvelles routes (`src/components/approvalsApi.ts`) : les anciennes ne servent plus qu'aux consommateurs externes.
- Les deux listes `/api/manager/expense-notes` et `/api/hr/expense-notes` restent les files d'attente propres à chaque écran. Elles passent par `ListPendingApprovals`.

## Alternatives écartées

- **Supprimer les anciennes routes**, comme le prévoyait le ticket. Cela contrevient à CLAUDE.md §9 (« 100 % des tests E2E fonctionnent toujours ») : une API publiée est une promesse, une *one-way door* (cours n°3). La suppression viendra après une période de transition annoncée.
- **REST pur : `PATCH /api/expense-notes/{id}` avec `{ status }`.** Cela laisserait croire que `status` est un champ librement modifiable, alors que c'est une transition métier contrôlée : on ne revient jamais en arrière et seul le validateur l'effectue. Ça mélangerait aussi décision et édition.
- **Deux routes `…/approve` et `…/reject` sous `/api/expense-notes`.** On dupliquerait le contrat. Une valeur d'enum `decision` s'étend mieux, par exemple à une future valeur `returned` (« à corriger »).
- **Passer tout de suite toutes les routes en RFC 9457.** Ce serait un changement MAJOR du format d'erreur pour les consommateurs existants. C'est prévu à l'étape 6, avec annonce. Une route neuve n'a pas d'historique à préserver.

## Conséquences

- Il n'y a plus qu'une implémentation de la décision et une du reçu. Les 7 anciennes routes n'ont plus de SQL.
- Pendant la transition, deux formats d'erreur coexistent : `{ error }` sur les anciennes routes, problem+json sur la nouvelle. Le contrat OpenAPI documente les deux.
- La validation du corps est écrite à la main (`src/interface/http/decisionRequest.ts`). Le passage à zod est prévu à l'étape 6, avec les autres schémas.
