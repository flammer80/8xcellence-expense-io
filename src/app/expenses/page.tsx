'use client'

import { useRef, useState, type FormEvent } from 'react'
import { NotificationsPanel } from '@/components/NotificationsPanel'
import { api, openReceipt } from '@/components/api/client'
import { useApiResource } from '@/components/api/useApiResource'
import { Card, EmptyRow, ErrorAlert } from '@/components/ui'
import type { ExpenseNoteStatus } from '@/domain/ExpenseNote'
import { formatCurrency, formatDate } from '@/utils/format'

const inputClass =
  'w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-gray-700 dark:bg-gray-900 dark:focus:ring-brand-900'

const STATUS_STYLES: Record<ExpenseNoteStatus, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
}

const STATUS_LABELS: Record<ExpenseNoteStatus, string> = {
  pending: 'en attente',
  approved: 'approuvée',
  rejected: 'rejetée',
}

function StatusBadge({ status }: { status: ExpenseNoteStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}

export default function ExpensesPage() {
  const history = useApiResource(api.listMyExpenseNotes)
  const notes = history.data ?? []
  const [actionError, setActionError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [suggestionNotice, setSuggestionNotice] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [expenseDate, setExpenseDate] = useState('')
  const receiptInputRef = useRef<HTMLInputElement>(null)
  const error = actionError ?? history.error

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setActionError(null)
    const form = event.currentTarget

    const result = await api.submitExpenseNote(new FormData(form))
    setSubmitting(false)

    if (result.ok) {
      form.reset()
      setAmount('')
      setExpenseDate('')
      setSuggestionNotice(null)
      history.reload()
    } else {
      setActionError(result.problem?.error ?? result.message)
    }
  }

  async function handleSuggestFields() {
    const receipt = receiptInputRef.current?.files?.[0]
    if (!receipt) {
      setActionError('Sélectionne d’abord un reçu.')
      return
    }
    setExtracting(true)
    setActionError(null)
    setSuggestionNotice(null)

    // Analyse asynchrone : 202 puis polling jusqu'au résultat (ADR 0007).
    const result = await api.suggestFromReceipt(receipt)
    setExtracting(false)

    if (!result.ok) {
      setActionError(result.message)
      return
    }
    // Une suggestion vide est valide (rien reconnu) : sans ce message, ça
    // ne se distinguerait pas visuellement d'un bouton qui n'a rien fait.
    const { amount: foundAmount, expenseDate: foundDate } = result.data
    if (foundAmount !== undefined) setAmount(String(foundAmount))
    if (foundDate !== undefined) setExpenseDate(foundDate)
    if (foundAmount === undefined && foundDate === undefined) {
      setSuggestionNotice('Aucune information reconnue sur ce reçu — saisis les champs manuellement.')
    } else if (foundAmount === undefined || foundDate === undefined) {
      setSuggestionNotice(`${foundAmount !== undefined ? 'Date' : 'Montant'} non reconnu(e) sur ce reçu — vérifie ce champ.`)
    }
  }

  async function handleViewReceipt(id: string) {
    setActionError(await openReceipt(id))
  }

  const total = notes.reduce((sum, note) => sum + note.amount, 0)

  return (
    <main className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mes notes de frais</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {notes.length > 0
            ? `${notes.length} note${notes.length > 1 ? 's' : ''} · ${formatCurrency(total)} au total`
            : 'Soumets ta première note de frais ci-dessous.'}
        </p>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <h2 className="mb-4 text-base font-semibold">Nouvelle note de frais</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="amount" className="text-sm font-medium">
                Montant (€)
              </label>
              <input
                id="amount"
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                required
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="expenseDate" className="text-sm font-medium">
                Date
              </label>
              <input
                id="expenseDate"
                name="expenseDate"
                type="date"
                required
                value={expenseDate}
                onChange={(event) => setExpenseDate(event.target.value)}
                className={inputClass}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="description" className="text-sm font-medium">
              Description
            </label>
            <input
              id="description"
              name="description"
              type="text"
              placeholder="Ex. Taxi aéroport, repas client…"
              required
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="receipt" className="text-sm font-medium">
              Reçu (image ou PDF)
            </label>
            <input
              ref={receiptInputRef}
              id="receipt"
              name="receipt"
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              required
              className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100 dark:text-gray-400 dark:file:bg-gray-800 dark:file:text-brand-300"
            />
            <button
              type="button"
              onClick={handleSuggestFields}
              disabled={extracting}
              className="self-start text-sm font-medium text-brand-600 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
            >
              {extracting ? 'Analyse du reçu…' : 'Pré-remplir depuis le reçu'}
            </button>
            {suggestionNotice && (
              <p className="text-sm text-amber-700 dark:text-amber-400">{suggestionNotice}</p>
            )}
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="self-start rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Envoi…' : 'Soumettre'}
          </button>
        </form>
      </section>

      <NotificationsPanel />

      <ErrorAlert message={error} />

      <Card title="Historique">
        {history.loading ? (
          <EmptyRow>Chargement…</EmptyRow>
        ) : notes.length === 0 ? (
          <EmptyRow>Aucune note de frais pour le moment.</EmptyRow>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:text-gray-400">
                  <th className="px-6 py-3 font-medium">Date</th>
                  <th className="px-6 py-3 font-medium">Description</th>
                  <th className="px-6 py-3 text-right font-medium">Montant</th>
                  <th className="px-6 py-3 font-medium">Statut</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {notes.map((note) => (
                  <tr key={note.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-6 py-3 whitespace-nowrap text-gray-500 dark:text-gray-400">
                      {formatDate(note.expenseDate)}
                    </td>
                    <td className="px-6 py-3">{note.description}</td>
                    <td className="px-6 py-3 text-right font-medium whitespace-nowrap">
                      {formatCurrency(note.amount)}
                    </td>
                    <td className="px-6 py-3">
                      <StatusBadge status={note.status} />
                    </td>
                    <td className="px-6 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleViewReceipt(note.id)}
                        className="text-sm font-medium text-brand-600 hover:underline"
                      >
                        Voir le reçu
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </main>
  )
}
