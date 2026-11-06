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
| `FLIGHTS_PROVIDER_MIN_INTERVAL_MS` | 1500 ms | minimalny odstęp między zapytaniami do dostawcy. To założenie robocze, nie zmierzony limit konta |
| `SERVER_ERROR_ALERT_THRESHOLD` | 20 / 10 min | próg alarmu serii nieobsłużonych 5xx |

## Co robi gubernator lotów sam

- **429 od LiteAPI (także 5xx z `Retry-After`):** pauza wszystkich instancji na `Retry-After` (15 s–15 min, domyślnie 60 s), bez ponowień.
- **Timeout albo zerwane połączenie:** bez ponowienia po stronie serwera, slot zajęty jeszcze 3 s, bo dostawca może pracować nad porzuconym zapytaniem. Automatycznie ponawiane jest tylko szybkie, odebrane 5xx (raz). Czat ma własną drugą próbę w budżecie tury.
- **401 / 403 / 40301:** pauza 15 min i alarm krytyczny.
- **Budżety dzienne:** alarm przy 50 %, 80 %, 100 %. Po przekroczeniu odpowiedź 503 bez zapytania do dostawcy.
- **Te same zapytania równolegle:** jedno zapytanie do dostawcy, jeden wynik dla wszystkich.
- **Bramka slotów (`flgov:v1:slot:<n>`):** najwyżej jedno wyszukiwanie naraz u dostawcy na wszystkich instancjach. Kto czekał, po zajęciu slotu najpierw czyta cache. Slot zajęty dłużej niż wolno czekać (12 s użytkownik, 5 s czat, 2 s tło) → 503 `PROVIDER_BUSY` z `Retry-After: 5`, bez zapytania do dostawcy.
- **Lista wyników:** lotniska z grupy idą po kolei. Pauza, zajęta bramka albo limit przerywają przebieg od razu, a dwa błędy z rzędu (timeout, 5xx, sieć) po drugim lotnisku. Ponowienie obejmuje tylko nieudane lotniska.
- **Redis niedostępny:** użytkownicy przechodzą (licznik lokalny, bramka lokalna w obrębie instancji), crony stoją. Bramka nie obejmuje wtedy innych instancji: dwóch gości w tej samej sekundzie może dostać 429. To świadomy wybór zamiast wyłączania lotów na czas awarii Upstash.

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
