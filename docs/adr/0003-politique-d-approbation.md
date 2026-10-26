# ADR 0003 — Politique d'approbation : qui tranche quelle note

- **Statut :** accepté
- **Date :** 2026-10-26
- **Contexte de l'audit :** ARC-04 (workflow implicite et incomplet), ARC-03 (4 routes approve/reject quasi identiques), SEC-04 — `docs/audit/audit-v2.md`

## Contexte

La règle « qui valide qui » est le cœur différenciant d'Expense.io : c'est le *build* du cours n°2 (*build vs buy*). Pourtant elle n'existait nulle part en tant que telle :

- elle était recopiée en SQL dans **8 requêtes** : 4 routes approve/reject, 2 routes `receipt-url` et 2 listes ;
- elle était aussi dans 4 policies RLS, qui ne disaient pas la même chose. Les routes manager ne vérifiaient pas l'entreprise, la route RH si ;
- trois cas n'avaient pas de validateur possible, et leurs notes restaient **en attente pour toujours** :
  - l'**employé sans manager**, ce qui est le cas de tout nouvel inscrit ;
  - le **RH**, que le rattachement de manager refuse comme cible (`api/hr/users/[id]/manager/route.ts`) ;
- deux décisions concurrentes passaient toutes les deux, car le code lisait le statut puis écrivait sans condition ;
- on ne gardait aucune trace de qui avait décidé, ni quand.

## Décision

**1. Une seule règle, dans le domaine.** C'est `src/domain/ApprovalPolicy.ts`, un ensemble de fonctions pures testées cas par cas (`tests/unit/domain/ApprovalPolicy.test.ts`) :

| Situation de l'auteur | Qui tranche |
| --- | --- |
| A un manager | Ce manager direct, et lui seul (le RH ne court-circuite pas) |
| Manager racine | Un RH de l'entreprise |
| **Employé sans manager** | **Un RH de l'entreprise** : il est traité comme un manager racine |
| **RH** | **Un autre RH de l'entreprise** |
| Toujours | Jamais l'auteur lui-même ; jamais quelqu'un d'une autre entreprise |

**2. Cas limite assumé : le RH unique.** Si une entreprise n'a qu'un seul RH, sa note **reste en attente**. Aucun validateur n'est possible sans inventer une règle : faire valider par un manager inverserait la hiérarchie, et l'auto-approbation est interdite (règle n°4). C'est la seule note qui peut encore rester bloquée. Ce cas est couvert par un test et sera à présenter au produit, par exemple avec un rôle finance ou un validateur désigné par entreprise.

**3. Motif de rejet facultatif, mais stocké.** Il est enregistré avec `decided_by` et `decided_at` (migration `1700000000002_record-decision.sql`), ce qui donne une piste d'audit pour des frais remboursés. Il est facultatif parce que l'UI et les anciennes routes n'en envoient pas : le rendre obligatoire serait un changement **MAJOR** du contrat. Il est refusé sur une approbation (422). Deux contraintes SQL garantissent la cohérence :
- un motif n'existe que pour un rejet ;
- une note en attente n'a pas de décideur.

**4. Une décision ne passe qu'une fois, même en concurrence.** Elle est enregistrée par `UPDATE … WHERE status = 'pending'`. Si aucune ligne n'est mise à jour, la réponse est 409. L'atomicité vient de Postgres, sans verrou applicatif. Un test d'intégration lance deux décisions simultanées.

**5. Le rôle est relu en base, pas dans le jeton.** Les cas d'usage rechargent l'acteur via `UserRepository`. Un JWT reste valide jusqu'à son expiration, même après un changement de rôle ou de rattachement (CLAUDE.md §10).

**6. Trois cas d'usage partagent la règle.**
- `DecideExpenseNote` tranche la note.
- `ListPendingApprovals` construit la file d'attente en filtrant les auteurs avec la politique elle-même. La liste et la décision ne peuvent donc plus diverger.
- `GetReceiptUrl` sert le reçu à l'auteur ou à son validateur.

**7. Ordre des contrôles.** L'autorisation passe avant l'état. Une note qu'on n'a pas le droit de trancher donne 403 (même entreprise) ou 404 (autre entreprise), jamais 409 : on ne révèle rien de son état.

> *Amendé par l'ADR 0005 :* depuis que la RLS s'applique, une note que l'utilisateur ne peut pas **voir** répond 404, même dans son entreprise (par exemple un manager qui n'est pas le manager direct). Le 403 reste renvoyé quand il la voit sans en être le validateur.

## Alternatives écartées

- **Garder la règle en SQL et la factoriser dans une vue ou une fonction Postgres.** La règle resterait testable seulement avec une base, et invisible pour qui lit le code applicatif.
- **Faire porter la règle par les policies RLS.** La RLS est une défense en profondeur, pas l'endroit où la règle se lit et se teste. Elle sera réécrite à l'étape 4 pour refléter cette politique.
- **Faire trancher la note d'un RH unique par le manager racine.** Cela inverse la hiérarchie et invente une règle que le produit n'a pas demandée.
- **Motif obligatoire.** Il casserait l'UI et les anciennes routes (MAJOR). On pourra l'exiger plus tard sur la nouvelle route seule, qui reste une évolution contrôlée.
- **Verrou pessimiste (`SELECT … FOR UPDATE`).** Il est inutile : la mise à jour conditionnelle suffit et ne garde aucun verrou pendant la logique métier.

## Conséquences

- La règle se lit dans un fichier de ~60 lignes et se teste en millisecondes. Une évolution, comme un rôle finance ou une délégation pendant une absence, se fait au même endroit.
- **Changements visibles**, documentés dans `CHANGELOG.md` :
  - la file du RH contient aussi les notes des employés sans manager et des autres RH ;
  - les routes manager refusent désormais une note d'une autre entreprise, même si le rattachement est incohérent en base.
- `ListPendingApprovals` charge les utilisateurs de l'entreprise pour appliquer la politique. C'est négligeable à l'échelle d'une PME. Pour une très grande entreprise, il faudra une requête dédiée, testée contre la politique.
- **Dette connue, soldée à l'étape 4** : les policies RLS décrivaient encore l'ancienne règle (RH → managers racine seulement), sans effet tant que l'application se connectait en superutilisateur (SEC-03). Elles ont été réécrites avec `company_id` (ADR 0005), et les tests de décision du RH sur un employé sans manager et sur un autre RH tournent désormais avec le rôle applicatif.
- Les libellés de l'écran RH (« Notes des managers racine ») ne sont pas modifiés, pour ne pas casser un test E2E qui s'appuierait dessus. Ils sont à revoir à l'étape 6.
