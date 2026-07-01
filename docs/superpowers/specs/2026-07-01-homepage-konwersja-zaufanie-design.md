# Homepage: konwersja + zaufanie (krok milowy) — design

Data: 2026-07-01 · Status: zatwierdzony przez właściciela (podejście A, sekcje 1–3)
Branch: `feat/homepage-konwersja-zaufanie`

## Cel

Homepage ma robić konwersję sprzedażową jak topowe serwisy (Booking/Trip) i budować
zaufanie do świeżego projektu — **bez wydłużania strony**. Osoba, która nie wie,
dokąd jechać, ma zostać nakierowana: chipy nastrojów → mocne podstrony
`/wyjazdy/[typ]` z cenami, sezonem i „dla kogo".

## Decyzje właściciela (2026-07-01)

1. **Cel główny = użycie wyszukiwarki** (Booking-style). Wszystko inne drugorzędne.
2. **Zaufanie = fakty weryfikowalne**: technologia partnerów (LiteAPI, Stripe)
   + prawdziwy profil Trustpilot (`pl.trustpilot.com/review/helptravel.pl`,
   ma opinie; już linkowany na checkoucie). Zero zmyślonych liczb.
3. **Niezdecydowani**: chipy → rozbudowane podstrony `/wyjazdy/[typ]` (nie kreator
   na homepage).
4. **Prawdziwe ceny „od X zł"** na kafelkach homepage i kartach `/wyjazdy` —
   z naszego cache LiteAPI (grzanego cronem).
5. **Zakres podstron w tym milestone: tylko `/wyjazdy/[typ]`** (6 nastrojów).
6. Praca z użyciem plugina **Impeccable** (init → kontekst designu; detect/audit
   jako bramka jakości UI).

## Kontekst zastany (istotne fakty z kodu)

- Homepage: `HomeHybridHero` (backdrop + `HomeSearchTabs` + pas zaufania +
  `PaymentMethods` + `MoodChips` + 12 kafelków `DestinationTile`) +
  `HomePageSections` (sekcja „Zacznij od pomysłu" — 6 dużych kart, dubluje chipy).
  ISR `revalidate=3600`.
- **Historia uczciwości**: `DestinationTile` MIAŁ „od X zł" liczone z hasha —
  usunięte 2026-06-11 jako fikcja. Nowe ceny MUSZĄ pochodzić z realnych wyszukań.
- Cron `/api/cron/warm-rates` (co 30 min, Vercel Pro, CRON_SECRET) grzeje ceny
  hoteli: `getTopDestinations(10)` × 3 okna dat (`computeWarmDateWindows`:
  weekend-1, weekend-2, tydzien-1) × 50 hoteli, przez `resolveSlimRates`
  (zwraca mapę hotelId → slim rate z ceną total za pobyt).
- `/wyjazdy/[typ]`: `MoodLanding` — hero, przełącznik nastrojów, karty
  `MoodDestinationCard` (CTA „Zobacz hotele" z datami +30/+34), sekcje
  redakcyjne, FAQ + schema.org. `MoodPick` ma już pola `season`, `overview`,
  `tags`, `searchCity`, `country`.
- Loty: słownik lotnisk `src/lib/flights/airports.ts` (IATA po mieście);
  wyniki `/loty/wyniki?origin=&destination=&depart=&return=&adults=`.
- Trustpilot: `trust-strip.tsx` (checkout) linkuje prawdziwy profil.

## Architektura zmian

### 1. Snapshot cen kierunków (fundament — bez zmian UI)

**Nowy moduł** `src/lib/prices/destination-price-snapshot.ts`:

- Jeden klucz Redis `dstprice:v1` (Upstash, wzorzec best-effort jak
  `hotels/rate-cache` i `flights/rates-cache`: każdy błąd/brak env = miss,
  cena może TYLKO pomóc).
- Kształt: `{ [key: string]: { hotelFromPlnPerNight: number; checkin: string;
  checkout: string; computedAt: number } }` gdzie
  `key = foldText("${cityEn}|${countryEn}")` (fold jak w flights/airports).
- API modułu:
  - `destinationPriceKey(cityEn, countryEn): string`
  - `readPriceSnapshot(): Promise<Snapshot | null>` (jeden GET na render ISR)
  - `mergePriceSnapshot(entries): Promise<void>` (cron; merge, nie replace —
    częściowy przebieg crona nie kasuje reszty)
  - `pricePerNight(totalPln, checkin, checkout): number | null` (czysta
    matematyka: total / liczba nocy, zaokrąglenie w dół do pełnych zł;
    null gdy noce ≤ 0 lub total nieprawidłowy)
  - `isFreshPrice(entry, now): boolean` — **staleness 48 h**; starsze wpisy
    traktowane jak brak ceny.
- TTL klucza Redis: 7 dni (staleness i tak tnie po 48 h; TTL chroni przed
  wiecznym śmieciem).

**Rozszerzenie crona** `/api/cron/warm-rates`:

- Po każdym udanym `resolveSlimRates` dla zadania (kierunek × okno) cron liczy
  minimum ceny za noc po hotelach tego zadania; po przebiegu zapisuje
  `mergePriceSnapshot` z minimum po wszystkich oknach danego kierunku.
- Lista grzanych kierunków — **KOREKTA przy planowaniu (2026-07-01)**: seed
  jest sortowany popularnością i top-14 to niemal sama Hiszpania (Rzym idx 23,
  Ateny 48, Stambuł 64), więc podbicie licznika NIE pokryłoby kafelków.
  Zamiast tego: `HOME_TILE_DESTINATION_IDS` (8 kafelków) +
  `WARM_EXTRA_DESTINATION_IDS` w `warm-config.ts`; cron grzeje
  **union(top-10, extras)** (~15 kierunków × 3 okna ≈ 45 zadań; budżet czasu
  weryfikowany pomiarem w Task 8 — fallback: mniej okien dla extras).
- Karty `/wyjazdy` pokazują cenę TYLKO dla kierunków obecnych w snapshotcie
  (podzbiór picks) — reszta gracefully bez ceny. Świadomy kompromis: nie
  rozszerzamy crona o ~40 miast nastrojów w tym milestone.

### 2. Homepage

**Sekcja hero** (`home-hybrid-hero.tsx`) — zmiany otoczki, formularz NIETKNIĘTY:

- Pas zaufania pod formularzem: `["Ceny w PLN", "Bez rejestracji",
  "Sprawdzeni partnerzy"]` → trzy weryfikowalne fakty:
  1. „★ Opinie na Trustpilot" — link do profilu (nofollow, target=_blank),
  2. „Płatności obsługuje Stripe",
  3. „Ceny finalne w PLN".
- `PaymentMethods` i `MoodChips` zostają bez zmian układu.
- Nagłówek/podtytuł: bez zmiany sensu; ewentualny szlif w F4 (polish).

**Kafelki kierunków**: 12 → **8** (2 rzędy × 4 na lg). Zestaw: podzbiór
obecnych 12, dobrany tak, by wszystkie były w grzanych top-14 (finalny dobór
w F2 przy mapowaniu slug↔seed). `DestinationTile` dostaje opcjonalny prop
`fromPricePerNight?: number` → renderuje linię „Hotel od X zł/noc"; brak
propa = brak linii (obecny wygląd). Strona homepage czyta snapshot
serwerowo przy ISR i mapuje profil → klucz snapshotu.

**Nowa sekcja „Jak to działa + kto za tym stoi"** (zastępuje CAŁĄ obecną
`HomePageSections`): jeden ekran, dwie kolumny (mobile: stack):

- Kolumna A — 3 kroki: (1) Wyszukujesz — ceny finalne w PLN, bez ukrytych
  opłat; (2) Płacisz bezpiecznie — Stripe: karta, BLIK, Google Pay;
  (3) Potwierdzenie od razu na e-mail.
- Kolumna B — „Kto za tym stoi": rezerwacje realizuje LiteAPI (globalna
  platforma rezerwacyjna), płatności przetwarza Stripe; link do Trustpilot;
  link do `/o-nas`.
- Komponent: `src/components/home/trust-how-it-works.tsx` (server component,
  czysty JSX, zero fetch).

**Efekt długości**: netto KRÓCEJ niż dziś (znika sekcja 6 kart, kafelków
mniej o 4, dochodzi jedna zwarta sekcja).

### 3. Podstrony `/wyjazdy/[typ]`

`MoodDestinationCard` dostaje nowe propsy (renderowane tylko gdy dane są):

1. `fromPricePerNight?: number` → „Hotel od X zł/noc" (źródło: snapshot,
   klucz z `pick.searchCity`+`pick.country`).
2. Sezon: RENDERUJEMY istniejące `pick.season` jako plakietkę (dane już są;
   bez wyliczanki z temperatur w tym milestone — YAGNI).
3. „Dla kogo": jedno zdanie z istniejącego `pick.overview` (jeśli karta już
   je pokazuje — zostaje; jeśli nie — dodajemy render).
4. `flightsHref?: string` → drugi, mniejszy CTA „Sprawdź loty":
   `/loty/wyniki?origin=WAW&destination=<IATA>&depart=<checkin>&return=<checkout>&adults=2`.
   IATA z `lookupAirport`-owego słownika po mieście (nowy helper
   `iataForCity(cityEn): string | null` w `src/lib/flights/airports.ts` —
   szuka po city w AIRPORTS); brak IATA = brak CTA.
   Daty = te same +30/+34, co CTA hotelowe.
- `MoodLanding` czyta snapshot raz (server, ISR 86400 → **3600**, żeby ceny
  na kartach nie wisiały dobę).

### 4. Impeccable w procesie

- **F0**: uruchomić `reference/init.md` zgodnie ze skillem → `PRODUCT.md`
  (+ `DESIGN.md` jeśli init go wytworzy) w root repo, commit. To karmi hook
  i wszystkie komendy.
- Po każdej fazie UI: `npx impeccable detect src/components/home src/components/publisher`
  (lub odpowiednie pliki) — znaleziska naprawiane przed commitem.
- **F4**: pełny przebieg audit/polish wg `reference/audit.md` + `polish.md`
  na homepage i jednej stronie nastroju; poprawki z audytu wdrażane.

## Obsługa błędów

- Snapshot: brak env Upstash / błąd sieci / zły JSON → `readPriceSnapshot()`
  zwraca null → strony renderują się bez cen (jak dziś). Log `console.warn`
  raz na proces (wzorzec rates-cache).
- Cena nieświeża (>48 h) lub nie-dodatnia → traktowana jak brak.
- Cron: błąd merge snapshotu NIE wywala grzania (try/catch, warn).
- Brak IATA dla miasta → karta bez CTA lotów (bez błędu).

## Testy (node:test, rejestrowane w package.json)

- `destination-price-snapshot.test.ts`: klucz foldowany; pricePerNight
  (zwykłe, 1 noc, 0 nocy, ujemne, zaokrąglanie); isFreshPrice (świeży, 48h+,
  brak pola); merge (nowe+istniejące, nie kasuje nieobecnych); read przy
  braku env → null (seam testowy jak w rates-cache).
- `airports.test.ts` (rozszerzenie): `iataForCity("Barcelona") === "BCN"`,
  nieznane miasto → null.
- Bez testów snapshot-renderowania React (brak infra RTL w repo) —
  weryfikacja UI: build + preview DOM + Impeccable detect.

## Weryfikacja końcowa (bramka przed PR)

1. `pnpm test` — komplet zielony.
2. `pnpm build` — czysty.
3. Preview (lokalnie): homepage renderuje 8 kafelków; przy zasianym w Redis
   snapshotcie kafelek pokazuje „Hotel od X zł/noc", bez snapshotu — nie
   pokazuje; sekcja „Jak to działa" obecna; stara sekcja kolekcji nieobecna;
   `/wyjazdy/plaza` karta z ceną/sezonem/CTA lotów.
4. `npx impeccable detect` na zmienionych plikach — bez blokujących findings.
5. PR → Vercel preview → **właściciel decyduje o merge na produkcję**
   (standard: bez wyraźnego „merge" nic nie idzie na prod).

## Fazy implementacji

- **F0** — Impeccable init: PRODUCT.md (+DESIGN.md), commit.
- **F1** — snapshot cen: moduł + testy + rozszerzenie crona + WARM 10→14
  + pomiar czasu przebiegu crona lokalnie.
- **F2** — homepage: pas zaufania, 8 kafelków z `fromPricePerNight`,
  `trust-how-it-works.tsx`, usunięcie `HomePageSections`.
- **F3** — `/wyjazdy`: snapshot na kartach, sezon, „dla kogo", CTA lotów,
  `iataForCity`, ISR 3600.
- **F4** — Impeccable audit/polish + perf sanity (LCP/CLS bez regresji,
  homepage nadal ISR bez dodatkowych blokujących wywołań) + PR.

## Poza zakresem (świadomie)

- Ceny lotów „od" na kafelkach (TTL cache lotów 3 min — wymaga osobnego
  snapshotu; następny milestone).
- Kreator/quiz na homepage; przebudowa `/inspiracje` i stron SEO.
- Rozszerzenie crona o wszystkie ~40 miast z picks nastrojów.
- Wirtualizacja/porządki niezwiązane z celem.
