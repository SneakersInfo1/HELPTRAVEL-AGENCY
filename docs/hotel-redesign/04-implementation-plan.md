# 04 — Plan wdrożenia

Zasada porządkowania: **najpierw prawda o danych, potem wygląd.** Etapy 1–3
naprawiają rzeczy, które dziś wprowadzają użytkownika w błąd albo blokują
wszystko inne. Dopiero potem UI.

Każdy etap = osobny commit (albo kilka), z własnymi testami i możliwością
zatrzymania prac bez psucia serwisu.

Legenda ryzyka regresji: 🟢 lokalne · 🟡 dotyka wspólnego kodu · 🔴 dotyka rezerwacji/płatności

---

## Etap 0 — Punkt odniesienia (**pierwsze zadanie następnej sesji**)

Bez tego nie da się spełnić briefu §26.7 („zmierz przed i po”).

- Wstaje serwer deweloperski (uwaga: po ubitym procesie `rm -rf .next`)
- Zrzuty bazowe: wyniki desktop/mobile, hotel desktop/mobile, filtry, pokoje, opinie
- Pomiar: LCP, CLS, INP, rozmiar JS, czas do pierwszych cen
- Zapis do `docs/hotel-redesign/baseline/`

Testy: `pnpm build` przechodzi · Ryzyko: 🟢

---

## Etap 1 — Kontrakt danych: odblokowanie tego, co API już daje

**Cel:** przestać wyrzucać dane, za które już płacimy, i naprawić dwa
potwierdzone błędy nazewnicze.

Pliki: `src/lib/liteapi/types.ts`, `hotel.ts`, `+ types.test.ts`

- `starRating` dodane obok `stars` (R4) → gwiazdki i JSON-LD wracają na stronie hotelu
- `checkinCheckoutTimes` w **snake_case** (`checkin_start`, `checkin_end`, `instructions`, `special_instructions`)
- `rooms[]` z pełnym kształtem (nazwa, metraż, łóżka, udogodnienia, **zdjęcia**)
- `poi[]`, `sentiment_analysis`, `facilities[{facilityId,name}]`, `chain`, `chainId`, `parking`, `petsAllowed`, `childAllowed`
- `retailRate.taxesAndFees[]` i `initialPrice`
- `facilityIds` w schemacie listy (odblokowuje filtry udogodnień)

**Wszystko jako pola opcjonalne (R3).** Żadnych zmian istniejących nazw.

Kryteria odbioru: sonda i schemat zgadzają się co do pól; testy schematów
przechodzą na próbkach „sparse" (pola `null`); `pnpm test` zielone.

Testy: `node --import tsx --test src/lib/liteapi/types.test.ts` · `pnpm test` · Ryzyko: 🟡 (wspólne z rezerwacją — dlatego tylko dodawanie pól)

---

## Etap 2 — Model domenowy i normalizacja

**Cel:** komponenty nigdy nie dotykają surowej odpowiedzi API.

Nowe: `src/lib/hotels/domain/` — `hotel-details.ts`, `room.ts`, `rate.ts`,
`price.ts`, `review.ts`, `amenity.ts`, `location.ts` + mappery + testy.

- Typy z briefu §18 (`HotelDetails`, `RoomType`, `RoomRate`, `PriceBreakdown`, `TaxesAndFees`, `BoardType`, `CancellationPolicy`, `HotelAmenity`, `MapMarker`)
- **Dopasowanie taryfa↔pokój** (`02-data-contracts.md` §5): pobranie `rooms[]` też w `language=en`, dopasowanie EN↔EN, `fuse.js` jako próg podobieństwa. Brak dopasowania → placeholder (R10)
- Normalizacja udogodnień po `facilityId` + kategorie z briefu §14.2
- Mapowanie `boardType` → polskie nazwy; polityki anulacji z **zagnieżdżonego** `refundableTag`
- **Weryfikacja 2.10 z audytu:** z którego poziomu `group-rates.ts` czyta `refundableTag`

Kryteria: testy jednostkowe na brakujących polach, `null`, pustych tablicach,
braku ceny referencyjnej, braku współrzędnych; zero `any`.

Testy: nowe pliki `*.test.ts` **dopisane do listy w `package.json`** (inaczej nigdy się nie uruchomią) · Ryzyko: 🟢

---

## Etap 3 — Uczciwe ceny i podatki (R7)

**Cel:** usunąć fałszywe „wł. podatków" z całego lejka.

Pliki: `src/lib/hotels/domain/price.ts`, `result-card.tsx`, `card-price.tsx`,
`rooms-section.tsx`, `booking-widget.tsx`

- Jedna funkcja prezentacji ceny dla listy, hotelu i checkoutu
- Etykieta podatków **wynika z `included`**, nie jest wpisana na stałe
- Total dominuje, „/ noc" pomocnicze — **spójnie** (R6)
- Bez przecen (D2 domyślnie wariant 1)

Kryteria: żaden komponent nie zawiera na stałe słowa „podatk"; testy pokrywają
`included:true`, `included:false`, mieszankę, brak pola, opis w obcej walucie.

Testy: `node --import tsx --test src/lib/hotels/domain/price.test.ts` · Ryzyko: 🔴 (checkout czyta `price`/`cur` — kontrakt R12 zamrożony)

---

## Etap 4 — Tokeny, ikony, skala warstw

Pliki: `src/app/globals.css`, nowy `src/lib/ui/layers.ts`, `result-card.tsx`

- Nazwane warstwy z-index (R8); czat schodzi **pod** sticky CTA hotelu
- `🍽` → `lucide-react` (R1)
- Tokeny odstępów/promieni/cieni dla sekcji hotelowej, na bazie istniejących OKLCH

Kryteria: homepage i loty **bez zmian wizualnych** (porównanie zrzutów z Etapu 0).

Ryzyko: 🟡 (`globals.css` jest globalny — stąd wymóg porównania zrzutów)

---

## Etap 5 — Karta wyniku i lista (desktop + mobile)

- Hierarchia ceny z Etapu 3, dzielnica, marka, udogodnienia, typ obiektu
- Skeletony, stan pusty, stan błędu, ponowienie
- Mobile: brak ucinania nazwy, cele dotykowe 44 px

Kryteria: `helptravel-conversion-checklist` przechodzi; 375 px bez przewijania w poziomie.

Ryzyko: 🟢

---

## Etap 6 — Filtry i sortowanie

- Filtr marki (`chain`), typu obiektu, udogodnień (`facilityIds`) — **odblokowane Etapem 1**
- Mobile: pełnoekranowy panel, sticky stopka z `env(safe-area-inset-bottom)`, licznik wyników
- **Żadnego filtra bez pokrycia w danych** (brief §9)

Ryzyko: 🟢

---

## Etap 7 — Mapa · **zablokowany bramą D1**

Dopiero po decyzji o dostawcy. Import dynamiczny, brak wpływu na LCP listy,
degradacja do listy przy błędzie dostawcy.

Ryzyko: 🟡

---

## Etap 8 — Strona hotelu: szkielet, zakładki, galeria

- Zakładki (Radix Tabs, już jest), sticky na desktopie, przewijalne na mobile
- Galeria: duże + siatka, licznik, lightbox (Radix Dialog + Embla — R2)
- Gwiazdki wracają (Etap 1)

Ryzyko: 🟢

---

## Etap 9 — Pokoje i warianty **ze zdjęciami**

Najważniejszy etap dla konwersji — realizuje brief §12.

- Karta pokoju: zdjęcia pokoju, metraż, łóżka, maks. gości, udogodnienia
- Warianty: wyżywienie, anulacja z terminem, podatki, cena całkowita i za noc
- Szczegóły pokoju: modal z galerią (focus trap, Escape, blokada scrolla)
- **Placeholder zamiast zdjęcia hotelu przy braku dopasowania (R10)**

Ryzyko: 🔴 (link do checkoutu — kontrakt R12 bez zmian)

---

## Etap 10 — Opinie

`/data/reviews` + `sentiment_analysis.categories`: ocena ogólna, paski kategorii,
zalety, pojedyncze opinie z `pros`/`cons`, językiem i źródłem (`tripadvisor`).
Puste `cons` **nie renderuje pustej karty**. Treści AI oznaczone (R11).

Rozkład typów podróżujących — **dopiero po zmierzeniu pokrycia `review.type`**
(bywa `"NONE"`).

Ryzyko: 🟢

---

## Etap 11 — Udogodnienia, lokalizacja, polityka

Kategorie i deduplikacja po `facilityId` (R5); `poi[]` z odległościami;
polityka z `hotelImportantInformation` + `checkin_start`/`instructions`
(odblokowane Etapem 1) + `petsAllowed`/`childAllowed`/`parking`.
Ważne warunki w karcie „Dobrze wiedzieć".

Ryzyko: 🟢

---

## Etap 12 — Sticky CTA, czat, wydajność

Warstwy z Etapu 4 w praktyce; `env(safe-area-inset-bottom)`; czat nie zasłania
CTA i nie znika. Pomiar względem Etapu 0.

Ryzyko: 🟡 (czat jest współdzielony)

---

## Etap 13 — Dostępność i E2E · **brama D3**

WCAG 2.2 AA; Playwright (jeśli zgoda) z 18 scenariuszami briefu §26.3,
viewportami §26.4 i WebKit §26.5.

Ryzyko: 🟢

---

## Etap 14 — Regresja i raport końcowy

Homepage, loty, checkout, czat, analityka po zmianach wspólnych.
`09-final-report.md` + instrukcja wycofania.

Ryzyko: 🟡

---

## Kolejność a bramy

```
Etap 0 → 1 → 2 → 3 → 4 → 5 → 6 → 8 → 9 → 10 → 11 → 12 → 14
                              ↘ 7 (czeka na D1: dostawca mapy)
                                             ↘ 13 (czeka na D3: Playwright)
```

Etapy 1–6 i 8–12 **nie są zablokowane** — praca może iść dalej bez odpowiedzi
na bramy. Blokują one wyłącznie mapę (D1), sposób pokazania ceny odniesienia
(D2, domyślnie: nie pokazujemy) i testy E2E (D3).
