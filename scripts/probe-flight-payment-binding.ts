// Sonda WIĄZANIA PŁATNOŚCI — mierzy to, co dotąd było przyjęte przez analogię.
//
// ── PO CO ────────────────────────────────────────────────────────────────────
//
// `src/lib/flights/payment-evidence.ts` twierdzi, że `secretKey` z prebooka
// LOTÓW to Stripe client secret `pi_<id>_secret_<...>`, i na tym twierdzeniu
// stoi bramka `payment_intent_mismatch` (jedyny werdykt „rejected" wydawany
// bez udziału Stripe'a). Twierdzenie pochodziło z HOTELI — z analogii, nie
// z pomiaru na payloadzie lotniczym. Fałszywa analogia oznaczałaby odrzucanie
// prawidłowo opłaconych transakcji, czyli awarię gorszą od łatanej dziury.
//
// ── CO ROBI ──────────────────────────────────────────────────────────────────
//
//   1. `POST /flights/rates`      — wyszukanie (odczyt, nie blokuje niczego).
//   2. `POST /flights/offers/…`   — verify (odczyt).
//   3. `POST /flights/prebooks`   — JEDYNY krok tworzący coś u dostawcy:
//      lock taryfy + PaymentIntent. NIE OBCIĄŻA KARTY. Bez tego kroku nie da
//      się zobaczyć `secretKey`, a o niego całe pytanie.
//   4. `GET payment-wrapper.liteapi.travel/config` — publishable key Stripe'a
//      (dokładnie to, co robi widget w przeglądarce; odczyt).
//   5. `GET api.stripe.com/v1/payment_intents/{id}?client_secret=…` — Stripe'owy
//      odczyt PaymentIntentu kluczem PUBLISHABLE. To ta sama para (publishable
//      key + client secret), którą posługuje się Payment Element, i jedyny
//      sposób potwierdzenia BEZ PŁACENIA, że client secret należy do
//      PaymentIntentu o tym właśnie identyfikatorze i na tę właśnie kwotę.
//
// NIE WOŁA `POST /flights/bookings`. Nie potwierdza płatności. Nie dotyka karty.
//
// ── HIGIENA SEKRETÓW ─────────────────────────────────────────────────────────
//
// Nie wypisuje `secretKey`, publishable key ani pełnego `client_secret`.
// Identyfikator `pi_…` jest identyfikatorem, nie sekretem (Stripe dokleja go
// jawnie do adresu powrotu), ale i tak pokazujemy go skróconego.
//
// Uruchomienie z worktree:  pnpm probe:flight-binding
// Zmienne: PROBE_ORIGIN / PROBE_DEST / PROBE_DAYS / PROBE_REPEAT (domyślnie 2)

import { getEnv } from "@/lib/liteapi/client";
import { getLiteApiWidgetEnv } from "@/lib/liteapi/widget-env";
import { prebookFlight, searchFlightRates, verifyFlightOffer, extractVerifiedTotal } from "@/lib/flights/client";
import { normalizeRatesResponse } from "@/lib/flights/display";
import { paymentIntentIdFromSecret } from "@/lib/flights/payment-evidence";
import { FlightSearchInputSchema } from "@/lib/flights/types";

const ORIGIN = process.env.PROBE_ORIGIN ?? "WAW";
const DEST = process.env.PROBE_DEST ?? "BCN";
const DAYS = Number(process.env.PROBE_DAYS ?? 30);
const REPEAT = Math.max(1, Math.min(4, Number(process.env.PROBE_REPEAT ?? 2)));

/** Kształt Stripe'owego client secret PaymentIntentu. */
const STRIPE_CLIENT_SECRET = /^pi_[A-Za-z0-9]+_secret_[A-Za-z0-9]+$/;

function inDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/** `pi_3Ab…XyZ` — tyle, żeby dwa identyfikatory dało się porównać wzrokiem. */
function shortId(id: string | undefined): string {
  if (!id) return "(brak)";
  return id.length <= 12 ? id : `${id.slice(0, 6)}…${id.slice(-4)}`;
}

interface Measurement {
  attempt: number;
  offerId: string;
  verifiedTotal?: number;
  verifiedCurrency?: string;
  prebookPrice?: number;
  prebookCurrency?: string;
  secretKeyPresent: boolean;
  secretKeyLength: number;
  stripeClientSecretShape: boolean;
  paymentIntentExtracted: boolean;
  paymentIntentPrefix: string;
  paymentIntentIdShort: string;
  /** Z odczytu Stripe'a: czy `id` PaymentIntentu == to, co wyliczyliśmy z secretKey. */
  bindingMatch: boolean | null;
  stripeAmount?: number;
  stripeCurrency?: string;
  stripeStatus?: string;
  stripeReadError?: string;
  sandboxFlag?: boolean;
  paymentTypes?: string[];
  stripeProvider?: string;
}

/**
 * Publishable key Stripe'a — dokładnie tak, jak pobiera go widget.
 *
 * Kontrakt odczytany z `payment-wrapper.liteapi.travel/dist/liteAPIPayment.js`
 * (metoda `getConfig`): POST z `{publicKey: "live"|"sandbox"}`, odpowiedź niesie
 * `provider` i `publicKey` (`pk_live_…`). Endpoint nieudokumentowany — dlatego
 * żyje TYLKO w sondzie, nigdy na ścieżce krytycznej.
 */
async function fetchWidgetConfig(
  env: "live" | "sandbox",
): Promise<{ publishableKey: string | null; providerName?: string }> {
  try {
    const res = await fetch("https://payment-wrapper.liteapi.travel/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publicKey: env }),
    });
    if (!res.ok) return { publishableKey: null };
    const json = (await res.json()) as { publicKey?: unknown; provider?: { name?: unknown } };
    return {
      publishableKey: findPublishableKey(json.publicKey),
      providerName: typeof json.provider?.name === "string" ? json.provider.name : undefined,
    };
  } catch {
    return { publishableKey: null };
  }
}

function findPublishableKey(node: unknown): string | null {
  if (typeof node === "string") return /^pk_(test|live)_[A-Za-z0-9]+$/.test(node) ? node : null;
  if (Array.isArray(node)) {
    for (const v of node) {
      const f = findPublishableKey(v);
      if (f) return f;
    }
    return null;
  }
  if (node && typeof node === "object") {
    for (const v of Object.values(node)) {
      const f = findPublishableKey(v);
      if (f) return f;
    }
  }
  return null;
}

/**
 * Odczyt PaymentIntentu kluczem publishable — to, co robi Stripe.js.
 * Zwraca `id`, `status`, `amount`, `currency`. Nie potwierdza płatności.
 */
async function readPaymentIntent(
  clientSecret: string,
  publishableKey: string,
): Promise<{ id?: string; status?: string; amount?: number; currency?: string; error?: string }> {
  const id = clientSecret.slice(0, clientSecret.indexOf("_secret_"));
  const url = `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(id)}?client_secret=${encodeURIComponent(clientSecret)}`;
  try {
    const res = await fetch(url, { headers: { authorization: `Bearer ${publishableKey}` } });
    const json = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      const err = json.error as { message?: string; code?: string } | undefined;
      return { error: `HTTP ${res.status} ${err?.code ?? ""} ${err?.message ?? ""}`.trim() };
    }
    return {
      id: typeof json.id === "string" ? json.id : undefined,
      status: typeof json.status === "string" ? json.status : undefined,
      amount: typeof json.amount === "number" ? json.amount : undefined,
      currency: typeof json.currency === "string" ? json.currency : undefined,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// LiteAPI ODRZUCA nazwiska wyglądające na testowe (kod 53099: „appears to be a
// placeholder/test name", „cannot contain numbers"). Sonda musi więc podać
// nazwiska wyglądające zwyczajnie — poniższe są fikcyjne i nie należą do
// nikogo z zespołu. Prebook nie wystawia biletu, więc nie powstaje żaden
// dokument na te dane.
const SURNAMES = ["Kowalczyk", "Nowicki", "Zielinski", "Wojciechowski"];

function passengersFor(count: number, attempt: number) {
  return Array.from({ length: count }, (_, i) => ({
    title: "MR" as const,
    firstName: "Jan",
    lastName: SURNAMES[(attempt + i) % SURNAMES.length]!,
    birthday: "1990-01-01",
    gender: "M" as const,
    nationality: "PL",
    type: "ADT" as const,
    documentType: "passport" as const,
    documentNumber: `AB${100000 + attempt * 10 + i}`,
    documentExpiry: inDays(365 * 5).slice(0, 10),
    documentIssueCountry: "PL",
  }));
}

async function measure(attempt: number, offerIndex: number): Promise<Measurement | null> {
  const input = FlightSearchInputSchema.parse({
    legs: [
      { origin: ORIGIN, destination: DEST, date: inDays(DAYS), direction: "OUTBOUND" },
      { origin: DEST, destination: ORIGIN, date: inDays(DAYS + 7), direction: "INBOUND" },
    ],
    adults: 1,
  });

  const rates = await searchFlightRates(input);
  const offers = normalizeRatesResponse(rates);
  if (!offers.length) {
    console.log(`  [${attempt}] brak ofert — pomijam`);
    return null;
  }
  const sorted = [...offers].sort((a, b) => (a.total ?? Infinity) - (b.total ?? Infinity));
  const offer = sorted[Math.min(offerIndex, sorted.length - 1)];
  if (!offer) return null;

  let verifiedTotal: number | undefined;
  let verifiedCurrency: string | undefined;
  try {
    const v = await verifyFlightOffer(offer.offerId);
    const extracted = extractVerifiedTotal(v);
    verifiedTotal = extracted.total;
    verifiedCurrency = extracted.currency;
  } catch (e) {
    console.log(`  [${attempt}] verify nieudany: ${e instanceof Error ? e.message : String(e)}`);
  }

  const pre = await prebookFlight({
    offerId: offer.offerId,
    contact: {
      firstName: "Jan",
      lastName: SURNAMES[attempt % SURNAMES.length]!,
      email: "rezerwacje@helptravel.pl",
      phoneNumber: "500100200",
      phoneCountryCode: "48",
    },
    passengers: passengersFor(1, attempt),
  });

  const secretKey = pre.secretKey ?? "";
  const shape = STRIPE_CLIENT_SECRET.test(secretKey);
  const piId = paymentIntentIdFromSecret(secretKey);

  const m: Measurement = {
    attempt,
    offerId: offer.offerId,
    verifiedTotal,
    verifiedCurrency,
    prebookPrice: pre.price,
    prebookCurrency: pre.currency,
    secretKeyPresent: Boolean(secretKey),
    secretKeyLength: secretKey.length,
    stripeClientSecretShape: shape,
    paymentIntentExtracted: Boolean(piId),
    paymentIntentPrefix: piId ? piId.slice(0, 3) : secretKey.slice(0, 3),
    paymentIntentIdShort: shortId(piId),
    bindingMatch: null,
    sandboxFlag: pre.sandbox,
    paymentTypes: pre.paymentTypes as string[] | undefined,
  };

  if (shape && piId) {
    const cfg = await fetchWidgetConfig(getLiteApiWidgetEnv());
    m.stripeProvider = cfg.providerName;
    if (!cfg.publishableKey) {
      m.stripeReadError = "nie udało się pobrać publishable key z payment-wrapper";
    } else {
      const pi = await readPaymentIntent(secretKey, cfg.publishableKey);
      if (pi.error) m.stripeReadError = pi.error;
      m.stripeAmount = pi.amount;
      m.stripeCurrency = pi.currency?.toUpperCase();
      m.stripeStatus = pi.status;
      if (pi.id) m.bindingMatch = pi.id === piId;
    }
  }
  return m;
}

function report(m: Measurement) {
  console.log(`
  ── pomiar #${m.attempt} ──────────────────────────────────────────────`);
  console.log(`  secretKeyPresent          = ${m.secretKeyPresent}`);
  console.log(`  secretKeyLength           = ${m.secretKeyLength}`);
  console.log(`  stripeClientSecretShape   = ${m.stripeClientSecretShape}`);
  console.log(`  paymentIntentExtracted    = ${m.paymentIntentExtracted}`);
  console.log(`  paymentIntentPrefix       = ${m.paymentIntentPrefix}`);
  console.log(`  paymentIntentId (skrót)   = ${m.paymentIntentIdShort}`);
  console.log(`  bindingMatch              = ${m.bindingMatch === null ? "(nie zmierzono)" : m.bindingMatch}`);
  if (m.stripeReadError) console.log(`  stripeReadError           = ${m.stripeReadError}`);
  console.log(`  stripeStatus              = ${m.stripeStatus ?? "—"}`);
  console.log(`  stripeProvider (konto)    = ${m.stripeProvider ?? "—"}`);
  console.log(`  verify / prebook / Stripe = ${m.verifiedTotal ?? "—"} ${m.verifiedCurrency ?? ""} / ${m.prebookPrice ?? "—"} ${m.prebookCurrency ?? ""} / ${m.stripeAmount !== undefined ? (m.stripeAmount / 100).toFixed(2) : "—"} ${m.stripeCurrency ?? ""}`);
  console.log(`  sandbox (flaga dostawcy)  = ${m.sandboxFlag ?? "(brak pola)"}`);
  console.log(`  paymentTypes              = ${JSON.stringify(m.paymentTypes ?? null)}`);
}

async function main() {
  const env = getEnv();
  console.log("=== ŚRODOWISKO ===");
  console.log(`tryb klucza LiteAPI = ${env.mode}`);
  console.log(`widget env (Stripe) = ${getLiteApiWidgetEnv()}`);
  console.log(`trasa               = ${ORIGIN}→${DEST} (+${DAYS} dni, powrót +${DAYS + 7})`);
  console.log(`powtórzeń           = ${REPEAT}`);
  console.log(`
UWAGA: prebook tworzy lock taryfy i PaymentIntent u dostawcy. NIE obciąża karty.
Ten skrypt NIGDY nie woła POST /flights/bookings ani nie potwierdza płatności.`);

  const results: Measurement[] = [];
  for (let i = 0; i < REPEAT; i += 1) {
    try {
      // Różne oferty (najtańsza, druga, …) — inny przewoźnik, inny dostawca
      // taryfy. Tu właśnie ujawniłby się „inny format" secretKey, gdyby istniał.
      const m = await measure(i + 1, i);
      if (m) {
        results.push(m);
        report(m);
      }
    } catch (e) {
      const anyErr = e as { message?: string; code?: string; details?: unknown; body?: unknown };
      console.log(`  [${i + 1}] BŁĄD: ${anyErr.message ?? String(e)}`);
      console.log(`      code=${anyErr.code ?? "—"} details=${JSON.stringify(anyErr.details ?? anyErr.body ?? null).slice(0, 600)}`);
    }
  }

  console.log(`
=== WNIOSEK ===`);
  if (!results.length) {
    console.log("Brak pomiarów — nie da się nic orzec.");
    return;
  }
  const allShape = results.every((r) => r.stripeClientSecretShape);
  const allExtracted = results.every((r) => r.paymentIntentExtracted);
  const measuredBindings = results.filter((r) => r.bindingMatch !== null);
  const allBound = measuredBindings.length > 0 && measuredBindings.every((r) => r.bindingMatch === true);

  console.log(`pomiarów                       = ${results.length}`);
  console.log(`stripeClientSecretShape (all)  = ${allShape}`);
  console.log(`paymentIntentExtracted  (all)  = ${allExtracted}`);
  console.log(`bindingMatch potwierdzony      = ${allBound} (zmierzono ${measuredBindings.length}/${results.length})`);
  console.log(`długości secretKey             = ${JSON.stringify(results.map((r) => r.secretKeyLength))}`);

  const priceOk = results.every(
    (r) =>
      r.stripeAmount === undefined ||
      r.prebookPrice === undefined ||
      Math.abs(r.stripeAmount / 100 - r.prebookPrice) < 0.01,
  );
  console.log(`kwota prebook == kwota PI      = ${priceOk}`);

  console.log(
    allShape && allExtracted && allBound
      ? "\nWIĄZANIE POTWIERDZONE: secretKey lotów to Stripe client secret, a wyliczone\n" +
          "z niego `pi_…` jest identyfikatorem TEGO PaymentIntentu (odczyt ze Stripe'a)."
      : "\nWIĄZANIE NIEPOTWIERDZONE — bramka payment_intent_mismatch nie ma podstawy\n" +
          "empirycznej i musi zostać usunięta albo przebudowana przed produkcją.",
  );
}

void main();
