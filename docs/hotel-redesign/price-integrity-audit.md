# Audyt integralności cen — pokój vs checkout

Wygenerowane: 2026-08-08. Gałąź `feat/hotel-experience-redesign`, HEAD `3e78836`.
Zakres: punkty §15–§23 briefu „FINAL PRE-PRODUCTION HARDENING".

**Werdykt: PRODUCTION BLOCKER.** Checkout twierdzi, że cena zawiera podatki
i opłaty, dla **80,5% zbadanych taryf**, w których dostawca jawnie mówi, że
NIE zawiera. Średnia nieujawniona dopłata: **352,38 PLN**.

---

## 1. Metoda

Sonda `tmp/price-integrity-probe.ts` (niecommitowana, katalog roboczy).

- Źródło: **żywe LiteAPI**, `POST /hotels/rates`, klucz produkcyjny.
- READ-ONLY: wyłącznie `GET /data/hotels` i `POST /hotels/rates`.
  **Zero `prebook`, zero `book`, zero płatności.** Nic nie ruszało pieniędzy
  ani inwentarza.
- Termin 2026-09-15 → 2026-09-17, 2 dorosłych, waluta PLN, `guestNationality: PL`.
- Miasta: Hurghada (EG), Rzym (IT), Barcelona (ES), Warszawa (PL) — po to,
  żeby złapać różne reżimy podatkowe, nie jeden kierunek.
- Surowe taryfy przepuszczone przez **prawdziwe funkcje domenowe repo**
  (`mapTaxes`, `taxNoticeFrom` z `domain/price.ts`, `taxNoticeText`
  z `domain/format.ts`) — czyli dokładnie ten kod, który renderuje
  `rooms-section.tsx:503`. Sonda nie ma własnej kopii logiki, więc nie może
  się z produkcją rozjechać.
- Strona checkoutu porównywana z tekstem **wpisanym na sztywno**
  w `booking-summary-card.tsx:249`.

Kryterium werdyktu dla pojedynczej taryfy:

| stan z danych dostawcy | co mówi pokój | co mówi checkout | werdykt |
|---|---|---|---|
| `all-included` | „w tym podatki i opłaty" | „wł. podatków i opłat" | MATCH |
| `extra-at-property` | „+ X zł płatnych na miejscu" | „wł. podatków i opłat" | **FAIL** |
| `unknown` | milczy | „wł. podatków i opłat" | NIEPEWNE |

---

## 2. Wynik

| | |
|---|---|
| Taryf zbadanych | **17 776** |
| MATCH — checkout mówi prawdę | 3 461 (19,5%) |
| **FAIL — checkout kłamie** | **14 315 (80,5%)** |
| NIEPEWNE | 0 |
| Taryf z policzalną dopłatą | 14 315 |
| **Średnia dopłata na miejscu** | **352,38 PLN** |
| Taryf z realną przeceną (`initialPrice > total`) | 318 / 17 776 (1,8%) |

Zero pozycji „NIEPEWNE" znaczy, że dostawca **zawsze** podaje flagę `included`
— nie ma tu szarej strefy „nie wiadomo". Każdy FAIL to twarda sprzeczność
między dwiema stronami tego samego serwisu dla tej samej taryfy.

### Przykłady (bez danych osobowych)

| hotel | rateId | cena pokazana | dopłata na miejscu | POKÓJ mówi | CHECKOUT mówi |
|---|---|---|---|---|---|
| lp1d5c5 | I5NFERCNJ5FFOT | 1406,39 PLN | 182,31 PLN | „+ 182 zł podatków i opłat płatnych na miejscu" | „wł. podatków i opłat · płatność w PLN" |
| lp1d5c5 | I5GVSVCFJVBFOR | 1426,90 PLN | 184,97 PLN | „+ 185 zł podatków i opłat płatnych na miejscu" | „wł. podatków i opłat · płatność w PLN" |
| lp1d5c5 | I5NFERCNJ5FFOT | 1603,70 PLN (Half Board) | 207,89 PLN | „+ 208 zł podatków i opłat płatnych na miejscu" | „wł. podatków i opłat · płatność w PLN" |

Ta sama taryfa, dwa ekrany, dwie sprzeczne informacje o tym, ile gość zapłaci.

---

## 3. Przyczyna — to NIE jest błąd treści

Pierwsza hipoteza („zły string, wystarczy zmienić copy") jest **nieprawdziwa**.
Checkout nie ma czym powiedzieć prawdy.

1. **`BookingSummaryCard` nie przyjmuje żadnego pola podatkowego.**
   `booking-summary-card.tsx:15-29` — propsy to: `hotelName`, `hotelCity`,
   `photoUrl`, `stars`, `rating`, `reviewCount`, `checkin`, `checkout`,
   `adults`, `board`, `price`, `currency`, `cancelUntil`.
   Brak `taxesAndFees`, brak `taxNotice`, brak czegokolwiek o dopłatach.

2. **Cena w podsumowaniu pochodzi z parametru URL.**
   `rezerwacja/page.tsx:110` → `const price = sp.price ? Number(sp.price) : undefined;`
   `rezerwacja/page.tsx:187` → `price={Number.isFinite(price) ? price : undefined}`.

3. Uczciwy system etykiet **istnieje i działa** — `domain/price.ts`,
   `domain/format.ts` — i jest używany w `result-card.tsx:210`,
   `rooms-section.tsx:503`, `[hotelId]/page.tsx:264`, `resolve-slim-rates.ts:25`.
   Checkout jest **jedynym** miejscem toru hotelowego, które go omija.

Czyli: naprawa wymaga **doprowadzenia rozbicia podatkowego do checkoutu**
(najlepiej z `prebook`, który jest autorytatywny — nie z URL-a), a dopiero
potem zmiany tekstu. Sama podmiana stringa dałaby drugi nieprawdziwy komunikat.

### Skutek uboczny tej samej przyczyny — `/cennik`

`src/app/cennik/page.tsx:15` **jawnie kotwiczy** obietnicę marketingową
w tej właśnie linii kodu:

> „Każda liczba i każde twierdzenie poniżej ma pokrycie w kodzie:
> • «wł. podatków i opłat · płatność w PLN» — booking-summary-card.tsx:249"

`metadata.description` tej strony obiecuje „z podatkami i opłatami w środku".
Jeśli komunikat w checkoucie jest nieprawdziwy dla 80,5% taryf, to strona
`/cennik` powtarza tę samą nieprawdę — i robi to jako deklaracja handlowa.

### Drugie, niezależne wystąpienie tej samej klasy błędu

`src/components/mvp/stay-offers-panel.tsx:35` — bezwarunkowe
`„… wł. podatków i opłat"`, używane na `/trips/[id]`
(`src/app/trips/[id]/page.tsx:116`). Poza gałęzią hotelową, nietknięte tym
diffem. `src/app/loty/pasazerowie/page.tsx:297` ma analogiczny tekst dla lotów
— inny kontrakt danych, wymaga osobnej weryfikacji.

---

## 4. Czego ten audyt NIE ustalił

Uczciwe granice — te punkty pozostają otwarte:

- **Jaka kwota jest realnie obciążana.** Komentarz
  `reservation-form.tsx:10-12` twierdzi, że na kroku płatności karta pokazuje
  cenę z `prebook` („authoritative"). Nie zweryfikowano tego empirycznie —
  wymagałoby to wywołania `prebook` na kluczu produkcyjnym.
- **Czy `?price=` z URL-a może wpłynąć na kwotę obciążenia**, czy służy tylko
  do wyświetlenia przed prebookiem. Do rozstrzygnięcia trzeba przejść
  `payments.ts` i `book.ts` (§35: „nie ufaj klientowi w kwestii kwoty").
- **Czy `prebook` zwraca własne `taxesAndFees`** — od tego zależy, czy da się
  policzyć uczciwą sumę całkowitą (§18), czy wolno pokazać wyłącznie
  „dodatkowo na miejscu: X zł" bez sumy.

Dopóki te trzy punkty nie są rozstrzygnięte, **nie wolno zmieniać samego
tekstu w checkoucie** — bo nie wiadomo, którą kwotę tekst ma opisywać.

---

## 5. Reprodukcja

```bash
npx tsx --env-file=.env.local tmp/price-integrity-probe.ts
```

Sonda jest read-only. Liczby zmieniają się między przebiegami (żywe
ceny i dostępność), ale proporcja MATCH/FAIL jest stabilna, bo wynika
z polityki podatkowej obiektów, nie z chwilowych stawek.

---

## 6. Forensyka PREBOOKA (za zgodą właściciela, 3 próby, limit wyczerpany)

`POST /rates/prebook`, `usePaymentSdk: true`. **Zero `/rates/book`, zero
płatności, zero danych klienta.** Uchwyty transakcyjne poniżej zamaskowane.

### 6.1 Dwie pierwsze próby: `4002 invalid offerId` — błąd metody, nie dostawcy

Do prebooka wysyłałem `rates[].rateId`. **Prawidłową wartością jest
`roomTypes[].offerId`** — tak robi `scripts/booking-smoke.ts:44-50` i tak robi
UI (`rooms-section.tsx:510` ← `room.ts:172`).

Komentarz w `prebook.ts:19-21` twierdzi: „getRates returns `rateId`, but POST
/rates/prebook requires **the same value** under the field name `offerId`".
**To jest nieprawda i wprowadza w błąd** — to dwa różne pola o różnych
wartościach (`rateId` len 551, `offerId` len 1084). Komentarz do poprawienia.

### 6.2 Trzecia próba: HTTP 200 — i to zmienia diagnozę

Hotel `lp88f00`, Rzym, 2 noce, 2 dorosłych, PLN.

```
data.price                = 3966.4
data.currency             = "PLN"
data.sellingPriceToUser   = 3966.4
data.priceDifferencePercent = 0
data.roomTypes[0].rates[0].retailRate.taxesAndFees =
   [{ included:false, description:"City tax", amount:171.38, currency:"PLN" },
    { included:false, description:"VAT",      amount:367.26, currency:"PLN" }]
```

Pełna lista kluczy `data.*`: `prebookId, offerId, hotelId, currency,
termsAndConditions, roomTypes, suggestedSellingPrice, isPackageRate,
commission, price, priceType, priceDifferencePercent, cancellationChanged,
boardChanged, supplier, supplierId, transactionId, secretKey, paymentTypes,
checkin, checkout, sellingPriceToUser`.

### 6.3 Wniosek — dane SĄ, to my je wyrzucamy

**Prebook zwraca komplet rozbicia podatkowego.** Checkout mógłby być uczciwy
już dziś. Nie jest, bo `LiteApiPrebookResponseSchema` (`types.ts:450-467`)
deklaruje tylko 9 pól, a schematy w tym repo są **nie-strict** — więc Zod
**po cichu kasuje**:

- `roomTypes[].rates[].retailRate.taxesAndFees` ← rozbicie podatkowe (§17/§18)
- `priceDifferencePercent`, `cancellationChanged`, `boardChanged` ← **gotowe
  sygnały live-verify, których żąda §20** („czy provider zmienił cenę")
- `sellingPriceToUser`, `commission`, `suggestedSellingPrice`, `paymentTypes`

To jest ta sama pułapka, dla której powstał `scripts/probe-hotel-contract.ts`.

**Naprawa jest więc dobrze określona i addytywna:** rozszerzyć schemat
prebooka o te pola (wszystkie `.optional()`), znormalizować je po stronie
serwera i podać do `BookingSummaryCard` zamiast gołego `price: number`.
Żadnej zmiany zachowania — tylko przestajemy wyrzucać dane.

### 6.4 Werdykt dla `?price=` — KORYGUJĘ wcześniejszą ocenę

**To NIE jest dziura pozwalająca zapłacić mniej.**

- `prebook/route.ts:111` woła `prebookHotel({ rateId: b.offerId })` — cena
  z URL-a **nie jest wysyłana do LiteAPI**.
- Prebook **zwrócił** cenę (`data.price`), więc `pre.price ?? b.rate.price`
  (`prebook/route.ts:131`) bierze wartość serwerową. Fallback do URL-a jest
  wtedy martwy.
- `book.ts:61-63` wysyła wyłącznie `{ prebookId, transactionId }` — **żadnej
  kwoty**. Obciążenie jest związane z `secretKey`/`transactionId` po stronie
  dostawcy.

**Pozostaje realna wada, ale niższej klasy:** `price: z.number().optional()`
w schemacie prebooka znaczy, że `pre.price` *może* być nieobecne. Wtedy
`b.rate.price` — czyli liczba z URL-a, sterowana przez klienta — trafia do
`session.price`, `rateSummary.price` i dalej do `prebook.amount`, które
`payment-slot.tsx:188` podaje do konstruktora `LiteAPIPayment`. Gość mógłby
wtedy zobaczyć **inną kwotę niż ta, którą dostawca faktycznie obciąży**.

Klasyfikacja: **nie CRITICAL SECURITY BLOCKER**, ale **do usunięcia** —
fallback ceny na dane z URL-a nie ma prawa istnieć. Przy braku `pre.price`
poprawną reakcją jest błąd, nie zgadywanie z query stringa.

### 6.5 `offerId` jest wspólny dla wszystkich taryf roomType'u — wpływ NIEPOTWIERDZONY

`room.ts:167-172` przypisuje każdej taryfie `offerId: rt.offerId`, więc
wszystkie taryfy jednego roomType'u dzielą jeden identyfikator prebooka.
Hipoteza: gość wybiera „Half Board 1603 zł", a prebook rozwiązuje się na inną
taryfę.

**Nie udało się tego potwierdzić ani obalić.** W 72 hotelach z trzech miast
(Rzym, Barcelona, Hurghada) **nie znaleziono ani jednego roomType'u z dwiema
taryfami o różnych cenach** — w tej próbce każdy roomType niósł jedną taryfę,
co czyni współdzielenie `offerId` nieszkodliwym. Wymaga szerszego przemiatania,
zanim uzna się to za wadę albo za nieistotne. **Nie traktować jako
potwierdzonego błędu.**

### 6.6 Dryf ceny w sekundach — materiał do §20

Ten sam hotel, to samo zapytanie, kilka sekund odstępu:
**3966,40 PLN → 3902,07 PLN** (różnica 64,33 PLN). To nie jest błąd — to
normalna zmienność dostawcy, i dokładnie dlatego checkout musi pokazywać cenę
z prebooka, a nie z URL-a, oraz jawnie komunikować zmianę
(`priceDifferencePercent` jest w odpowiedzi i jest dziś wyrzucane).
