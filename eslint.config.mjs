import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Garde-fou d'architecture hexagonale (docs/adr/0002-architecture-hexagonale.md) :
// les dépendances pointent vers le domaine. Une violation fait échouer
// `npm run lint`, donc la CI.
const DOMAIN_IS_PURE = {
  files: ["src/domain/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            regex: "^(?!\\./|@/domain/)",
            message:
              "Le domaine est pur : il n'importe que d'autres fichiers du domaine (ni framework, ni bibliothèque, ni infrastructure).",
          },
        ],
      },
    ],
  },
};

const APPLICATION_DEPENDS_ON_PORTS = {
  files: ["src/application/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: [
              "@/infrastructure/*",
              "@/interface/*",
              "@/app/*",
              "@/lib/*",
              "@/components/*",
              "@/composition",
              "**/infrastructure/**",
              "**/interface/**",
            ],
            message:
              "La couche application ne connaît que le domaine et ses ports : passez par une interface de `application/ports/`.",
          },
          {
            group: [
              "next", "next/*", "next-auth", "next-auth/*", "pg", "@aws-sdk/*", "tesseract.js", "react",
              "@opentelemetry/*", "pino",
            ],
            message:
              "La couche application ne dépend d'aucun framework ni driver : l'implémentation va dans `infrastructure/`.",
          },
        ],
      },
    ],
  },
};

// Observabilité (docs/adr/0011-observabilite.md) : tout le code passe par le logger
// structuré (`src/lib/logger.ts`), qui ajoute trace_id et correlation_id et
// masque les secrets. Un `console.*` échapperait aux deux.
const NO_CONSOLE_IN_SERVER_CODE = {
  files: ["src/**/*.{ts,tsx}"],
  rules: { "no-console": "error" },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  DOMAIN_IS_PURE,
  APPLICATION_DEPENDS_ON_PORTS,
  NO_CONSOLE_IN_SERVER_CODE,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Rapport généré par `npm run test:coverage`.
    "coverage/**",
  ]),
]);

export default eslintConfig;
