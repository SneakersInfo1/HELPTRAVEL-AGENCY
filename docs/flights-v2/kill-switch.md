# Kill-switch lotów — instrukcja dla operatora

Jedna zmienna środowiskowa zatrzymuje sprzedaż lotów, nie ruszając reszty
serwisu ani ludzi, którzy są w trakcie płatności.

```
FLIGHTS_FLOW_MODE=disabled
```

Brak zmiennej znaczy to samo co `disabled` — włącza WYŁĄCZNIE dokładna wartość
`live` (wielkość liter bez znaczenia, spacje obcinane).

---

## Awaryjne wyłączenie (30 sekund)

1. Vercel → projekt → **Settings → Environment Variables**.
2. `FLIGHTS_FLOW_MODE` → **Production** → ustaw `disabled`
   (albo usuń zmienną — efekt identyczny).
3. **Redeploy** ostatniego wdrożenia produkcyjnego.

Zmiana wchodzi z redeployem. Nie ma tu ścieżki „bez redeployu" i to jest
świadome: flaga czytana z `process.env` w Node runtime nie wymaga żadnej usługi
zewnętrznej, więc nie może paść razem z tym, co właśnie wyłączasz.

## Włączenie z powrotem

Ta sama ścieżka, wartość `live`, redeploy. Potem sprawdź, że
`/loty/wyniki?...` **nie** pokazuje paska „rezerwacja chwilowo niedostępna".

---

## Co się wyłącza, a co działa dalej

### Zatrzymane (napływ nowych transakcji)

| Miejsce | Zachowanie |
|---|---|
| `POST /api/flights/prebook` | `503 flights_disabled`. Sprawdzane **przed** limiterem, walidacją, Redisem i LiteAPI — nie powstaje ani lock taryfy, ani PaymentIntent, ani rekord intencji |
| `GET /api/flights/session/[id]` | `payable:false`, `flightsDisabled:true` — widget płatności się nie montuje |
| `/loty/wyniki` | pasek informacyjny na wejściu w lejek |
| `/loty/pasazerowie` | uczciwy komunikat po submicie zamiast błędu technicznego |
| `/loty/platnosc` | „Twoje dane nie zostały nigdzie wysłane, a karta nie została obciążona" |

### Działa dalej — CELOWO

| Miejsce | Dlaczego |
|---|---|
| `POST /api/flights/book`, `finalizeFlightBooking` | klient mógł JUŻ zapłacić — musi dostać rezerwację |
| `/loty/platnosc/return` | ta sama ścieżka odzyskania, wejście z widgetu |
| webhook `/api/liteapi/flights-webhook` | zdarzenia dostawcy dla rezerwacji w toku |
| `GET /api/flights/booking/[id]`, `/loty/potwierdzenie/[id]` | istniejące potwierdzenia muszą zostać widoczne |
| wyszukiwanie (`/flights/rates`, `verify`) | nie rusza pieniędzy |
| homepage, cały lejek hotelowy | osobna flaga `BOOKING_FLOW_MODE` |

**Zasada:** hamulec zatrzymuje NAPŁYW, nigdy dokończenie. Odcięcie finalizacji
człowiekowi z obciążoną kartą zamienia awarię w zabranie pieniędzy bez
rezerwacji — czyli w coś gorszego niż problem, który gasisz.

---

## Czego kill-switch NIE zrobi

* **Nie cofnie rezerwacji już utworzonych.** Anulowanie idzie przez LiteAPI,
  ręcznie.
* **Nie zatrzyma płatności, która już trwa w widgecie.** Payment Element
  rozmawia ze Stripe'em bezpośrednio; my nie stoimy w tej rozmowie. Taka
  płatność dokończy się i zostanie sfinalizowana — i tak ma być.
* **Nie wyłączy hoteli.** To osobna flaga.

## Weryfikacja po przełączeniu

```bash
# powinno zwrócić 503 + {"error":"flights_disabled"}
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://helptravel.pl/api/flights/prebook \
  -H "content-type: application/json" -d '{}'
```

Testy pilnujące obu stron zachowania:
`src/app/api/flights/flight-routes.test.ts` — sekcja „KILL-SWITCH LOTÓW",
w szczególności *„kill-switch NIE odcina finalizacji — klient, który mógł
zapłacić, dostaje rezerwację"*.
