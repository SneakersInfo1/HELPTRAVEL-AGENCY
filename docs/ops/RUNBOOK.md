# Runbook produkcji — loty, Redis, crony

Stan po przywróceniu produkcji 2026-11-01/03 (PR #139–#146). Bez wartości
sekretów — tylko nazwy zmiennych i kluczy.

## Wyłączniki natychmiastowe (bez wdrożenia, konsola Upstash → Data Browser / CLI)

| Co | Polecenie | Skutek |
|---|---|---|
| Wszystkie crony | `SET cron:v1:off 1 EX 86400` | crony kończą się `200 skipped_disabled`; ruch użytkowników bez zmian |
| Jeden cron | `SET cron:v1:off:warm-rates 1 EX 3600` | jw., tylko ten job (`warm-rates`, `warm-flights`, `warm-flight-deals`, `warm-featured-hotels`, `build-concierge-snapshot`) |
| Powrót cronów | `DEL cron:v1:off` (lub `…:<job>`) | od najbliższego przebiegu |
| Wstrzymanie WSZYSTKICH wyszukiwań lotów u dostawcy (też użytkowników — ostateczność) | `SET flgov:v1:pause "access_denied\|<untilMs>" EX <sekundy>` | wyszukiwarka odpowiada 503 „chwilowo przeciążona”, zero zapytań do LiteAPI |

Uwaga do pauzy lotów: instancja, która już zobaczyła pauzę, pamięta ją lokalnie
do `untilMs` — `DEL` nie wznawia jej wcześniej. Ustawiaj krótkie `untilMs`
(epoka w ms) i w razie potrzeby przedłużaj.

## Przełączniki przez zmienne środowiskowe (Vercel, działają po redeployu ~2 min)

| Zmienna | Domyślnie | Znaczenie |
|---|---|---|
| `FLIGHTS_BACKGROUND_SEARCH` | wyłączone | `on` włącza wyszukiwania lotów w cronach (prewarming, okazje, snapshot czatu). Przed włączeniem: potwierdzić limit konta w LiteAPI. |
| `FLIGHTS_BACKGROUND_DAILY_LIMIT` | 50 / dobę UTC | sufit wyszukiwań cronów |
| `FLIGHTS_SEARCH_DAILY_LIMIT` | 500 / dobę UTC | sufit wyszukiwań użytkowników i czatu (liczone tylko trafienia do dostawcy, nie cache) |
| `FLIGHTS_PROVIDER_CONCURRENCY` | 1 (zakres 1–4) | ile wyszukiwań lotów naraz u dostawcy, na wszystkich instancjach. Nie podnosić bez potwierdzenia limitu przez LiteAPI: zapytania równoczesne to zmierzona przyczyna 429 |
| `FLIGHTS_PROVIDER_MIN_INTERVAL_MS` | 65 000 ms (do 300 000) | minimalny odstęp między zapytaniami do dostawcy. Zmierzone pary 1–6.11: 9,46 s → 429, 63,8 s → 200, więc prawdziwy limit leży między nimi. Skracać dopiero po odpowiedzi LiteAPI |
| `SERVER_ERROR_ALERT_THRESHOLD` | 20 / 10 min | próg alarmu serii nieobsłużonych 5xx |

## Co robi gubernator lotów sam

- **429 od LiteAPI (także 5xx z `Retry-After`):** pauza wszystkich instancji na `Retry-After` (15 s–15 min, domyślnie 60 s), bez ponowień.
- **Bez automatycznych ponowień po stronie serwera** (5xx, timeout, zerwane połączenie): drugie zapytanie w tym samym oknie to przepis na 429. Czat ma własną drugą próbę w budżecie tury, ale idzie ona przez tę samą bramkę.
- **401 / 403 / 40301:** pauza 15 min i alarm krytyczny.
- **Budżety dzienne:** alarm przy 50 %, 80 %, 100 %. Po przekroczeniu odpowiedź 503 bez zapytania do dostawcy.
- **Te same zapytania równolegle:** jedno zapytanie do dostawcy, jeden wynik dla wszystkich.
- **Bramka slotów (`flgov:v1:slot:<n>`):** najwyżej jedno wyszukiwanie naraz u dostawcy na wszystkich instancjach i odstęp między zapytaniami. Po zajęciu slotu kod zawsze najpierw czyta cache. Slot zajęty dłużej, niż wolno czekać (3 s użytkownik, 5 s czat, 2 s tło) → 503 `PROVIDER_BUSY` z `Retry-After` do zwolnienia, bez zapytania do dostawcy. Trasa z cache nie przechodzi przez bramkę.
- **Lista wyników:** lotniska z grupy idą po kolei, najpierw główne. Na `PROVIDER_BUSY` przeglądarka sama czeka do terminu i wraca (`Kolejne lotnisko sprawdzimy za N s`), więc „Warszawa — wszystkie lotniska” trwa około 2 min, a „Polska” około 5,5 min, z ofertami od pierwszego lotniska. Pauza, limit albo dwa błędy z rzędu przerywają przebieg. Ponowienie obejmuje tylko nieudane lotniska.
- **Czat w oknie odstępu:** dostaje `PROVIDER_BUSY` i oddaje ofertę bez lotu, zamiast wywołać 429.
- **Redis niedostępny:** użytkownicy przechodzą (licznik lokalny, bramka lokalna w obrębie instancji), crony stoją. Bramka nie obejmuje wtedy innych instancji: dwóch gości w tej samej chwili może dostać 429. To świadomy wybór zamiast wyłączania lotów na czas awarii Upstash. Gdy magazyn pada w trakcie czekania na czyjś slot, odmowa, bo wtedy wiadomo, że ktoś właśnie pyta dostawcę.

## Monitoring

- `GET /api/cron/flights-usage` z nagłówkiem `Authorization: Bearer $CRON_SECRET` zwraca:
  - dzisiejsze liczniki (użytkownicy, tło),
  - wyniki: `ok`, `throttled`, `denied`, `error`,
  - aktywną pauzę i stan `backgroundSearch`.
- `GET /api/health` zwraca stan i opóźnienie Redisa (ciepłe ~4–6 ms w fra1), stan wyłącznika obwodu, region i commit.
- Alerty idą na `ALERT_WEBHOOK_URL` i pokrywają:
  - pauzę lotów (429, 403/40301),
  - budżety lotów,
  - serię nieobsłużonych 5xx (`[alert][critical][server]`),
  - cron, który przekroczył 3× swój budżet transferu Redis,
  - trwałą awarię Redisa.
- Logi Vercela:
  - `[redis-metrics]`: KB wysłane i odebrane per trasa i cron (podstawa szacunku transferu Upstash; miarodajny jest panel Upstash),
  - `[cron-lock]`,
  - `[alert]`.

## Odmowy prebooku hotelu (`offerref:v1`)

Gdy LiteAPI odrzuci ofertę przy prebooku (wyprzedana albo wygasła), trasa
`/api/booking/prebook` zapisuje znacznik `offerref:v1:o:<skrót offerId>` (TTL 30 min)
i unieważnia stawki tylko tego hotelu i terminu, najwyżej raz na 60 s
(`offerref:v1:cd:…`). Tej warstwy nie trzeba czyścić, klucze wygasają same.

- Strona hotelu nie czyta Redisa. Trasa prebooku robi jeden GET. Gościowi z odmową
  ofertę ukrywa odcisk w jego linku (`refused=<odcisk>`), innych gości to nie dotyczy.
- Błąd Redisa oznacza brak wiedzy o odmowach, nigdy błąd rezerwacji. Gorszy wariant
  to gość, który kliknie martwą ofertę i dostanie zwykłą odmowę od dostawcy.
- Ślad w logach: `[liteapi][booking][prebook] … code=RATE_UNAVAILABLE`. Powtórka tej
  samej oferty nie idzie do dostawcy i ma wpis `oferta odrzucona wcześniej`.
- Test całego toru na atrapach: `pnpm build && pnpm e2e:odmowa`.

## Cron warm-rates (`/api/cron/warm-rates`, co 30 min)

**Incydent 2026-11-06 („Task timed out after 300 seconds”), przyczyna zmierzona.**
Stawki z crona szły przez Next Data Cache (`revalidate` 900 s). Przy cronie co 30 min
każdy wpis był przeterminowany, więc Data Cache oddawał stare ceny od ręki (handler
~6 s, log `ok:true`), a dostawcę pytał w tle: wszystkimi ~250 zadaniami naraz
i bez sygnału przerwania, bo Next celowo go nie przekazuje przy odświeżaniu w tle.
Funkcja czekała na to tło (`waitUntil`). Jedno z 250 zapytań wisiało 298,7 s
(metryka External APIs: `http_status -1`), więc funkcja dobiła do limitu z HTTP 200.
Skutki uboczne: realna równoległość ~136 zamiast 6 (zmierzone na atrapie),
a w Redisie i snapshocie lądowały ceny sprzed cyklu.

**Jak działa po poprawce (`src/lib/hotels/warm-rates-cron.ts`):**

- Stawki i listy hoteli są zawsze świeże, idą na pierwszym planie (`skipDataCache`,
  a w trasie `fetchCache = "force-no-store"`). Każde zapytanie ma limit 15 s i jedną próbę.
- Pula o stałej równoległości 6. Po 200 s przebieg nie zaczyna nowych zadań,
  po 215 s przerywa trwające. Bezpiecznik: 3 odmowy 403/429 albo 12 błędów z rzędu
  kończą przebieg.
- Bliskie okna (cache wyników `htr:`) idą co przebieg. Tanie okna snapshotu „od X zł”
  idą w rotacji: 8 kierunków na przebieg, pełny obieg 46 kierunków w około 3 h.
  Na przebieg wychodzi ~101 zapytań zamiast 250.
- Punkt kontrolny `warmrates:v1:state`: kursor rotacji, licznik nieudanych przebiegów
  i znacznik trwającego przebiegu. Przerwany albo niezaczęty kierunek wraca jako
  pierwszy, a nieudany zapis snapshotu powtarza całą partię. Znacznik, którego nikt
  nie wyczyścił, oznacza przebieg zabity przez platformę: seria rośnie już na starcie
  następnego. Gdy znacznika nie da się zapisać, przebieg jest pomijany.
- Kierunek z nieudanym zadaniem (błąd, limit czasu, odmowa) nie nadpisuje snapshotu,
  bo minimum z części okien zawyżyłoby „od X zł”. Stary wpis zostaje (ważny 48 h),
  kursor idzie dalej, a kierunek wraca w kolejnym obiegu.
- Plan hoteli `warmrates:v1:ids:<kierunek>`: lista hotelId z TTL 7 dni, odświeżana
  po 24 h (najwyżej 6 na przebieg) zamiast `/data/hotels` w każdym przebiegu.

**Odczyt logu** — jedna linia `[cron/warm-rates] {…}` na przebieg (`console.warn`, gdy nieudany):

| Pole | Znaczenie |
|---|---|
| `stopReason` | `completed`, `time_budget`, `provider_refused`, `provider_unavailable` albo `store_lost` |
| `rateCalls` / `succeeded` / `failed` / `timedOut` / `refused` / `aborted` / `skipped` | zadania: wysłane, udane, nieudane (w tym limit czasu i odmowy), przerwane przez nas, niezaczęte |
| `providerRequests` | wszystkie zapytania HTTP do LiteAPI w przebiegu (stawki i plany) |
| `plan.hits` / `plan.refreshed` | listy hoteli z Redisa i pobrane od dostawcy |
| `rotation` | partia tanich okien: `from`, `size`, `of`, kursor `next` |
| `previousRunDied` / `failStreak` | poprzedni przebieg zabity, nieudane przebiegi z rzędu po tym przebiegu |
| `snapshotSaved` / `stateSaved` | czy zapisał się snapshot cen i stan (nieudany snapshot = partia do powtórki) |

**Alert:** po 3 nieudanych przebiegach z rzędu `[alert][warning][cron]` idzie na
`ALERT_WEBHOOK_URL`, potem co 16 przebiegów (≈ 8 h). Zabite przebiegi też się liczą.
Nieudany przebieg to:
- zatrzymanie przed czasem;
- co najmniej połowa zadań nieudana;
- zero zadań, np. zimny start przy leżącym `/data/hotels`;
- połowa kierunków bez listy hoteli;
- nieudany zapis snapshotu.

Linia `[alert]` w logu powstaje zawsze, nawet gdy webhook nie odpowie.

**Ręczne zatrzymanie:** `SET cron:v1:off:warm-rates 1 EX 3600`, sekcja „Wyłączniki”.
Nie wywoływać crona wielokrotnie ręcznie: każdy przebieg to ~100 zapytań do LiteAPI.

**Pomiar w Vercelu bez czytania logów** (`vercel metrics`, filtr
`origin_path eq '/api/cron/warm-rates'`):

- `vercel.external_api_request.count` z podziałem na `fetch_type`: po poprawce
  wyłącznie `origin`, bez `cache-get` i `cache-set`;
- `vercel.function_invocation.function_duration_ms`: czas całej funkcji, łącznie z tłem.

## Wycofanie wdrożenia

Vercel → Deployments → filtr *Production* → wdrożenie z poprzednim commitem →
*Promote to Production* (bez przebudowy). Kolejność commitów na `main` w tej
misji:

1. `f4ac371` — crony bez wyszukiwań lotów
2. `140beeb` — gubernator
3. `a8ee34c` — funkcje w fra1
4. `5795e0a` — lżejsza strona hotelu
5. `a0ea9c1` — E2E
6. `35f3dee` — alarm 5xx + wyłącznik cronów
7. `ac4694e` — hero strony głównej (wycinek na telefon)

Stan sprzed misji: `335929d`.

## Znane ograniczenia (2026-11-02)

- **Limit wyszukiwań lotów konta LiteAPI** po odblokowaniu jest nieznany. Limity powyżej są celowo konserwatywne; podnosić dopiero po odpowiedzi supportu. Bramka obejmuje tylko `/flights/rates`: jeśli limit konta liczy też `verify`, `prebook` i `book`, te wywołania mogą się z nią minąć.
- **Testy lotów bez ruchu do dostawcy:** `pnpm build && pnpm e2e:loty` (atrapy LiteAPI i Upstash, dwa procesy serwera). Główna konfiguracja Playwrighta idzie do żywego LiteAPI.
- **Sekcja „Tanie loty z Polski”** na stronie głównej jest ukryta, dopóki crony lotów są wyłączone. Pokazuje tylko ceny młodsze niż 7 h, więc zamiast nieaktualnych cen nie pokazuje nic.
- **Pakiety lot+hotel w snapshocie czatu** są puste. Czat szuka lotów na żywo (źródło `chat`, w budżecie użytkowników).
