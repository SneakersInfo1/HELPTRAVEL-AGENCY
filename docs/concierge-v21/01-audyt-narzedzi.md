# Concierge V2.1 — audyt narzędzi: architektura, przyczyny, inwentarz

Zakres: **jakość rekomendacji + czas narzędzi**. Model, prompt i streaming są
zamknięte i nietknięte.

Wszystkie liczby w tym dokumencie pochodzą z pomiaru, nie z oszacowania.
Źródła: sonda snapshotu produkcyjnego (`pnpm probe:concierge-snapshot`),
benchmark narzędzi na Preview (`/api/concierge/tool-bench`) i logi runtime
Vercela z 2026-09-06.

---

## 1. ŚCIEŻKA NARZĘDZIA — MAPA

```
użytkownik
  → POST /api/concierge/chat            src/app/api/concierge/chat/route.ts
      · enforceRateLimit("concierge")   10/min/IP + 200/dobę/IP
      · zod: ≤20 wiadomości, ≤1500 znaków
      · Promise.race z 57 s (pas nad budżetem orkiestratora)
  → runConcierge                        src/lib/concierge/orchestrator.ts
      · budżet tury 50 s, do 4 rund modelu, timeout modelu ≤30 s
      · JEDEN ToolContext na turę (ślad + memo snapshotu + termin)
  → chatCompletion                      src/lib/concierge/openrouter.ts
      · primary haiku-4.5, zapas gemini-3.1-flash-lite (tylko na awarię)
  → dispatchToolCall                    orchestrator.ts (eksportowany)
      ├── search_trips  → executeSearchTrips           tools.ts
      │     · readSnapshotOnce → readPriceSnapshot     Upstash `dstprice:v1`
      │     · resolveThemeCities / listDestinationsInCountry   seed 796 kier.
      │     · rankTripCandidates                        trip-search.ts (czyste)
      │     · AUTO-OFERTA: executeGetTripOffer(top-1)
      └── get_trip_offer → executeGetTripOffer         tools.ts
            · daty: argumenty modelu → month/nights → snapshot → +21 dni
            ├── findCheapestHotel   tool-deps.ts
            │     · fetchHotelsForDestination  /data/hotels (Next Data Cache 24 h)
            │     · resolveSlimRates           /hotels/rates + Redis `htr:v4`
            ├── findCheapestFlight  tool-deps.ts
            │     · Redis `flrt:v2` → searchFlightOffers → /flights/rates
            └── fetchHotelPhotoUrls /data/hotel  (limit 900 ms, best-effort)
  → wynik narzędzia (JSON) wraca do modelu jako role:"tool"
  → tekst + TripOffer → UI (trip-offer-card.tsx)
```

### Etapy, ich limity i tryb awarii

| etap | plik | wejście | wyjście | cache | limit czasu | ponowienia | awaria |
|---|---|---|---|---|---|---|---|
| rate limit | `rate-limit.ts` | IP | 429 albo null | Redis | — | — | brak env → limit wyłączony |
| tura | `orchestrator.ts` | historia | tekst + oferta | — | 50 s | 1× na zdeformowaną odpowiedź | łagodny tekst PL, nigdy wyjątek |
| model | `openrouter.ts` | wiadomości | JSON | prompt cache Anthropic | ≤30 s | zapas u innego dostawcy | `{error}` → łagodny tekst |
| snapshot | `destination-price-snapshot.ts` | — | mapa kierunków | Upstash, TTL 7 d, świeżość 48 h | brak | brak | null → brak cen orientacyjnych |
| ranking | `trip-search.ts` | kandydaci | posortowana lista | — | — | — | czysta funkcja, nie zawodzi |
| hotel: lista | `liteapi/search.ts` | miasto/kraj | hotelIds | Next Data Cache 24 h | 30 s | 3 | łańcuch: cityName → coords → placeId |
| hotel: stawki | `resolve-slim-rates.ts` | hotelIds+daty | najtańsza taryfa | Redis `htr:v4` 60 min | 30 s | 3 | null → oferta częściowa |
| lot | `tool-deps.ts` | trasa+daty | najtańsza oferta | Redis `flrt:v2` 10/40 min | **20 s (było 30)** | **1 (było 3)** | null → oferta częściowa |
| galeria | `liteapi/hotel.ts` | hotelId | URL-e zdjęć | Next Data Cache | 900 ms | — | pusta → zdjęcie główne |

---

## 2. INWENTARZ NARZĘDZI

| narzędzie | po co | zależności | żywe API | cache | zmierzony czas (Preview, 78 pomiarów) | równolegle? | awaria | rozmiar wyniku |
|---|---|---|---|---|---|---|---|---|
| `search_trips` | kierunki z motywu/kraju + budżetu | snapshot, seed | nie (sam snapshot) — ale **auto-oferta dokłada żywy hotel + lot** | Redis `dstprice:v1` | p50 1733 · p95 9841 ms | tak (wewnątrz auto-oferty) | pusta lista z `reason` | ≤5 kandydatów + oferta |
| `get_trip_offer` | konkretna oferta hotel + lot | LiteAPI hotele i loty, snapshot | **tak** | `htr:v4`, `flrt:v2`, Next Data Cache | p50 4776 · p95 23449 ms | tak (`Promise.allSettled`) | brakujący składnik → `partial`/`unavailable` | 1 oferta + do 12 zdjęć |
| `list_themes` | slugi motywów | stała `TRAVEL_MOODS` | nie | — | <1 ms | n/d | nie zawodzi | 6 pozycji |

Innych narzędzi konsjerż nie ma — `TOOL_DEFS` ma dokładnie trzy pozycje.

---

## 3. GDZIE UCIEKA CZAS — POMIAR

Benchmark narzędzi, 39 przypadków × 2 przebiegi, Preview (region `iad1`),
**bez modelu** (koszt LLM = 0 zł).

### Rozbicie na zależności — stan sprzed poprawek

| etap | n | p50 | p75 | p95 | max |
|---|---|---|---|---|---|
| **`liteapi.flight`** | 72 | **2365** | **6738** | **14398** | **28603** |
| `redis.snapshot` | 40 | 200 | 226 | 296 | 369 |
| `liteapi.hotel` | 72 | 195 | 275 | 3369 | 3574 |
| `liteapi.gallery` | 68 | 8 | 17 | 46 | 127 |
| `rank` | 38 | 0 | 0 | 1 | 1 |

**Jedna zależność odpowiada za praktycznie cały ogon.** Wyszukanie lotu jest
o rząd wielkości droższe od wszystkiego innego razem wziętego; ranking, którego
dotyczy połowa uwag jakościowych, kosztuje 0 ms — czyli można go poprawiać bez
żadnego kompromisu czasowego.

Dziesięć najwolniejszych przypadków — w każdym dominuje `liteapi.flight`:

```
28604 ms  offer.island-alias        liteapi.hotel=1132  liteapi.flight=28603
23449 ms  offer.warm.cheap-window   liteapi.hotel=3277  liteapi.flight=23449
16662 ms  offer.cold.month-only     liteapi.hotel=100   liteapi.flight=16661
14398 ms  offer.cold.window         liteapi.hotel=3482  liteapi.flight=14398
13582 ms  offer.warm.Barcelona      liteapi.hotel=180   liteapi.flight=13582
```

`offer.warm.Barcelona` to przypadek, który **powinien** być ciepły: cron
`warm-flights` grzeje WAW→BCN na oknie `tydzien-1` przy 2 dorosłych, czyli
dokładnie te parametry. Był zimny, bo konsjerż nie czytał cache'a lotów —
patrz przyczyna 4.

---

## 4. PRZYCZYNY ŹRÓDŁOWE

### 4.1 Czat jako jedyny w serwisie nie używał cache'a lotów

`findCheapestFlightLive` wołało `searchFlightRates` **wprost**, z pominięciem
`flrt:v2` — klucza, który grzeje cron `warm-flights` i z którego korzysta lejek
lotów. Skutki:

* grzana trasa i tak była zimna (13,6 s zamiast ~0,2 s),
* powtórka w tej samej rozmowie („a coś tańszego?") płaciła drugi raz —
  widać to w benchmarku: `offer.island-alias` 28,6 s w przebiegu 1 i 10,9 s
  w przebiegu 2, przy identycznym zapytaniu.

### 4.2 Limit czasu lotu nie mieścił się w budżecie tury

`searchFlightRates` chodziło z domyślnymi 30 s × 3 próby (`liteApiRequest`),
czyli teoretycznie **90 s na jedno wywołanie narzędzia** przy budżecie tury
50 s i `maxDuration` route'a 60 s. Timeouty realnie występują — w logach crona
z tej samej doby: `'WAW-NCE/weekend-1' nieudany: Timed out after 30000ms`.

### 4.3 Ranking po przycięciu listy

Ścieżka „konkretny kraj" robiła `listDestinationsInCountry(country).slice(0, 6)`
**przed** rankingiem. O wejściu na listę decydowała więc pozycja w seedzie,
a nie cena ani dopasowanie.

Zmierzone na **produkcyjnym** snapshocie (2026-09-06): 12 z 46 wycenionych
kierunków było w ten sposób nieosiągalnych.

| kraj | kierunki z ceną | osiągalne | **nieosiągalne** |
|---|---|---|---|
| Hiszpania | 12 | 6 | Palma, Sewilla, Bilbao, Grenada, **Teneryfa**, Malaga (duplikat) |
| Grecja | 8 | 5 | **Rodos, Kos, Zakintos** |
| Włochy | 5 | 2 | Bari, Katania, Palermo |
| **razem** | **46** | **34** | **12** |

Cała Grecja wyspiarska i Teneryfa — czyli kierunki, po które użytkownik
przychodzi — były poza zasięgiem zapytania „chcę Grecję".

### 4.4 `country` wypierało `theme`

`if (country) { … } else { … }` — kraj **zastępował** motyw jako źródło
kierunków, a lista wracała w kolejności popularności seedu. „Ciepło, plaża,
Grecja" stawało się samą Grecją; motyw znikał bez śladu, również z wyniku
podawanego modelowi.

### 4.5 Brak hotelu i brak lotu przechodziły jako oferta

`partial: boolean` nie odróżniało „mam hotel, brakuje lotu" od „nie mam nic".
Przy obu `null` orkiestrator i tak zwracał `offer`, a `trip-offer-card.tsx`
renderowało nagłówek z datami i dwa szare komunikaty „nie udało się
potwierdzić" — wizualnie kartę oferty, w której nie ma oferty.

### 4.6 Podwójny odczyt snapshotu w jednej turze

`search_trips` czytało `dstprice:v1`, a chwilę później auto-oferta czytała go
ponownie, żeby dobrać daty. Dwa round-tripy do Redisa (~100 ms każdy) po
wartość, która w obrębie tury się nie zmienia.

---

## 5. AUDYT CACHE

| warstwa | klucz | TTL | uwzględnia | ryzyko |
|---|---|---|---|---|
| stawki hoteli | `htr:v4:{checkin}:{checkout}:{adults}-{dzieci}-{pokoje}:{waluta}:{hotelId}` | 60 min (10 min dla „brak dostępności") | daty, obsadę, pokoje, walutę, hotel | brak — klucz pełny |
| oferty lotów | `flrt:v2:{trasa}:{pax}:{klasa}:{waluta}` | 10 min (40 min z crona, 10 min dla pustki) | trasę, daty, pax, klasę, walutę | brak — klucz pełny |
| snapshot cen | `dstprice:v1` (JEDEN klucz) | 7 dni; świeżość 48 h przy odczycie | nic — mapa wszystkich kierunków | świadome: to jest zbiorczy odczyt |
| lista hoteli | pełny URL `/data/hotels` | 24 h (Next Data Cache) | miasto/kraj/limit/offset | cap 2 MB na wpis |

**Nadmiernego rozdrobnienia ani zbyt luźnych kluczy nie znaleziono.** Dwa
różne zapytania nie mogą trafić w ten sam wpis: klucz stawek zawiera obsadę
(stąd przypadek `offer.cold.occupancy` jest zimny — 2+2 to inny klucz niż 2+0,
i tak ma być), a klucz lotów zawiera pax i klasę.

Zmierzone koszty odczytu: `redis.snapshot` p50 200 ms (suma dwóch odczytów
w turze, czyli ~100 ms na odczyt) — funkcja stoi w `iad1`, Upstash odpowiada
zza oceanu. To jest stała, z którą trzeba żyć; po memo zostaje jeden odczyt.

Ciepło vs zimno na warstwie hoteli działa: `liteapi.hotel` p50 195 ms
(trafienie w cache crona) przy p95 3369 ms (zimno) — czyli prewarming hoteli
robi dokładnie to, do czego został zbudowany.

---

## 6. POKRYCIE SNAPSHOTU — STAN PRZED

Sonda produkcyjna, 2026-09-06 (`pnpm probe:concierge-snapshot`):

```
kluczy w snapshocie:              46
świeża cena hotelu (≤48 h):       46
ma cenę lotu:                     45
ŚWIEŻY PAKIET = widzi concierge:  45   (98% kluczy, 5,7% seedu)
wiek wpisu p50 0,1 h · p95 0,1 h · max 0,1 h
```

**Okna dat, które `search_trips` może w ogóle zaproponować — DWA:**

| okno | nocy | miesiąc | kierunków |
|---|---|---|---|
| 2026-10-19 → 2026-10-23 | 4 | październik | 33 |
| 2026-11-07 → 2026-11-14 | 7 | listopad | 12 |

Pokrycie motywów jest pełne (6/6 picków z ceną w każdym z 6 motywów), ale
**kalendarzowo snapshot to dwa punkty w roku**. Użytkownik pytający o wakacje
dostaje orientacyjną cenę z października — jest to powiedziane wprost, a karta
i tak pobiera ceny live na jego termin, ale liczba „od X zł" jest z innego
sezonu.

Kraje reprezentowane w snapshocie (46 kierunków): Hiszpania 12, Grecja 8,
Włochy 5, Portugalia 4, Turcja 2, Cypr 2, Austria 2, Maroko 2 oraz po
jednym: Francja, Czechy, Węgry, Albania, Norwegia, Słowenia, Niemcy,
Bułgaria, Malta.

---

## 7. CRON — CO REALNIE ROBI I ILE KOSZTUJE

Z logów runtime produkcji, 2026-09-06, 10 kolejnych przebiegów:

### `/api/cron/warm-rates` — co 30 min

```
destinations 46 (core 23 + snapshot-only 23) · windows 5 · tasks 250
rateCalls 250 · warmedHotels ~6900 · skipped 0
flightCalls 82–92 · flightPrices 81–90 · snapshotEntries 46 · pkgCount 41–46
durationMs: 177891 · 229337 · 230453 · 244041 · 254935 · 256324 · 267841
            272633 · 278318 · 280325
```

**To jest najważniejsza liczba w tej sekcji: `durationMs` sięga 280 s przy
`maxDuration` 300 s i budżecie `WARM_TIME_BUDGET_MS` 250 s.** Cron chodzi na
93% twardego limitu funkcji. `skipped: 0` nie znaczy, że jest luźno — znaczy
tylko, że ostatnie zadania zdążyły wystartować przed wyczerpaniem budżetu.

Rozkład czasu (szacunek zgodny z pomiarem): 250 zapytań o stawki przy
współbieżności 6 × ~4 s ≈ 167 s, plus 90 zapytań o loty przy współbieżności
6 × ~6 s ≈ 90 s → ≈ 257 s.

`pkgCount` waha się 41–46: pakiet powstaje tylko wtedy, gdy w TYM SAMYM oknie
są oba składniki, a loty czasem padają (`lot 'Valencia/tani-tydzien' nieudany:
HTTP 500`). Stąd 1–5 kierunków na przebieg traci wycenę pakietu.

### `/api/cron/warm-flights` — co 30 min (:15, :45)

```
origins 2 · windows 2 · tasks 40 · warmed 38–40 · failed 0–2
durationMs 88411 · 88650 · 101940 · 160538
```

Zapas czasu jest (maxDuration 300 s). W jednym przebiegu dwa zadania padły na
`Timed out after 30000ms` — realne potwierdzenie, że 30 s to nie jest teoria.

### Koszt dzienny LiteAPI (same te dwa crony)

| cron | wywołań/przebieg | przebiegów/dobę | **wywołań/dobę** |
|---|---|---|---|
| warm-rates — stawki | 250 | 48 | 12 000 |
| warm-rates — loty | ~90 | 48 | ~4 320 |
| warm-flights | 40 | 48 | 1 920 |
| **razem** | | | **≈ 18 240/dobę** (≈ 547 tys./mies.) |

Dochodzą `warm-featured-hotels` (co 6 h) i `warm-flight-deals` (co 30 min),
nieobjęte tym audytem.

---

## 8. POKRYCIE SNAPSHOTU — PROPOZYCJA (NIE WDROŻONA W V2.1)

§9 prosi o rozsądny model pokrycia; §11 każe najpierw policzyć. Policzone
wyżej: **w obecnym cronie nie ma miejsca na ani jedno okno więcej.** 280 s
z 300 s to nie jest margines, w którym można dołożyć 46 zapytań o stawki
i 46 o loty (≈ +50 s). Dlatego V2.1 pokrycia NIE rusza — zwiększenie go
wymaga najpierw zwolnienia czasu, a to osobna zmiana z własnym ryzykiem.

Propozycja do decyzji właściciela, w kolejności stosunku zysku do kosztu:

1. **Rozdzielić grzanie hoteli i lotów na dwa crony.** Loty (~90 s) wychodzą
   z `warm-rates` do własnego przebiegu. Koszt: 0 dodatkowych wywołań.
   Zysk: ~90 s wolnego budżetu w `warm-rates`, czyli miejsce na trzecie okno.
2. **Zmienić schemat snapshotu na `pkgByMonth`** — dziś wpis trzyma JEDEN
   pakiet, więc nawet gdyby cron policzył trzy okna, zapisałby najtańsze
   z nich i miesiąc byłby przypadkowy. Bez tej zmiany rozszerzanie okien nie
   ma sensu. Uwaga: czytają to także sekcje homepage („Cały wyjazd w jednej
   cenie") — zmiana wykracza poza konsjerża.
3. **Trzecie okno = najbliższy miesiąc + jedno okno sezonowe rotowane po
   przebiegach** (np. lipiec/sierpień w I kw., ferie zimowe w IV kw.).
   Koszt przy płytkim skanie (top-50, 1 paczka): +46 zapytań o stawki
   i +46 o loty na przebieg = **+4 416/dobę (+24%)**.
4. **Nie robić macierzy** 800 kierunków × 12 miesięcy × 10 długości pobytu —
   to 96 tys. kombinacji, czyli trzy rzędy wielkości ponad obecny wolumen.

Do czasu tej decyzji obowiązuje mechanizm z V2.1: kandydat niesie
`monthMatch`, więc model mówi wprost „orientacyjnie, dla terminu X", a karta
oferty pobiera **żywe** ceny na termin użytkownika.

---

## 9. RESIDUALS (POZA ZAKRESEM V2.1)

* dwa pływające CTA 7 px od siebie na mobile — §35, świadomie nietknięte,
* globalne `font: inherit` — §35, świadomie nietknięte,
* `pkgCount` gubi 1–5 kierunków na przebieg przez błędy 500 z `/flights/rates`
  po stronie dostawcy — do obserwacji, nie do obejścia kodem,
* `trustpilot: "failed"` w KAŻDYM przebiegu crona (`brak danych w odpowiedzi
  (challenge?)`) — pasy zaufania jadą na starym wpisie; osobny temat,
* `climate` w seedzie jest modelem syntetycznym (maj–wrzesień = ciepło,
  reszta = zimno) i bywa po prostu nieprawdziwy (Antalya w październiku
  oznaczona jako „cold"). NIE użyto go w rankingu — świadomie.
