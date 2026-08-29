# FLIGHTS EXPERIENCE V2 — specyfikacja

**Gałąź:** `feat/flights-experience-v2` · **baza:** `origin/main` @ `76fb3ca`
**Data audytu:** 2026-08-29 · **Autor:** sesja Claude Code (audyt + implementacja)
**Status:** audyt zamknięty, implementacja wykonana — wyniki w sekcji 25 na końcu.

Dokument powstał PRZED implementacją (wymóg §33 briefu). Każda liczba w sekcjach
„audyt" pochodzi z pomiaru w przeglądarce (`getBoundingClientRect`,
`getComputedStyle`) albo z cytatu kodu — nie z oszacowania. Miejsca, gdzie
sprawdziłem hipotezę i okazała się FAŁSZYWA, są odnotowane jawnie, żeby nikt nie
naprawiał nieistniejącego błędu.

---

## 1. Current architecture

Warstwa lotów to ~7 900 LOC w czterech miejscach:

| Warstwa | Ścieżka | LOC |
|---|---|---|
| Domena (czyste funkcje + klient LiteAPI) | `src/lib/flights/*` | 3 213 |
| API routes (proxy do LiteAPI) | `src/app/api/flights/*`, `src/app/api/liteapi/flights-webhook` | 708 |
| Strony lejka | `src/app/loty/*` | 1 587 |
| Komponenty współdzielone | `src/components/flights/*` | 836 |

**Dostawca:** wyłącznie LiteAPI Flights (`api.liteapi.travel`, `keyMode:"public"`).
Travelpayouts/Aviasales usunięte. Klucz API żyje tylko po stronie serwera.

**Persystencja:** Upstash Redis (`flight:v1:*`), NIE Prisma — `DATABASE_URL` w tym
projekcie to placeholder. Klucze: `session:{id}`, `completed:{bookingId}`,
`failed:{sessionId}`, `idem:{key}`, `event:{eventId}`, `bybooking:*`, `byprebook:*`.

**Płatność:** LiteAPI Payment SDK (widget `payment-wrapper.liteapi.travel`),
merchant of record = NUITEE TRAVEL. Stripe jest pod spodem, ale my nie tworzymy
PaymentIntentu — robi to LiteAPI w `POST /flights/prebooks` z `usePaymentSdk:true`
i oddaje nam `secretKey` + `transactionId`.

---

## 2. Full funnel

```
/  (?tab=loty)  MiniPlannerForm mode="flights"
      │  walidacja: IATA celu, „Skąd" wymagane, daty
      ▼
/loty/wyniki?origin=…&destination=…&depart=…&return=…&adults=…
      │  FlightResults: fan-out POST /api/flights/rates po każdym lotnisku wylotu
      │  → normalizacja → filtry/sort po stronie klienta → 20 kart naraz
      │  klik „Wybierz” → sessionStorage(ht_flight_flow_v1) → push
      ▼
/loty/dodatki   wybór taryfy (branded fare = inny offerId tej samej trasy)
      │  „Dalej” → POST /api/flights/verify
      │     • priceChanged → modal Akceptuję/Wróć
      │     • OFFER_UNAVAILABLE → auto-recovery (fresh re-search + dopasowanie
      │       po podpisie segmentów) → re-verify
      ▼
/loty/pasazerowie   dane pasażerów + kontakt + zgody
      │  submit → POST /api/flights/prebook (LiteAPI /flights/prebooks)
      │  ← sessionId, secretKey, widgetEnv, price, currency
      ▼
/loty/platnosc   PaymentSlot → widget LiteAPI → 3DS → redirect
      ▼
/loty/platnosc/return?sid=…   (server) finalizeFlightBooking(sid)
      │  → LiteAPI POST /flights/bookings {prebookId, payment:{TRANSACTION_ID}}
      ▼
/loty/potwierdzenie/[bookingId]   GET /api/flights/booking/[id] (live GET = źródło prawdy)
      │
      └─ równolegle: POST /api/liteapi/flights-webhook (flight.book.*)
```

---

## 3. API map

| Endpoint | LiteAPI | Rate-limit | Idempotencja | Uwagi |
|---|---|---|---|---|
| `POST /api/flights/rates` | `/flights/rates` | `flights-search` | — | cache gzip v2, cap 500 ofert, `?fresh=1` omija odczyt |
| `POST /api/flights/verify` | `/flights/verify` | `flights-search` | — | `retries:1` (świadomie bez retry) |
| `POST /api/flights/prebook` | `/flights/prebooks` | `booking-prebook` | `Idempotency-Key` (5 min, best-effort) | zapis intencji PRZED wołaniem dostawcy |
| `POST /api/flights/book` | `/flights/bookings` | `booking-book` | przez stan sesji | cienki wrapper na `finalizeFlightBooking` |
| `GET /api/flights/booking/[id]` | `GET /flights/bookings/{id}` | — | — | live GET nadpisuje cache |
| `POST /api/liteapi/flights-webhook` | — | — | `event_id` w Redis NX | zawsze 200 poza 401 |

---

## 4. State / storage map

| Dane | Gdzie | Kto ufa | Ryzyko |
|---|---|---|---|
| Wyniki wyszukiwania | pamięć klienta + Redis cache (`rates-cache`) | klient | — |
| Wybrana oferta, taryfa, „zaakceptowana cena" | **`sessionStorage` `ht_flight_flow_v1`** | klient | edytowalne przez usera |
| `sessionId`, `prebookId`, `transactionId`, `price` | Redis (`flight:v1:session:*`) | serwer | źródło prawdy o kwocie |
| `secretKey` | wyłącznie front (widget) — **nigdy w Redis** | — | poprawnie |
| Kwota realnie pobrana | LiteAPI/Stripe, powiązana z `secretKey` | dostawca | front nie ma wpływu |
| Numery dokumentów | tylko w body do LiteAPI; w Redis zamaskowane (`***567`) | — | poprawnie |

---

## 5. Current UX problems (zmierzone)

### 5.1 Szerokość — twarde liczby przy viewport 1920 px

| Ekran | `main.x` | `main.width` | biała lewa | biała prawa | % ekranu |
|---|---:|---:|---:|---:|---:|
| `/loty/wyniki` | 563 | 778 | 563 | 579 | **40,5 %** |
| ↳ pojedyncza **karta oferty** | 863 | **462** | — | — | **24,1 %** |
| `/loty/dodatki` | 617 | **672** | 617 | 632 | **35,0 %** |
| `/loty/pasazerowie` | 440 | 1 024 | 440 | 456 | 53,3 % |

Przyczyna jest JEDNA i leży poza sekcją lotów:
`src/components/site/site-shell.tsx:201-205` nakłada `max-w-7xl px-4 sm:px-6 lg:px-8`
na wszystko, co nie jest homepage ani szeroką trasą hotelową. Sekcja lotów mogła
mieć u siebie dowolne `max-w-*` i nic by to nie dało. Na to nakłada się własne
`max-w-6xl` w `flight-results.tsx:182` i `max-w-2xl` w `flight-extras.tsx:169`.

**Karta lotu ma 462 px na monitorze 1920 px.** Google Flights i KAYAK dają temu
elementowi 1 000–1 200 px, bo mieści się w nim godzina, trasa, czas, przesiadki,
bagaż i cena bez zawijania.

### 5.2 Header — pływająca pastylka

`site-shell.tsx:254`: poza homepage header dostaje
`mt-2 rounded-[1.2rem] border … px-3 py-2`. Zmierzony `border-radius: 19.2px`,
szerokość 1 216 px przy viewport 1920 (x = 344). Na homepage (`:253`) jest
odwrotnie: pas przyklejony do krawędzi, `border-b`, bez promienia. To dokładnie
opisana w briefie „floating capsule".

### 5.3 Warstwa lotów NIE UŻYWA systemu projektowego

To jest właściwa odpowiedź na „kolejne kroki nie wyglądają jak ten sam produkt co
homepage". Cała sekcja lotów maluje surową paletą Tailwinda:
`text-neutral-900`, `border-neutral-200`, `bg-emerald-600`, `text-emerald-700` —
podczas gdy reszta serwisu (homepage, hotele, stopka, header) stoi na tokenach
OKLCH z `globals.css`: `ink`, `ink-muted`, `line`, `surface-raised`, `brand`,
`accent`. Skala szarości Tailwinda jest neutralna, a tokeny serwisu są tintowane
w stronę marki (chroma 0.002–0.018 przy hue 164). Różnica jest subtelna na
jednym elemencie i bardzo widoczna na całym ekranie — stąd wrażenie „panelu
doklejonego do strony".

Dodatkowo łamane są trzy reguły systemu:
- **`--accent` jest zarezerwowany dla ceny.** Loty malują cenę `emerald-700`
  (czyli kolorem CTA), więc cena i przycisk krzyczą tym samym głosem.
- **Ikony tylko `lucide-react`.** Loty mają wklejone `<svg>` z `<path>` (znacznik
  ceny, checkmarki zaufania, ołówek „Zmień") i **emoji `✈` w kodzie**
  (`flight-itinerary-summary.tsx:48`) — a system zabrania emoji w UI.
- **`active:` jest obowiązkowe** (90 % ruchu to telefon, gdzie `hover:` nie
  istnieje). Żaden przycisk ani karta w lotach nie ma stanu wciśnięcia.

### 5.4 Gęstość mobilna

390 × 844, WAW→BCN, 2 pasażerów, 215 ofert:
- wysokość dokumentu wyników: **9 165 px** przy 20 kartach → ~458 px na kartę,
  czyli **nieco ponad jedna oferta na ekran**;
- `/loty/pasazerowie`: cena „Razem" pojawia się dopiero na **2 047 px**, a CTA
  „Przejdź do płatności" na **2 579 px** scrolla. Do momentu zobaczenia kwoty
  użytkownik przewija 2,4 ekranu wypełnionego polami dokumentów.

### 5.5 Kolizja czatu z ceną

`ConciergeLauncher` na trasach `/loty/*` innych niż wyniki jedzie
`bottom-[max(5.25rem,…)] right-4 z-40`. Na 390 px **zasłania cenę taryfy „Plus"
na `/loty/dodatki`** (zrzut w `docs/flights-v2/shots/before/`). Brief §23 mówi
wprost: nie może zasłaniać ceny.

### 5.6 Drobne, ale realne

- `pasazerowie/page.tsx:106-110` — auto-scroll do pierwszego błędu czyta **stary**
  stan `errors` (`setErrors` jest asynchroniczne), więc przy pierwszym nieudanym
  submicie `firstKey` jest `undefined` i **przewijanie się nie wykonuje**.
- 17 pól formularza pasażerów **nie ma ani jednego `autocomplete`**; telefon ma
  `type="text"` zamiast `tel` (na telefonie wyskakuje pełna klawiatura QWERTY).
- Brak wskaźnika kroku — na żadnym z 4 ekranów lejka nie widać, gdzie się jest.
- Brak `scroll-margin` pod sticky header: każdy `scrollIntoView` ląduje pod paskiem.
- `sticky top-[72px] sm:top-[84px]` w `wyniki/page.tsx:78` to wysokość headera
  wpisana z palca — rozjedzie się przy każdej zmianie headera.

### 5.7 Hipotezy SPRAWDZONE I ODRZUCONE

Zapisuję, żeby nikt tego nie „naprawiał":

- **Zoom na iOS przy focusie pola — NIE WYSTĘPUJE.** `getComputedStyle` na polu
  formularza pasażerów daje **16 px**, nie 14. Klasa `text-sm` na `<input>` w tym
  repo nic nie robi: reset `input { font-size: inherit }` stoi poza warstwami CSS
  i bije utility Tailwinda z `@layer utilities`.
- **Poziomy scroll — NIE WYSTĘPUJE.** `scrollWidth` = 390 przy viewport 390 i
  1 905 przy 1920.
- **Cele dotykowe — OK.** Pola mają zmierzone 44 px wysokości.
- **Brak tanich linii u dostawcy — NIEAKTUALNE.** Poprzednie ustalenie („GDS
  Travelport = zero Ryanair/Wizz") jest **nieprawdziwe na dziś**: wyszukiwanie
  WAW→BCN zwraca Wizz Air jako najtańszą ofertę (959 zł/os.) i Wizz Air widnieje
  w filtrze linii. Notatka wymaga aktualizacji.

---

## 6. Desktop audit

| Kryterium | Stan | Ocena |
|---|---|---|
| Wykorzystanie szerokości | karta 462 px na 1920 px | ✗ krytyczne |
| Header spójny z homepage | pastylka `radius 19.2px` vs pas na `/` | ✗ |
| Hierarchia karty oferty | godziny bold, cena bold, ale wszystko w 462 px zawija | ✗ |
| Filtry | sidebar 260 px, faceting danymi-sterowany, liczniki | ✓ dobre |
| Sortowanie | 5 opcji, `<select>`; brak widocznej „ceny przy sorcie" | ~ |
| Odznaki | Najtańszy / Najszybszy / Bezpośredni — liczone z pełnej puli | ✓ |
| Szczegóły lotu | rozwijane w karcie, per-segment | ✓ |
| Stany loading | szkielet w kształcie kart + banner rotujący komunikaty | ✓ |
| Stan pusty / błąd | rozróżnia „brak lotów" i „awaria" + akcja | ✓ |

## 7. Mobile audit (375 / 390 / 412)

| Kryterium | Stan | Ocena |
|---|---|---|
| Poziomy scroll | brak | ✓ |
| Gęstość wyników | ~458 px/kartę, 1 oferta na ekran | ✗ |
| Filtry | bottom-sheet (drawer) z „Pokaż wyniki (n)" | ✓ |
| Sort | `<select>` obok „Filtry" | ✓ |
| Picker lotniska | pełnoekranowy arkusz < 640 px, historia `popstate` | ✓ bardzo dobre |
| Cena widoczna w formularzu | dopiero na 2 047 px scrolla | ✗ |
| CTA widoczne | dopiero na 2 579 px scrolla | ✗ |
| Czat vs cena | zasłania cenę taryfy | ✗ |
| Cele dotykowe | 44 px | ✓ |
| Autofill | brak `autocomplete`, telefon jako `text` | ✗ |

---

## 8. Price audit (END-TO-END)

Trasa testowa: WAW→BCN 20–27.09.2026, 2 dorosłych, taryfa Basic.

| Krok | Źródło | Cena surowa | Markup | Waluta | Zaokrąglenie | Wyświetlana | Zapisana | Zaufanie |
|---|---|---|---|---|---|---|---|---|
| Wyniki | `journey.cheapestOffer.pricing.display.total` | 1918,34 | **0** | PLN (od dostawcy) | `maxFractionDigits:0` | „959 zł/os." (÷2, `Math.round`) | sessionStorage | średnie (klient) |
| Wybór oferty | `offer.total` | 1918,34 | 0 | PLN | — | — | `flow.verifiedTotal` | **niskie — nazwa kłamie** |
| Taryfa | `journey.offers[].pricing.display.total` | 1918,34 / 2780 / 3056 / 3618 | 0 | PLN | 0 miejsc | „1918 zł" | — | średnie |
| Verify | `data[0].journey.pricing.display.total` | **1918,34** | 0 | PLN | — | modal tylko przy zmianie | `flow.verifiedTotal` | wysokie |
| Prebook | `data[0].price` | (kwota locka) | 0 | `data[0].currency` | — | — | **Redis `session.price`** | **wysokie — źródło prawdy** |
| Płatność | `flow.verifiedTotal` z sessionStorage | — | — | — | 0 miejsc | „Do zapłaty 1918 zł" | — | **niskie** |
| Obciążenie | PaymentIntent po stronie LiteAPI (`secretKey`) | = prebook | — | — | pełna | — | LiteAPI | wysokie |
| Booking | `prebookId` + `transactionId` | — | — | — | — | — | — | wysokie |
| Potwierdzenie | `completed.price` ← `session.price` | prebook | 0 | PLN | 0 miejsc | „Zapłacono 1918 zł" | Redis | wysokie |
| Mail | `input.price.toFixed(2)` | prebook | 0 | PLN | 2 miejsca | „1918.34 PLN" | — | wysokie |

### Wnioski

1. **Markup: ZERO.** W całym repo nie ma mnożnika, prowizji ani doliczenia do ceny
   lotu. Sprzedajemy cenę dostawcy 1:1. Ryzyko „markup dodany dwa razy" nie
   istnieje, bo markupu nie ma.
2. **Podatki i opłaty są w `display.total`** — LiteAPI zwraca też `base`/`taxes`/
   `fees`, my bierzemy `total`. Copy „wł. opłat" jest prawdziwe.
3. **Brak konwersji walut po naszej stronie** — `currency:"PLN"` idzie w zapytaniu,
   dostawca liczy sam. Nie ma gdzie zepsuć kursu.
4. **BLOCKER P1 — cena zaakceptowana ≠ cena locka, bez pytania użytkownika.**
   `pasazerowie/page.tsx:155` robi
   `verifiedTotal: json.price ?? flow.verifiedTotal` — po prostu **nadpisuje**
   kwotę, którą użytkownik zaakceptował w modalu, kwotą z prebooka. Serwer w
   `api/flights/prebook/route.ts` nie porównuje tych dwóch liczb w ogóle. Ścieżka:
   user akceptuje 2 727 zł → prebook zwraca 2 900 zł → strona płatności pokazuje
   2 900 zł i tyle pobiera karta. Użytkownik nigdy nie zobaczył, że cena wzrosła
   po jego akceptacji. To ten sam gatunek błędu co incydent hotelowy z cenami.
5. **P2 — kwota na stronie płatności pochodzi z `sessionStorage`, nie z serwera.**
   `platnosc/page.tsx:42`. Realnie pobrana kwota jest bezpieczna (widget bierze ją
   z `secretKey`), więc to nie jest dziura płatnicza — ale to znaczy, że
   „Do zapłaty" może rozjechać się z tym, co faktycznie obciąży kartę, i że
   jedyne, co użytkownik widzi przed kliknięciem „Zapłać", jest niezweryfikowane.
6. **P2 — grosze znikają.** `fmtMoneyPln` (i systemowe `formatPricePln`/`formatPLN`)
   mają `maximumFractionDigits: 0`. Zmierzone: verify zwrócił **1918,34**, UI
   pokazuje **„1918 zł"**, mail pokazuje **„1918.34 PLN"**. Trzy różne liczby dla
   jednej transakcji. Na kwotach „od X zł" zaokrąglenie jest w porządku; na
   kwocie, którą pobiera karta — nie jest.
7. **P3 — mieszanie per-osoba i total.** Wyniki mówią „959 zł/os.", następny ekran
   mówi „1918 zł" bez kotwicy per-osoba. Dodatkowo `Math.round(total/pax)` dzieli
   przez **wszystkich** pasażerów łącznie z niemowlętami, które kosztują ułamek
   ceny dorosłego — przy 2 dorosłych + niemowlę „cena za osobę" jest zaniżona.
8. **P3 — `verifiedTotal`/`verifiedAt` są ustawiane przy samym kliknięciu „Wybierz"
   (`flight-results.tsx:173`), zanim cokolwiek zostało zweryfikowane.** Nazwa pola
   kłamie o stanie danych; realny verify dzieje się dopiero na `/loty/dodatki`.

---

## 9. Payment audit

| Pytanie z briefu | Odpowiedź | Dowód |
|---|---|---|
| Czy front może zmienić kwotę obciążenia? | **NIE.** Do konstruktora `LiteAPIPayment` idą wyłącznie `publicKey`, `secretKey`, `returnUrl`, `targetElement`, `appearance`. Kwoty tam nie ma. | `payment-slot.tsx:192-200` |
| Skąd bierze się kwota? | Z PaymentIntentu utworzonego przez LiteAPI w prebooku i związanego z `secretKey`. | `client.ts:179-211` |
| Czy `transactionId` wycieka do klienta? | Nie — zostaje w Redis, do frontu idzie tylko `secretKey`. | `prebook/route.ts:166-174` |
| Czy `secretKey` jest gdziekolwiek zapisywany? | Nie, świadomie. | `session.ts:124` |
| Podwójny klik „Zapłać" | Widget LiteAPI jest montowany raz (`startedRef`), a `payment.method:"TRANSACTION_ID"` referuje JEDNĄ transakcję. Drugie obciążenie wymagałoby drugiego prebooka. | `platnosc/page.tsx:28-30` |
| Walidacja server-side tuż przed płatnością | **BRAK** — patrz BLOCKER P1. Prebook nie sprawdza, czy cena locka zgadza się z ceną zaakceptowaną. | — |

## 10. Booking audit

| Scenariusz | Zachowanie | Ocena |
|---|---|---|
| `payment OK → book OK` | `confirmed`, `completed`, mail, redirect na potwierdzenie | ✓ |
| `payment OK → book FAIL` | `paymentStatus:"paid"` + `bookingStatus:"manual_review"` **ustawione PRZED próbą booka**, rekord `failed:*`, alert `notifyCritical`, mail do admina, HTTP 202 z uczciwym komunikatem | ✓ wzorowe |
| Odświeżenie `/loty/platnosc/return` | `finalizeFlightBooking` zwraca istniejący `bookingId` przy `bookingStatus==="confirmed"` | ✓ |
| Powtórzony webhook | `markWebhookEventProcessed` (Redis `NX`) → duplikat ACK-owany bez akcji | ✓ |
| `flight.book.failed` po `confirmed` | log + ignore (reguła 1.4.7) | ✓ |
| Self-fetch na stronie powrotu | usunięty — `finalizeFlightBooking` wołane in-process (historyczny bug: `getSiteUrl()` kierował preview na produkcję) | ✓ |
| Redis padł na starcie prebooka | 503, prebook NIE jest tworzony | ✓ fail-loud |
| Redis padł po prebooku | alert + 503 bez `secretKey` (płatność nie rusza) | ✓ |

**To jest najmocniejsza część tego lejka.** Nie ruszam architektury odporności —
brief §10 słusznie ostrzega przed mechanicznym kopiowaniem rozwiązania hotelowego.

## 11. Recovery / idempotency audit

- **Wygaśnięcie oferty (LiteAPI 52099/53010)** → `OFFER_UNAVAILABLE` → automatyczny
  `?fresh=1` re-search + dopasowanie po **podpisie segmentów** (przewoźnik + numer
  rejsu + trasa + godziny) i po profilu bagażu. Brak dopasowania = uczciwy komunikat,
  zero cichej podmiany na inny lot. To jest zrobione dobrze i zostaje.
- **Idempotency-Key** na prebooku: obsługiwany, ale **front go nie wysyła**
  (`pasazerowie/page.tsx:115` nie ustawia nagłówka). Podwójny submit formularza
  utworzy DWA prebooki u dostawcy (dwa locki taryfy, dwa PaymentIntenty).
  Podwójnego obciążenia to nie daje — użytkownik płaci w jednym widgecie — ale
  śmieci u dostawcy i psuje `sessionId`. **P2.**
- Guard `submitting` istnieje, więc scenariusz wymaga np. cofnięcia i ponowienia.

## 12. Chatbot audit

| Trasa | QuickSearchLauncher | ConciergeLauncher | Kolizja |
|---|---|---|---|
| `/loty/wyniki` | ukryty (prefix `/loty`) | `bottom-4 right-4`, ikona | brak (dziś) |
| `/loty/dodatki` | ukryty | uniesiony ~84 px | **zasłania cenę taryfy** |
| `/loty/pasazerowie` | ukryty | uniesiony | zasłania pola formularza |
| `/loty/platnosc` | ukryty | uniesiony | ryzyko przy widgecie |
| `/loty/potwierdzenie/*` | ukryty | uniesiony | brak |

Kontekst lotu **nie jest** przekazywany do czatu. Brief §23 mówi „rozważ" i „nie
przebudowuj bez potrzeby" — traktuję to jako opcję, nie wymóg, i nie ruszam
architektury czatu.

## 13. Performance baseline

Środowisko: `next dev` (Turbopack) — liczby służą do porównania PRZED/PO w tej
samej konfiguracji, nie jako wartości produkcyjne.

| Metryka | Wartość |
|---|---|
| Oferty zwrócone (WAW→BCN, RT, 2 pax) | 215 |
| Kart w DOM na start | 20 (`PAGE_SIZE`) |
| Wysokość dokumentu, mobile 390 | 9 165 px |
| Wysokość dokumentu, `/loty/pasazerowie` 390 | 3 726 px |
| `scrollWidth` @390 / @1920 | 390 / 1 905 (brak przepełnienia) |
| Zapytania na wyszukiwanie | 1 na lotnisko wylotu (grupa „wszystkie" → do 6 równolegle) |
| Cap ofert w cache | 500, gzip, ≈180 KB |

Pełne pomiary PO — sekcja „Wyniki" w raporcie końcowym.

## 14. Competitor patterns (co biorę, czego nie)

| Wzorzec | Kto | Bierzemy? |
|---|---|---|
| Pozioma karta: godziny → oś czasu → cena po prawej | wszyscy | ✓ już jest, ale za wąska |
| Etykiety „Najtańszy / Najszybszy / Najlepszy" | Google Flights, Skyscanner | ✓ jest; dodać „Najlepszy" spójny z sortem `best` |
| Bagaż jako **ikona z liczbą** przy cenie, nie tekstem | KAYAK, Kiwi | ✓ warto |
| Filtry jako pasek chipów nad listą (desktop) | Google Flights | ✗ — sidebar z licznikami jest czytelniejszy przy 20+ liniami |
| Kalendarz cen / „±3 dni" | Google Flights, Kiwi | ✗ — wymaga 7× więcej zapytań do GDS; poza zakresem |
| Sticky pasek z ceną i CTA na mobile w checkoutcie | Booking, Kiwi | ✓ |
| Ukrywanie total do ostatniego kroku | niektórzy | ✗ świadomie — sprzeczne z „ceny finalne" |
| Presja („2 osoby oglądają") | Kiwi | ✗ zakazane w tym repo (Omnibus + PRODUCT.md) |

---

## 15-19. Proponowane rozwiązanie

### 15. UX

1. **Jedna rama, trzy szerokości.** Wyniki = szeroko (do 1 600 px), taryfa =
   średnio (dwie kolumny: lot + wybór), formularz i płatność = skupione.
2. **Wskaźnik kroku** na wszystkich 4 ekranach lejka (Lot → Taryfa → Dane → Płatność).
3. **Cena zawsze w polu widzenia** — na mobile sticky pasek z kwotą i CTA.
4. **Jeden język ceny**: „X zł za wszystkich" jako liczba główna w checkoutcie,
   „Y zł/os." jako podpis. Na liście odwrotnie. Nigdy bez etykiety.
5. **Zmiana ceny po akceptacji zawsze przez modal**, także gdy przychodzi z prebooka.

### 16. Desktop

- Header: pas pełnej szerokości z `border-b`, jak na homepage (bez pastylki).
- Wyniki: `filtry 280px | lista` w kontenerze do 1 600 px; karta oferty ~1 100 px.
- Karta: godziny i trasa po lewej (dominanta), metadane w środku, cena + CTA po
  prawej w stałej kolumnie 200 px — bez zawijania.
- Taryfa: dwie kolumny (podsumowanie lotu sticky | lista taryf).

### 17. Mobile

- Karta oferty przeprojektowana na gęstość: cel ≤ 300 px/kartę.
- Sticky dolny pasek: cena + CTA, z `env(safe-area-inset-bottom)`.
- `ConciergeLauncher` podniesiony ponad sticky pasek na trasach `/loty/*`.
- `autocomplete` + `inputMode` na wszystkich polach.

### 18. Architektura komponentów

Nowe / zmienione:
```
src/components/flights/
  flight-offer-card.tsx      NOWY  — karta oferty (wyjęta z flight-results)
  flight-step-nav.tsx        NOWY  — wskaźnik kroku lejka
  flight-sticky-cta.tsx      NOWY  — mobilny pasek cena+CTA
  flight-price.tsx           NOWY  — jeden sposób pokazywania kwoty
src/lib/flights/
  money.ts                   NOWY  — formatowanie kwot lotu (exact vs. approx)
  layout.ts                  NOWY  — szerokości ekranów lejka
src/components/site/site-shell.tsx   ZMIANA — gałąź „flights wide"
```

### 19. Architektura stanu

Bez rewolucji. Jedna zmiana kontraktu `FlightFlow`:
- `verifiedTotal` → rozdzielone na `selectedTotal` (co user widział/zaakceptował)
  i `lockedTotal` (co zwrócił prebook). Różnica = modal.
- Nowy endpoint `GET /api/flights/session/[sessionId]` zwracający **autorytatywną**
  kwotę do wyświetlenia na stronie płatności (bez `transactionId`/`secretKey`).

### 20. Analytics plan

| Event | Stan | Akcja |
|---|---|---|
| `flight_search` | jest | — |
| `flight_results_view` | jest | — |
| `flight_select` | jest | — |
| `fare_selected` | **brak** | dodać |
| `flight_passenger_form_start` | jest | — |
| `passenger_step_completed` | **brak** | dodać |
| `flight_payment_start` | jest | — |
| `flight_payment_error` | typ istnieje, **nigdy nie emitowany** | podpiąć |
| `purchase` (`item_category:"flight"`) | jest, raz przez ref | — |
| `flight_offer_recovery` (wygasła oferta) | **brak** | dodać |
| PII w eventach | brak | ✓ utrzymać |

### 21. Ryzyka

| Ryzyko | Prawdop. | Skutek | Mitygacja |
|---|---|---|---|
| Zmiana `site-shell` psuje inne trasy | średnie | wysoki | gałąź warunkowa tylko dla `/loty/*`; test regresji na `/`, `/hotele/*`, artykule |
| Gate ceny prebook blokuje poprawne rezerwacje | niskie | wysoki | próg tolerancji na grosze; przy różnicy → modal, nigdy twardy błąd |
| Sticky CTA zasłania treść / koliduje z czatem | średnie | średni | pomiar `elementFromPoint`, `pb` na kontenerze |
| Regres LCP homepage | niskie | wysoki | nie ruszam komponentów hero; porównanie przed/po |

### 22. Blockery

**BLOCKER-1 (P1, cena):** cena z prebooka nadpisuje zaakceptowaną bez zgody
użytkownika. Musi zostać naprawiony przed jakimkolwiek deployem lotów.
Pozostałe znaleziska są P2/P3 i nie blokują.

### 23. Acceptance criteria

- [ ] Header na `/loty/*` = pas jak na homepage, `border-radius` ≤ 4 px
- [ ] Karta oferty ≥ 900 px przy 1920 px
- [ ] Białe marginesy `/loty/wyniki` ≤ 12 % szerokości na 1920 px
- [ ] Wysokość karty mobile ≤ 320 px
- [ ] Cena i CTA widoczne bez scrolla na każdym ekranie lejka na 390 px
- [ ] Cena z prebooka różna od zaakceptowanej → modal, brak cichego nadpisania
- [ ] Kwota „Do zapłaty" pochodzi z serwera, nie z `sessionStorage`
- [ ] Kwoty transakcyjne pokazywane z groszami; displayed == charged
- [ ] Czat nie zasłania ceny ani CTA na żadnym ekranie (`elementFromPoint`)
- [ ] `autocomplete` + `inputMode` na wszystkich polach formularza
- [ ] Auto-scroll do pierwszego błędu faktycznie działa
- [ ] Mail potwierdzający zawiera trasę, daty, pasażerów, taryfę, bagaż, kwotę
- [ ] Mail przy anulowaniu nie mówi „potwierdzona"
- [ ] Zero PII w eventach; brak podwójnych emisji
- [ ] `pnpm test` i `tsc --noEmit` przechodzą; build przechodzi
- [ ] Brak regresji na `/`, `/hotele/szukaj`, `/hotele/[id]`

### 24. Fazy implementacji

| Faza | Zakres | Ryzyko |
|---|---|---|
| **A** | Rama: `site-shell` gałąź lotów, `layout.ts`, header | średnie |
| **B** | Integralność ceny: gate prebooka, `money.ts`, endpoint sesji | **wysokie — najpierw testy** |
| **C** | Wyniki: karta oferty, gęstość, tokeny |  niskie |
| **D** | Taryfa/bagaż: dwie kolumny, czytelność różnic | niskie |
| **E** | Pasażerowie: sticky CTA, autocomplete, scroll do błędu | niskie |
| **F** | Płatność + potwierdzenie + mail | średnie |
| **G** | Czat, analytics, dostępność | niskie |
| **H** | QA responsywne, testy, review | — |

---

## 25. WYNIKI — co faktycznie zmierzono po zmianie

Metoda: `e2e/flights-shots.ts` (Playwright, ten sam skrypt dla „przed" i „po"),
plus pomiary `getBoundingClientRect` / `elementFromPoint` w przeglądarce.
Trasa testowa jest zawsze ta sama: WAW→BCN 20–27.09.2026, 2 dorosłych.

### 25.1 Szerokość i nagłówek (desktop 1920)

| Metryka | Przed | Po | Zmiana |
|---|---:|---:|---|
| `/loty/wyniki` — szerokość treści | 779 px | 1 720 px | **+121 %** |
| `/loty/wyniki` — biały margines | 59,4 % ekranu | 10,4 % | **−49 pkt proc.** |
| **Karta oferty** | **463 px** | **1 288 px** | **+178 %** |
| `/loty/dodatki` — biały margines | 65,0 % | ~42 % (celowo węższa) | — |
| Nagłówek — `border-radius` | 19,2 px (pastylka) | **0 px** (pas) | wymóg §4 |
| Nagłówek — szerokość | 1 216 px | 1 905 px (pełna) | wymóg §4 |
| Poziome przewijanie | brak | brak | bez regresji |

### 25.2 Gęstość i mobile (390 × 844)

| Metryka | Przed | Po | Zmiana |
|---|---:|---:|---|
| Wysokość karty oferty | 402 px | 309 px | **−23 %** |
| Wysokość dokumentu wyników | 9 165 px | 7 341 px | **−20 %** |
| Pierwsza oferta na scrollu | ~840 px | **340 px** | **−60 %** |
| `/loty/pasazerowie` — cena widoczna od | 2 047 px scrolla | **0 px** (sticky) | wymóg §22 |
| `/loty/pasazerowie` — CTA widoczne od | 2 579 px scrolla | **0 px** (sticky) | wymóg §22 |
| `/loty/pasazerowie` — wysokość dokumentu | 3 728 px | 3 266 px | −12 % |
| Elementy pływające w lejku | 2 (czat + baner) | 1 (baner zgód) | wymóg §23 |

### 25.3 Ceny — co widzi użytkownik

| Miejsce | Przed | Po |
|---|---|---|
| Karta oferty | `959 zł / os.` (dzielone przez WSZYSTKICH, w tym niemowlęta) | `1 918,34 zł` + `śr. 959 zł/os.` |
| Wybór taryfy | `1918 zł` | `1 918,34 zł` |
| „Razem" w checkoutcie | `1918 zł` | `1 918,34 zł` |
| „Do zapłaty" | `1918 zł` z `sessionStorage` | `1 918,34 zł` **z serwera** |
| „Zapłacono" | `1918 zł` | `1 918,34 zł` |
| Mail | `1918.34 PLN` | `1 918,34 zł` |

Jedna transakcja miała wcześniej **trzy różne zapisy kwoty**, a ten pokazywany
tuż nad przyciskiem „Zapłać" był o 34 gr niższy od realnego obciążenia.

### 25.4 Bramka ceny — zachowanie (testy route'owe)

| Scenariusz | Wynik |
|---|---|
| lock == zaakceptowana | 200 + `secretKey`, `priceGatePassed:true` |
| lock wyższy (2 727 → 2 900) | **409 `PRICE_CHANGED`, BEZ `secretKey`** |
| lock niższy (2 727 → 2 500) | 409 — spadek też wymaga zgody |
| różnica +1 grosz | 409 |
| różnica < 1 grosz (szum float) | 200 — nie blokujemy na artefakcie IEEE-754 |
| inna waluta | 409 `CURRENCY_MISMATCH` |
| prebook bez ceny | 502 — nie otwieramy płatności na nieznaną kwotę |
| brak `acceptedTotal` w body | 400, dostawca w ogóle nie dotknięty |
| finalizacja sesji z niezaliczoną bramką | 409, `paymentStatus` zostaje `pending` |

---

## 26. Czego NIE zrobiono i dlaczego

Uczciwa lista — te rzeczy są w briefie, a nie ma ich w tej gałęzi.

1. **Realny test płatności i rezerwacji.** §43 zabrania prawdziwych obciążeń
   i rezerwacji, a konto jest produkcyjne (sandbox porzucony przy Fazie 0).
   Ścieżka `payment → book → confirmation` jest pokryta testami z mockowanym
   dostawcą i przechwyconymi odpowiedziami, ale **nie została przejechana
   prawdziwą kartą**. To jest największe ograniczenie tej pracy.
2. **Rozmiary bundli per trasa.** `next build` w tej wersji (16.2.9, Turbopack)
   nie drukuje kolumny rozmiaru dla tras, a chunki klienckie mają nazwy
   hashowane, więc nie da się ich przypisać do `/loty/*` bez analizatora.
   Zamiast zmyślonej liczby podaję pomiary, które mam: liczba węzłów DOM,
   wysokość dokumentu, liczba zapytań.
3. **Kalendarz cen / elastyczne daty.** Wymaga 7× więcej zapytań do GDS na
   jedno wyszukiwanie. Poza zakresem i poza budżetem zapytań.
4. **Wybór miejsc i bagaż à la carte** (`servicesAttachable`). Kontrakt
   attach→booking wymaga potwierdzenia realną rezerwacją — patrz punkt 1.
5. **Kontekst lotu przekazywany do czata.** §23 mówi „rozważ", a czat jest
   w lejku lotów wyłączony (zasłaniał ceny), więc przekazywanie kontekstu
   nie miałoby dokąd trafić.
6. **Paleta `airport-combobox`.** Zostaje na `emerald-*`, bo TA SAMA paleta
   stoi w homepage'owym `origin-combobox` (7 wystąpień). Ujednolicenie go
   z tokenami rozjechałoby picker lotów z pickerem hotelowym na stronie
   głównej — czyli pogorszyło dokładnie tę spójność, o którą chodzi.

---

## 27. Ryzyka, które zostają

1. **Finalizacja ufa, że wywołanie strony powrotu == udana płatność.**
   `finalizeFlightBooking` oznacza `paymentStatus:"paid"` na podstawie samego
   wejścia na `/loty/platnosc/return?sid=…`, bez pytania dostawcy o status
   transakcji. Bramka `priceGatePassed` zamyka wariant „sesja bez `secretKey`",
   ale użytkownik nadal może wywołać finalizację WŁASNEJ opłaconej-nie-do-końca
   sesji. Skutkiem jest odrzucenie przez LiteAPI (transakcja nieprzechwycona)
   i fałszywy alert `manual_review`, a nie darmowy bilet. Domknięcie wymaga
   zapytania o status transakcji u dostawcy — czyli kontraktu, którego nie da
   się zweryfikować bez realnej płatności (punkt 26.1).
2. **`itinerary` w mailu pochodzi od klienta.** Świadomie: nie dotyka ceny ani
   rezerwacji, a alternatywą było parsowanie niezmierzonego kształtu
   `prebook.booking.journey`. Podmiana zmieni treść maila, który podmieniający
   dostanie na własny adres.
3. **`confirmationSent` ustawiane PRZED wysyłką.** Nieudany mail nie zostanie
   ponowiony przez webhook. Zachowanie odziedziczone, nie pogorszone — ale to
   realna luka w dostarczalności.
4. **Verify ufa `previousTotal` od klienta** przy fladze „cena się zmieniła".
   Po dodaniu bramki prebooka nie ma to już wpływu na kwotę obciążenia; może
   jedynie ukryć komunikat o zmianie na kroku taryfy przed samym klientem.
