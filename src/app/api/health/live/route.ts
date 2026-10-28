// Sonde de vie (ADR 0011) : le process répond, sans toucher aux dépendances.
// Ni session, ni corrélation : appelée en boucle par l'orchestrateur.
export function GET(): Response {
  return Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } })
}
