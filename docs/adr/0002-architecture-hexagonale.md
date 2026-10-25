# ADR 0002 — Architecture hexagonale dans le monolithe Next.js

- **Statut :** accepté
- **Date :** 2026-10-25
- **Contexte de l'audit :** ARC-01 (hexagone de façade), ARC-02 (Transaction Script dans 15 routes), ARC-03 (duplications) — `docs/audit/audit-v2.md`

## Contexte

Les dossiers `domain/`, `ports/` et `adapters/` existaient, mais aucun fichier ne les importait. Chaque route enchaînait session, autorisation, validation, SQL, S3 et mapping JSON. Conséquences mesurées par l'audit :

- le mapping ligne SQL → JSON d'une note était recopié dans **7 routes** ;
- la configuration S3 était écrite **3 fois**, dont une copie qui ignorait `S3_FORCE_PATH_STYLE` ;
- le type des rôles était déclaré **4 fois** ;
- aucune règle métier n'était testable sans base de données.

Le cours n°2 décrit exactement cette situation : une « terminologie valide mais [un] métier couplé à l'infrastructure ». C'est aussi la cause du premier incident de l'histoire d'Expense.io : un filtrage par client recopié dans chaque route, et donc oublié dans l'une d'elles.

## Décision

On structure le monolithe en **architecture hexagonale (ports & adapters)**, avec une seule règle : **les dépendances pointent vers le domaine**.

```
src/
  domain/            entités, value objects, erreurs : aucun import externe
  application/       cas d'usage (un fichier = une intention)
    ports/           interfaces dont les cas d'usage ont besoin
  infrastructure/    adaptateurs secondaires : postgres/, s3/, notifications/, in-memory/
  interface/http/    adaptateurs primaires : DTO, lecture des paramètres
  app/               routes Next.js : session → cas d'usage → réponse
  composition.ts     racine de composition : choisit l'adaptateur de chaque port
```

- **Le SQL ne vit que dans `infrastructure/postgres/`** pour les cas d'usage migrés.
- **Un garde-fou automatique** (`no-restricted-imports` dans `eslint.config.mjs`) fait échouer la CI dans deux cas :
  - `domain/` importe autre chose que le domaine ;
  - `application/` importe l'infrastructure, `lib/`, Next.js, `pg` ou le SDK AWS.

  Le test `tests/unit/architecture.test.ts` vérifie que ce garde-fou reste actif.
- **Migration progressive.** Une route pilote, `GET /api/expense-notes`, passe par le cas d'usage `ListMyExpenseNotes`. Les autres routes gardent leur SQL jusqu'à leur étape (décision : étape 3 ; soumission : étape 4), mais partagent déjà le mapping unique `toExpenseNote` → `toExpenseNoteDto`.
- **Pas de port sans utilisateur.** `UnitOfWork`, `UserRepository` et `ReceiptKey` seront créés quand un cas d'usage en aura besoin (étapes 3 et 4). Créer des ports que personne n'importe reproduirait le constat ARC-01.

## Alternatives écartées

- **Clean Architecture (R. C. Martin).** Elle repose sur les mêmes principes : inversion des dépendances et cœur testable. Mais elle est plus prescriptive (input/output ports, presenters, un port par fichier), ce qui est lourd pour une petite équipe et ~50 fichiers. L'hexagonale donne l'essentiel avec moins de cérémonie.
- **Microservices** (Expense, Permission…). Ils apportent une architecture distribuée, avec des déploiements et un monitoring plus complexes, sans bénéfice à cette taille (un seul client web, une seule équipe). Le cours n°2 propose le **monolithe modulaire** comme première réponse. *KISS.*
- **Garder le Transaction Script et seulement factoriser des helpers.** Cela suffirait pour la duplication, mais les règles métier resteraient couplées à `pg` et à Next.js, et donc impossibles à tester sans base. Or le workflow d'approbation est le cœur différenciant du produit : on le *build* et on le teste.
- **Un conteneur d'injection de dépendances** (tsyringe, inversify). Inutile ici : `composition.ts` câble quelques objets à la main, de façon lisible par un humain comme par un LLM.

## Conséquences

- Une règle métier se teste en millisecondes avec les adaptateurs en mémoire (`tests/unit/`). Le contrat HTTP reste couvert par les tests d'intégration existants.
- Changer d'infrastructure (Postgres → autre base, S3 → autre stockage, Tesseract → API d'IA) ne touche qu'un adaptateur et `composition.ts`.
- Coût : davantage de fichiers par fonctionnalité (port, adaptateur réel, adaptateur en mémoire, cas d'usage, DTO). La checklist `docs/HOW_TO_ADD_A_FEATURE.md` (à rédiger d'après `CLAUDE.md` §13) rendra ce surcoût mécanique.
- Trade-off assumé pendant la transition : deux styles cohabitent. Les routes non migrées gardent du SQL, et cela se voit à leurs imports de `@/lib/db`.
- `package.json` déclare `"type": "module"`. Ce n'est pas un choix d'architecture : les scripts Node (`seed`, `ensure-bucket`) importent la configuration S3 en TypeScript, sans avertissement de Node.
