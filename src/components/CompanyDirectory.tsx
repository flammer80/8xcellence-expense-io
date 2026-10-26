'use client'

import { useState } from 'react'
import { api } from './api/client'
import { useApiResource } from './api/useApiResource'
import { Card, EmptyRow, ErrorAlert } from './ui'

const selectClass =
  'rounded-md border border-gray-300 px-2 py-1.5 text-sm shadow-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-gray-700 dark:bg-gray-900 dark:focus:ring-brand-900'

/**
 * Organigramme de l'entreprise (`GET /api/users`) : le RH y rattache chaque
 * employé ou manager à son manager (`PUT /api/users/{id}/manager`). Les
 * refus (autre entreprise, cycle) viennent du serveur, en 422.
 */
export function CompanyDirectory() {
  const directory = useApiResource(api.listCompanyUsers)
  const [actionError, setActionError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const users = directory.data ?? []
  const managers = users.filter((user) => user.role === 'manager')

  async function handleManagerChange(userId: string, managerId: string) {
    setSavingId(userId)
    setActionError(null)
    const result = await api.assignManager(userId, { managerId: managerId === '' ? null : managerId })
    setSavingId(null)
    if (result.ok) directory.reload()
    else setActionError(result.message)
  }

  return (
    <Card title={`Organigramme (${users.length})`}>
      <ErrorAlert message={actionError ?? directory.error} className="mx-6 mt-4" />
      {directory.loading ? (
        <EmptyRow>Chargement…</EmptyRow>
      ) : users.length === 0 ? (
        <EmptyRow>Aucun employé ou manager dans cette entreprise.</EmptyRow>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:text-gray-400">
                <th className="px-6 py-3 font-medium">Nom</th>
                <th className="px-6 py-3 font-medium">Rôle</th>
                <th className="px-6 py-3 font-medium">Manager</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-6 py-3">
                    <div className="font-medium">{user.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{user.email}</div>
                  </td>
                  <td className="px-6 py-3 capitalize">{user.role}</td>
                  <td className="px-6 py-3">
                    <select
                      value={user.managerId ?? ''}
                      disabled={savingId === user.id}
                      onChange={(event) => handleManagerChange(user.id, event.target.value)}
                      className={selectClass}
                    >
                      <option value="">— aucun (racine) —</option>
                      {managers
                        .filter((manager) => manager.id !== user.id)
                        .map((manager) => (
                          <option key={manager.id} value={manager.id}>
                            {manager.name}
                          </option>
                        ))}
                    </select>
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
