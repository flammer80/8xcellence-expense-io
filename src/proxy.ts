import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { correlationIdFrom } from '@/lib/correlationId'

const PROTECTED_PREFIXES = ['/expenses', '/manager', '/hr']

/**
 * - Pages protégées : redirection vers `/login` sans session.
 * - Toutes les requêtes (pages, API, server actions) : un id de corrélation
 *   (`X-Correlation-Id`, repris du client s'il est acceptable, sinon généré)
 *   est posé sur la requête, que `traced()` et les logs reprennent, et
 *   renvoyé dans la réponse (ADR 0011).
 */
export default auth((req) => {
  const correlationId = correlationIdFrom(req.headers.get('x-correlation-id'))
  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    req.nextUrl.pathname.startsWith(prefix)
  )
  const response =
    isProtected && !req.auth
      ? NextResponse.redirect(new URL('/login', req.nextUrl))
      : NextResponse.next({ request: { headers: withHeader(req.headers, 'x-correlation-id', correlationId) } })
  response.headers.set('X-Correlation-Id', correlationId)
  return response
})

function withHeader(source: Headers, name: string, value: string): Headers {
  const headers = new Headers(source)
  headers.set(name, value)
  return headers
}

export const config = {
  matcher: [
    // Tout, sauf les assets et les sondes de santé (appelées en boucle).
    '/((?!api/health|_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)',
  ],
}
