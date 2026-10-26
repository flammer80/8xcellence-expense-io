'use client'

import { useState } from 'react'
import { formatCurrency, formatDate } from '@/utils/format'
import { api, openReceipt } from './api/client'
import { useApiResource } from './api/useApiResource'
import { Card, EmptyRow, ErrorAlert } from './ui'

/**
 * File de validation de l'utilisateur connecté (`GET /api/expense-notes/pending`) :
 * les notes que l'ApprovalPolicy l'autorise à trancher. Même composant pour
 * le manager (ses subordonnés directs) et le RH (managers racine, employés
 * sans manager, autres RH).
 */
export function PendingApprovalsPanel({ title, authorLabel }: { title: string; authorLabel: string }) {
  const pending = useApiResource(api.listPendingApprovals)
  const [actionError, setActionError] = useState<string | null>(null)
  const [decidingId, setDecidingId] = useState<string | null>(null)
  const notes = pending.data ?? []

  async function handleDecide(id: string, decision: 'approved' | 'rejected') {
    setDecidingId(id)
    setActionError(null)
    const result = await api.decide(id, { decision })
    setDecidingId(null)
    if (result.ok) pending.reload()
    else setActionError(result.message)
  }

  async function handleViewReceipt(id: string) {
    setActionError(null)
    setActionError(await openReceipt(id))
  }

  return (
    <Card title={`${title} (${notes.length})`}>
      <ErrorAlert message={actionError ?? pending.error} className="mx-6 mt-4" />
      {pending.loading ? (
        <EmptyRow>Chargement…</EmptyRow>
      ) : notes.length === 0 ? (
        <EmptyRow>Aucune note en attente.</EmptyRow>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:text-gray-400">
                <th className="px-6 py-3 font-medium">{authorLabel}</th>
                <th className="px-6 py-3 font-medium">Date</th>
                <th className="px-6 py-3 font-medium">Description</th>
                <th className="px-6 py-3 text-right font-medium">Montant</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {notes.map((note) => (
                <tr key={note.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-6 py-3 font-medium">{note.authorName}</td>
                  <td className="px-6 py-3 whitespace-nowrap text-gray-500 dark:text-gray-400">
                    {formatDate(note.expenseDate)}
                  </td>
                  <td className="px-6 py-3">{note.description}</td>
                  <td className="px-6 py-3 text-right font-medium whitespace-nowrap">{formatCurrency(note.amount)}</td>
                  <td className="px-6 py-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleViewReceipt(note.id)}
                      className="mr-3 text-sm font-medium text-brand-600 hover:underline"
                    >
                      Voir le reçu
                    </button>
                    <button
                      type="button"
                      disabled={decidingId === note.id}
                      onClick={() => handleDecide(note.id, 'approved')}
                      className="mr-3 text-sm font-medium text-green-600 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Approuver
                    </button>
                    <button
                      type="button"
                      disabled={decidingId === note.id}
                      onClick={() => handleDecide(note.id, 'rejected')}
                      className="text-sm font-medium text-red-600 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Rejeter
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
