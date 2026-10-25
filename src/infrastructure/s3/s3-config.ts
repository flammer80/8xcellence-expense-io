import type { S3ClientConfig } from '@aws-sdk/client-s3'

// Seule lecture de la configuration S3, partagée par l'application et par
// les scripts `scripts/ensure-bucket.mjs` et `scripts/seed.mjs` (ARC-03).
// Ces scripts l'importent directement avec Node (suppression des types) :
// ce fichier ne doit donc contenir que de la syntaxe TypeScript effaçable
// (pas d'`enum`, pas d'alias `@/…`, imports de types en `import type`).

type Env = Record<string, string | undefined>

/** Options du client S3, lues depuis `S3_ENDPOINT`, `S3_REGION`, `S3_FORCE_PATH_STYLE` et les clés d'accès. */
export function s3ClientConfigFromEnv(env: Env = process.env): S3ClientConfig {
  return {
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION ?? 'us-east-1',
    // LocalStack exige le style « chemin » ; seul `false` le désactive.
    forcePathStyle: env.S3_FORCE_PATH_STYLE !== 'false',
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID ?? '',
      secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? '',
    },
  }
}

/** Nom du bucket des reçus (`S3_BUCKET`, `receipts` par défaut). */
export function s3BucketFromEnv(env: Env = process.env): string {
  return env.S3_BUCKET ?? 'receipts'
}
