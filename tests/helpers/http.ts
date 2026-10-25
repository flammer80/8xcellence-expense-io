import type { NextRequest } from 'next/server'

const BASE_URL = 'http://localhost:3000'

// Les route handlers ne lisent que `url`, `json()` et `formData()` : une
// Request standard suffit, typée en NextRequest pour les handlers qui
// l'annoncent.
export function request(path: string, init?: RequestInit): NextRequest {
  return new Request(`${BASE_URL}${path}`, init) as unknown as NextRequest
}

export function jsonRequest(path: string, method: string, body: unknown): NextRequest {
  return request(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function params<T extends Record<string, string>>(value: T) {
  return { params: Promise.resolve(value) }
}

/** Un PNG 1x1 valide, comme celui du seed. */
export function pngFile(name = 'receipt.png', type = 'image/png'): File {
  const bytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64'
  )
  return new File([bytes], name, { type })
}

export function noteForm(fields: Partial<Record<'amount' | 'expenseDate' | 'description', string>> & {
  receipt?: File | null
}): FormData {
  const form = new FormData()
  form.set('amount', fields.amount ?? '42.50')
  form.set('expenseDate', fields.expenseDate ?? '2026-10-20')
  form.set('description', fields.description ?? 'Taxi aéroport')
  if (fields.receipt !== null) form.set('receipt', fields.receipt ?? pngFile())
  return form
}
