'use client'

import { useCallback, useEffect, useState } from 'react'
import type { ApiResult } from './client'

/**
 * Charge une ressource de l'API au montage, puis à chaque `reload()`.
 *
 * L'état n'est modifié que dans la réponse asynchrone (`.then`), jamais de
 * façon synchrone dans l'effet : c'est ce qui rend inutile le
 * contournement de la règle `react-hooks/set-state-in-effect` des anciens composants.
 * Une réponse arrivée après le démontage, ou dépassée par un `reload()`, est
 * ignorée.
 *
 * @param load fonction stable (définie hors du composant ou mémoïsée).
 */
export function useApiResource<T>(load: () => Promise<ApiResult<T>>) {
  const [version, setVersion] = useState(0)
  const [state, setState] = useState<{ version: number; result: ApiResult<T> } | null>(null)

  useEffect(() => {
    let current = true
    load().then((result) => {
      if (current) setState({ version, result })
    })
    return () => {
      current = false
    }
  }, [load, version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  const result = state?.result

  return {
    data: result?.ok ? result.data : undefined,
    error: result && !result.ok ? result.message : null,
    /** Vrai jusqu'à la première réponse ; un rechargement garde les données affichées. */
    loading: state === null,
    reload,
  }
}
