'use client'

import { formatDateTime } from '@/utils/format'
import { api } from './api/client'
import { useApiResource } from './api/useApiResource'
import { Card } from './ui'

/**
 * Notifications de l'utilisateur : décisions prises sur ses notes, écrites
 * par le worker de l'outbox (ADR 0007). Rien n'est affiché s'il n'y en a pas.
 */
export function NotificationsPanel() {
  const notifications = useApiResource(api.listNotifications).data ?? []
  if (notifications.length === 0) return null

  return (
    <Card title="Notifications">
      <ul aria-label="Notifications" className="divide-y divide-gray-100 dark:divide-gray-800">
        {notifications.map((n) => (
          <li key={n.id} className="flex flex-col gap-0.5 px-6 py-3 text-sm">
            <span>
              Ta note « {n.noteDescription} » a été{' '}
              <strong>{n.decision === 'approved' ? 'approuvée' : 'rejetée'}</strong>
              {n.rejectionReason ? ` : ${n.rejectionReason}` : '.'}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">{formatDateTime(n.createdAt)}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
