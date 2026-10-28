# ADR 0010 — Couverture de tests mesurée et garantie par couche

- **Statut :** accepté
- **Date :** 2026-10-28
- **Contexte de l'audit :** OPS-01 (zéro test, zéro CI), recommandation R9 de `docs/audit/audit-v2.md`. Complète l'ADR 0001 (stratégie de tests).

## Contexte

Après l'étape 6, le dépôt comptait 295 tests (domaine, cas d'usage, routes, sécurité), mais **aucune mesure de couverture**. On ne pouvait ni chiffrer ce filet, ni empêcher qu'il s'effrite. Une fonctionnalité ajoutée sans test, par exemple pendant le live coding, passait la CI sans bruit.

## Décision

**1. Le provider `@vitest/coverage-v8`** est intégré à Vitest et s'appuie sur la couverture native de V8 : ni Babel, ni instrumentation du code. Le script `npm run test:coverage` lance **tous** les tests, unitaires et intégration. Les routes et les repositories ne sont en effet couverts que par l'intégration, contre le vrai Postgres.

**2. Périmètre : tout `src/`**, avec des exclusions explicites, chacune justifiée dans `vitest.config.ts`.

| Exclu | Pourquoi |
| --- | --- |
| Pages et composants React | Relèvent de l'E2E (navigateur), pas d'un test Node. |
| `instrumentation.ts`, `proxy.ts`, `app/api/auth/**` | Câblage du framework, sans logique propre. |
| `application/ports/**`, `messages.ts`, `dto.ts`, `types/` | Types uniquement : aucune instruction exécutable. |
| `lib/storage.ts` | Enveloppe fine du SDK AWS. Elle est simulée en intégration, faute de S3 en CI, et vérifiée sur LocalStack par `make dev`. |

**3. Des seuils par couche**, appliqués par Vitest : la commande, donc la CI, échoue si une couche passe en dessous.

| Couche | Lignes | Branches | Mesure du 2026-10-28 (lignes / branches) |
| --- | --- | --- | --- |
| `domain/` | 100 % | 95 % | 100 % / 99,4 % |
| `application/` | 95 % | 85 % | 99,2 % / 91,8 % |
| `interface/` | 95 % | 90 % | 98,6 % / 94,8 % |
| `infrastructure/` | 95 % | 85 % | 98,6 % / 92,6 % |
| Global | 90 % | 85 % | **95,2 % / 91,8 %** |

Les seuils sont arrondis vers le bas par rapport à la mesure : ils protègent contre la régression sans bloquer à 0,1 point près. Le domaine porte les règles métier ; il est exigé à 100 % des lignes.

**4. En CI**, `npm run test:coverage` remplace `npm test`. Le résumé s'affiche sur la page du run GitHub Actions et le rapport HTML est publié en artefact.

**5. Combler les trous révélés par la première mesure** (91,9 % des lignes) :
- `utils/format.ts` (0 %) ;
- la boucle de fond du worker de l'outbox (`start`, `stop`, lot en échec, hook de lettre morte en échec) ;
- `s3-config.ts` ;
- `ConsoleEmailSender`.

Neuf tests ont été ajoutés.

## Alternatives écartées

- **Un seul seuil global.** Il laisserait une couche critique, le domaine, baisser tant qu'une autre compense. Les seuils par couche suivent l'architecture hexagonale : plus on est près du métier, plus on exige.
- **Viser 100 % partout.** La couverture mesure ce qui est *exécuté*, pas ce qui est *vérifié*. Au-delà du domaine, ce chiffre pousse à écrire des tests sans assertion utile, par exemple pour les branches défensives des routes dépréciées. Les seuils servent de garde-fou, pas d'objectif.
- **Istanbul (`@vitest/coverage-istanbul`).** Plus précis sur certaines branches, mais il instrumente le code et ralentit la suite. V8 suffit à cette taille.
- **Un service externe (Codecov, Coveralls).** Il ajoute des commentaires de PR et un historique, mais aussi un compte tiers et un jeton à gérer. Le résumé GitHub et l'artefact suffisent pour une équipe de cette taille (KISS).
- **Mesurer le front avec des tests de composants** (Testing Library). Ce serait utile, mais c'est un autre chantier, mieux servi par quelques parcours Playwright.

## Conséquences

- **Le live coding devient plus sûr :** une fonctionnalité sans test fait baisser la couverture de sa couche et casse la CI. `npm run test:coverage` devient la dernière étape de la checklist d'ajout d'une fonctionnalité.
- **Chiffre pour l'audit :** on passe de zéro test (OPS-01) à 304 tests et 95 % des lignes couvertes, 100 % sur le domaine.
- **Couche la moins couverte : `lib/` (77,5 %).**
  - `lib/ocr.ts` : les chemins réels de Tesseract ne sont exercés que par un test d'intégration léger.
  - `lib/auth.ts` : la configuration NextAuth ; sa logique de connexion a été extraite et testée (`interface/auth/credentials.ts`, 100 %).
  - L'action `login` (`app/actions/auth.ts`) n'est pas couverte : elle dépend de `signIn` de NextAuth, à vérifier en E2E.
- **Maintenance :** remonter un seuil est une décision volontaire, à faire quand la mesure le permet durablement. Le baisser se justifie dans la PR qui le fait.
