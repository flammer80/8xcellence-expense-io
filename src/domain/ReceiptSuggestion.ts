export type ReceiptSuggestionStatus = 'pending' | 'done' | 'failed'

/** Ce que l'OCR a reconnu sur un reçu ; chaque champ peut manquer. */
export interface SuggestedFields {
  amount?: number
  expenseDate?: string
}

export interface ReceiptSuggestionProps {
  id: string
  requesterId: string
  companyId: string
  status: ReceiptSuggestionStatus
  /** Fichier temporaire à analyser, dans le stockage objet. */
  fileKey: string
  contentType: string
  fields: SuggestedFields
  createdAt: Date
  completedAt: Date | null
}

/**
 * Demande d'analyse d'un reçu par OCR, traitée en arrière-plan (ADR 0007).
 * Cycle de vie : `pending` → `done` (avec les champs reconnus, éventuellement
 * aucun) ou `failed` (traitement impossible après plusieurs tentatives).
 * Immuable ; un état final ne change plus.
 */
export class ReceiptSuggestion {
  constructor(private readonly props: ReceiptSuggestionProps) {}

  static request(props: Omit<ReceiptSuggestionProps, 'status' | 'fields' | 'completedAt'>): ReceiptSuggestion {
    return new ReceiptSuggestion({ ...props, status: 'pending', fields: {}, completedAt: null })
  }

  get id(): string {
    return this.props.id
  }

  get requesterId(): string {
    return this.props.requesterId
  }

  get companyId(): string {
    return this.props.companyId
  }

  get status(): ReceiptSuggestionStatus {
    return this.props.status
  }

  get fileKey(): string {
    return this.props.fileKey
  }

  get contentType(): string {
    return this.props.contentType
  }

  get fields(): SuggestedFields {
    return this.props.fields
  }

  get createdAt(): Date {
    return this.props.createdAt
  }

  get completedAt(): Date | null {
    return this.props.completedAt
  }

  isPending(): boolean {
    return this.props.status === 'pending'
  }

  /** @throws Error si la demande est déjà dans un état final. */
  complete(fields: SuggestedFields, at: Date): ReceiptSuggestion {
    return this.finish('done', fields, at)
  }

  /** @throws Error si la demande est déjà dans un état final. */
  fail(at: Date): ReceiptSuggestion {
    return this.finish('failed', {}, at)
  }

  private finish(status: 'done' | 'failed', fields: SuggestedFields, at: Date): ReceiptSuggestion {
    if (!this.isPending()) {
      throw new Error(`La suggestion ${this.props.id} est déjà traitée.`)
    }
    return new ReceiptSuggestion({ ...this.props, status, fields, completedAt: at })
  }
}
