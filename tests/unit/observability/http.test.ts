import { Pool } from 'pg'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { GET as live } from '@/app/api/health/live/route'
import { routeTemplate, traced } from '@/interface/http/correlation'
import { readinessResponse } from '@/interface/http/health'
import { logger } from '@/lib/logger'

// ADR 0011 : sondes de santé, et ce que `traced()` ajoute à chaque route.

describe('traced()', () => {
  it('ramène une URL à son modèle de route : peu de séries de métriques, aucun identifiant', () => {
    expect(routeTemplate('http://localhost/api/expense-notes/0b6f3c1e-8d2a-4e8b-9c41-6f0e2d7a5b13/decision?x=1')).toBe(
      '/api/expense-notes/{id}/decision'
    )
    expect(routeTemplate('/api/expense-notes')).toBe('/api/expense-notes')
  })

  it('renvoie l’id de corrélation reçu, ou en génère un', async () => {
    const handler = traced(async () => Response.json({ ok: true }))

    const provided = await handler(new Request('http://localhost/api/x', { headers: { 'X-Correlation-Id': 'corr-1234-abcd' } }))
    const generated = await handler()

    expect(provided.headers.get('X-Correlation-Id')).toBe('corr-1234-abcd')
    expect(generated.headers.get('X-Correlation-Id')).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('journalise un 403 comme événement de sécurité, avec la route mais sans identifiant', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    const handler = traced(async () => new Response(null, { status: 403 }))

    await handler(new Request('http://localhost/api/expense-notes/0b6f3c1e-8d2a-4e8b-9c41-6f0e2d7a5b13/decision', { method: 'POST' }))

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ security: true, event: 'forbidden', route: '/api/expense-notes/{id}/decision', method: 'POST' }),
      'forbidden'
    )
    warn.mockRestore()
  })
})

describe('GET /api/health/live', () => {
  it('répond 200 sans toucher aux dépendances', async () => {
    const response = live()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok' })
  })
})

describe('GET /api/health/ready', () => {
  const up = async () => {}

  it('répond 200 quand Postgres et le stockage répondent', async () => {
    const response = await readinessResponse({ postgres: up, storage: up })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ready', checks: { postgres: 'up', storage: 'up' } })
  })

  describe('Postgres arrêté', () => {
    // Un vrai client `pg` vers un port où rien n'écoute : la connexion est refusée.
    const deadPool = new Pool({ connectionString: 'postgres://expense:x@127.0.0.1:1/expense_io', connectionTimeoutMillis: 500 })
    afterAll(() => deadPool.end())

    it('répond 503 en RFC 9457, sans hôte ni message d’erreur', async () => {
      const response = await readinessResponse({ postgres: () => deadPool.query('SELECT 1'), storage: up })

      expect(response.status).toBe(503)
      expect(response.headers.get('Content-Type')).toBe('application/problem+json')
      const body = await response.json()
      expect(body).toMatchObject({ status: 503, title: 'Service indisponible', checks: { postgres: 'down', storage: 'up' } })
      expect(JSON.stringify(body)).not.toMatch(/127\.0\.0\.1|ECONNREFUSED/)
    })
  })

  it('une dépendance qui ne répond pas à temps est considérée indisponible', async () => {
    const hanging = (signal: AbortSignal) =>
      new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))))

    const response = await readinessResponse({ postgres: up, storage: hanging }, 20)

    expect(response.status).toBe(503)
    expect((await response.json()).checks).toEqual({ postgres: 'up', storage: 'down' })
  })
})
