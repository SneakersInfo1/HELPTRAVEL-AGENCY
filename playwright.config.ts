import { defineConfig } from "@playwright/test";

/**
 * Konfiguracja E2E sekcji hotelowej.
 *
 * Serwer NIE jest podnoszony automatycznie: testy uderzają w żywe LiteAPI,
 * więc chcemy mieć świadomą kontrolę nad tym, kiedy się je uruchamia
 * (i na jakim kluczu). Odpal `pnpm dev` albo `pnpm start`, potem `pnpm e2e`.
 *
 * `workers: 1` — równoległe przebiegi wysycają limit zapytań LiteAPI
 * i zamieniają realne błędy w losowe.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts/,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
