import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "**/.next/**",
    ".claude/**",
    ".vercel/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Katalog roboczy na jednorazowe skrypty diagnostyczne i zrzuty
    // Lighthouse'a. Nie jest częścią aplikacji, nie trafia do bundla i nie
    // jest wersjonowany — a wnosił kilkadziesiąt błędów lintu (`any`,
    // `require`), przez które `pnpm lint` nigdy nie mógł przejść na zielono.
    "tmp/**",
  ]),
]);

export default eslintConfig;
