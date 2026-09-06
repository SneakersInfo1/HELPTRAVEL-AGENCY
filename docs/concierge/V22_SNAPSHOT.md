# Concierge V2.2 — snapshot, świeżość terminów, pokrycie

Gałąź `feat/concierge-snapshot-v22`. Dokument jest raportem z audytu i decyzji
architektonicznych (§66) plus tabelą BEFORE/AFTER (§65).

**Data pomiarów: 2026-09-06.** Wszystkie liczby „BEFORE" pochodzą z
produkcyjnego Upstash (`pnpm probe:concierge-snapshot`), nie z szacunków.

---

## 1. Architektura zastana

```
Vercel Cron (vercel.json)
│
├─ /api/cron/warm-rates            */30 * * * *   maxDuration 300, budżet 250 s
│    │                                            ZMIERZONE: 178–280 s (do 93%)
│    ├─ dobór kierunków: getTopDestinations(10) ∪ HOME_TILE(18)
│    │                   ∪ TRAVEL_MOODS.picks ∪ PACKAGE(12)      → ~46
│    ├─ okna: computeWarmDateWindows()      [3 bliskie — cache wyszukań]
│    │        computeSnapshotDateWindows()  [2 tanie — snapshot cen]
│    ├─ metadane hoteli   fetchHotelsForDestination  (×46)
│    ├─ stawki hoteli     resolveSlimRates           (~250 zadań, concurrency 6)
│    ├─ ceny lotów        searchFlightRates WAW→cel  (~92 zadania, concurrency 6)
│    ├─ pakiety           computePackagePerPerson    (lot+hotel z TEGO SAMEGO okna)
│    ├─ zapis             mergePriceSnapshot → `dstprice:v1`   (odczyt-scal-zapis)
│    └─ trustpilot        refreshTrustpilotSnapshot
│
├─ /api/cron/warm-flights          15,45 * * * *   → `flrt:v2` (WAW/KRK × 14 IATA)
├─ /api/cron/warm-featured-hotels  5 */6 * * *     → `hotfeat:v1`
└─ /api/cron/warm-flight-deals     10,40 * * * *   → `fltdeal:v1`

Concierge
├─ search_trips    → readPriceSnapshot(`dstprice:v1`) → rankTripCandidates (czysty)
└─ get_trip_offer  → datesForMonth / okno pakietu → LIVE LiteAPI (hotel + lot)
```

Pliki: `src/app/api/cron/warm-rates/route.ts`, `src/lib/hotels/warm-config.ts`,
`src/lib/prices/destination-price-snapshot.ts`, `src/lib/concierge/tools.ts`,
`src/lib/concierge/trip-search.ts`.

---

## 2. Przyczyna źródłowa niskiego pokrycia

Zmierzone: **46 kierunków z ceną na 796 w seedzie = 5,8%**, przy czym każdy
kierunek miał **dokładnie jedno okno**:

```
32 × 2026-10-19 → 2026-10-23   (4 noce, październik)
14 × 2026-11-07 → 2026-11-14   (7 nocy, listopad)
```

Cztery niezależne przyczyny:

1. **Snapshot był produktem ubocznym grzania cache'u hoteli, nie indeksem
   discovery.** Zbiór kierunków wynika z kafelków homepage, sekcji pakietów
   i picków motywów — czyli z tego, co pokazuje strona, a nie z tego, o co
   pytają ludzie w czacie.

2. **Kształt danych mieścił jeden termin na kierunek.** `DestinationPriceEntry`
   ma pojedyncze pola `pkgCheckin`/`pkgCheckout`, więc cron zapisywał TYLKO
   tańszy z dwóch policzonych pakietów. Pytanie „Grecja, listopad, 7 nocy" nie
   miało jak trafić — nie z braku danych, tylko z braku miejsca na nie.

3. **Policzone dane były wyrzucane.** Cron liczył `hotelByWindow` i
   `flightByWindow` dla obu okien, po czym zostawiał jedno minimum.

4. **Nie było gdzie dołożyć.** 178–280 s przy limicie 300 s to brak marginesu;
   każde dodatkowe okno lub kierunek to zadanie ×46.

Dodatkowo `popularity` w seedzie **nie jest polskim popytem**: 640 z 796
kierunków ma 50–59 (brak rozróżnienia), a czołówka to sama Hiszpania. Repo nie
ma użytecznego pomiaru ruchu (`/api/events` bez `DATABASE_URL`, Vercel Analytics
wyłączone, logi zdominowane przez boty), więc tiering musi stać na listach
kuratorowanych.

**Przy okazji:** seed ma **10 par duplikatów `id`** (warianty diakrytyczne —
`Malaga`/`Málaga` oba jako `malaga-spain`, `Krakow`/`Kraków`), czyli 796
rekordów, ale 786 unikalnych kierunków.

---

## 3. Przyczyna źródłowa błędu z przeszłą datą

Zrzut od właściciela: starter „Plaża do 3000 zł **w sierpniu**" we wrześniu,
a po kliknięciu karta „Larnaka **10–17 sierpnia**". Trzy niezależne przyczyny,
z których **żadna sama nie była błędem**:

1. **Starter był stałą tablicą w komponencie**
   (`concierge-chat.tsx:67`). Tekst z nazwą miesiąca nie ma jak zestarzeć się
   głośno: nic go nie waliduje i nikt go nie odświeża.

2. **`formatDateRangePl` nigdy nie drukował roku.** `datesForMonth(8, …)`
   z 2026-09-06 rozwiązuje sierpień poprawnie na **2027-08-10** (najbliższy
   przyszły), ale bez roku wyświetla się to jako „10–17 sierpnia" — 6 września
   2026 nieodróżnialne od terminu, który właśnie minął. **To jest ten zrzut.**

3. **Ranking nie sprawdzał daty wyjazdu w ogóle.** `rankTripCandidates`
   filtrował wyłącznie wiek CENY (`pkgComputedAt ≤ 48 h`). Rekord z wczorajszym
   wyjazdem i dzisiejszą ceną przechodził jako „świeży" — a że przeszłe terminy
   są tanie, trafiłby na szczyt listy. Że nie było tego widać, wynikało
   wyłącznie z tego, że cron akurat grzeje okna 40–60 dni naprzód.

Czwarta, osobna rzecz: **sierpień 2027 jest formalnie poprawny, ale handlowo
martwy** — 338 dni naprzód GDS nie ma jeszcze rozkładów, więc karta wracała
bez lotu.

---

## 4. Rozważone opcje

| | A — minimalna | B — rozdzielenie cronów | C — rozdzielenie + tiering + rotacja |
|---|---|---|---|
| Złożoność | niska | średnia | wyższa |
| Obciążenie API | bez zmian | +100% (dublowanie) | +38% (kontrolowane) |
| Czas crona | bez zmian (93% limitu) | 2 × ~50% limitu | ~50% limitu, z rotacją |
| Pokrycie | 5,8% (bez zmian) | ~8–10% | **17,7% sufitu** |
| Ryzyko awarii | bez zmian | brak atomowej publikacji | staging + rollback |
| Redis | bez zmian | +1 klucz | +3 klucze (~60 kB) |
| Utrzymanie | najtańsze | średnie | konfiguracja w jednym pliku |

**A odpada**, bo nie ruszy głównego KPI (§47). **B odpada**, bo samo
rozdzielenie bez tierowania wydaje więcej zapytań równomiernie, zamiast wydawać
je tam, gdzie są pytania. **Wybrano C.**

---

## 5. Wybrana architektura

Kluczowa decyzja: **osobny cron i osobny indeks**, zamiast rozbudowy
istniejącego. `warm-rates` zostaje **nietknięty** i dalej pisze `dstprice:v1`
dla homepage i `/wyjazdy` — awaria snapshotu konsjerża nie może zabrać cen
„od X zł" ze strony głównej.

```
/api/cron/build-concierge-snapshot   25 * * * *   maxDuration 300, budżet 170 s
│
├─ tiering kierunków   buildDestinationTiers(seed)      A 53 / B 86 / C 647
├─ macierz okien       buildWindowMatrix(dziś)          4 mies. × {4,7} nocy = 8
├─ plan przebiegu      planRun(segment z zegara)        68 z 1020 zadań
│    dla każdego zadania (kierunek × wylot × okno):
│      ├─ lot:   getCachedFlightOffers(`flrt:v2`) → miss: live + zapis "warm"
│      └─ hotel: resolveSlimRates (metadane raz na kierunek)
├─ carry-forward       ACTIVE − przeterminowane + świeże
├─ pokrycie            computeCoverage → meta.coverage
├─ staging             `csnap:v1:build:<runId>`         TTL 1 h
├─ walidacja           kształt, daty, ceny, bramka zapaści pokrycia
└─ ATOMOWY promote     PREVIOUS ← ACTIVE, potem ACTIVE ← nowy   (jedno SET)
```

### 6. Rozdzielenie cronów
`warm-rates` (bez zmian) grzeje cache hoteli i pisze indeks homepage.
`build-concierge-snapshot` (nowy) buduje indeks discovery konsjerża. Wspólny
jest tylko cache lotów `flrt:v2` — i to celowo: nowy cron **czyta** z niego
i **dopisuje** z `kind="warm"`, więc build przy okazji grzeje cache realnych
wyszukań użytkowników.

### 7. Tiery kierunków (`src/lib/snapshot/tiers.ts`)
- **A (53)** — listy kuratorowane przez właściciela: kafelki homepage, sekcja
  pakietów, pula „polecane hotele", picki motywów, plus kierunki na trasach
  wybranych do prewarmingu lotów. To jest jedyny sygnał w repo, który realnie
  opisuje polski ruch leisure.
- **B (86)** — `popularity ≥ 60`, ale **z limitem 4 na kraj**. Bez limitu ta
  lista byłaby spisem miast hiszpańskich (32 z nich mieści się w progu).
  Efekt: 32 kraje zamiast jednego.
- **C (647)** — długi ogon, obsługiwany on-demand przez live LiteAPI.

Wagi do pokrycia ważonego: A=6, B=2, C=1.

### 8. Tiery lotnisk wylotu
- **A**: `WAW` (grupa „Warszawa — wszystkie lotniska" i tak robi fan-out
  `[WAW, WMI, RDO]`, więc grzane WAW trafia w leg takiego użytkownika).
- **B**: `KRK`, `KTW`, `GDN`, `WRO` — rotowane po kierunkach tieru A
  stabilnym hashem z `id`, żeby w ogóle kiedyś dostały pokrycie.

### 9. Strategia okien
4 najbliższe miesiące × {4, 7} nocy, **każdy miesiąc z każdą długością**
(koniec z „październik = tylko 4 noce, listopad = tylko 7"). 7 nocy kotwiczy
się na sobocie (klasyczny turnus), 4 noce na poniedziałku (stawki weekdayowe).
Wyprzedzenie ≥14 dni. Okno należy do miesiąca swojego **wyjazdu** — dokładnie
tak, jak konsjerż dopasowuje miesiąc.

Wygenerowane 2026-09-06:
`2026-09|4n, 2026-09|7n, 2026-10|4n, 2026-10|7n, 2026-11|4n, 2026-11|7n, 2026-12|4n, 2026-12|7n`

### 10. Rollover dat
Jedno źródło „dziś": `travelToday()` w **Europe/Warsaw**
(`src/lib/time/travel-now.ts`). Arytmetyka dat na północy UTC, więc zmiana
czasu nie gubi doby.

- **miesiąc bez roku** → najbliższe **przyszłe** wystąpienie; zostajemy
  w bieżącym roku, dopóki w tym miesiącu mieści się jeszcze termin
  z wyprzedzeniem (żeby „lipiec" 10 lipca nie skakał o rok);
- **miesiąc z rokiem, który minął** → `state: "PAST"`, `bookable: false` —
  rozmowa mówi, że termin minął, i prosi o inny; zero oferty;
- **termin poza horyzontem sprzedaży (330 dni)** → karta pokazuje najbliższy
  dostępny termin i niesie `dateNote`, który model MA wypowiedzieć.

### 11. Rotacja
1020 zadań / 15 segmentów, segment liczony z zegara
(`floor(now/30min) % 15`) — bez kursora w Redisie, więc nie ma stanu do
zgubienia. Round-robin po liście posortowanej priorytetem, więc **każdy
przebieg odświeża tier A** (w innych oknach), a pełny obieg zamyka się
w ~7,5 h.

Priorytet (§29): tier kierunku → tier lotniska → bliższy miesiąc → dłuższy
pobyt → popularność (remisy).

### 12. Strategia cache
`EXACT snapshot hit` → zero live. `NEAREST` → też zero live, ale oznaczone.
Auto-oferta (`get_trip_offer`) i tak liczy cenę LIVE, bo to ona idzie do
koszyka; snapshot służy WYŁĄCZNIE do discovery i cen orientacyjnych.

### 13–17. Wersjonowanie, staging, publikacja, PREVIOUS, rollback
`meta` niesie `version`, `runId`, `builtAt`, `coverage`, `windowConfig`,
`originConfig`, `destinationTierConfig`, `segment`. Build → staging
(`csnap:v1:build:<runId>`, TTL 1 h) → walidacja → promote: najpierw
`PREVIOUS ← obecny ACTIVE`, potem `ACTIVE ← nowy`. Kolejność jest istotna:
przerwanie po pierwszym zapisie zostawia stan nadmiarowy, ale spójny.
`rollbackToPrevious()` przywraca poprzednią wersję jednym zapisem.

### 18. Blokowanie
`zajmijBlokade("build-concierge-snapshot", 420)` — compare-and-delete przy
zwalnianiu, `finally` zwalnia także po wyjątku, zajęte = `200 skipped_locked`.

### 19. Polityka nieświeżości
Dwie **osobne** osie. Stan terminu: `FUTURE` / `EXPIRED`. Świeżość ceny:
`FRESH` (≤12 h) / `STALE_BUT_USABLE` (≤48 h) / `EXPIRED_PRICE`. Oferta może
być przyszła i mieć starą cenę — wtedy jest orientacyjna, nie „aktualna".
Carry-forward: nieudane odświeżenie **nie kasuje** dobrej starszej ceny.

### 20. Bramka pokrycia
Publikacja odrzucona, gdy nowy build ma <60% rekordów obecnego ACTIVE
(łapie zapaść 120 → 8, nie karze za gorszy dzień u dostawcy), gdy ma <20
rekordów, gdy niesie rekord z przeszłym terminem, złą walutę, złą liczbę nocy
albo cenę NaN/ujemną/nieskończoną. Drogie, ale prawdziwe oferty **nie** są
filtrowane — to byłoby kłamstwo o rynku.

### 20b. Benchmark współbieżności (§27) — POMIAR, nie szacunek

8 zimnych zadań na poziom, każdy poziom na innym (równie zimnym) segmencie,
wszystko jako dry run, Preview 2026-09-06:

| współbieżność | czas 8 zadań | na zadanie | przepustowość | błędy | timeouty | 429/5xx |
|---|---|---|---|---|---|---|
| 1 | 111,2 s | 13,9 s | 0,07 zad./s | 0 | 0 | 0 |
| 2 | 56,2 s | 7,0 s | 0,14 zad./s | 0 | 0 | 0 |
| 3 | 48,6 s | 6,1 s | 0,16 zad./s | 0 | 0 | 0 |
| 4 | 20,3 s | 2,5 s | 0,39 zad./s | 0 | 0 | 0 |
| **5** | **19,2 s** | **2,4 s** | **0,42 zad./s** | 0 | 0 | 0 |
| 6 | 57,2 s | 7,2 s | 0,14 zad./s | 0 | 0 | 0 |

**Sweet spot: 5.** Skalowanie jest ~liniowe do 4–5, powyżej nie ma zysku.
Na żadnym poziomie nie było błędu, timeoutu ani 429 — nie ocieramy się
o limiter (V2.1 zmierzył go dopiero przy 325 zapytaniach).

Ważniejsza od sweet spotu jest **wariancja**: czas POJEDYNCZEGO zadania to
2,4–13,9 s i zależy od trasy, nie od współbieżności. Dlatego budżet zadań
liczony jest z gorszego, a nie ze średniego przypadku — pierwotne
`TASK_BUDGET = 110` pochodziło ze średniej i przy wolniejszym dniu
u dostawcy ucinałoby końcówkę planu.

Efekt: **`TASK_BUDGET` 110 → 70**, **`SEGMENT_COUNT` 10 → 15**, cron co 30 min
zamiast co godzinę (pełny obieg 7,5 h, wewnątrz progu FRESH = 12 h).
1020 / 15 = 68 zadań na segment, więc `slice(0, 70)` niczego nie ucina —
pełny obieg pokrywa całą listę.

### 21. Obciążenie API
~70 lotów + ~70 stawek + ~40 metadanych = **~180 zapytań/przebieg**,
× 48 przebiegów = **~8 600/dobę**. Baza (`warm-rates` co 30 min + trzy
pozostałe crony) to ~16 000/dobę → **wzrost ~53%**, poniżej progu
„2× baseline" z §57. Część zapytań lotniczych trafia w istniejący `flrt:v2`
(benchmark widział 0–3 trafienia na 8 zadań), więc realny wzrost jest niższy.

### 22. Obciążenie Redis
~1020 rekordów × ~200 B ≈ 200 kB JSON → po gzipie kilkadziesiąt kB.
Trzy klucze (`active`, `previous`, przejściowy `build:<runId>`).

---

## 23. Tabela BEFORE / AFTER

Kolumna AFTER-konfiguracja to sufit wynikający z kodu (zmierzony sondą);
kolumna AFTER-Preview zostanie uzupełniona po pełnym przebiegu na Preview.

| METRYKA | BEFORE (prod) | AFTER (konfiguracja) |
|---|---|---|
| kierunków w seedzie | 796 (786 unikalnych) | 786 unikalnych |
| kierunków z jakąkolwiek ceną | 46 | — |
| destination coverage | **5,8%** | — |
| future usable destinations | **nie mierzone** | mierzone (KPI) |
| future usable coverage | **nie mierzone** | sufit **17,7%** |
| HOT (tier A) weighted coverage | nie mierzone | mierzone |
| miesięcy pokrytych | **2** | **4** |
| długości pobytu | **2** (rozłącznie!) | **2 × każdy miesiąc** |
| lotnisk wylotu | **1** (WAW) | **1 + rotacja 4** |
| rekordów w snapshocie | 46 | do 1020 |
| liczba cronów | 4 | 5 |
| runtime warm-rates | 178–280 s / 300 s (**93%**) | bez zmian |
| runtime nowego crona | — | zmierzone ~19 s / 8 zadań przy c=5; budżet 170 s / 300 s (**57%**) |
| współbieżność (sweet spot) | nie mierzone | **5** (0 błędów, 0 429 na wszystkich poziomach) |
| zapytań LiteAPI/dobę | ~16 000 | ~24 600 (**+53%**) |
| snapshot: publikacja | merge w miejscu | staging + atomowy promote |
| snapshot: rollback | **niemożliwy** | jeden zapis |
| **oferty z przeszłości** | możliwe (brak filtru) | **0** (filtr twardy) |
| **CTA z przeszłą datą** | możliwe (brak walidacji) | **0** (walidacja w karcie) |
| **startery z minionym miesiącem** | **1** | **0** (test na 12 miesięcy) |

---

## 24. Bramki P0 (§64)

| Blokada | Stan | Gdzie |
|---|---|---|
| starter z minionym miesiącem | ✅ | `starters.ts` + test na 12 miesięcy |
| expired record wchodzi do rankingu | ✅ | `trip-search.ts` filtr 0, `snapshot-candidates.ts` |
| przeszła oferta może się wyrenderować | ✅ | `offer-date-guard.ts` + wczesny return w karcie |
| CTA z przeszłą datą | ✅ | `withSafeDateParams` (fail-closed) |
| „sierpień" po sierpniu = przeszłość | ✅ | `resolveMonthWithoutYear` |
| cron grzeje przeszłe okna | ✅ | `buildWindowMatrix` + test na 12 miesięcy |
| future usable coverage nie mierzone | ✅ | `coverage.ts` + sonda |
