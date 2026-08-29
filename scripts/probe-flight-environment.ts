// Sonda ŚRODOWISKA lotów — odpowiada na pytanie „czy da się przejechać pełne
// E2E bez prawdziwych pieniędzy i prawdziwego biletu", faktami zamiast domysłem.
//
// WYŁĄCZNIE ODCZYT. Woła `POST /flights/rates` (wyszukiwanie — nie blokuje
// taryfy, nie tworzy prebooka, nie dotyka płatności) i czyta konfigurację
// kluczy. NIE robi prebooka ani bookingu.
//
// Uruchomienie: pnpm probe:flight-env

import { getEnv } from "@/lib/liteapi/client";
import { getLiteApiWidgetEnv } from "@/lib/liteapi/widget-env";
import { searchFlightRates } from "@/lib/flights/client";
import { normalizeRatesResponse } from "@/lib/flights/display";
import { FlightSearchInputSchema } from "@/lib/flights/types";

function mask(v: string | null | undefined): string {
  if (!v) return "(brak)";
  return `${v.slice(0, 9)}…${v.slice(-3)} (${v.length} zn.)`;
}

function inDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

async function main() {
  console.log("=== KLUCZE I TRYB ===");
  const env = getEnv();
  console.log(`LITEAPI_ENV                 = ${process.env.LITEAPI_ENV ?? "(brak)"}`);
  console.log(`apiBase                     = ${env.apiBase}`);
  console.log(`rozwiązany tryb (prefiks)   = ${env.mode}`);
  console.log(`klucz publiczny             = ${mask(env.publicKey)}`);
  console.log(`klucz prywatny              = ${mask(env.privateKey)}`);
  console.log(`LITEAPI_SANDBOX_KEY         = ${process.env.LITEAPI_SANDBOX_KEY ? "USTAWIONY" : "BRAK"}`);
  console.log(`LITEAPI_SANDBOX_PRIVATE_KEY = ${process.env.LITEAPI_SANDBOX_PRIVATE_KEY ? "USTAWIONY" : "BRAK"}`);
  console.log(`widget publicKey (Stripe)   = ${getLiteApiWidgetEnv()}  → Stripe ${getLiteApiWidgetEnv() === "live" ? "LIVE (PRAWDZIWE PIENIĄDZE)" : "TEST"}`);
  console.log(`kill-switch lotów           = ${process.env.FLIGHTS_FLOW_MODE ?? "(brak zmiennej)"}`);

  console.log("\n=== SONDA READ-ONLY: /flights/rates ===");
  const input = FlightSearchInputSchema.parse({
    legs: [
      { origin: "WAW", destination: "BCN", date: inDays(30), direction: "OUTBOUND" },
      { origin: "BCN", destination: "WAW", date: inDays(37), direction: "INBOUND" },
    ],
    adults: 1,
  });
  const t0 = Date.now();
  try {
    const res = await searchFlightRates(input);
    const ms = Date.now() - t0;
    const offers = normalizeRatesResponse(res);
    const prices = offers.map((o) => o.total).filter((p): p is number => typeof p === "number");
    prices.sort((a, b) => a - b);
    console.log(`HTTP 200 w ${ms} ms`);
    console.log(`ofert (znormalizowanych)  = ${offers.length}`);
    console.log(`najtańsza / mediana / max = ${prices[0] ?? "—"} / ${prices[Math.floor(prices.length / 2)] ?? "—"} / ${prices[prices.length - 1] ?? "—"} PLN`);
    // Flaga `sandbox` z odpowiedzi dostawcy — jeśli w ogóle ją zwraca dla rates.
    const sandboxFlag = JSON.stringify(res).match(/"sandbox"\s*:\s*(true|false)/)?.[1];
    console.log(`flaga "sandbox" w odpowiedzi = ${sandboxFlag ?? "(nie występuje)"}`);
    const cheapest = offers.find((o) => o.total === prices[0]);
    if (cheapest) {
      const leg = cheapest.legs[0];
      console.log(`najtańsza trasa: ${leg.originCode}→${leg.destinationCode} ${leg.carriers.join("/")} ${prices[0]} PLN, przesiadek ${leg.stops}`);
    }
  } catch (err) {
    console.log(`BŁĄD: ${err instanceof Error ? err.message : String(err)}`);
  }

  console.log("\n=== WNIOSEK ===");
  const live = getLiteApiWidgetEnv() === "live";
  const hasSandbox = Boolean(process.env.LITEAPI_SANDBOX_KEY || process.env.LITEAPI_SANDBOX_PRIVATE_KEY);
  console.log(
    live && !hasSandbox
      ? "PEŁNE E2E BEZ PRAWDZIWYCH PIENIĘDZY NIE JEST MOŻLIWE tym zestawem kluczy:\n" +
          "widget montuje się w Stripe LIVE, a rezerwacja idzie na inwentarz produkcyjny.\n" +
          "Żeby to zmienić, potrzebny jest klucz `sand_` w LITEAPI_SANDBOX_KEY."
      : "Sandbox jest skonfigurowany — sprawdź, czy /flights/* akceptuje klucz `sand_`.",
  );
}

void main();
