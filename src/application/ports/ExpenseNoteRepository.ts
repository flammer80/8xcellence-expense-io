import type { ExpenseNote } from '@/domain/ExpenseNote'
import type { ExpenseNoteSort } from '@/domain/ExpenseNoteSort'

/**
 * Accès en lecture et écriture aux notes de frais.
 *
 * Implémentations : `PostgresExpenseNoteRepository` (production, seul
 * endroit où vit le SQL des notes) et `InMemoryExpenseNoteRepository` (tests).
 *
 * `actorId` désigne l'utilisateur au nom duquel la requête s'exécute ;
 * l'adaptateur Postgres l'expose aux policies RLS. Il ne remplace pas les
 * contrôles d'autorisation, qui restent dans l'`ApprovalPolicy`.
 */
export interface ExpenseNoteRepository {
  /**
   * Notes dont `ownerId` est l'auteur, dans l'ordre demandé.
   * Liste vide si l'utilisateur n'a aucune note ou n'existe pas.
   */
  listByOwner(ownerId: string, sort: ExpenseNoteSort): Promise<ExpenseNote[]>

  /**
   * Insère une nouvelle note, en une seule écriture (avec sa clé de reçu).
   * @returns la note telle qu'enregistrée.
   * @throws toute erreur de la base (contrainte, policy RLS) : l'appelant
   *   compense alors l'envoi du reçu.
   */
  add(note: ExpenseNote, actorId: string): Promise<ExpenseNote>

  /** La note `noteId`, ou `null` si elle n'existe pas. */
  findById(noteId: string, actorId: string): Promise<ExpenseNote | null>

  /** Notes en attente des auteurs donnés, les plus anciennes d'abord. */
  listPendingByAuthors(authorIds: string[], actorId: string): Promise<ExpenseNote[]>

  /**
   * Enregistre la décision portée par `note` (statut, `decidedBy`,
   * `decidedAt`, motif), **seulement si la note est encore en attente** en
   * base : deux décisions concurrentes ne peuvent pas passer toutes les deux.
   * @returns la note telle qu'enregistrée.
   * @throws AlreadyDecidedError si la note a été tranchée entre-temps.
   */
  saveDecision(note: ExpenseNote, actorId: string): Promise<ExpenseNote>
}
