# 01 — Audyt stanu obecnego sekcji hotelowej

**Data:** 2026-08-06 · **Gałąź:** `feat/hotel-experience-redesign` (odbita od `main` @ `82f9fd6`)
**Zakres:** `/hotele/szukaj`, `/hotele/[hotelId]`, `/hotele/w/[miasto]`, warstwa `lib/liteapi` + `lib/hotels`

> Metoda: czytanie kodu + **empiryczna sonda API** (`scripts/probe-hotel-contract.ts`).
> Każde twierdzenie niżej ma odnośnik `plik:linia` albo pomiar. Rzeczy
> niesprawdzone są jawnie oznaczone jako **[NIEZWERYFIKOWANE]** — następna sesja
> niech ich nie traktuje jak faktów.

---

## 1. Architektura — jak to działa dziś

### 1.1 Wyniki wyszukiwania (`/hotele/szukaj`)

Server component z `revalidate = 300` (`page.tsx:24`). Przepływ:

```
page.tsx (RSC)
  └─ fetchHotelsByPlaceId / fetchHotelsForDestination     → pula 300 hoteli (POOL_PAGE_SIZE)
     └─ <Suspense fallback={ResultsSkeleton}>
        └─ ResultsList (client)
           ├─ dociąga kolejne strony puli przez /api/hotels/meta (sufit 2000)
           ├─ price-batcher → /api/hotels/rates/batch (ceny per karta, on mount)
           └─ filters-logic.ts → filtrowanie/sortowanie na PEŁNEJ puli (nie na stronie)
```

Decyzja „pula na kliencie" jest **dobra i trzeba ją zachować**: sortowanie po
cenie i filtr dostępności działają globalnie, nie tylko na widocznej stronie
(`page.tsx:26-39` dokumentuje historię capu 2 MB Next Data Cache).

Stronicowanie: 20 kart/stronę (`page.tsx:41`), parametry w URL (każdy widok
udostępnialny).

### 1.2 Strona hotelu (`/hotele/[hotelId]`)

663 linie w jednym pliku `page.tsx` + 5 komponentów. Dane:
`getHotelDetail()` (cache 24 h, sekwencyjnie PL→EN dla nazwy własnej —
`hotel.ts:75-79`) + taryfy.

### 1.3 Co jest zrobione dobrze i **nie wolno tego zepsuć**

| Element | Dlaczego jest kruche |
|---|---|
| Sekwencyjne PL→EN w `hotel.ts:75-79` | równoległość podwajała błędy 400 u dostawcy (incydent 2026-07-19) |
| Guard `HOTEL_ID_RE` (`hotel.ts:17`) | 5,5 tys. błędów 400 od crawlerów w 2 dni |
| `prefetch={false}` na linkach taryf (`rooms-section.tsx:290`) | 26,7 tys. zbędnych SSR-ów checkoutu w 2 dni |
| Per-element `safeParse` w listach (`types.ts:84`) | jeden trefny hotel wywracał CAŁY kierunek (Sharm, 754 hotele) |
| `.nullish()` w `LiteApiHotelDetailSchema` | hotele „sparse" nullują puste pola → 404 |
| Pula na kliencie + `/api/hotels/meta` | globalne sortowanie/filtrowanie |
| Kontrakt linku do checkoutu (`rooms-section.tsx:224-235`) | `offerId` + `price` + `cur` + `board` + `cancel` — checkout to czyta |
| `normalizeGuestsForRooms` / `splitGuestsIntoRooms` | trzy osobne incydenty obsadowe |

---

## 2. Potwierdzone defekty

Uporządkowane wg wagi. Wszystkie **zweryfikowane** — kod + pomiar API.

### 2.1 [WYSOKI · korektność] Fałszywe zapewnienie „wł. podatków"

- `src/app/hotele/szukaj/_components/result-card.tsx:213` → `„… · wł. podatków i opłat"`
- `src/app/hotele/[hotelId]/_components/rooms-section.tsx:276` → `„… / noc · wł. podatków"`

Oba napisy są **bezwarunkowe**. Pomiar na 400 taryfach: **209 pozycji ma
`taxesAndFees[].included === false`** (najczęściej VAT), czyli podatek **nie
jest** w pokazanej cenie. Użytkownik dostaje pisemne zapewnienie, które dla
około połowy ofert jest nieprawdziwe.

Naprawa wymaga uprzedniego dodania `taxesAndFees` do schematu (dziś Zod je
wyrzuca — `types.ts:181-186`).

### 2.2 [WYSOKI · dane] Gwiazdki znikają po wejściu na stronę hotelu

`/data/hotel` zwraca `starRating`, nie `stars`. `LiteApiHotelDetailSchema`
dziedziczy `stars` po `LiteApiHotelSchema` i **nie deklaruje `starRating`** →
Zod je wyrzuca → `detail.stars` jest **zawsze `undefined`**.

Martwy kod (nigdy się nie wykonuje):
`[hotelId]/page.tsx:253` (JSON-LD `starRating`), `:324` (kafelek „Standard"),
`:405` (gwiazdki w nagłówku), `:515` (opis „4-gwiazdkowy hotel"),
`rezerwacja/page.tsx:102`.

Na liście gwiazdki **są** (inny endpoint) → hotel „traci gwiazdki" po kliknięciu.
Traci je też Google (JSON-LD).

### 2.3 [WYSOKI · dane] Zdjęcia pokoi istnieją w API i są wyrzucane

`/data/hotel` zwraca `rooms[21]`, każdy z `photos[5]`, `roomSizeSquare`,
`bedTypes[]`, `roomAmenities[31]`, `maxOccupancy`, `description`.
`LiteApiHotelDetailSchema` **nie deklaruje `rooms`** → cała tablica ginie.

Dlatego `rooms-section.tsx` renderuje karty pokoi **bez jednego zdjęcia** i bez
metrażu — nie z braku danych, tylko dlatego, że nigdy nie przeszły przez Zod.

Ograniczenie: taryfy i pokoje **nie mają wspólnego klucza** — szczegóły i plan
obejścia w `02-data-contracts.md` §5.

### 2.4 [WYSOKI · dane] Odrzucane: `poi`, `sentiment_analysis`, `facilities`, `chain`, `facilityIds`

Grep potwierdza: **żaden plik w `src/` nie czyta** `taxesAndFees`,
`sentiment`, `poi`, `roomAmenities`, `bedTypes`, `initialPrice`.
`suggestedSellingPrice` jest w schemacie, ale nieużywane w UI.

Skutkiem jest większość braków z briefu: kategorie ocen, wyróżnienia,
odległości do atrakcji, filtr marki, filtry udogodnień na liście.

### 2.5 [WYSOKI · UX] Odwrócona hierarchia ceny

`result-card.tsx:208-214` — cena **za noc** jest wielka i zielona
(`text-xl font-bold`), cena **całkowita** to szary `text-[11px]`.
Brief §8.5 wymaga odwrotnie: całość pobytu dominuje, „za noc" jest pomocnicze.

Na stronie hotelu (`rooms-section.tsx:271-278`) jest **odwrotnie niż na liście**
— tam dominuje total. Dwie różne hierarchie w jednym lejku.

### 2.6 [ŚREDNI · UX] Emoji zamiast ikony

`result-card.tsx:193` → `<span aria-hidden>🍽</span>` przy typie wyżywienia.
Projekt ma `lucide-react` w zależnościach — ikona `UtensilsCrossed` jest
dostępna bez nowej biblioteki.

Szerszy grep po emoji w `src/app/hotele` **nie znalazł innych** — problem jest
węższy, niż sugeruje brief.

### 2.7 [~~ŚREDNI~~ → NIEAKTUALNE] Kolizja sticky CTA z czatem

> **Korekta 2026-08-06 (Etap 4).** Ten punkt powstał z samego grepa po
> `z-index` i **był błędny w części praktycznej**. Po przeczytaniu logiki
> pozycjonowania w `concierge-launcher.tsx:149-160`:
>
> - na stronach `/hotele/*` (poza wynikami) launcher **podnosi się nad pasek**:
>   `bottom-[max(5.25rem, calc(env(safe-area-inset-bottom)+5.25rem))]`,
>   z powrotem do `lg:bottom-6`, gdy pasek znika na dużych ekranach,
> - respektuje `env(safe-area-inset-bottom)` (wymóg briefu §16),
> - chowa się całkowicie, gdy baner zgód czeka na decyzję (`consentBlocking`) —
>   to reakcja na incydent, w którym dymek zasłaniał zgody i zabijał GA4,
> - na `/hotele/szukaj` zostaje przy dole, bo pasek filtrów jest wyśrodkowany
>   (zweryfikowane na 375 px w sesji 2026-07-11).
>
> Różnica z-index (czat `z-40`, sticky CTA `z-30`) **istnieje**, ale nie
> powoduje zasłaniania, bo elementy nie zajmują tego samego miejsca.
> Przebudowa **nie powinna tego ruszać** — to działające rozwiązanie oparte
> na pomiarze, a nie na teorii.
>
> Co zostaje prawdziwe z tego punktu: brak **nazwanej skali warstw** (wartości
> `z-10`…`z-[80]` rozsypane po 20+ plikach). To jednak dług czytelności,
> nie defekt użytkowy — obniżony do priorytetu „porządkowego".

Pierwotna treść punktu (zachowana dla kontekstu):

| Element | z-index | Plik |
|---|---|---|
| Sticky CTA hotelu | `z-30` | `[hotelId]/_components/booking-widget.tsx` |
| **Launcher czatu (FAB)** | **`z-40`** | `components/concierge/concierge-launcher.tsx` |
| Panel czatu (otwarty) | `z-[70]` | jw. |
| Panel filtrów (mobile) | `z-30`/`z-40`/`z-50` | `szukaj/_components/filters-sidebar.tsx` |
| Baner cookies | `z-40`/`z-50` | `components/site/cookie-consent-banner.tsx` |

**Czat (`z-40`) leży nad sticky CTA hotelu (`z-30`)** — to jest mechaniczna
przyczyna zasłaniania, nie kwestia gustu. Panel filtrów ma `z-40`
*równo z czatem* (kolejność zależy od DOM), a baner cookies dokłada trzeci
element na tym samym poziomie.

Nie istnieje żadna wspólna skala warstw — wartości `z-10`…`z-[80]` są rozsypane
po 20+ plikach.

### 2.8 [ŚREDNI · i18n] Dane wracają dwujęzyczne mimo `language=pl`

Zmierzone: `bedTypes` jednego pokoju zawiera **jednocześnie** `"Twin bed"`
i `"Łóżko podwójne"`. `rooms[].description` i `sentiment.categories[].name` są
po angielsku. `hotelFacilities[]` po angielsku, `facilities[]` po polsku.

Duplikaty udogodnień pochodzą **ze źródła**: `facilityId 47 = "WiFi dostępne"`
i `facilityId 107 = "Darmowe WiFi"` to dwa różne rekordy. Deduplikacja po
tekście nie zadziała — potrzebna mapa pojęć na `facilityId`.

### 2.9 [ŚREDNI · UX] Brak mapy

W `package.json` nie ma **żadnej** biblioteki map (ani Leaflet, ani MapLibre,
ani Mapbox, ani Google). Cała funkcjonalność z briefu §10 to praca od zera
**plus wybór dostawcy kafelków** → brama decyzyjna D1 (`07-decisions.md`).

### 2.10 [NIEZWERYFIKOWANE] Odczyt `refundableTag` z niewłaściwego poziomu

Na drucie `rate.refundableTag` jest `undefined`, a prawda siedzi w
`rate.cancellationPolicies.refundableTag` (`"NRFN"`). Schemat deklaruje oba.
**Nie sprawdzono jeszcze**, z którego poziomu czyta `lib/hotels/group-rates.ts`
— jeśli z top-level, oznaczenia „bezzwrotna/zwrotna" mogą być błędne.
**Do sprawdzenia w pierwszej kolejności w Etapie 1.**

---

## 3. Braki UX względem briefu (bez wartościowania kodu)

Stwierdzone przez lekturę komponentów, nie przez oglądanie w przeglądarce
(patrz §5 — zrzuty bazowe niewykonane):

- Karta wyniku nie pokazuje: dzielnicy, udogodnień, marki, typu obiektu.
- Strona hotelu: brak zakładek nawigacyjnych, brak lightboxa galerii
  (`hotel-gallery.tsx` ma 167 linii i `z-10`, ale nie pełnoekranowego widoku
  — **[do potwierdzenia w przeglądarce]**).
- `hotel-reviews.tsx` ma **42 linie** — to mierzy skalę braku sekcji opinii
  wobec wymagań briefu §13.
- Brak sekcji „Lokalizacja" i „Polityka" jako wydzielonych bloków.
- Filtry: brak filtra marki, typu obiektu, udogodnień (brak danych w modelu —
  patrz 2.4, nie brak pomysłu).

---

## 4. Warstwa wspólna — promień rażenia

Współdzielone z homepage i lotami (zmiana = ryzyko regresji poza hotelami):

- `components/site/*` — nagłówek, stopka, baner cookies, `quick-search-launcher`
- `components/search/*` — `date-range-field`, `guests-field`, `origin-combobox`
- `components/concierge/concierge-launcher` — czat, **obecny na stronach hoteli**
- `lib/money.ts` — `formatPLN`, `fromMinor`, `toMinor`
- `lib/liteapi/*` — **także loty i checkout**; zmiana schematu dotyka rezerwacji
- `app/globals.css` — tokeny

**Zasada na czas przebudowy:** rozszerzać schematy LiteAPI wyłącznie przez
**dodawanie opcjonalnych pól**. Żadnych zmian istniejących nazw i typów —
`booking`, `rezerwacja` i loty czytają te same moduły.

---

## 5. Czego ten audyt NIE objął

1. **Zrzutów bazowych i pomiarów wydajności** — serwer deweloperski miał
   uszkodzony katalog `.next` (znany błąd po ubitym procesie); po `rm -rf .next`
   wstał, ale panel przeglądarki nie kompletował klatek, więc zrzutów nie ma.
   **To pierwsze zadanie następnej sesji** (brief §26.7 wymaga „przed i po").
2. **Strony referencyjnej Nuitee w interakcji** — analiza opiera się na
   zrzutach przekazanych przez właściciela, nie na własnej sesji w przeglądarce.
3. **Playwright** — nie ma go w projekcie. E2E z briefu §26.3 wymaga instalacji
   (brama decyzyjna D3).
4. Pełnej lektury `[hotelId]/page.tsx` (663 linie) i `results-list.tsx`
   (593 linie) — czytane fragmentarycznie i przez grep.
5. Audytu dostępności i Lighthouse.

> Kontekst: równoległy audyt wielo-agentowy (7 agentów) padł na limicie sesji
> po ~956 tys. tokenów, bez zwrócenia wyników. Powyższe powstało w trybie
> jednoosobowym, dlatego zakres jest węższy, ale każdy punkt jest zweryfikowany
> u źródła.
