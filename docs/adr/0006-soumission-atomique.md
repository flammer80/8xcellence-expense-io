# ADR 0006 — Soumission atomique d'une note : le reçu d'abord, la note ensuite

- **Statut :** accepté
- **Date :** 2026-10-26
- **Contexte de l'audit :** ARC-06 (création non atomique), DAT-03 (`receipt_seq` révèle le volume), S9 (type MIME non vérifié, date non validée) — `docs/audit/audit-v2.md`

## Contexte

`POST /api/expense-notes` faisait trois écritures dans cet ordre :

1. un `INSERT` de la note avec `receipt_key = ''`, dans une transaction ;
2. l'envoi du reçu sur S3, sous la clé `receipts/{receipt_seq}` ;
3. un `UPDATE` de la clé, **hors transaction**, via le pool.

Le nommage par compteur imposait d'insérer d'abord pour connaître le numéro. Si S3 échouait, la note restait en base **sans justificatif**, visible et validable. Le cas s'est produit en local pendant l'étape 3 : une note « Train » est toujours en attente sans reçu dans la base de dev. Par ailleurs, la clé séquentielle révélait le nombre de notes de toute la plateforme. Le type MIME venait du client sans vérification, et une date comme `2026-13-45` provoquait une erreur 500 de Postgres.

## Décision

**Invariant : aucune note sans reçu.** Le cas d'usage `SubmitExpenseNote` le garantit par l'ordre des opérations, sans transaction distribuée :

1. **Tout valider avant toute écriture** : montant (`Money`), date (`ExpenseDate`), description, reçu (`ReceiptFile`).
2. **Générer l'UUID de la note**, dont dérive la clé : `receipts/{companyId}/{noteId}{ext}` (`domain/ReceiptKey.ts`).
3. **Déposer le reçu.**
4. **Insérer la note en une seule écriture**, qui porte déjà la clé.
5. **Si l'insertion échoue, supprimer le reçu** (compensation), puis propager l'erreur.

| Échec à l'étape… | État final |
| --- | --- |
| 1 (validation) | Rien n'est écrit ; 400 |
| 3 (S3) | Rien en base ; 500 avec `correlationId` |
| 4 (base) | Reçu supprimé ; 500 |
| 4, puis échec de la suppression | Fichier orphelin dans S3, invisible et sans effet métier |

Le dernier cas est le **sens d'échec qu'on accepte** : un fichier sans note ne coûte que quelques kilo-octets, alors qu'une note sans fichier est une faute métier.

**Clé opaque, préfixée par l'entreprise.** L'UUID v4 n'est pas devinable. Le préfixe prépare une rétention, une purge ou un stockage régional par client. `receipt_seq` est supprimé (migration `1700000000003_tenant-schema.sql`).

**Type vérifié sur le contenu.** `ReceiptFile` compare les premiers octets du fichier à la signature du type annoncé : PNG, JPEG, WebP (`RIFF…WEBP`) ou PDF (`%PDF-`). On n'ajoute pas de dépendance : quatre signatures tiennent en quelques lignes testées (KISS).

**Route réduite à un adaptateur.** Elle lit le formulaire, appelle le cas d'usage et traduit `InvalidInputError` en 400 avec les messages historiques. Elle ajoute l'en-tête `Location` à la réponse 201.

## Alternatives écartées

- **Insérer d'abord, puis envoyer le reçu, puis faire un `UPDATE` dans la même transaction.** La transaction resterait ouverte pendant l'appel réseau à S3 : connexion Postgres bloquée, verrou prolongé. Et un échec du `COMMIT` après l'envoi laisserait quand même un fichier orphelin.
- **Insérer une note `pending_upload` invisible, puis la passer à `pending`.** Il faudrait un nouvel état dans le cycle de vie et un balayage des notes abandonnées. C'est plus de complexité que le problème n'en mérite.
- **Transaction distribuée ou saga orchestrée.** C'est disproportionné pour deux écritures ; la compensation locale suffit.
- **La bibliothèque `file-type`.** C'est une dépendance de plus pour quatre signatures stables.

## Conséquences

- **Changements visibles**, documentés dans `CHANGELOG.md` :
  - `receiptKey` change de forme (`receipts/{companyId}/{noteId}.png`). Le champ était déjà marqué déprécié et opaque ; son retrait reste prévu à l'étape 6 ;
  - une date invalide, un fichier dont le contenu ne correspond pas au type, ou un montant à plus de deux décimales répondent 400 au lieu de 500 ou d'être acceptés ;
  - la réponse 201 porte `Location: /api/expense-notes/{id}`.
- `SubmitExpenseNote` est testé sans infrastructure (`tests/unit/application/SubmitExpenseNote.test.ts`), y compris la compensation. La route est testée avec un échec S3 simulé.
- **Hors périmètre** :
  - l'en-tête `Idempotency-Key`, qui permettra de rejouer une soumission sans doublon ;
  - le format RFC 9457 sur cette route.

  Les deux sont prévus à l'étape 6. Les fichiers orphelins éventuels pourront être purgés par une règle de cycle de vie S3.
