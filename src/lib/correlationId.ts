// Règle d'acceptation d'un id de corrélation fourni par le client, partagée
// par `proxy.ts` et `withCorrelationId` (sans dépendance Node).

/** Court et sans caractère exotique : un id fourni n'est repris qu'à ces conditions. */
const ACCEPTABLE_ID = /^[A-Za-z0-9._-]{8,64}$/

/** L'id fourni s'il est acceptable, sinon un nouvel UUID. */
export function correlationIdFrom(provided: string | null): string {
  return provided && ACCEPTABLE_ID.test(provided) ? provided : crypto.randomUUID()
}
