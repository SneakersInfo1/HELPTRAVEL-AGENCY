# 11 — Pasek kierunku i zoom przeglądarki (2026-08-08)

Sesja po RĘCZNEJ weryfikacji preview przez właściciela. Poprzedni raport
podawał 640/640 testów jednostkowych, 33/33 E2E i „21/21 smoke", a oba błędy
P0 były widoczne gołym okiem. To jest opis, dlaczego testy ich nie widziały
i co teraz je pilnuje.

## 1. Dlaczego poprzednie „PASS" było bezwartościowe

- **„21/21 smoke" nie istniało jako plik.** To była liczba w podsumowaniu
  rozmowy, nie uruchamialny artefakt. Nie dało się jej powtórzyć ani obalić.
- **Istniejący test utrwalał błąd.** `final-fix.spec.ts` miał test „pasek
  wyszukiwania przykleja się dokładnie pod nagłówkiem", który SPRAWDZAŁ, że
  pasek jest przyklejony — czyli wymagał dokładnie tego zachowania, które
  właściciel zgłosił jako usterkę. Żaden test nie mierzył prostokąta paska
  PO PRZEWINIĘCIU.
- **Zoom był udawany zmianą szerokości okna.** To nie jest zoom: nie zmienia
  `devicePixelRatio`, więc połowa zachowania (rozdzielczość bufora canvasa
  mapy) była poza zasięgiem testu.

## 2. Przyczyny źródłowe — zmierzone

### 2.1 Pasek kierunku podążał za przewijaniem

`hotele/szukaj/page.tsx` opakowywał pasek w `div.sticky.z-20` z
`top: var(--ht-header-h, 84px)`. Pomiar przed poprawką (Chrome 1920×1080,
zoom 100%, prawdziwy zoom przez CDP):

| scroll | górna krawędź paska |
|-------:|--------------------:|
|      0 |                  82 |
|    250 |                  82 |
|    500 |                  82 |
|    800 |                  82 |
|   1200 |                  82 |
|   2000 |                  82 |

Pasek nie opuszczał okna NIGDY, a przy przewinięciu 2000 nachodził na kartę
hotelu (zmierzone nakładanie: 1 karta). Po poprawce górna krawędź jedzie
razem z treścią: 82 → −168 → −418 → −718 → −1118 → −1918, nakładanie 0.

### 2.2 Kształt — cofnięcie poprzedniej decyzji

Poprzednia sesja ujednoliciła pasek z nagłówkiem (ten sam promień 1,2 rem,
to samo obramowanie, ten sam materiał). Właściciel odrzucił ten kierunek:
„nie chcę dwóch podobnych zaokrąglonych kart". Teraz nagłówek zostaje
pływającą pastylką, a pasek jest prostokątnym pasem (promień 0) wyrównanym
do powłoki wyników. Spójność niosą kolory, typografia, odstępy i ikony.

### 2.3 Karta mierzyła OKNO, nie siebie

W widoku dzielonym karta ma **955 px przy oknie 1920 px**, ale okno raportuje
`2xl`, więc karta dostawała układ zaprojektowany na 1408 px. Przy zoomie 125%
(okno 1536 px) ta sama karta ma 788 px i wciąż `2xl` — zdjęcie zostawało na
352 px, czyli z 37% szerokości karty robiło się 45%. To jest zgłoszone
„inaczej przy 80%, inaczej przy 100%".

Zamienione na zapytania kontenerowe (`@container/karta`). Dwie pułapki po
drodze, obie zmierzone:

1. **Kontener nie stosuje własnych zapytań do siebie.** Pierwsza wersja miała
   `@container` na korzeniu karty razem z `@min-[576px]:flex-row` — klasa była
   martwa, karta zostawała `flex-col`, zdjęcie traciło `aspect-[4/3]` i miało
   **352×0 px**, a treść przykrywała przycisk polubienia. Złapał to
   `v3.spec.ts`. Kontener musi być OPAKOWANIEM.
2. **Strefy dzielą treść, nie kartę.** Progi trzech stref keyowane do
   szerokości karty rozpadały się w widoku dzielonym: karta 955 px minus
   zdjęcie 352 px minus szyna 288 px zostawiało ~153 px na nazwę, więc
   „Kipos Boutique Suites" łamało się po jednym słowie na linię, a plakietka
   oceny wchodziła na nazwę. Progi są teraz przeliczone na szerokość karty
   przez znaną szerokość zdjęcia.

Przy okazji naprawione: widok listy przy oknie 1024 px miał kartę 652 px,
zdjęcie 320 px i **36 px** na kolumnę nazwy. Nikt tego nie zauważył, bo testy
patrzyły tylko na 1920, 1440, 768 i 390.

### 2.4 Mapa: `sticky` bez zakresu ruchu

Mapa miała `position: sticky`, ale obie kolumny podziału mają tę samą
wysokość, więc wiersz siatki jest dokładnie tak wysoki jak mapa i nie ma jej
gdzie jechać. Zmierzone: po przewinięciu o 400 px górna krawędź mapy była na
−180 px — mapa wyjechała ponad okno zamiast się zatrzymać.

Poprawność opiera się więc na WYSOKOŚCI, nie na przyklejeniu. Dawne
`100vh − nagłówek − 8,5 rem` dawało dolną krawędź 2 px POD krawędzią okna przy
1080 px; przy 80% zoomu (okno 1350 px CSS) te 2 px ginęły w zapasie i wszystko
wyglądało dobrze, a przy 100% mapa wystawała. Po korekcie do 9 rem zapas
wynosi −6 px i przy 100%, i przy 125%.

Canvas mapy wypełniał kontener poprawnie już wcześniej (delta 0 przy każdym
zoomie) — brakowało testu, który by tego pilnował. Doszła też reakcja na
zmianę `devicePixelRatio` (`matchMedia("(resolution: …dppx)")`), bo sam
`ResizeObserver` widzi tylko wymiary CSS.

## 3. Co teraz pilnuje regresji

| Plik | Zakres |
|---|---|
| `e2e/_zoom.ts` | prawdziwy zoom przeglądarki przez CDP `Emulation.setDeviceMetricsOverride` (rozmiar okna **i** DPR naraz) |
| `e2e/destination-bar-scroll-regression.spec.ts` | 5 testów: pozycjonowanie, prostokąt po każdym przewinięciu, brak nakładania z kartami i mapą, tożsamość paska przy Lista↔Mapa, telefon |
| `e2e/preview-smoke.spec.ts` | ponumerowane punkty 22–37: pasek, wymiary canvasa vs kontener, bufor vs DPR, macierz zoomu 100/110/90/125/80, dziesięć otwarć mapy z rzędu |
| `e2e/shots-100.ts` | zrzuty przy realnym 100% (narzędzie, nie test) |

**Dowód, że testy reprodukują błąd:** po tymczasowym przywróceniu `sticky`
w `page.tsx` regresja pada 4/5, po cofnięciu przechodzi 5/5.

**Pułapka w samym teście (znaleziona pełnym przebiegiem):** porównanie
położenia paska w drzewie szło aż do `<body>`, a `next dev` dokłada tam własną
nakładkę o zmiennej liczbie węzłów — indeks rodzeństwa najwyższej ramki skakał
z 3 na 23 i test wywracał się, choć w DOM aplikacji nic się nie ruszyło.
Ścieżka liczy się teraz do `<main>`.

## 4. Wynik

- E2E: **50/50**
- smoke preview (punkty 22–37): **12/12**
- jednostkowe: **640/640**
- `pnpm lint`, `tsc --noEmit`, `pnpm build`: bez błędów

Zrzuty przy realnym zoomie 100%: `shots/pasek-kierunku/`.

## 5. Czego NIE zrobiono

- **Mapa nadal ma martwą klasę `sticky`.** Zostawiona świadomie: działa
  w przypadku brzegowym (krótka lista = niższa kolumna obok), a przerobienie
  podziału na model „długa lista przewija stronę, mapa stoi" to zmiana modelu
  przewijania całego widoku, poza zakresem tego zgłoszenia.
- **Znaczniki mapy potrafią się stykać przy 1440 px** (zrzut
  `1440x900-mapa-gora.png`, dwie grupy w lewym górnym rogu). To siatka
  grupująca z poprzedniej sesji; nie ruszane, bo brief wprost zabraniał
  przebudowy działających napraw bez wykrytej regresji.
