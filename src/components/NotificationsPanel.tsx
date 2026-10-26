'use client'

import { useEffect, useState } from 'react'

interface Notification {
  id: string
  noteDescription: string
  decision: 'approved' | 'rejected'
  rejectionReason: string | null
  createdAt: string
}

const dateTimeFormatter = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })

/**
 * Notifications de l'utilisateur : décisions prises sur ses notes, écrites
 * par le worker de l'outbox (ADR 0007). Rien n'est affiché s'il n'y en a pas.
 */
export function NotificationsPanel() {
  const [notifications, setNotifications] = useState<Notification[]>([])

  useEffect(() => {
    let cancelled = false
    fetch('/api/notifications')
      .then((response) => (response.ok ? response.json() : []))
      .then((items: Notification[]) => {
        if (!cancelled) setNotifications(items)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  if (notifications.length === 0) return null

  return (
    <section
      aria-label="Notifications"
      className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900"
    >
      <h2 className="border-b border-gray-200 px-6 py-4 text-base font-semibold dark:border-gray-800">
        Notifications
      </h2>
      <ul className="divide-y divide-gray-100 dark:divide-gray-800">
        {notifications.map((n) => (
          <li key={n.id} className="flex flex-col gap-0.5 px-6 py-3 text-sm">
            <span>
              Ta note « {n.noteDescription} » a été{' '}
              <strong>{n.decision === 'approved' ? 'approuvée' : 'rejetée'}</strong>
              {n.rejectionReason ? ` : ${n.rejectionReason}` : '.'}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {dateTimeFormatter.format(new Date(n.createdAt))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
