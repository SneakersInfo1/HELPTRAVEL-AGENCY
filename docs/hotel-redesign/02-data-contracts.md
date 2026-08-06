# 02 — Kontrakty danych LiteAPI (zmierzone empirycznie)

**Data pomiaru:** 2026-08-06 · **Klucz:** `prod_` · **Hotel referencyjny:** `lp6558036a`
(Vincci Larios Diez, Málaga) · **Sonda:** `scripts/probe-hotel-contract.ts`

> Ten dokument NIE opisuje tego, co deklarują nasze schematy Zod. Opisuje to, co
> dostawca **naprawdę zwraca na drucie**. Różnica między jednym a drugim jest
> największym odkryciem tego audytu.

## 0. Dlaczego trzeba było sondować

Schematy w `src/lib/liteapi/types.ts` są **nie-strict** (`z.object` bez
`.strict()`). Zod po cichu **wyrzuca każde pole, którego nie zadeklarowaliśmy**.
Z samego kodu nie da się więc odczytać, czego nam brakuje — brakujące pole
wygląda dokładnie tak samo jak pole nieistniejące u dostawcy.

Sonda robi surowy `fetch` i wypisuje **wszystkie** klucze odpowiedzi.

Uruchomienie (read-only, nie dotyka prebook/book):

```bash
pnpm probe:hotel-contract
```

---

## 1. `GET /data/hotels` — pula wyników

Pola zwracane, których **nie parsujemy** (a które odblokowują filtry):

| Pole | Przykład | Do czego |
|---|---|---|
| `chain`, `chainId` | `"Vincci Hoteles"`, `1114` | filtr marki hotelowej (§9 briefu) |
| `facilityIds` | `[47, 107, 2, …]` (34 poz.) | **filtry udogodnień na LIŚCIE** — dziś niemożliwe |
| `hotelTypeId` | `204` | filtr typu obiektu (hotel/apartament) |
| `hotelDescription` | HTML | skrót opisu na karcie |
| `accessibilityAttributes` | obiekt | filtr dostępności |

Pola parsowane poprawnie: `id, name, city, country, latitude, longitude,
address, zip, stars, rating, reviewCount, main_photo, thumbnail`.

> **Uwaga na `rating`:** to skala **0–10** (przykład: `10`), nie 0–5.
> `reviewCount: 5776`.

---

## 2. `GET /data/hotel` — szczegóły hotelu

### 2.1 Pola, które Zod dziś WYRZUCA (potwierdzone na drucie)

| Pole | Kształt | Wartość dla redesignu |
|---|---|---|
| **`rooms`** | `[21× { id, roomName, description, roomSizeSquare, roomSizeUnit, maxAdults, maxChildren, maxOccupancy, bedTypes[], roomAmenities[], photos[], views[] }]` | **ZDJĘCIA POKOI ISTNIEJĄ.** 21/21 pokoi ma zdjęcia (po ~5 szt.) |
| **`poi`** | `[10× { name, category, distanceKm, importance }]` | prawdziwe odległości do atrakcji — sekcja „Lokalizacja" |
| **`sentiment_analysis`** | `{ pros[], cons[], categories[] }` | kategorie ocen + „inteligentne wyróżnienia" |
| `sentiment_updated_at` | `"2025-12-11T16:53:09Z"` | data — wymagana przy oznaczaniu treści AI |
| `facilities` | `[34× { facilityId, name }]` | **udogodnienia PO POLSKU + stabilne ID** |
| `chain`, `chainId` | `"Vincci Hoteles"` | marka |
| `parking` | `"Płatny"` | fakt do sekcji „Dobrze wiedzieć" |
| `childAllowed`, `petsAllowed` | `true` / `false` | zasady pobytu |
| `hotelType` | `"Hotele"` | typ obiektu |
| `phone`, `email`, `fax`, `airportCode` | string | kontakt (często `""`) |
| `rohId`, `groupRoomMin`, `deletedAt` | — | bez zastosowania w UI |

### 2.2 Pojedynczy pokój (`rooms[0]`) — pełny kształt

```
id              = 5677262                 (number, NIE string)
roomName        = "Pokój dwuosobowy"      (PL gdy language=pl — ale NIE zawsze, p. 6)
description     = "Offering free toiletries…"   ← ZOSTAJE PO ANGIELSKU
roomSizeSquare  = 22
roomSizeUnit    = "sqm"
maxAdults       = 2
maxChildren     = 1
maxOccupancy    = 2
bedTypes        = [{ quantity, bedType, bedSize }]
roomAmenities   = [31× { amenitiesId, name, sort }]
photos          = [5× { url, hd_url, imageDescription, mainPhoto, score,
                        imageClass1, imageClass2, classId, classOrder, failoverPhoto }]
views           = []
bedRelation     = ""
```

### 2.3 Dwie pułapki nazewnicze — **potwierdzone błędy w naszym kodzie**

**(a) `starRating`, nie `stars`.**

```
/data/hotels  (lista)     → stars: 4          ✅ parsujemy
/data/hotel   (szczegóły) → starRating: 4     ❌ NIE parsujemy; stars = undefined
```

`LiteApiHotelDetailSchema` dziedziczy `stars` po `LiteApiHotelSchema`, a
`/data/hotel` tego pola **nie zwraca w ogóle**. Skutek: `detail.stars` jest
**zawsze `undefined`** na stronie hotelu. Martwe miejsca:

- `src/app/hotele/[hotelId]/page.tsx:253` — `starRating` w JSON-LD nigdy nie trafia do Google
- `src/app/hotele/[hotelId]/page.tsx:324` — kafelek „Standard 4★" nigdy się nie renderuje
- `src/app/hotele/[hotelId]/page.tsx:405` — gwiazdki w nagłówku nigdy się nie renderują
- `src/app/hotele/[hotelId]/page.tsx:515` — „4-gwiazdkowy hotel" nigdy nie wchodzi do opisu
- `src/app/hotele/rezerwacja/page.tsx:102` — brak gwiazdek w checkoucie

Na liście wyników gwiazdki **działają** (inny endpoint) — dlatego błąd jest
niewidoczny przy pobieżnym przeglądzie: hotel ma gwiazdki na liście i traci je
po kliknięciu.

**(b) `checkinCheckoutTimes` jest w snake_case.**

```
na drucie: { checkin_start, checkin_end, checkout, instructions, special_instructions }
w schemacie: { checkin, checkinStart, checkinEnd, checkout }
```

Przechodzi tylko `checkout`. `checkin_start` / `checkin_end` (czyli **godzina
zameldowania**) oraz `instructions` / `special_instructions` (instrukcje
zameldowania do sekcji polityki) są wyrzucane.

---

## 3. `GET /data/reviews` — pojedyncze opinie

Endpoint **istnieje i działa**, choć nie ma go dziś w `src/lib/liteapi/`
w postaci pełnego mapowania opinii.

```
Top-level: { data, total, sentimentAnalysis }

Pojedyncza opinia:
  averageScore = 10
  country      = "Nottingham, Nottinghamshire, England"
  type         = "NONE"          (typ podróżującego — bywa pusty)
  name         = "36robd"
  date         = "2026-07-28T13:27:05Z"
  headline     = "Great location and quality breakfast"
  language     = "en"
  pros         = "Great location and quality breakfast…"
  cons         = ""
  source       = "tripadvisor"
```

**Konsekwencje projektowe:**

- Opinia dzieli się na `pros` / `cons` — to nie jest jedno pole tekstowe.
  Prezentacja musi to odzwierciedlać (zielony plus / szary minus), a **puste
  `cons` nie może renderować pustej karty**.
- `language` jest jawny → wymóg briefu §13 („oznacz język") jest wykonalny.
- `source` jest jawny → „opinie zweryfikowanych gości" wymaga atrybucji
  (`tripadvisor`), a nie ogólnikowego „partnera".
- `type` bywa `"NONE"` → rozkład typów podróżujących (para/rodzina/solo) z
  ekranu Nuitee jest **niepewny**; nie budować sekcji, dopóki nie zmierzymy
  pokrycia na próbce hoteli.

### 3.1 `sentimentAnalysis.categories`

```json
[{"name":"Cleanliness","rating":10,"description":"Rooms were great, very clean…"},
 {"name":"Service","rating":10,"description":"The staff are extremely friendly…"},
 {"name":"Location","rating":10,"description":"Central position of the hotel…"},
 {"name":"Room Quality","rating":10,"description":"Modern comfortable r…"}]
```

To jest dokładny odpowiednik sekcji „Kategorie" z Nuitee (Czystość 9.3,
Obsługa 9.8…). Nazwy kategorii są **angielskie i ze skończonego zbioru** →
da się je przetłumaczyć słownikiem. `description` jest zdaniem po angielsku
wygenerowanym przez AI dostawcy → **wymaga oznaczenia** (brief §11.5), a
tłumaczenie maszynowe zmieniałoby znaczenie opinii (brief §13 tego zakazuje).

---

## 4. `POST /hotels/rates` — taryfy

### 4.1 Kształt na drucie (surowy)

```
roomType:
  roomTypeId, offerId, supplier, supplierId, rates[],
  offerRetailRate, suggestedSellingPrice, offerInitialPrice,
  priceType, rateType, paymentTypes

rate:
  rateId, occupancyNumber, name, maxOccupancy, adultCount, childCount,
  childrenAges, boardType, boardName, remarks, priceType, commission,
  retailRate, cancellationPolicies, paymentTypes, providerCommission,
  perks, promotions

retailRate:
  total                 = [{ amount: 3219.28, currency: "PLN" }]
  suggestedSellingPrice = [{ amount: 3771.71, currency: "PLN", source: "booking.com" }]
  initialPrice          = [{ amount: 3219.28, currency: "PLN" }]
  taxesAndFees          = [{ included: false, description: "VAT",
                             amount: 298.08, currency: "PLN" }]
```

Nasz `LiteApiRateSchema` parsuje z tego **`total` i `suggestedSellingPrice`**.
`taxesAndFees`, `initialPrice`, `perks`, `promotions`, `remarks`,
`childrenAges` — wyrzucane.

### 4.2 Podatki — pomiar na 400 taryfach (2 hotele, 3 noce, 2 dorosłych)

```
Taryf ogółem:                      400
Z polem taxesAndFees:              400  (100%)
  pozycji included=false:          209  ← DOPŁATA POZA CENĄ
  pozycji included=true:           191

Rodzaje:
  209× VAT                       (included=false)
  125× Taxes and Fees            (included=true)
   24× VAT                       (included=true)
   13× Tax                       (included=true)
    9× Sales tax                 (included=true)
    6× vat                       (included=true)
    3× "VAT of 10% per room per night (Included in price)"
    4× "$163.02 USD per room per stay" (i podobne — opłata w OBCEJ walucie)
```

> **To jest błąd korektności, nie kosmetyka.** `rooms-section.tsx:276` pisze
> **`„… / noc · wł. podatków"` przy KAŻDEJ taryfie**, podczas gdy dla ~52%
> pozycji dostawca jawnie deklaruje `included: false`. Użytkownik dostaje
> zapewnienie, że podatek jest w cenie, gdy w rzeczywistości dopłaci go
> w hotelu. Naprawa musi wejść **przed** czymkolwiek wizualnym.

Zwróć uwagę na ostatnią grupę: opis opłaty bywa **kwotą w USD** wklejoną w
pole `description`. Parser musi to tolerować i **nie sumować** — to tekst, nie
liczba do arytmetyki.

### 4.3 Cena referencyjna — **nie ma jej**

```
initialPrice != total            :   0 / 400
suggestedSellingPrice > total    : 400 / 400
Źródło suggestedSellingPrice     : 400× "booking.com"
```

Dwa twarde wnioski:

1. **`initialPrice` jest zawsze równe `total`.** LiteAPI nie daje własnej ceny
   bazowej ani historycznej. **Nie istnieje dana, z której dałoby się policzyć
   uczciwą przecenę.**
2. **`suggestedSellingPrice` to cena KONKURENTA** (booking.com), zawsze wyższa,
   na 100% taryf.

Skutek dla briefu §4.4: **przekreślonej ceny i „-X%" nie da się zbudować
uczciwie z tego API.** Renderowanie `suggestedSellingPrice` jako przeceny
oznaczałoby stałą, nigdy nieznikającą „promocję" na każdej ofercie w serwisie —
czyli dokładnie ten fałszywy sygnał, który brief zakazuje.

Osobną kwestią jest **porównanie cenowe z atrybucją** („na Booking.com:
3 772 zł") — to inna wypowiedź prawna niż przecena i wymaga decyzji
właściciela. Patrz `07-decisions.md`, brama D2.

### 4.4 Anulacja — pole jest ZAGNIEŻDŻONE

```
rate.refundableTag                     = undefined     ← puste na drucie
rate.cancellationPolicies.refundableTag = "NRFN"       ← tu jest prawda
rate.cancellationPolicies              = { cancelPolicyInfos: [], hotelRemarks: [], refundableTag }
```

Schemat deklaruje **oba** warianty, więc kod, który czyta `rate.refundableTag`
top-level, czyta `undefined`. Do zweryfikowania w `group-rates.ts` przy
implementacji (patrz `01-current-state-audit.md`, pozycja otwarta).

Uwaga: `cancelPolicyInfos` bywa **pustą tablicą** przy `refundableTag: "NRFN"` —
brak terminów nie znaczy „brak polityki", znaczy „bezzwrotna".

---

## 5. Powiązanie taryfa ↔ pokój — **problem nierozwiązany**

```
/hotels/rates  → roomTypeId = "GUZTKLJRG4YDAMRWGY4DKOD4JZJEMTT4GIYDENRQ…"  (base32, ~90 zn.)
/data/hotel    → rooms[].id = 5677262                                       (number)
```

**Identyfikatory nie pasują do siebie.** Nie ma klucza obcego. Żeby pokazać
zdjęcie konkretnego pokoju przy taryfie, trzeba dopasować **po nazwie**:

```
rate.name          = "Standard Room"          ← angielska (z taryfy)
rooms[].roomName   = "Pokój dwuosobowy"       ← polska (z language=pl)
```

To dopasowanie **przez barierę językową**. Możliwe podejścia (do rozstrzygnięcia
w Etapie 2): pobranie `rooms[]` również w `language=en` i dopasowanie EN↔EN
(kosztem drugiego, cache'owanego na 24 h wywołania — dokładnie ten sam wzorzec,
którego `hotel.ts` już używa dla nazwy hotelu), z `fuse.js` jako progiem
podobieństwa. **Bez dopasowania nie wolno podstawiać zdjęcia hotelu jako
zdjęcia pokoju** (brief §12.1).

---

## 6. Język — dane są MIESZANE mimo `language=pl`

Potwierdzone na jednym hotelu:

```
facilities[].name  → "WiFi dostępne", "Darmowe WiFi", "Parking"          PL ✅
hotelFacilities[]  → "WiFi available", "Free WiFi", "Parking"            EN ❌
rooms[].roomName   → "Pokój dwuosobowy" … ale też "Luxury Double Room, Jetted Tub"
rooms[].description→ "Offering free toiletries, this double room…"       EN ❌
bedTypes[]         → { bedType: "Twin bed" } ORAZ { bedType: "Łóżko podwójne" }  ← w JEDNYM pokoju
sentiment.categories[].name → "Cleanliness", "Service"                   EN ❌
review.pros/cons   → EN (z polem `language`)
```

**Wniosek:** `language=pl` to dla LiteAPI *best effort*, nie gwarancja.
Warstwa normalizacji musi zakładać wejście dwujęzyczne i tłumaczyć słownikiem
po naszej stronie — inaczej „polsko-angielska sieczka" z briefu §17 wróci przy
pierwszym hotelu spoza próbki.

### 6.1 Duplikaty udogodnień pochodzą z ŹRÓDŁA

```
{ facilityId: 47,  name: "WiFi dostępne" }
{ facilityId: 107, name: "Darmowe WiFi" }
```

To **dwa różne `facilityId`** o tym samym znaczeniu użytkowym. Deduplikacja po
stringu nie zadziała — potrzebna mapa `facilityId → kategoria pojęciowa`,
zbudowana na stabilnych ID (nie na tekście, który zmienia się z językiem).

`hotelFacilities[]` (EN, bez ID) i `facilities[]` (PL, z ID) to **ta sama
lista 34 pozycji** w dwóch reprezentacjach → kanoniczne źródło to
`facilities[]`, bo ma stabilny klucz.

---

## 7. Co da się zbudować uczciwie — podsumowanie

| Funkcja z briefu | Dane są? | Uwaga |
|---|---|---|
| Zdjęcia konkretnego pokoju | ✅ | wymaga dopasowania nazw (§5) |
| Powierzchnia, łóżka, maks. gości | ✅ | `roomSizeSquare`, `bedTypes`, `maxOccupancy` |
| Udogodnienia pokoju | ✅ | `roomAmenities[31]` |
| Kategorie ocen (paski) | ✅ | `sentiment_analysis.categories`, nazwy EN → słownik |
| Pojedyncze opinie + język + źródło | ✅ | `/data/reviews` |
| Najczęściej wymieniane zalety | ✅ | `sentiment_analysis.pros` (EN, treść AI dostawcy) |
| Odległości do atrakcji | ✅ | `poi[].distanceKm` |
| Marka hotelowa (filtr) | ✅ | `chain` / `chainId` |
| Filtry udogodnień na liście | ✅ | `facilityIds` z `/data/hotels` |
| Podatki i opłaty — rozbicie | ✅ | `taxesAndFees[]` z flagą `included` |
| Godzina zameldowania | ✅ | po naprawie snake_case |
| Gwiazdki na stronie hotelu | ✅ | po naprawie `starRating` |
| **Przecena / przekreślona cena** | ❌ | `initialPrice == total` na 400/400 |
| **Rozkład typów podróżujących** | ⚠️ | `review.type` bywa `"NONE"` — zmierzyć pokrycie |
| **Odległość od centrum / plaży** | ⚠️ | `poi[]` ma atrakcje; „centrum"/„plaża" wymaga własnej reguły |
| **Mapa** | ❌ | brak biblioteki i dostawcy kafelków — brama D1 |

---

## 8. Czego jeszcze NIE zmierzono

Uczciwa lista dziur w tym audycie — następna sesja niech nie zakłada, że to
sprawdzone:

1. Pokrycie `rooms[].photos` na **szerszej próbce** (mierzone na 1 hotelu:
   21/21). Hotele „sparse" z incydentu `LITEAPI_VALIDATION` mogą mieć `null`.
2. Pokrycie `poi[]` i czy pojawia się `category: "beach"` dla hoteli nadmorskich.
3. Pokrycie `review.type` (rozkład par/rodzin/solo).
4. Czy `/data/reviews` ma paginację i limit — sprawdzano tylko `limit=3`.
5. Skuteczność dopasowania nazw pokoi EN↔EN na próbce kilkudziesięciu hoteli.
6. Zachowanie `taxesAndFees` przy walutach innych niż PLN.
