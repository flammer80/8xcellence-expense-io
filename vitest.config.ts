import path from 'node:path'
import { defineConfig } from 'vitest/config'

// Deux familles de tests (voir docs/adr/0001-strategie-de-tests.md) :
// - unit : sans base de données, rapides ;
// - integration : route handlers appelés contre un vrai Postgres (base dédiée
//   `expense_io_test`), session et S3 simulés.
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    environment: 'node',
    // Les tests d'intégration partagent une seule base : les fichiers
    // s'exécutent l'un après l'autre (option globale, ignorée par projet).
    fileParallelism: false,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          // next-auth importe `next/server` sans extension, ce que la
          // résolution ESM de Node refuse : Vite doit le transformer.
          server: { deps: { inline: ['next-auth'] } },
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts', 'tests/security/**/*.test.ts'],
          globalSetup: ['tests/helpers/global-setup.ts'],
          setupFiles: ['tests/helpers/integration-setup.ts'],
        },
      },
    ],
  },
})
