import { defineConfig } from "@playwright/test";

import base from "./playwright.config";

/**
 * E2E wyszukiwarki lotów na ATRAPACH LiteAPI i Upstash, z dwoma procesami Nexta
 * na jednym magazynie, jak dwie instancje Vercela. Sama podnosi serwery, bo nic
 * tu nie dotyka prawdziwego dostawcy ani produkcyjnego Redisa.
 *
 *   pnpm build && pnpm e2e:loty
 *
 * Zmienne procesu wygrywają z `.env.local`, więc klucze produkcyjne z tego pliku
 * nie mają jak trafić do prawdziwych usług. Główna konfiguracja tych spec-ów nie
 * nadaje się do tego celu: `loty.spec.ts` idzie wtedy do żywego LiteAPI.
 */
const FAKE_LITEAPI_PORT = 8796;
const FAKE_UPSTASH_PORT = 8797;
const APP_PORT = 3112;
const SECOND_INSTANCE_PORT = 3113;

process.env.E2E_FAKE_LITEAPI = `http://127.0.0.1:${FAKE_LITEAPI_PORT}`;
process.env.E2E_FIRST_INSTANCE = `http://127.0.0.1:${APP_PORT}`;
process.env.E2E_SECOND_INSTANCE = `http://127.0.0.1:${SECOND_INSTANCE_PORT}`;

const appEnv = {
  LITEAPI_BASE_URL: `http://127.0.0.1:${FAKE_LITEAPI_PORT}/v3.0`,
  LITEAPI_BOOK_BASE_URL: `http://127.0.0.1:${FAKE_LITEAPI_PORT}/v3.0`,
  LITEAPI_ENV: "sandbox",
  LITEAPI_SANDBOX_KEY: "sand_e2e_atrapa",
  UPSTASH_REDIS_REST_URL: `http://127.0.0.1:${FAKE_UPSTASH_PORT}`,
  UPSTASH_REDIS_REST_TOKEN: "mock-token",
  FLIGHTS_FLOW_MODE: "live",
  // Wartości jawnie: test ma mierzyć produkcyjny odstęp, nie domyślną z lokalnego pliku.
  FLIGHTS_PROVIDER_CONCURRENCY: "1",
  FLIGHTS_PROVIDER_MIN_INTERVAL_MS: "1500",
  FLIGHTS_BACKGROUND_SEARCH: "off",
};

const instance = (port: number) => ({
  command: `pnpm exec next start -p ${port}`,
  port,
  timeout: 60_000,
  env: appEnv,
});

export default defineConfig({
  ...base,
  testMatch: /loty(-bledy|-mobile-stres|-limit-dostawcy|-dostawca-atrapa)?\.spec\.ts/,
  use: { ...base.use, baseURL: `http://127.0.0.1:${APP_PORT}` },
  webServer: [
    {
      command: `pnpm exec tsx scripts/e2e/fake-liteapi-server.ts --port ${FAKE_LITEAPI_PORT}`,
      port: FAKE_LITEAPI_PORT,
    },
    {
      command: `pnpm exec tsx scripts/redis/mock-upstash-server.ts --port ${FAKE_UPSTASH_PORT} --allow-ratelimit`,
      port: FAKE_UPSTASH_PORT,
    },
    instance(APP_PORT),
    instance(SECOND_INSTANCE_PORT),
  ],
});
