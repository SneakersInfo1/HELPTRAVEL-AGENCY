# 07 — Decyzje i bramy decyzyjne

Format: decyzje podjęte samodzielnie (brief §28 na to pozwala) + bramy, które
**wymagają decyzji właściciela**, bo dotyczą pieniędzy, prawa albo nowej usługi.

---

## Bramy — ROZSTRZYGNIĘTE 2026-08-06

| # | Decyzja właściciela | Skutek |
|---|---|---|
| **D1** | **MapLibre GL + MapTiler** | Etap 7 odblokowany po dostarczeniu klucza API MapTiler (`MAPTILER_API_KEY` w env Vercela + `.env.local`). Do czasu klucza można zbudować komponent i pracować na lokalnym kluczu deweloperskim. |
| **D2** | **Nie pokazywać ceny Booking.com w ogóle** | Etap 3 bez ceny odniesienia. Żadnego `line-through`, żadnego „-X%". `suggestedSellingPrice` zostaje w modelu domenowym jako dana, ale **nie trafia do UI**. |
| **D3** | **Playwright — tak, w Etapie 13** | UI stabilizujemy najpierw; testy E2E pisane raz, do gotowego interfejsu. |

> Jedyna rzecz, której nadal potrzebuję od właściciela: **klucz API MapTiler**
> (darmowe konto, ~100 tys. ładowań/mies.). Bez niego Etap 7 nie wejdzie na
> preview, choć kod można napisać wcześniej.

### D1a — Rozważony i odrzucony wariant: gotowy widget mapy LiteAPI

Właściciel podesłał `docs.liteapi.travel/docs/integrate-a-map-widget` (2026-08-06).
Sprawdzone — **nie zastępuje własnej mapy**, mimo jednej realnej zalety.

Zaleta: nie wymaga własnego klucza dostawcy kafelków (LiteAPI obsługuje to
u siebie), embed to jeden `<script src="https://components.liteapi.travel/v1.0/sdk.umd.js">`
+ `LiteAPI.Map.create()`.

Dlaczego mimo to odpada:

1. **To ich UI, nie nasze.** Konfiguracja ogranicza się do `primaryColor`,
   kolorów dymka i `labelsOverride`. Brief §7 wymaga spójności z HelpTravel,
   a nie kolorowania cudzego komponentu.
2. **Brak udokumentowanego języka polskiego.** Dokumentacja wymienia `currency`,
   ale nie ustawienie locale. To dokładnie ta sama ściana, o którą rozbił się
   gotowy chatbot LiteAPI (porzucony: brak PL UI, ceny w USD).
3. **Nie da się zsynchronizować z naszą listą i filtrami.** Widget ma własne
   wyszukiwanie i własną pulę hoteli. Brief §10 wymaga wspólnego stanu:
   zaznaczony marker ↔ podświetlona karta, zachowanie filtrów, „przeszukaj ten
   obszar" na NASZYCH wynikach. Hostowany komponent tego nie odda.
4. Kliknięcie prowadzi na stronę WhiteLabel (`*.nuitee.link`), czyli **poza
   helptravel.pl** — chyba że przechwycimy `onHotelClick`, co i tak sprowadza
   się do pisania własnej integracji.

To samo rozumowanie dotyczy widgetów listy hoteli i paska wyszukiwania:
są komplementarne dla stron treściowych bez własnego backendu, a my mamy
własny lejek, ceny w PLN i polski interfejs.

**Wniosek: D1 bez zmian — MapLibre GL + MapTiler.** Widgety zostają odnotowane
jako awaryjny plan B, gdyby MapTiler okazał się problemem.

### D1b — Co z linków RZECZYWIŚCIE zmieniło projekt

Dokumentacja `POST /hotels/rates` ujawniła parametr **`roomMapping: true`**,
który rozwiązuje największy nierozwiązany problem audytu (powiązanie taryfy ze
zdjęciem pokoju) — szczegóły i pomiar w `02-data-contracts.md` §5.
Ujawniła też **filtry po stronie serwera** (`starRating`, `facilities`,
`chainIds`, `boardType`, `refundableRatesOnly`, `sort`, `limit`), co jest
istotne dla Etapu 6.

Uzasadnienia wariantów zostają niżej — przydają się przy powrocie do tematu.

---

## Bramy wymagające decyzji właściciela (kontekst źródłowy)

### D1 — Dostawca mapy · ~~BLOKUJE ETAP 7~~ → **rozstrzygnięte: MapLibre + MapTiler**

W projekcie **nie ma żadnej biblioteki map**. Mapa z briefu §10 to nie jest
przestawienie komponentu, tylko nowa zależność + dostawca kafelków.

| Wariant | Koszt | Ryzyko |
|---|---|---|
| **MapLibre GL + MapTiler** | darmowy do 100 tys. ładowań/mies., potem płatny; **wymaga klucza API** | limit; klucz w env |
| **Leaflet + kafelki OSM** | 0 zł, bez klucza | licencja OSM **odradza użycie komercyjne** na ich serwerach kafelków; realne ryzyko odcięcia |
| **Mapbox** | ~50 tys. ładowań/mies. darmowo, potem płatne; klucz | to, czego używa Nuitee |
| **Bez mapy interaktywnej** | 0 zł | statyczny obraz + link do Map Google; brak funkcji z §10 |

Rekomendacja: **MapLibre GL + MapTiler**. MapLibre jest na licencji BSD (brak
uzależnienia od dostawcy), a warstwę kafelków da się później podmienić bez
przepisywania komponentu.

**Potrzebne od właściciela:** zgoda na założenie konta i klucz API.

### D2 — Czy pokazywać cenę Booking.com jako odniesienie · ~~BLOKUJE ETAP 4~~ → **rozstrzygnięte: nie pokazujemy**

Pomiar (400 taryf, `02-data-contracts.md` §4.3):

- `initialPrice == total` na **400/400** → LiteAPI **nie daje** własnej ceny bazowej
- `suggestedSellingPrice` jest wyższe od naszej ceny na **400/400**, źródło: **100% booking.com**

**Wniosek techniczny: uczciwej przeceny nie da się zbudować z tych danych.**
Przekreślona cena i „-15%" na każdej ofercie w serwisie to stała, nigdy
nieznikająca „promocja" — czyli dokładnie ten fałszywy sygnał, którego brief §4.4
zakazuje. Prawnie: unijna dyrektywa Omnibus (w Polsce egzekwowana przez UOKiK)
wymaga, by przy ogłoszeniu obniżki podać **najniższą cenę z 30 dni** — cena
konkurenta tego nie spełnia.

Trzy warianty:

1. **Nie pokazywać nic** (domyślny, bezpieczny) — cena to cena.
2. **Porównanie z atrybucją** — „Na Booking.com: 3 772 zł" jako osobny,
   opisany wiersz, **bez** przekreślenia i **bez** procentu. To reklama
   porównawcza, nie ogłoszenie obniżki — inny reżim prawny, ale wymaga
   rzetelności i możliwości weryfikacji.
3. Pokazać jako przecenę — **odrzucone**, sprzeczne z briefem i ryzykowne prawnie.

**Domyślnie idę wariantem 1**, dopóki właściciel nie zdecyduje inaczej.
Wariant 2 to decyzja biznesowo-prawna, nie techniczna.

### D3 — Playwright dla testów E2E

Brief §26.3 wymaga 18 scenariuszy E2E. W projekcie **nie ma Playwrighta ani
żadnego frameworka E2E** (tylko `node:test` + `tsx`).

Koszt: nowa zależność deweloperska (~300 MB przeglądarek), czas na konfigurację,
wolniejsze CI. Zysk: jedyny sposób, by spełnić §26.3–26.6 (viewporty,
iOS Safari/WebKit, testy wizualne).

Rekomendacja: **tak**, ale jako osobny etap po ustabilizowaniu UI (Etap 13),
żeby nie pisać testów do interfejsu, który się jeszcze zmienia.

---

## Decyzje podjęte samodzielnie

### R1 — Ikony: `lucide-react`, zero nowych zależności
Już jest w `package.json`. Emoji `🍽` (`result-card.tsx:193`) → `UtensilsCrossed`.
Import selektywny (per ikona), nigdy `import * as icons`.

### R2 — Galeria: `embla-carousel-react` + Radix Dialog
Oba już są. Nie dokładamy biblioteki lightboxa. Radix daje focus trap,
Escape i blokadę scrolla „za darmo" (brief §12.3).

### R3 — Rozszerzanie schematów LiteAPI wyłącznie przez pola opcjonalne
`lib/liteapi/*` jest współdzielone z rezerwacją i lotami. Każde nowe pole:
`.optional()` / `.nullish()`, żadnych zmian nazw i typów istniejących pól.
Uzasadnienie: incydent `LITEAPI_VALIDATION` (hotele „sparse") pokazał, że
zaostrzenie schematu wywraca stronę.

### R4 — Naprawa `starRating` przez **dodanie** pola, nie zmianę
```ts
starRating: z.number().nullish(),   // /data/hotel
// stars zostaje — /data/hotels nadal je zwraca
```
Konsumenci czytają `detail.starRating ?? detail.stars`. Zero ryzyka dla listy.

### R5 — Kanoniczne źródło udogodnień: `facilities[]`, nie `hotelFacilities[]`
`facilities[]` ma **stabilne `facilityId`** i polskie nazwy. `hotelFacilities[]`
to ten sam zbiór po angielsku, bez ID. Deduplikacja i kategoryzacja idą po ID
(tekst zmienia się z językiem — `facilityId 47` vs `107` to dwa różne rekordy
o tym samym znaczeniu).

### R6 — Cena: total dominuje, „za noc" jest pomocnicze — **spójnie w całym lejku**
Dziś lista (`result-card.tsx:208`) i strona hotelu (`rooms-section.tsx:271`) mają
**odwrotne** hierarchie. Ujednolicamy na wariant z briefu §8.5: całość pobytu
duża, „/ noc" mała, podatki opisane osobno **prawdziwie** (patrz R7).

### R7 — Etykieta podatków wynika z danych, nigdy nie jest wpisana na stałe
Zamiast bezwarunkowego „wł. podatków":
- wszystkie pozycje `included: true` → „w tym podatki i opłaty"
- jakakolwiek `included: false` → „+ {kwota} podatków płatnych na miejscu”
- brak `taxesAndFees` → **nie piszemy nic** o podatkach

Opis opłaty bywa tekstem w obcej walucie (`"$163.02 USD per room per stay"`) —
parser nie może próbować tego sumować.

### R8 — Skala warstw (z-index) jako jedno źródło prawdy
Dziś `z-10`…`z-[80]` rozsypane po 20+ plikach; czat (`z-40`) leży nad sticky CTA
hotelu (`z-30`). Wprowadzamy nazwane warstwy w `globals.css` i przepinamy
**tylko** elementy hotelowe + launcher czatu, bez ruszania homepage.

### R9 — Nie regenerować `data/destinations.json`
Znany błąd: skrypt nadpisuje plik i redukuje zbiór (796 → 245). Przebudowa
hoteli tego pliku nie potrzebuje.

### R10 — Zdjęcie hotelu **nigdy** jako zdjęcie pokoju
Gdy dopasowanie taryfa↔pokój zawiedzie (`02-data-contracts.md` §5), karta pokoju
dostaje neutralny placeholder, nie zdjęcie budynku. Brief §12.1 wprost tego
zakazuje, a podmiana wprowadzałaby w błąd co do wyglądu pokoju.

### R11 — Treści AI dostawcy oznaczane i nietłumaczone maszynowo
`sentiment_analysis.pros/cons/categories[].description` to teksty generowane
przez AI LiteAPI (jest nawet `sentiment_updated_at`). Pokazujemy je z jawną
adnotacją o źródle. Nazwy kategorii (skończony zbiór: Cleanliness, Service,
Location, Room Quality…) tłumaczymy **słownikiem**; opisów i treści opinii
**nie tłumaczymy maszynowo** — brief §13 zakazuje zmieniania znaczenia opinii.

### R12 — Kontrakt linku do checkoutu zamrożony
`hotelId, offerId, price, cur, board, cancel, cancelUntil` + parametry
wyszukiwania (`rooms-section.tsx:224-235`). Przebudowa UI **nie zmienia** tych
nazw ani znaczeń — po drugiej stronie jest działający checkout i płatności.
