# AI Concierge (czat wyjazdowy) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Konwersacyjny asystent po polsku: użytkownik pisze np. „kierunek z plażą do 3 tys. w sierpniu, lot + hotel", a bot dopytuje o brakujące szczegóły i zwraca **realną** najkorzystniejszą ofertę lot+hotel w budżecie jako jedną kartę z dwoma podglądami — klik w hotel → nasza strona hotelu, klik w lot → nasze wyniki lotów.

**Architecture:** LLM przez OpenRouter (ekonomiczny model) z **function-calling**. Model NIGDY nie wymyśla cen ani ofert — tylko rozmawia i wybiera, które NASZE narzędzia wywołać; wszystkie liczby pochodzą z realnych źródeł (snapshot `dstprice:v1` + live LiteAPI hotele/loty). Orkiestracja i klucz OpenRouter są server-side (`/api/concierge/chat`, streaming). UI to panel czatu (wzorzec `QuickSearchLauncher`) renderujący strumień + bogatą kartę oferty z handoffem do istniejących flow `/hotele/[hotelId]` i `/loty/wyniki`. Booking NIE dzieje się w czacie — czat to warstwa odkrywania.

**Tech Stack:** Next.js 16 (App Router, route handler Node runtime, streaming), OpenRouter Chat Completions API (tool-calling), Zod (walidacja tool-args + odpowiedzi), Upstash Redis (istniejący snapshot + cache tur), istniejące moduły: `destination-price-snapshot.ts`, `travel-moods.ts`, `lib/liteapi` (hotele), `lib/flights` (loty), `formatPLN`, `enforceRateLimit`, `ConsentProvider`.

---

## Kontekst i twarde zasady (przeczytaj przed kodem)

Z `PRODUCT.md` i historii projektu — **nienegocjowalne**:

1. **Zero zmyślonych liczb.** LLM nie generuje cen/dostępności. Każda kwota w odpowiedzi pochodzi z tool-resulta (snapshot lub live LiteAPI). System prompt tego zakazuje; dodatkowo walidujemy, że finalna karta oferty niesie realne identyfikatory (hotelId + flight offerId/params), nie „ładne liczby".
2. **Uczciwość budżetu.** „do 3k" jest wieloznaczne (na osobę? za dwoje? sam nocleg? lot+hotel?). Bot **dopytuje**, nie zgaduje. Domyślna interpretacja (po potwierdzeniu): **lot+hotel, na osobę, przy 2 os.** (spójne z `computePackagePerPerson`).
3. **Mobile-first (90% ruchu).** Panel czatu projektowany i weryfikowany na 375px PRZED zgłoszeniem.
4. **PL + PLN** wszędzie (UI, odpowiedzi modelu, ceny przez `formatPLN`).
5. **Handoff, nie booking-in-chat.** Klik w ofertę prowadzi do naszych istniejących, dopracowanych flow (marża, GA4, maile, płatność, auto-recovery lotów). Nie duplikujemy checkoutu w czacie.
6. **RODO.** Treść rozmowy idzie do OpenRouter (dostawca AI, poza EOG). Wymagana zgoda + jawna informacja („rozmowę przetwarza dostawca AI"). Gate jak przy analytics/marketing.
7. **Koszt pod kontrolą.** Ekonomiczny model + limit rund tool-calli + limit tokenów + rate-limit per IP + cache tur. Bez tego czat = otwarty portfel.

---

## Kluczowe decyzje (ZATWIERDZONE przez właściciela 2026-07-07)

| # | Decyzja | Ustalenie | Uzasadnienie |
|---|---------|-----------|--------------|
| D1 | Model OpenRouter | **Ekonomiczny.** Domyślnie `google/gemini-2.5-flash-lite` (env `OPENROUTER_MODEL`; zweryfikuj dokładną nazwę na liście OpenRouter w Fazie 0); do eval też `gemini-2.5-flash`, `gpt-4o-mini`. Sufit kosztu **≈ $50/mc** = próg alertu. | Zadanie modelu jest wąskie (rozmowa + wybór narzędzia + dopytanie; wszystkie liczby liczą narzędzia) → lekki/tani model wystarcza. Ostateczny wybór po eval (Faza 6). |
| D2 | Booking w czacie? | **Nie** — discovery + handoff do `/hotele/[hotelId]` i `/loty/wyniki` | Reużywa całe nasze flow (płatność/marża/maile/auto-recovery 52099), zero podwajania, zgodne z zasadami. |
| D3 | Źródło cen do shortlisty | **Snapshot `dstprice:v1`** (`pickFreshPackage`) → potem live-verify top 1–3 | Live-search wszystkich kierunków jest wolny/drogi. Snapshot daje realne „od" natychmiast; live tylko dla finalnej oferty. |
| D4 | Zakres kierunków | Kierunki z `TRAVEL_MOODS` + katalog `commercial-cities` | Mamy motywy (plaża/city break/słońce zimą…) i realne ceny tylko dla grzanych miast. |
| D5 | Skąd wylot | Dopytujemy; brak → domyślnie Warszawa (jak reszta serwisu), z jawną adnotacją | Ceny pakietów w snapshot liczone z WAW. |
| D6 | UI launchera | **Dokowany widget czatu (dymek, prawy-dolny róg), na KAŻDEJ podstronie** (także `/hotele/*`, `/loty/*`). Mobile: pełny ekran z możliwością **zminimalizowania** (rozmowa nie ginie). Desktop: panel ~20% szer. w prawym-dolnym. Ma **rzucać się w oczy** (akcent + subtelny puls + jednorazowy teaser-dymek) — bez fałszywej presji/liczników. | Wprost z decyzji właściciela. |

---

## File Structure

**Nowe:**
- `src/lib/concierge/types.ts` — typy domenowe (ConciergeIntent, TripCandidate, TripOffer, ChatMessage, tool I/O).
- `src/lib/concierge/trip-search.ts` — **czysta** logika: theme→kierunki, filtr budżetu, ranking. Serce uczciwości. (TDD)
- `src/lib/concierge/trip-search.test.ts` — testy trip-search.
- `src/lib/concierge/budget.ts` — **czyste** parsowanie/interpretacja budżetu + walidacja kompletności intencji. (TDD)
- `src/lib/concierge/budget.test.ts`.
- `src/lib/concierge/tools.ts` — definicje tool-schemas (dla OpenRouter) + serwerowe egzekutory (wrap trip-search + live-verify hotel/lot).
- `src/lib/concierge/openrouter.ts` — cienki klient OpenRouter (chat completions + tool-calling, streaming), server-only, klucz z env.
- `src/lib/concierge/system-prompt.ts` — polski system prompt + guardraile (zbudowany z stałych, testowalny na obecność zakazów).
- `src/lib/concierge/orchestrator.ts` — pętla: model ↔ tool-calle ↔ finalna odpowiedź; twarde limity (rundy/tokeny); mapowanie na strumień zdarzeń.
- `src/app/api/concierge/chat/route.ts` — route handler (Node, streaming, rate-limit, walidacja Zod).
- `src/components/concierge/concierge-launcher.tsx` — dymek + dokowany panel czatu (client): mobile pełny ekran z minimalizacją, desktop panel ~20% w prawym-dolnym; widoczny na KAŻDEJ podstronie; stany `bubble`/`expanded`/`minimized`; consent-gate; eye-catching (akcent + puls + teaser).
- `src/components/concierge/concierge-chat.tsx` — logika czatu (stan wiadomości, streaming fetch, wysyłka).
- `src/components/concierge/message-bubble.tsx` — render wiadomości (user/assistant + „myślę…").
- `src/components/concierge/trip-offer-card.tsx` — **karta oferty**: destynacja, rozbicie ceny (lot X + hotel Y = total ≤ budżet), dwa klikalne podglądy (hotel → `/hotele/[hotelId]`, lot → `/loty/wyniki`).
- `src/components/concierge/quick-replies.tsx` — chipy szybkich odpowiedzi na pytania bota (np. „Tylko ja / We dwoje / Rodzina").

**Modyfikowane:**
- `next.config.ts` — CSP `connect-src`: dodać `https://openrouter.ai` (fetch do API idzie z SERWERA, więc CSP przeglądarki tego nie dotyczy — ale nasz `/api/concierge/chat` fetchowany z klienta jest `'self'`, OK; dodać openrouter tylko jeśli kiedyś fetch z klienta — domyślnie NIE trzeba).
- `src/app/layout.tsx` — montaż `<ConciergeLauncher />` na każdej stronie. UWAGA: `QuickSearchLauncher` też siedzi w prawym-dolnym — na stronach treści dwa dymki by się nakładały; ustalić stacking (concierge = główny, prawy-dolny; quick-search wyżej) lub docelowo scalić. Patrz Faza 4.
- `.env.local` / Vercel — `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `NEXT_PUBLIC_SHOW_CONCIERGE`.
- `package.json` — dopisać nowe `*.test.ts` do skryptu `test`.

---

## FAZA 0 — Fundament: OpenRouter + koszt/limit

### Task 0.1: Klient OpenRouter (server-only)

**Files:**
- Create: `src/lib/concierge/openrouter.ts`
- Test: `src/lib/concierge/openrouter.test.ts`

- [ ] **Step 1: Test — brak klucza rzuca jasny błąd, nagłówki poprawne**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

test("openrouter: brak OPENROUTER_API_KEY → typowany błąd konfiguracji", async () => {
  const prev = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  try {
    const { chatCompletion } = await import("./openrouter");
    await assert.rejects(() => chatCompletion({ messages: [], tools: [] }), /OPENROUTER_API_KEY/);
  } finally {
    if (prev) process.env.OPENROUTER_API_KEY = prev;
  }
});
```

- [ ] **Step 2: Run → FAIL** (`node --import tsx --test src/lib/concierge/openrouter.test.ts`) — moduł nie istnieje.

- [ ] **Step 3: Implementacja** — `chatCompletion({messages, tools, stream})`:
  - Endpoint `https://openrouter.ai/api/v1/chat/completions`, nagłówki: `Authorization: Bearer ${OPENROUTER_API_KEY}`, `HTTP-Referer: https://helptravel.pl`, `X-Title: HelpTravel`, `Content-Type: application/json`.
  - Body: `{ model: process.env.OPENROUTER_MODEL ?? "google/gemini-2.5-flash-lite", messages, tools, tool_choice: "auto", temperature: 0.3, max_tokens: 700, stream }`. **Uwaga (zgodnie z wdrożeniem):** `tools`/`tool_choice` dołączaj TYLKO gdy `tools.length > 0` (część providerów odrzuca puste tablice narzędzi).
  - `AbortController` timeout 30s. Brak klucza → `throw new Error("OPENROUTER_API_KEY not configured")`.
  - Zwraca surową odpowiedź (non-stream) albo `ReadableStream` (stream). Zero logiki domenowej tutaj.

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Commit** — `feat(concierge): klient OpenRouter (server-only, tool-calling)`.

### Task 0.2: Limity kosztu/nadużyć (stałe + guard)

**Files:** Modify `src/lib/concierge/openrouter.ts` (dodać stałe) — użyte w orchestratorze (Faza 3).

- [ ] **Step 1:** Wyeksportuj stałe: `MAX_TOOL_ROUNDS = 4`, `MAX_HISTORY_MESSAGES = 20`, `MAX_INPUT_CHARS = 1500` (przycinamy user input), `MAX_TOKENS = 700`. Komentarz: to twarde bezpieczniki kosztu.
- [ ] **Step 2: Commit** — `chore(concierge): stałe limitów kosztu/nadużyć`.

---

## FAZA 1 — Silnik doboru wyjazdu (czysty, TDD) — SERCE UCZCIWOŚCI

### Task 1.1: Interpretacja budżetu i kompletności intencji

**Files:**
- Create: `src/lib/concierge/types.ts`, `src/lib/concierge/budget.ts`
- Test: `src/lib/concierge/budget.test.ts`

- [ ] **Step 1: Typy** (`types.ts`):

```ts
export type BudgetKind = "per_person" | "total_two"; // na osobę | za dwoje
export interface ConciergeIntent {
  theme?: string;          // slug motywu z TRAVEL_MOODS (np. "plaza")
  budgetPln?: number;      // kwota
  budgetKind?: BudgetKind; // interpretacja kwoty
  month?: number;          // 1–12
  origin?: string;         // IATA wylotu (domyślnie "WAW")
  adults?: number;
  children?: number;
  wantsFlight: boolean;    // domyślnie true dla „lot + hotel"
  wantsHotel: boolean;
}
/** Czego jeszcze brakuje, by odpalić trip-search (do dopytania przez bota). */
export type MissingField = "theme" | "budgetPln" | "budgetKind" | "month" | "adults";
```

- [ ] **Step 2: Test — brakujące pola i domyślne wypełnienia**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { missingFields, normalizeIntent } from "./budget";

test("missingFields: sam motyw+budżet → brakuje interpretacji budżetu i miesiąca", () => {
  assert.deepEqual(missingFields({ theme: "plaza", budgetPln: 3000, wantsFlight: true, wantsHotel: true }).sort(),
    ["adults", "budgetKind", "month"].sort());
});
test("normalizeIntent: brak origin → WAW; brak adults gdy podane → bez zmian", () => {
  const i = normalizeIntent({ theme: "plaza", budgetPln: 3000, budgetKind: "per_person", month: 8, adults: 2, wantsFlight: true, wantsHotel: true });
  assert.equal(i.origin, "WAW");
});
test("missingFields: komplet → []", () => {
  assert.deepEqual(missingFields({ theme: "plaza", budgetPln: 3000, budgetKind: "per_person", month: 8, adults: 2, wantsFlight: true, wantsHotel: true }), []);
});
```

- [ ] **Step 3: Run → FAIL.**

- [ ] **Step 4: Implementacja** (`budget.ts`): `missingFields(intent)` zwraca listę `MissingField` (theme/budgetPln zawsze wymagane; budgetKind wymagane gdy jest budgetPln; month wymagane; adults wymagane). `normalizeIntent(intent)`: `origin ??= "WAW"`, `adults ??= 2`, `children ??= 0`, `wantsFlight`/`wantsHotel` domyślnie true. Czyste, zero I/O.

- [ ] **Step 5: Run → PASS. Commit** — `feat(concierge): interpretacja budżetu + kompletność intencji (TDD)`.

### Task 1.2: Dobór kierunków z motywu + budżetu (czysty)

**Files:**
- Create: `src/lib/concierge/trip-search.ts`
- Test: `src/lib/concierge/trip-search.test.ts`

Zależności (już istnieją): `TRAVEL_MOODS`/`getMoodBySlug` (`@/lib/mvp/travel-moods`) → lista kierunków motywu; `DestinationPriceSnapshot` + `pickFreshPackage`/`pickFreshPrice`/`pickFreshFlightPrice` (`@/lib/prices/destination-price-snapshot`). **Silnik dostaje snapshot jako argument** (czysty, testowalny — I/O robi warstwa tools).

- [ ] **Step 1: Typ wyniku** (`types.ts`):

```ts
export interface TripCandidate {
  cityEn: string; countryEn: string; cityPl: string;
  perPersonPln: number;      // z pakietu snapshotu (lot RT + noce×hotel/2)
  checkin: string; checkout: string;
  hotelFromPlnPerNight: number | null;
  flightFromPln: number | null;
}
```

- [ ] **Step 2: Test — filtr budżetu + ranking (dane syntetyczne)**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import type { DestinationPriceSnapshot } from "@/lib/prices/destination-price-snapshot";
import { destinationPriceKey } from "@/lib/prices/destination-price-snapshot";
import { rankTripCandidates } from "./trip-search";

const now = Date.UTC(2026, 6, 7);
function entry(pkg: number) {
  return { hotelFromPlnPerNight: 200, checkin: "2026-08-10", checkout: "2026-08-17", computedAt: now,
    pkgPerPersonPln: pkg, pkgCheckin: "2026-08-10", pkgCheckout: "2026-08-17", pkgComputedAt: now };
}
const snap: DestinationPriceSnapshot = {
  [destinationPriceKey("Malaga", "Spain")]: entry(1800),
  [destinationPriceKey("Barcelona", "Spain")]: entry(2600),
  [destinationPriceKey("Dubai", "UAE")]: entry(5200), // ponad budżet
};

test("rankTripCandidates: zwraca tylko ≤ budżet, posortowane rosnąco", () => {
  const cities = [
    { cityEn: "Malaga", countryEn: "Spain", cityPl: "Malaga" },
    { cityEn: "Barcelona", countryEn: "Spain", cityPl: "Barcelona" },
    { cityEn: "Dubai", countryEn: "UAE", cityPl: "Dubaj" },
  ];
  const out = rankTripCandidates(cities, snap, { budgetPln: 3000, budgetKind: "per_person" }, now);
  assert.deepEqual(out.map((c) => c.cityEn), ["Malaga", "Barcelona"]);
});

test("rankTripCandidates: budżet 'za dwoje' dzieli próg na 2", () => {
  const cities = [{ cityEn: "Barcelona", countryEn: "Spain", cityPl: "Barcelona" }]; // 2600/os
  // 3000 za dwoje = 1500/os → Barcelona (2600/os) odpada
  assert.equal(rankTripCandidates(cities, snap, { budgetPln: 3000, budgetKind: "total_two" }, now).length, 0);
});

test("rankTripCandidates: brak świeżego pakietu → kierunek pomijany (nie zgadujemy)", () => {
  const cities = [{ cityEn: "Nieznane", countryEn: "X", cityPl: "Nieznane" }];
  assert.equal(rankTripCandidates(cities, snap, { budgetPln: 9999, budgetKind: "per_person" }, now).length, 0);
});
```

- [ ] **Step 3: Run → FAIL.**

- [ ] **Step 4: Implementacja** (`trip-search.ts`):
  - `budgetPerPerson(budgetPln, kind)` = `kind === "total_two" ? Math.floor(budgetPln / 2) : budgetPln`.
  - `rankTripCandidates(cities, snapshot, {budgetPln, budgetKind}, now)`: dla każdego miasta `pickFreshPackage(snapshot, cityEn, countryEn, now)`; jeśli null → pomiń (uczciwość: brak realnej ceny = brak kandydata); jeśli `perPersonPln <= budgetPerPerson` → dodaj `TripCandidate` (z hotel/flight „od" przez `pickFreshPrice`/`pickFreshFlightPrice`). Sortuj rosnąco po `perPersonPln`. Zwróć.
  - `resolveThemeCities(themeSlug, resolveDest)` (osobna, czysta): `getMoodBySlug` → z `mood.picks` wyciągnij `{cityEn, countryEn, cityPl}` (dedup PO rozwiązaniu). **WDROŻONE Z ISTOTNĄ POPRAWKĄ:** każdy pick rozwiązywany przez rekord SEEDU (wstrzyknięty `resolveDest: SeedDestinationLookup`; w produkcji = `getDestinationByCityCountry` z `@/lib/mvp/destinations-seed`), bo cron pisze klucze snapshotu z `seed.city.en` (pick „Palma de Mallorca" ≠ seed „Palma" → bez tego kierunek po cichu znika). Lookup wstrzykiwany, bo moduł seedu jest `server-only` (crashuje node:test). Test regresji: każdy pick każdego motywu trafia w klucz crona.

- [ ] **Step 5: Run → PASS. Commit** — `feat(concierge): silnik doboru kierunków z budżetu (TDD)`.

---

## FAZA 2 — Warstwa narzędzi (function-calling)

### Task 2.1: Definicje tool-schemas

**Files:** Create `src/lib/concierge/tools.ts`

- [ ] **Step 1:** Wyeksportuj `TOOL_DEFS` (format OpenRouter/OpenAI). Trzy narzędzia:
  1. `search_trips` — params: `theme` (enum ze slugów motywów), `budgetPln` (number), `budgetKind` (enum), `month` (1–12), `origin` (string, opc.), `adults` (int), `children` (int, opc.), `wantsFlight` (bool), `wantsHotel` (bool). Zwraca top ≤5 `TripCandidate`.
  2. `get_trip_offer` — params: `cityEn`, `countryEn`, `checkin`, `checkout`, `origin`, `adults`, `children`. **Live**: najtańszy hotel (LiteAPI `getRates` → `pickCheapestRate`) + najtańszy lot (`searchFlightRates`→`normalizeRatesResponse`→min). Zwraca `TripOffer` z realnymi `hotelId`, danymi lotu i linkami handoff.
  3. `list_themes` — bez params, zwraca dostępne motywy (żeby model nie zgadywał slugów).
- [ ] **Step 2:** Każdy schema z opisami PO POLSKU + `required`. Komentarz: opisy sterują modelem, dopracować w Fazie 6.
- [ ] **Step 3: Commit** — `feat(concierge): definicje narzędzi function-calling`.

### Task 2.2: Egzekutory narzędzi (server, z uczciwością)

**Files:**
- Create: executory w `src/lib/concierge/tools.ts`
- Test: `src/lib/concierge/tools.test.ts` (mock snapshot + mock LiteAPI klienta)

- [ ] **Step 1: Test — `executeSearchTrips` zwraca tylko realnych kandydatów w budżecie** (wstrzyknięty snapshot testowy, jak w Fazie 1). Assert: kwoty == snapshot, brak kierunków bez świeżej ceny.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implementacja:**
  - `executeSearchTrips(args)`: `normalizeIntent` → `resolveThemeCities(theme, getDestinationByCityCountry)` (**UWAGA: przekaż lookup seedu jako drugi argument** — patrz Task 1.2) → `readPriceSnapshot()` → `rankTripCandidates` → top 5. Gdy 0 → zwróć `{candidates: [], reason: "Brak kierunków w tym budżecie/motywie"}` (bot to uczciwie zakomunikuje).
  - `executeGetTripOffer(args)`: równolegle hotel (`getRates` dla miasta → `pickCheapestRate` → `hotelId`, cena, `formatPLN`) i lot (`searchFlightRates` → min offer). Buduje `TripOffer` z linkami: hotel `/hotele/{hotelId}?checkin&checkout&adults&rooms`, lot `/loty/wyniki?origin&destination&depart&return&adults`. Jeśli którykolwiek składnik nie wyjdzie → zwróć częściowy + flagę (bot powie „lot potwierdzę na następnym kroku"). **Nigdy nie zwraca ceny bez realnego wyniku.**
  - `executeListThemes()`: mapa slug→label z `TRAVEL_MOODS`.
- [ ] **Step 4: Run → PASS. Commit** — `feat(concierge): egzekutory narzędzi (snapshot + live LiteAPI)`.

---

## FAZA 3 — Orkiestracja + API route

### Task 3.1: System prompt (PL + guardraile)

**Files:** Create `src/lib/concierge/system-prompt.ts` + test.

- [ ] **Step 1: Test** — `SYSTEM_PROMPT` zawiera twarde zakazy (asercje na obecność fraz): „nie wymyślaj cen", „używaj wyłącznie wyników narzędzi", „dopytaj gdy brakuje", „ceny w PLN", „mów po polsku".
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implementacja** — string budowany ze stałych. Zawiera: rola (polski doradca wyjazdowy HelpTravel), zasady (używaj narzędzi do WSZYSTKICH liczb; nigdy nie zmyślaj; dopytaj o brakujące pola zamiast zgadywać; jedna oferta = jedna karta; PL + PLN; ton ciepły/konkretny, bez presji/„ostatnie 2 miejsca"). Instrukcja: gdy masz komplet intencji → `search_trips`; po wyborze kierunku → `get_trip_offer`; prezentuj kartę.
- [ ] **Step 4: Run → PASS. Commit.**

### Task 3.2: Pętla orkiestracji

**Files:** Create `src/lib/concierge/orchestrator.ts` + test (mock `chatCompletion` + mock executorów).

- [ ] **Step 1: Test** — gdy model zwraca `tool_calls`, orchestrator wykonuje executor, dokłada `role:"tool"` z wynikiem i woła model ponownie; zatrzymuje się po `MAX_TOOL_ROUNDS`; finalna wiadomość bez tool-calli kończy. (Mock: 1 runda tool → finalna treść.)
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implementacja** — `runConcierge({history})`: przytnij historię (`MAX_HISTORY_MESSAGES`, `MAX_INPUT_CHARS`), dołóż `SYSTEM_PROMPT`; pętla ≤ `MAX_TOOL_ROUNDS`: `chatCompletion` → jeśli `tool_calls` → wykonaj (walidacja args Zod; błąd walidacji → `role:"tool"` z komunikatem, nie crash) → kontynuuj; jeśli treść → zwróć `{ text, offer? }` (jeśli ostatni `get_trip_offer` dał `TripOffer`, dołącz jako strukturę do renderu karty). Zwraca zdarzenia do streamu.
  - **Obsługa błędów OpenRouter (carry-forward z Task 0.1):** klient `chatCompletion` NIE sprawdza `response.ok` — odpowiedź błędu (zły klucz/model, limit, `{ error: {...} }`) wygląda jak sukces. Orchestrator MUSI wykryć brak `choices`/obecność `error` w wyniku i zamienić to na czysty stan błędu (nie crash, nie „udawany sukces"): zaloguj serwerowo, zwróć użytkownikowi łagodny komunikat PL („Chwilowo nie mogę teraz odpowiedzieć — spróbuj za moment"). Test: mock `chatCompletion` zwraca `{ error }` → orchestrator zwraca stan błędu, nie rzuca.
- [ ] **Step 4: Run → PASS. Commit.**

### Task 3.3: Route `/api/concierge/chat`

**Files:** Create `src/app/api/concierge/chat/route.ts`.

- [ ] **Step 1:** `runtime = "nodejs"`, `dynamic = "force-dynamic"`, `maxDuration = 60`. `enforceRateLimit(request, "concierge")` (dodać koszyk w `lib/rate-limit`, ciasny limit ~10/min/IP — każdy request kosztuje tokeny). Body Zod: `{ messages: {role, content}[] }` (limit długości). **DECYZJA (zmiana vs pierwotny szkic):** odpowiedź = pojedynczy JSON `{ text, offer, error }` (orchestrator jest nie-streamujący z założenia; UI pokazuje „asystent pisze…"). Streaming tokenów/SSE odłożony do Fazy 6, jeśli latencja realnie doskwiera. Błędy → typowany JSON, nigdy surowy stack.
- [ ] **Step 2:** Ręczny smoke (skrypt `tmp/concierge-smoke.ts` z `.env.local`, JEDNA tura) — potwierdź, że wraca tekst PL + że `search_trips` się odpala. (Nie commitujemy `tmp/`.)
- [ ] **Step 3: Commit** — `feat(concierge): route /api/concierge/chat (streaming, rate-limit, guardraile)`.

---

## FAZA 4 — UI czatu + karta oferty (mobile-first, impeccable)

> Użyj skilla `impeccable` (rejestr `product`) do jakości. Z `QuickSearchLauncher` reużyj mechaniki (portal, focus trap, Esc, consent-gate, reset na zmianie route), ale **wzorzec jest inny**: nie centrowany modal, lecz **dokowany widget czatu** (mobile pełny ekran z minimalizacją; desktop panel ~20% w prawym-dolnym). Panel nie renderuje formularza z DateRangeField, więc problem transform-containing-block nie występuje — mimo to unikaj transformów w stanie spoczynku.

> ### Kierunek wizualny i copy (WAŻNE — wprost od właściciela)
> **Ma to wyglądać jak realny produkt zbudowany przez programistów, NIE jak „AI slop".** Twarde zasady:
> - **Zero pastelowej, generycznej estetyki chatbota AI** (żadnych fioletowo-różowych gradientów, „sparkle everywhere", baniek jak z demo). Ma być pewny siebie, konkretny, dopracowany.
> - **Dopasuj do istniejącego brandu.** Przed kodem UI przeczytaj tokeny (`src/app/globals.css`, konfiguracja Tailwind, istniejące dopracowane komponenty jak pasek lotów/karty hoteli) i użyj tej samej palety/typografii/promieni. NIE wymyślaj nowej palety.
> - **Nastawienie na konwersję („jak Jordan Belfort prowadzi do zakupu").** Copy i layout mają zdecydowanie prowadzić użytkownika do oferty i do kliknięcia CTA („Zobacz hotel", „Zobacz lot"). Pewny, sprzedażowy, ciepły ton — bot proponuje i domyka, nie jest biernym FAQ.
> - **Uczciwość ponad wszystko (PRODUCT.md — nienaruszalne).** Perswazja WYŁĄCZNIE z realnej wartości: prawdziwa cena, „w budżecie ✓", realne oceny/recenzje, konkret oferty. **NIGDY** fałszywej presji: zero wymyślonych liczników, „ostatnie 2 miejsca", zmyślonej rzadkości czy nieprawdziwych liczb. To jest granica, której sprzedażowy ton nie przekracza.
> Dotyczy Task 4.1 (karta) i 4.2 (czat/launcher) w całości; weryfikuj kontrast i „nie-AI-slop" wygląd w preview (375 + desktop).

### Task 4.1: Karta oferty (`trip-offer-card.tsx`)

- [ ] Render `TripOffer`: nagłówek destynacja + daty; **rozbicie ceny** (Lot `formatPLN` + Hotel `formatPLN` = **Razem `formatPLN` / os.**, „w budżecie ✓"); **dwa podglądy**: (1) hotel (miniatura, nazwa, ocena) → `Link` do `/hotele/[hotelId]?…`; (2) lot (przewoźnik, godziny, przesiadki) → `Link` do `/loty/wyniki?…`. CTA pod każdym: „Zobacz hotel →" / „Zobacz lot →". Ceny wyłącznie z propsów (realne). Weryfikacja `preview_inspect` (kontrast, PLN).

### Task 4.2: Czat (`concierge-chat.tsx`) + launcher

- [x] Stan `messages`, `input`, `pending`. `sendMessage`: POST `/api/concierge/chat` (**pojedynczy JSON `{text, offer, error}` — bez streamingu, decyzja z Task 3.3**); `offer` → `<TripOfferCard>` pod wiadomością asystenta. **Quick-replies: TYLKO 3 chipy startowe na pustym czacie (decyzja: chipy per-pytanie odłożone — dopytywanie jest prozą, „jedno pytanie na raz" z system promptu; ewentualne chipy dynamiczne = Faza 6 po evalu).** Autoscroll, „asystent pisze…", stany błędu/limitu/429. Persystencja sessionStorage (cap 40).
- [ ] `concierge-launcher.tsx`: dymek „✨ Asystent wyjazdu" w prawym-dolnym rogu, **na każdej podstronie** (także `/hotele/*`, `/loty/*`). Trzy stany: `bubble` (zwinięty dymek) → `expanded` (mobile: `fixed inset-0` pełny ekran; desktop: panel dokowany prawy-dolny `~20vw`, min ~360px, wys. ~70vh, `max-h`) → `minimized` (powrót do dymka **BEZ utraty historii** — stan czatu żyje w launcherze + `sessionStorage`). Nagłówek panelu: tytuł + przycisk „—" (minimalizuj) i „✕" (zamknij). Gate: `NEXT_PUBLIC_SHOW_CONCIERGE` (domyślnie OFF) + zgoda (marketing/analytics). **Eye-catching (bez fałszywej presji — zgodnie z PRODUCT.md):** akcentowy kolor, subtelny puls/„oddech" dymka, jednorazowy teaser „Cześć! Dobiorę wyjazd w Twoim budżecie ✨" (dismissable, zapamiętany w `localStorage`, bez liczników/scarcity). **Coexistence z `QuickSearchLauncher`:** na stronach treści ułożyć w pionie (concierge = prawy-dolny główny, quick-search wyżej) — potwierdzić na 375px w preview, że nic się nie nakłada.
- [ ] Montaż w `layout.tsx`. Weryfikacja preview: 375px pełny ekran, desktop panel; strumień działa; karta klika do hotelu i lotu.

### Task 4.3: RODO + informacja o AI

- [ ] Pierwsza wiadomość bota + stopka panelu: „Rozmowę przetwarza dostawca AI (OpenRouter). Ceny i oferty pochodzą z naszej wyszukiwarki." Link do polityki prywatności; dopisać AI/OpenRouter jako sub-procesora. Gate zgody jak analytics/marketing.

---

## FAZA 5 — Dopytywanie, stany brzegowe, i18n

- [ ] **Dopytywanie:** gdy `missingFields` niepuste, system prompt każe zadać JEDNO pytanie na raz + wystawić quick-replies (miesiąc, budżet na osobę/za dwoje, ile osób, skąd). Test manualny: „plaża do 3k" → bot pyta o miesiąc/os./skąd, nie zgaduje.
- [ ] **Brak oferty w budżecie:** bot mówi uczciwie + proponuje: podnieś budżet / inny miesiąc / inny motyw (nie zmyśla taniego lotu).
- [ ] **Wygasła oferta lotu przy handoffie:** link prowadzi do `/loty/wyniki` (świeży search + auto-recovery 52099 już wdrożone) — bez zmian, tylko potwierdzić w QA.
- [ ] **Format PLN/daty** wszędzie przez `formatPLN`/`pl-PL`.

---

## FAZA 6 — Model eval, koszt, analytics, flaga, rollout

- [ ] **Eval modelu (D1):** ~15 realnych zapytań PL (różne motywy/budżety/braki) na 2–3 modelach (Gemini 2.5 Flash, GPT-4o-mini, Claude Haiku). Metryki: trafność tool-calli, polszczyzna, brak halucynacji cen, koszt/rozmowę, latencja. Wybierz `OPENROUTER_MODEL`.
- [ ] **Koszt:** log tokenów/rozmowę (serwer), alert gdy średnia > próg. Cache `search_trips` (klucz z args, TTL 10 min) — snapshot i tak stabilny.
- [ ] **Analytics (GA4):** `concierge_open`, `concierge_message`, `concierge_offer_shown`, `concierge_offer_click` (hotel|flight). Reużyj `track` (dodać nazwy do katalogu). Atrybucja handoffu przez `clientReference`/UTM w linkach.
- [ ] **Flaga + rollout:** `NEXT_PUBLIC_SHOW_CONCIERGE` domyślnie OFF; włącz na preview, potem prod. Kill-switch działa bez redeployu logiki (env).
- [ ] **QA end-to-end (3 scenariusze):** (a) „plaża do 3k sierpień we dwoje z Warszawy" → oferta w budżecie, klik hotel/lot; (b) budżet za niski → uczciwa odmowa; (c) niekompletne → dopytywanie. Mobile 375 + desktop.

---

## Testing Strategy

- **Czyste jednostki (TDD, twarde asercje):** `budget.ts`, `trip-search.ts`, `system-prompt.ts`, `orchestrator.ts` (z mockami), egzekutory tools (mock snapshot/LiteAPI). To pokrywa logikę uczciwości/budżetu — najważniejsze.
- **Integracja LLM:** nie testujemy niedeterministycznego wyjścia modelu w CI; smoke ręczny + eval (Faza 6).
- **UI:** weryfikacja przez preview-MCP (DOM/inspect/screenshot, 375 + desktop).
- Dopisz wszystkie `src/lib/concierge/*.test.ts` do `package.json` → `test`.

## Rollout / Guardrails (podsumowanie)

- Klucz OpenRouter WYŁĄCZNIE server-side. Rate-limit + limity rund/tokenów/historii. Cache tur.
- Zero cen spoza narzędzi (walidacja karty oferty: wymaga realnych id/linków).
- Consent-gate + jawna informacja o AI (RODO).
- Flaga OFF→preview→prod. Handoff do istniejących flow (reuse marża/GA4/maile/auto-recovery).
- Commit po każdym zaakceptowanym tasku.

## Decyzje właściciela — ZATWIERDZONE (2026-07-07)
1. **Model** — ekonomiczny; domyślnie `gemini-2.5-flash-lite`, eval też `gemini-2.5-flash`/`gpt-4o-mini`. **Sufit ≈ $50/mc** → próg alertu kosztu (Faza 6). Zakres AI wąski: tylko dobór oferty + wybór lotu/hotelu (nie „do wszystkiego").
2. **Bez bookingu w czacie** — discovery + handoff do `/hotele/[hotelId]` i `/loty/wyniki` („ma prowadzić do ofert, nie finalizować").
3. **Launcher** — dokowany dymek prawy-dolny na KAŻDEJ podstronie; mobile pełny ekran z minimalizacją, desktop panel ~20%; ma się rzucać w oczy (bez fałszywej presji). Szczegóły: D6 + Faza 4.

### Do potwierdzenia w trakcie (drobne, NIE blokują startu)
- Coexistence dwóch dymków (concierge + `QuickSearchLauncher`) na stronach treści — układ pionowy vs docelowe scalenie w jeden launcher. Domyślnie stackujemy; decyzja po podglądzie 375px.
- Dokładna nazwa/ID modelu na liście OpenRouter (sprawdzić w Fazie 0, przy dodawaniu klucza).
