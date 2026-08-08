# V2 — przegląd wizualny przed/po (brief §31)

**Data:** 2026-08-08 · **Gałąź:** `feat/hotel-experience-redesign`
**Zrzuty:** `docs/hotel-redesign/shots/before/` i `shots/after/`
**Pomiar:** Playwright, Chromium, 1920×1080 i 390×844, ten sam hotel i ten sam
termin w obu przebiegach (Hurghada, 15–17 września 2026, 2 dorosłych).

> **Uwaga do zrzutów `before`.** Pierwszy przebieg trafił na uszkodzony katalog
> `.next` — wszystkie trasy API zwracały 404, więc wyniki pokazywały „0
> dostępnych obiektów" i „Nie udało się pobrać ceny" na każdej karcie. To był
> artefakt środowiska, **nie** stan produktu. Zrzuty w `shots/before/` pochodzą
> z powtórzonego przebiegu na zdrowym serwerze.

---

## 1. Szerokość — wyniki wyszukiwania

| | BEFORE | AFTER |
|---|---|---|
| treść | 1216 px | **1840 px** |
| pustka z lewej | 352 px | **40 px** |
| pustka z prawej | 352 px | **40 px** |
| karta hotelu | 880 px | **1408 px** |

**Co było nie tak.** Na monitorze 1920 px **37% ekranu szło na marginesy**.
Wyglądało to jak strona zaprojektowana pod 1366 px otwarta na dużym monitorze.

**Gdzie leżała przyczyna — i dlaczego pierwsza poprawka nie zadziałała.**
Sekcja hotelowa miała `max-w-7xl` (1280 px) na swoich kontenerach, ale
podniesienie tego limitu **nic nie dało**: prawdziwe ograniczenie siedzi
w `site-shell.tsx`, wspólnej ramie CAŁEGO serwisu, która nakłada `max-w-7xl`
na każdą stronę poza główną. Dopiero pomiar łańcucha przodków w przeglądarce
to pokazał.

**Jak naprawione.** Rama dostała wyjątek obejmujący **dokładnie dwie trasy** —
`/hotele/szukaj` i `/hotele/<id>` — a szerokością steruje nowy moduł
`lib/hotels/layout.ts`. Poza tymi trasami nic się nie zmieniło; pilnują tego
cztery testy w `e2e/regresja.spec.ts` (homepage, loty, strona miasta, checkout).

**Referencja Nuitee:** treść ~1500 px przy 1920. Jesteśmy szersi, bo mamy
sidebar filtrów, którego u nich nie ma na tym poziomie.

---

## 2. Nagłówek wyników — licznik i „bez miejsc"

| | BEFORE | AFTER |
|---|---|---|
| w trakcie skanu | `Sprawdzam dostępność… 1500/2099 · dotąd 386 dostępnych` | `● Szukamy najlepszych ofert…` |
| po skanie | `386 dostępnych obiektów · 1714 bez miejsc` | `418 obiektów` |

**Co było nie tak.** Dwie osobne rzeczy.

Licznik `1500/2099` zamieniał gościa w obserwatora backendu: zamiast oglądać
hotele, patrzył jak wolno rośnie liczba. Liczba dostępnych skakała
0 → 53 → 172 → 386 i **każda z tych wartości była nieprawdziwa w chwili
wyświetlenia**.

„1714 bez miejsc" nie dawało nic poza wrażeniem pustego magazynu.

**Jak naprawione.** Trzy rozłączne stany w `ResultsSubtitle`: w trakcie skanu
ani jednej liczby, po skanie jedna ostateczna, wchodząca miękkim `fade-in`.
Backend nadal liczy niedostępne (steruje ukrywaniem kart) — po prostu tego nie
pokazujemy. Komunikat o awarii pobierania cen został, ale bez liczby.

**Pierwsze wyniki nie zwolniły** — karty pojawiają się tak samo szybko,
zmieniła się wyłącznie warstwa opisu. Pilnuje tego test „pierwsze karty
pojawiają się przed końcem skanu".

---

## 3. Karta wyniku

**Co było nie tak.** Treść była jedną kolumną z ceną dosuniętą do dołu przez
`mt-auto`. Na szerokim ekranie dawało to **pustkę na ~200 px wysokości**
w środku karty — wyglądało na niedokończone.

**Jak naprawione.**
- od `lg` treść dzieli się na kolumnę informacji i wydzieloną **szynę cenową**
  (248 px, oddzielona pionową linią) — cena i CTA zawsze w tym samym miejscu,
- doszły **chipy z realnych danych**: wyżywienie i anulacja z taryfy,
  udogodnienia z `facilityIds` (Wi-Fi, Parking, Basen, Centrum fitness, Spa…),
- zdjęcie urosło z 256 px do 320 px,
- ocena przestała odpływać od nazwy hotelu (`xl:max-w-[46rem]` na wierszu
  nagłówka — bez tego `justify-between` odpychało ją o ~600 px),
- **przecena** `−X%` + przekreślona cena, gdy istnieje (patrz §5).

Nic z tych chipów nie jest dopisane „dla wyglądu" — brak `facilityIds`
w rekordzie hotelu znaczy brak chipów.

---

## 4. Galeria hotelu

| | BEFORE | AFTER |
|---|---|---|
| układ desktop | jedna scena 1184×560 + pasek miniatur | **kolaż 5 kafli** (duży 50% + siatka 2×2) |
| zdjęć w DOM | **29** | **10** |
| mobile | ta sama scena | karuzela z zatrzaskiem, okno ±1 kadru |

**Co było nie tak.** Poza wyglądem — `photos.map()` wstawiał do DOM
**wszystkie** zdjęcia jako `<Image fill>`, a pasek miniatur drugi raz to samo.
Dla hotelu ze 140 zdjęciami (zmierzone: `lp1897`) to 280 elementów.

**Dlaczego kolaż poprawia też OSTROŚĆ** — patrz §6.

---

## 5. Przeceny

**Co było nie tak.** Poprzednia sesja zbadała 400 taryf, trafiła same zera
i zapisała w raporcie, że uczciwych przecen „nie ma i nie może być".

**To było błędne.** Pomiar na **33 421 taryfach w 5 miastach**:
`initialPrice > total` w **852 taryfach, 70 hoteli, wszystkie 5 miast**.

**Jak naprawione.** Przecena liczona **wyłącznie** z `initialPrice` — ceny tej
samej taryfy. `suggestedSellingPrice` (booking.com, wyższe od naszej ceny
w 100% taryf) świadomie **nie** trafia do UI: dałoby wieczną promocję na każdej
ofercie. Próg 3%. Pełne śledztwo, liczby i otwarta kwestia prawna (Omnibus):
`discount-investigation.md`.

Widoczne na zrzucie `after/02` — karta z `−4%` i przekreśloną ceną 281 zł.

---

## 6. Jakość zdjęć

**Zbadana przyczyna, nie zgadywana.** Na 4 hotelach, 298 zdjęciach:

- `hotelImages[].urlHd === url` w **100%** wpisów → **dostawca nie ma wariantu HD**,
- renditiony po ścieżce nie istnieją (`/hotels/1920x1080/…` → 404),
- rozdzielczości źródeł skaczą: 1280×960, 1476×984, 2048×1024, 3000×2000.

Scena hero miała **1184×560 px** i deklarowała `sizes="1280px"`. Przy DPR 2
przeglądarka chciała 2368 px, a plik ma 1280 → **1,85× powiększenia**.
To jest ta „gorsza jakość": nie kompresja, tylko rozciąganie.

**Jak naprawione.** Nie da się poprosić dostawcę o lepszy plik — więc
przestajemy go rozciągać. W kolażu duży kadr ma ~872 px zamiast 1184
(`sizes` policzone z realnej geometrii powłoki), a cztery małe po ~432 px są
ostre nawet przy najsłabszym źródle.

---

## 7. Pokój — podgląd

**Co było nie tak.** Karta pokoju pokazywała miniaturę, metraż i trzy
udogodnienia. Kliknąć dało się **wyłącznie** „Wybierz" przy taryfie. Gość,
który chciał zobaczyć pokój, nie miał gdzie kliknąć.

**Jak naprawione.** `RoomDetailDialog` (Radix): galeria zdjęć **tego** pokoju
ze strzałkami i licznikiem, metraż, pojemność, łóżka, opis, **pełna** lista
wyposażenia w kolumnach oraz wszystkie warianty taryf z cenami i CTA.
Otwierają go trzy cele: zdjęcie, nazwa pokoju i jawny link
„Zobacz szczegóły pokoju".

Wiersze taryf w modalu i na karcie pochodzą z **jednego** źródła — rozjazd
między nimi byłby błędem, którego gość nie wybaczy.

Gdy dostawca nie powiązał pokoju: uczciwy komunikat „Dostawca nie udostępnił
zdjęć tego pokoju", **nigdy** zdjęcie budynku (decyzja R10).

---

## 8. Mapa

| | BEFORE | AFTER |
|---|---|---|
| silnik | hostowany widget LiteAPI | **MapLibre GL + kafelki Geoapify** |
| pula hoteli | własna pula widgetu | **nasze wyniki, po naszych filtrach** |
| znaczniki | cudze | pigułki z ceną + grupowanie z licznikiem |
| synchronizacja | brak | marker ↔ karta, w obie strony |
| „szukaj w tym obszarze" | brak | tak, lokalnie (zero zapytań do dostawcy) |
| układ desktop | pełna szerokość pod listą | **podział 55/45, mapa przyklejona** |
| mobile | ten sam widget | pełny ekran + karta obiektu od dołu |
| waluta i język | podmieniane w cudzym DOM przez `MutationObserver` | **nasze, natywnie** |

**Co było nie tak.** Widget wyglądał znośnie, ale ma własną pulę hoteli
i własną wyszukiwarkę — więc trzy wymagania briefu §13 były na nim **fizycznie
niewykonalne**. Waluta i język wymagały podmiany tekstu w cudzym DOM, co każda
ich aktualizacja mogła wywrócić bez ostrzeżenia.

**Klucz był na miejscu.** `GEOAPIFY_API_KEY` jest w projekcie od dawna,
a Geoapify figuruje w polityce prywatności jako podmiot przetwarzający.
Kafelki idą przez `/api/map/tiles` — klucz zostaje na serwerze, bo repozytorium
jest publiczne.

**CSP zawężone.** Widget wymagał siedmiu hostów (SDK, trzy Mapbox, FontAwesome,
WebSocket `wss://*.nuitee.link`). Wszystkie usunięte.

---

## 9. Co znalazły testy E2E

Cztery **realne** błędy, żaden nie był widoczny w kodzie ani na zrzucie:

1. **Przestarzały obsługiwacz kliknięcia.** Znacznik, który zmienił się z grupy
   w pojedynczy obiekt (dzieje się przy każdym przybliżeniu i zmianie filtrów),
   wyglądał jak hotel z ceną, ale po kliknięciu dalej tylko przybliżał mapę.
2. **Mapa kadrowała się raz**, na tych kilku hotelach, które zdążyły się
   wycenić. Zmierzone: **4 znaczniki przy 44 obiektach** w wynikach — reszta
   leżała poza kadrem.
3. **Grupy przykrywały pojedyncze hotele.** Warstwy były ustawione tak, że
   części obiektów nie dało się kliknąć.
4. **Lista pobierała silnik mapy.** `maplibre-gl` (~944 kB nieskompresowane)
   leciał na każdym wyszukiwaniu, także do gościa, który mapy nigdy nie otworzy.
   Naprawione przez `next/dynamic`; pilnuje tego osobny test.

---

## 10. Etykiety opinii (brief §20)

`Great location` → `Świetna lokalizacja`, `Friendly staff` → `Życzliwa obsługa`
i 40 innych. Słownik jest **zmierzony**: sonda po 90 hotelach dała 292
wystąpienia i 127 różnych fraz; słownik pokrywa ~4/5 wolumenu.

Fraza spoza słownika (np. `No so much rules`) **zostaje po angielsku** —
zmyślone tłumaczenie maszynowe zmieniałoby wymowę opinii (decyzja R11).
Deduplikacja idzie po WYNIKU tłumaczenia, żeby „Great service" i „Excellent
service" nie dały dwóch identycznych chipów.

---

## 11. Mobile 390 px

Bez przewijania poziomego na wynikach i na stronie hotelu (test E2E).
Galeria: karuzela z zatrzaskiem CSS zamiast kolażu. Mapa: pełny ekran
z przyciskiem powrotu i kartą obiektu od dołu, z uwzględnieniem `safe-area`.

---

## 12. Czego ten przegląd NIE obejmuje

- **Lighthouse przed/po** — poprzednia sesja pokazała, że na tej maszynie
  rozrzut wyników sięga 43 → 65 → 19 dla **niezmienionej** strony. Bez
  spokojnej maszyny i mediany z kilku przebiegów taki pomiar wprowadzałby
  w błąd, więc go nie podaję.
- **Porównanie „pierwszy wynik" przed/po w sekundach** — z tego samego powodu.
  Wiadomo natomiast, co ubyło z drogi krytycznej: sekwencyjny `suggestPlaces`
  na serwerze (pełny round-trip do LiteAPI przy KAŻDYM wyszukiwaniu, potrzebny
  wyłącznie widgetowi mapy) oraz chunk `maplibre-gl` w widoku listy.
