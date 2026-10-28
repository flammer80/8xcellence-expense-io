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
    // Couverture (`npm run test:coverage`, docs/adr/0010-couverture-de-tests.md).
    // Mesurée sur tout `src/`, sauf ce qui relève de l'E2E ou ne contient
    // aucun code exécutable ; chaque exclusion est justifiée.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        // Pages et composants React : relèvent des tests E2E (navigateur).
        'src/app/**/page.tsx',
        'src/app/layout.tsx',
        'src/components/**',
        // Démarrage et câblage du framework, sans logique propre.
        'src/instrumentation.ts',
        'src/proxy.ts',
        'src/app/api/auth/**',
        // Fichiers de types uniquement (ports, contrats de messages, DTO).
        'src/application/ports/**',
        'src/application/messages.ts',
        'src/interface/http/dto.ts',
        'src/types/**',
        '**/*.d.ts',
        // Enveloppe fine du SDK AWS, simulée dans les tests d'intégration
        // (pas de S3 en CI) ; vérifiée sur LocalStack par `make dev`.
        'src/lib/storage.ts',
      ],
      reporter: ['text-summary', 'text', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
      // Seuils par couche : la CI échoue si l'une d'elles descend en dessous.
      // Calés sur la mesure du 2026-10-28, arrondis vers le bas.
      thresholds: {
        lines: 90,
        statements: 90,
        functions: 90,
        branches: 85,
        'src/domain/**': { lines: 100, statements: 100, functions: 100, branches: 95 },
        'src/application/**': { lines: 95, statements: 95, functions: 95, branches: 85 },
        'src/interface/**': { lines: 95, statements: 95, functions: 95, branches: 90 },
        'src/infrastructure/**': { lines: 95, statements: 95, functions: 90, branches: 85 },
      },
    },
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
