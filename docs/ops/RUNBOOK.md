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
| `SERVER_ERROR_ALERT_THRESHOLD` | 20 / 10 min | próg alarmu serii nieobsłużonych 5xx |

## Co robi gubernator lotów sam

- **429 od LiteAPI:** pauza wszystkich instancji na `Retry-After` (15 s–15 min, domyślnie 60 s), bez ponowień.
- **401 / 403 / 40301:** pauza 15 min i alarm krytyczny.
- **Budżety dzienne:** alarm przy 50 %, 80 %, 100 %. Po przekroczeniu odpowiedź 503 bez zapytania do dostawcy.
- **Te same zapytania równolegle:** jedno zapytanie do dostawcy, jeden wynik dla wszystkich.
- **Redis niedostępny:** użytkownicy przechodzą (licznik lokalny), crony stoją.

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

- **Limit wyszukiwań lotów konta LiteAPI** po odblokowaniu jest nieznany. Limity powyżej są celowo konserwatywne; podnosić dopiero po odpowiedzi supportu.
- **Sekcja „Tanie loty z Polski”** na stronie głównej jest ukryta, dopóki crony lotów są wyłączone. Pokazuje tylko ceny młodsze niż 7 h, więc zamiast nieaktualnych cen nie pokazuje nic.
- **Pakiety lot+hotel w snapshocie czatu** są puste. Czat szuka lotów na żywo (źródło `chat`, w budżecie użytkowników).
