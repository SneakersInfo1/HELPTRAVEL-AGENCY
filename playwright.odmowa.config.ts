import { defineConfig } from "@playwright/test";

import base from "./playwright.config";

/**
 * E2E „odmowa prebooku → powrót do hotelu” na ATRAPACH LiteAPI i Upstash.
 * W przeciwieństwie do głównej konfiguracji sama podnosi serwery, bo nic tu nie
 * dotyka prawdziwego dostawcy ani produkcyjnego Redisa.
 *
 *   pnpm build && pnpm e2e:odmowa
 *
 * Zmienne procesu wygrywają z `.env.local`, więc klucze produkcyjne z tego pliku
 * nie mają jak trafić do prawdziwych usług.
 */
const FAKE_LITEAPI_PORT = 8798;
const FAKE_UPSTASH_PORT = 8799;
const APP_PORT = 3111;

process.env.E2E_FAKE_LITEAPI = `http://127.0.0.1:${FAKE_LITEAPI_PORT}`;

export default defineConfig({
  ...base,
  testMatch: /rezerwacja-odmowa-cache\.spec\.ts/,
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
    {
      command: `pnpm exec next start -p ${APP_PORT}`,
      port: APP_PORT,
      timeout: 60_000,
      env: {
        LITEAPI_BASE_URL: `http://127.0.0.1:${FAKE_LITEAPI_PORT}/v3.0`,
        LITEAPI_BOOK_BASE_URL: `http://127.0.0.1:${FAKE_LITEAPI_PORT}/v3.0`,
        UPSTASH_REDIS_REST_URL: `http://127.0.0.1:${FAKE_UPSTASH_PORT}`,
        UPSTASH_REDIS_REST_TOKEN: "mock-token",
        BOOKING_FLOW_MODE: "live",
      },
    },
  ],
});
