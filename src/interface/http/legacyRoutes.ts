import { AlreadyDecidedError, ForbiddenError, NotFoundError } from '@/domain/errors'
import type { UserRole } from '@/domain/User'
import { respondError } from '@/lib/errors'

// Adaptateurs des anciennes routes /api/manager/* et /api/hr/*, conservées
// pour ne pas casser leurs consommateurs (CLAUDE.md §9, ADR 0004). Elles
// appellent les mêmes cas d'usage que le nouveau contrat, mais gardent leur
// format historique : `{ error }`, 401 côté manager, 403 côté RH.

/** Code historique renvoyé quand la session manque ou n'a pas le bon rôle. */
const WRONG_ROLE_STATUS: Record<'manager' | 'hr_admin', number> = { manager: 401, hr_admin: 403 }

export interface LegacySession {
  user: { id: string; role: UserRole }
}

export type RoleGuard = { ok: true; actorId: string } | { ok: false; response: Response }

/**
 * Vérifie que la session a le rôle attendu par la route. Ce contrôle ne sert
 * qu'à conserver les codes historiques : l'autorisation réelle est faite par
 * le cas d'usage, sur le rôle relu en base.
 */
export function requireRole(session: LegacySession | null, role: 'manager' | 'hr_admin'): RoleGuard {
  if (session?.user?.role === role) return { ok: true, actorId: session.user.id }
  return {
    ok: false,
    response: Response.json({ error: 'Unauthorized' }, { status: WRONG_ROLE_STATUS[role] }),
  }
}

/**
 * Erreur du domaine → réponse historique. Un refus d'autorisation reste un
 * 404, comme avant : ces routes n'ont jamais distingué « interdit » de
 * « introuvable ».
 */
export function legacyErrorResponse(error: unknown): Response {
  if (error instanceof NotFoundError || error instanceof ForbiddenError) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }
  if (error instanceof AlreadyDecidedError) {
    return Response.json({ error: 'Already decided' }, { status: 409 })
  }
  return respondError(error)
}

/**
 * Marque une réponse comme dépréciée (draft IETF `Deprecation`, RFC 8288
 * pour `Link`) en indiquant la route qui la remplace.
 */
export function deprecated(response: Response, successorPath: string): Response {
  const headers = new Headers(response.headers)
  headers.set('Deprecation', 'true')
  headers.set('Link', `<${successorPath}>; rel="successor-version"`)
  return new Response(response.body, { status: response.status, headers })
}
