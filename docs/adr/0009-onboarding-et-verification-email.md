# ADR 0009 — Onboarding : domaine professionnel, email vérifié, tentatives limitées

- **Statut :** accepté. Décision produit R9 prise le 2026-10-26.
- **Date :** 2026-10-26
- **Contexte de l'audit :** SEC-06 (prise de contrôle d'un tenant à l'inscription), SEC-11 (aucune limitation de débit), DAT-02 (inscription non transactionnelle). Recommandations R3 et R8 de `docs/audit/audit-v2.md`.

## Contexte

Aujourd'hui, l'entreprise d'un inscrit est déduite du domaine de son email, et **le premier inscrit d'un domaine en devient RH**. Rien ne vérifiait que la personne possédait l'adresse :

- un inconnu pouvait s'inscrire en `ceo@client.fr` avant le vrai client et devenir RH de son espace : il accédait à l'annuaire, aux rattachements et aux notes des managers racine ;
- toutes les adresses `@gmail.com` partageaient un même tenant, ce qui mélangeait des inconnus dans une même « entreprise » ;
- ni la connexion ni l'inscription n'étaient limitées, ce qui laissait la voie libre à la force brute sur les mots de passe et à la création de comptes en masse.

L'audit laissait le choix entre deux options produit (R9) :

- **(a)** refuser les domaines publics et exiger la vérification de l'email ;
- **(b)** faire créer l'entreprise par un RH, qui invite ensuite ses employés.

## Décision

**Option (a), retenue par l'équipe produit.** Elle corrige la faille sans changer le parcours que connaissent les utilisateurs (et les E2E) : on s'inscrit soi-même, et le domaine désigne l'entreprise.

**1. Les messageries grand public sont refusées.**
- `isProfessionalEmail` (domaine, `src/domain/Email.ts`) écarte une liste fermée de 23 domaines : Gmail, Outlook/Hotmail/Live, Yahoo, iCloud, Proton, GMX, AOL, et les FAI français.
- Le refus s'affiche sur le formulaire, avant tout accès à la base.

**2. Le compte reste inactif tant que l'adresse n'est pas confirmée.**
- La migration `1700000000006` ajoute `users.email_verified_at`. Les comptes existants, ceux du seed et les fixtures valent « vérifiés » par défaut ; seule l'inscription publique pose `NULL`.
- La connexion refuse un compte non vérifié avec le code `email_not_verified`. Ce code n'est renvoyé **qu'après un mot de passe correct**, pour ne rien révéler à qui ne connaît pas le mot de passe.
- **Plus de connexion automatique après l'inscription** : le formulaire affiche « un lien a été envoyé à … ».

**3. L'envoi du lien passe par l'outbox (ADR 0007), dans la transaction de l'inscription.**

`app_register_user` (`SECURITY DEFINER`) fait tout en une transaction :
- crée l'entreprise si besoin, puis le compte non vérifié ;
- stocke **l'empreinte SHA-256** d'un jeton aléatoire de 256 bits, valable 24 h ;
- dépose un message `EmailVerificationRequested` v1 dans l'outbox.

Si une étape échoue, rien n'existe, et en particulier aucun email n'est envoyé pour un compte refusé (email déjà pris). Le worker passe ensuite le message au consommateur `SendVerificationEmail`, puis au port `EmailSender` :
- en local, l'adaptateur `ConsoleEmailSender` écrit l'email dans les logs du serveur, d'où l'on copie le lien ;
- un fournisseur réel (SMTP, Brevo, SES) s'ajoutera comme un autre adaptateur de ce port, sans toucher au reste.

**4. La page `/verify-email?token=…` confirme l'adresse** (`app_verify_email`).
- Rouvrir le même lien pendant sa validité affiche toujours le succès : l'opération est idempotente.
- Un lien inconnu ou expiré affiche un message neutre.

**5. Les tentatives sont limitées en base** (`auth_attempts`, `app_consume_auth_attempt`).

| Action | Clé | Limite |
| --- | --- | --- |
| Connexion | `login:<email>` | 10 tentatives / 15 min, réussies ou non |
| Inscription | `signup:<ip>` (première IP de `x-forwarded-for`) | 5 / heure |

Le compteur vit dans Postgres : il vaut pour toutes les instances et survit à un redémarrage. Les tentatives sorties de la fenêtre sont purgées au passage.

**6. La logique de connexion est sortie de la configuration NextAuth** (`src/interface/auth/credentials.ts`, `authorizeCredentials`).
- Elle se teste sans base ni framework : limite, compte non vérifié, absence d'énumération.
- NextAuth la branche sur les vrais adaptateurs et transmet la raison du refus (`CredentialsSignin.code`) à l'action `login`, qui affiche le message adapté.

## Alternatives écartées

- **Option (b), entreprise créée par un RH qui invite.** C'est le modèle le plus robuste : aucune entreprise ne naît d'une adresse. Mais il change le parcours d'inscription que testent les E2E, demande un écran d'invitation et un nouveau type de jeton, et ne règle pas mieux le cas du premier RH : il faudrait de toute façon vérifier son adresse. On pourra le superposer plus tard (un RH vérifié invite), sans revenir sur cette décision.
- **Vérifier le domaine par DNS (enregistrement TXT).** C'est la preuve de propriété la plus forte, mais elle est hors de portée d'un premier RH non technique. On pourra en faire une option « entreprise vérifiée » pour les gros clients.
- **Limiter les tentatives en mémoire** (`Map` dans le process). C'est plus simple, mais le compteur est perdu au redémarrage et faux dès qu'il y a deux instances : un attaquant n'a qu'à répartir ses tentatives.
- **Ne stocker que l'empreinte du jeton, y compris dans l'outbox.** Le worker ne pourrait alors pas construire le lien. Le jeton en clair voyage donc dans le payload du message. C'est un compromis assumé : seul le rôle `expense_worker` lit l'outbox (ADR 0007), le jeton expire en 24 h, et la table `email_verifications` ne contient que des empreintes.
- **Limiter la connexion par IP plutôt que par email.** Cela protège mal un compte précis contre une attaque distribuée, et pénalise tout un bureau derrière la même IP. On limite par email ; une limite globale par IP pourra s'y ajouter.

## Conséquences

- **SEC-06 corrigée :**
  - devenir RH d'une entreprise suppose désormais de lire les emails de son domaine ;
  - les domaines publics ne forment plus de tenant.
- **SEC-11 couverte** pour la connexion et l'inscription.
- **Tests :**
  - `tests/unit/interface/credentials.test.ts` : limite, compte non vérifié, absence d'énumération ;
  - `tests/unit/domain/Email.test.ts` : domaines refusés ;
  - `tests/integration/accounts.test.ts` : message dans l'outbox avec le compte, rien en cas de doublon, jeton valide, inconnu ou expiré, fenêtre de la limite ;
  - `tests/integration/signup.test.ts` : action d'inscription complète (compte non vérifié, domaine public refusé, limite par IP) ;
  - `tests/unit/application/SendVerificationEmail.test.ts`.
- **Vérifié sur le serveur de dev :**
  - inscription (fonction `app_register_user` appelée avec le rôle applicatif) ;
  - connexion refusée (`email_not_verified`) ;
  - lien lu dans les logs ;
  - « Adresse confirmée » ;
  - connexion acceptée ;
  - `rate_limited` après 10 échecs.
- **Changements visibles** (`CHANGELOG.md`) :
  - une inscription ne connecte plus automatiquement ;
  - une adresse grand public est refusée.
  Les comptes existants ne sont pas affectés.
- **Configuration :** `APP_URL` (facultative en local) sert à construire le lien envoyé.
- **Dettes connues :**
  - aucun renvoi du lien n'est proposé (il faut se réinscrire avec une autre adresse, ou que le RH intervienne) ;
  - `auth_attempts` n'est purgée que clé par clé ; une purge périodique relèvera de la MCO ;
  - la liste des domaines publics est fermée et devra être enrichie au fil des clients internationaux.
