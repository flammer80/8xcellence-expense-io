import type { Notification, NotificationPort } from './ports/NotificationPort'

/** Nombre de notifications renvoyées, les plus récentes d'abord. */
export const NOTIFICATIONS_PAGE_SIZE = 20

/**
 * Cas d'usage : un utilisateur consulte ses notifications (décisions sur ses
 * notes). Erreurs : aucune ; une liste vide s'il n'en a pas.
 */
export class ListMyNotifications {
  constructor(private readonly notifications: NotificationPort) {}

  execute({ actorId }: { actorId: string }): Promise<Notification[]> {
    return this.notifications.listRecent(actorId, NOTIFICATIONS_PAGE_SIZE)
  }
}
