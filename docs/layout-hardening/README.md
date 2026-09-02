# Sitewide layout hardening — audyt, decyzje i pomiary

Gałąź: `feat/sitewide-layout-hardening` · baza: `origin/main` @ `448aaf5`

Zadanie było **wizualne / układowe**. Nie ruszało logiki wyszukiwania,
dostępności, cen, rezerwacji, płatności, sesji ani integracji z dostawcami.

---

## 1. Root cause

Serwis miał **jedną** przyczynę obu zgłoszonych problemów, a nie kilkanaście.

`src/components/site/site-shell.tsx` renderował nagłówek, treść i stopkę
wewnątrz **jednej ramy**:

```
<div class="mx-auto flex min-h-screen w-full flex-col  max-w-7xl px-4 sm:px-6 lg:px-8">
   <header>            ← dziecko ramy
   <div id=main-content>{children}</div>
   <footer>            ← dziecko ramy
</div>
```

**Skutek 1 — pływająca pastylka zamiast paska.** Nagłówek nie miał własnego
marginesu bocznego. Zjeżdżał na środek ekranu razem z ramą, a `rounded-[1.2rem]`
i `mt-2` domykały wrażenie białej karty doklejonej nad stroną. Homepage i loty
miały już wcześniej wariant „pas" — reszta serwisu nie.

**Skutek 2 — zagnieżdżone limity szerokości.** Każda strona dokładała do ramy
**własne** `max-w-7xl px-4 sm:px-6 lg:px-8`. Limity i paddingi mnożyły się:

```
1920 → 1280 (max-w ramy) → 1216 (padding ramy) → 1152 px realnej treści
```

czyli 40 % monitora szło na marginesy — mimo że ani rama, ani strona nie
prosiły o tak wąską treść.

Warstwa hotelowa i loty miały ten problem **już rozwiązany** (`max-w-none` na
ramie + własny moduł szerokości), więc poprawka nie wymyśla nowego wzorca,
tylko rozciąga istniejący na resztę serwisu.

---

## 2. Co zostało zmienione

| Warstwa | Zmiana |
|---|---|
| Rama powłoki | przestaje ograniczać szerokość; `min-h-screen` → `min-h-[100dvh]` |
| Nagłówek | pas na pełną szerokość na **każdej** trasie: `x=0`, `radius 0`, `margin 0` |
| Stopka | ta sama reguła co nagłówek |
| Rząd wewnętrzny | **usunięty** — jeden wspólny gutter `SITE_HEADER_GUTTER` (16 / 24 / 32 px) |
| Discovery | `SHELL_DISCOVERY` — praktycznie pełna szerokość, gutter 32 px (limit 2000 px dopiero na ultra-wide) |
| Siatki kart | `.ht-karty` — niepełny rząd jest wyśrodkowany |
| `/polubione` | usunięte `min-h-screen`, dodana szerokość |

Nowy moduł: `src/lib/ui/layout.ts` (rodzeństwo `lib/hotels/layout.ts`
i `lib/flights/layout.ts`).

---

## 3. Szerokości — podział wg §6 briefu

**MARKETPLACE / DISCOVERY → praktycznie pełna szerokość** (`SHELL_DISCOVERY`, 1856 px treści na 1920)
`/kierunki`, `/kierunki/<slug>`, `/inspiracje`, landingi kategorii
(`/city-breaki`, `/cieple-kierunki`, `/tanie-podroze`, `/przewodniki`,
`/bez-wizy`, `/weekendowe-wyjazdy`), `/wyjazdy/<typ>`, `/hotele/w/<miasto>`,
`/mapa-serwisu`, `/porownanie`.

**DŁUGI TEKST → bez zmian**
`/regulamin`, `/polityka-prywatnosci` zostają na 720 px kolumny w pasie pełnej
szerokości. Brief mówi to wprost: *„NIE rozciągaj tekstu na 1600–1800 px"*.

**STRONY TEKSTOWE Z UKŁADEM → bez zmian**
`/jak-pracujemy`, `/o-nas`, `/faq`, `/cennik`, `/redakcja`, `/dla-partnerow`,
`/standard-redakcyjny`, `/oferta`. Ich treścią jest jedna kolumna do czytania —
poszerzenie **pogorszyłoby** je, a nie poprawiło. Dostają natomiast
pełnoszerokościowy nagłówek i stopkę, czyli tę samą przynależność wizualną.

---

## 4. Samotna karta — dlaczego nie da się tego rozwiązać liczbą kolumn

Zmierzone w DOM na 1920 px **przed** poprawką:

| Strona | Siatka | Kolumny | Kart | Reszta |
|---|---|---|---|---|
| `/kierunki` | przewodniki | 3 | 22 | **1** |
| `/city-breaki` | kierunki | 3 | 7 | **1** |
| `/cieple-kierunki` | artykuły | 2 | 9 | **1** |
| `/przewodniki` | artykuły | 2 | 11 | **1** |
| `/weekendowe-wyjazdy` | artykuły | 2 | 5 | **1** |
| `/tanie-podroze` | artykuły | 2 | 3 | **1** |

Liczby kart pochodzą z **danych** i są różne na każdej stronie (3, 5, 7, 9, 11,
22). Żadna stała liczba kolumn tego nie rozwiąże — dobranie kolumn „pod te pięć
kart" przenosi problem na następną kategorię.

**Rozwiązanie:** jedna wspólna klasa `.ht-karty` w `globals.css` —
`flex-wrap` z `justify-content: center` i liczbą kolumn jako zmienną CSS.
Pełne rzędy mają dokładnie 100 % szerokości, więc wyśrodkowanie ich **nie
rusza**; zmienia się wyłącznie rząd niepełny.

**Dlaczego nie rozciągnięcie osieroconej karty na cały rząd** (druga rozważana
droga): karta zachowuje wtedy `sizes` policzone dla 1/3 szerokości, więc
przeglądarka pobrałaby obraz trzykrotnie za mały i rozmyty. To błąd, który to
repo ma już za sobą (upscale 1,7–2,1× na kaflach kierunków).

---

## 5. Pomiary BEFORE / AFTER

Narzędzie: `e2e/layout-shots.ts` (`npx tsx e2e/layout-shots.ts before|after`).
Pełne dane: `shots/before/pomiary.json`, `shots/after/pomiary.json`.
Zrzuty PNG zostają **lokalnie** (101 MB, repo jest publiczne) — patrz `.gitignore`.

Pogrubione = wartość się zmieniła.

### 1920x1080

| Strona | Nagłówek x / szer. / promień | Treść (px) | Pustka po bokach | Luka przed stopką |
|---|---|---|---|---|
| `/ (homepage)` | 0 / 1920 / 0px | 1920 | 0% | 113 |
| `/hotele/szukaj` | **40 / 1840 / 19.2px → 0 / 1920 / 0px** | 1840 | 4.2% | 56 |
| `/hotele/<id>` | **40 / 1840 / 19.2px → 0 / 1920 / 0px** | 1760 | 8.3% | 96 |
| `/kierunki` | **352 / 1216 / 19.2px → 0 / 1920 / 0px** | **1152 → 1536** | **40% → 20%** | 96 |
| `/inspiracje` | **352 / 1216 / 19.2px → 0 / 1920 / 0px** | **1088 → 1536** | **43.3% → 20%** | 96 |
| `/city-breaki` | **352 / 1216 / 19.2px → 0 / 1920 / 0px** | **1152 → 1536** | **40% → 20%** | 96 |
| `/wyjazdy/plaza` | **352 / 1216 / 19.2px → 0 / 1920 / 0px** | **1152 → 1536** | **40% → 20%** | -3 |
| `/jak-pracujemy` | **352 / 1216 / 19.2px → 0 / 1920 / 0px** | 1088 | 43.3% | 96 |
| `/regulamin` | **352 / 1216 / 19.2px → 0 / 1920 / 0px** | 720 | 62.5% | 80 |
| `/faq` | **352 / 1216 / 19.2px → 0 / 1920 / 0px** | 1104 | 42.5% | 98 |
| `/o-nas` | **352 / 1216 / 19.2px → 0 / 1920 / 0px** | 1088 | 43.3% | 96 |
| `/polubione` | **352 / 1216 / 19.2px → 0 / 1920 / 0px** | 0 | — | **723 → 163** |
| `/porownanie` | **352 / 1216 / 19.2px → 0 / 1920 / 0px** | **1088 → 1536** | **43.3% → 20%** | 89 |
| `/mapa-serwisu` | **352 / 1216 / 19.2px → 0 / 1920 / 0px** | **1104 → 1536** | **42.5% → 20%** | 93 |
| `/cennik` | **352 / 1216 / 19.2px → 0 / 1920 / 0px** | 1088 | 43.3% | 96 |
| `/kierunki/<slug>` | **352 / 1216 / 19.2px → 0 / 1920 / 0px** | **1152 → 1536** | **40% → 20%** | 114 |
| `/inspiracje/<slug>` | **352 / 1216 / 19.2px → 0 / 1920 / 0px** | **1152 → 1216** | **40% → 36.7%** | 102 |

### 1440x900

| Strona | Nagłówek x / szer. / promień | Treść (px) | Pustka po bokach | Luka przed stopką |
|---|---|---|---|---|
| `/ (homepage)` | 0 / 1440 / 0px | 1440 | 0% | 113 |
| `/hotele/szukaj` | **40 / 1360 / 19.2px → 0 / 1440 / 0px** | 1440 | 0% | 56 |
| `/hotele/<id>` | **40 / 1360 / 19.2px → 0 / 1440 / 0px** | 1440 | 0% | 96 |
| `/kierunki` | **112 / 1216 / 19.2px → 0 / 1440 / 0px** | **1152 → 1376** | **20% → 4.4%** | 96 |
| `/inspiracje` | **112 / 1216 / 19.2px → 0 / 1440 / 0px** | **1088 → 1376** | **24.4% → 4.4%** | 96 |
| `/city-breaki` | **112 / 1216 / 19.2px → 0 / 1440 / 0px** | **1152 → 1376** | **20% → 4.4%** | 96 |
| `/wyjazdy/plaza` | **112 / 1216 / 19.2px → 0 / 1440 / 0px** | **1152 → 1376** | **20% → 4.4%** | -3 |
| `/jak-pracujemy` | **112 / 1216 / 19.2px → 0 / 1440 / 0px** | 1088 | 24.4% | 96 |
| `/regulamin` | **112 / 1216 / 19.2px → 0 / 1440 / 0px** | 720 | 50% | 80 |
| `/faq` | **112 / 1216 / 19.2px → 0 / 1440 / 0px** | 1104 | 23.3% | 98 |
| `/o-nas` | **112 / 1216 / 19.2px → 0 / 1440 / 0px** | 1088 | 24.4% | 96 |
| `/polubione` | **112 / 1216 / 19.2px → 0 / 1440 / 0px** | 0 | — | **543 → 121** |
| `/porownanie` | **112 / 1216 / 19.2px → 0 / 1440 / 0px** | **1088 → 1376** | **24.4% → 4.4%** | 89 |
| `/mapa-serwisu` | **112 / 1216 / 19.2px → 0 / 1440 / 0px** | **1104 → 1376** | **23.3% → 4.4%** | 93 |
| `/cennik` | **112 / 1216 / 19.2px → 0 / 1440 / 0px** | 1088 | 24.4% | 96 |
| `/kierunki/<slug>` | **112 / 1216 / 19.2px → 0 / 1440 / 0px** | **1152 → 1376** | **20% → 4.4%** | 114 |
| `/inspiracje/<slug>` | **112 / 1216 / 19.2px → 0 / 1440 / 0px** | **1152 → 1216** | **20% → 15.6%** | 102 |

### 390x844

| Strona | Nagłówek x / szer. / promień | Treść (px) | Pustka po bokach | Luka przed stopką |
|---|---|---|---|---|
| `/ (homepage)` | 0 / 390 / 0px | 390 | 0% | 109 |
| `/hotele/szukaj` | **16 / 358 / 19.2px → 0 / 390 / 0px** | 390 | 0% | 168 |
| `/hotele/<id>` | **16 / 358 / 19.2px → 0 / 390 / 0px** | 390 | 0% | 192 |
| `/kierunki` | **16 / 358 / 19.2px → 0 / 390 / 0px** | **326 → 358** | **16.4% → 8.2%** | 93 |
| `/inspiracje` | **16 / 358 / 19.2px → 0 / 390 / 0px** | **326 → 358** | **16.4% → 8.2%** | 93 |
| `/city-breaki` | **16 / 358 / 19.2px → 0 / 390 / 0px** | **326 → 358** | **16.4% → 8.2%** | 93 |
| `/wyjazdy/plaza` | **16 / 358 / 19.2px → 0 / 390 / 0px** | **326 → 358** | **16.4% → 8.2%** | -59 |
| `/jak-pracujemy` | **16 / 358 / 19.2px → 0 / 390 / 0px** | **326 → 358** | **16.4% → 8.2%** | **93 → 92** |
| `/regulamin` | **16 / 358 / 19.2px → 0 / 390 / 0px** | **326 → 358** | **16.4% → 8.2%** | 64 |
| `/faq` | **16 / 358 / 19.2px → 0 / 390 / 0px** | **326 → 358** | **16.4% → 8.2%** | 98 |
| `/o-nas` | **16 / 358 / 19.2px → 0 / 390 / 0px** | **326 → 358** | **16.4% → 8.2%** | **93 → 92** |
| `/polubione` | **16 / 358 / 19.2px → 0 / 390 / 0px** | 0 | — | **394 → 121** |
| `/porownanie` | **16 / 358 / 19.2px → 0 / 390 / 0px** | **326 → 358** | **16.4% → 8.2%** | 81 |
| `/mapa-serwisu` | **16 / 358 / 19.2px → 0 / 390 / 0px** | **326 → 358** | **16.4% → 8.2%** | 93 |
| `/cennik` | **16 / 358 / 19.2px → 0 / 390 / 0px** | **326 → 358** | **16.4% → 8.2%** | 93 |
| `/kierunki/<slug>` | **16 / 358 / 19.2px → 0 / 390 / 0px** | **326 → 358** | **16.4% → 8.2%** | 114 |
| `/inspiracje/<slug>` | **16 / 358 / 19.2px → 0 / 390 / 0px** | **326 → 358** | **16.4% → 8.2%** | 102 |

---

## 6. Straż nad warstwą hotelową

Brief §20 traktuje zmianę czegokolwiek poza nagłówkiem jako regresję.
Zmierzone, viewport 1920:

| Miara | Before | After |
|---|---|---|
| Powłoka wyników (`HOTEL_SHELL_WIDE`) | 1840 px | 1840 px |
| Siatka wyników (`grid-template-columns`) | `320px 1408px` | `320px 1408px` |
| Treść strony obiektu (`HOTEL_SHELL`) | 1760 px | 1760 px |
| Luka przed stopką (wyniki) | 56 px | 56 px |
| Pasek kontekstu wyszukiwania | jest | jest |

Zmienił się **wyłącznie** nagłówek: `x=40 / 1840 / promień 19,2 px`
→ `x=0 / 1920 / promień 0`.

Offset pasków przyklejonych pod nagłówkiem **nie wymagał ręcznej korekty**:
`HeaderOffsetProbe` mierzy realną wysokość nagłówka i publikuje ją jako
`--ht-header-h`, więc zniknięcie `mt-2` (8 px) zostało wchłonięte automatycznie.
Potwierdzone testami `destination-bar-scroll-regression.spec.ts` (5/5)
i `listing-no-sticky.spec.ts` (2/2).

`src/lib/hotels/layout.ts` — **plik nietknięty**.

---

## 7. Straż nad homepage

| Miara (1920) | Before | After |
|---|---|---|
| Nagłówek | `x=0 / 1920 / 0px` | `x=0 / 1920 / 0px` |
| Rząd nagłówka | `x=32`, szer. 1856 | `x=32`, szer. 1856 |
| Treść `<main>` | 1920 px | 1920 px |
| Luka przed stopką | 113 px | 113 px |

Homepage była wzorcem i **nie zmieniła się w żadnym mierzonym wymiarze**.
Pilnuje tego test „homepage jest wzorcem i nie może się zmienić" — w tym
asercja, że rząd nagłówka **nie dostaje** limitu rodziny discovery (inaczej
logo przeskoczyłoby z `x=32` na `x=176`).

---

## 8. Chatbot i elementy pływające

Sprawdzone `document.elementFromPoint()` (nie czytaniem klas), na czterech
viewportach, w wielu pozycjach przewinięcia:

- **żaden link ani przycisk nie jest trwale nieosiągalny** — 385 elementów
  sprawdzonych na 1440 i 390 px, zero nieosiągalnych po `scrollIntoView`;
- na dole strony (tam, gdzie użytkownik korzysta ze stopki) **zero
  zasłoniętych linków stopki** na 1920 / 1440 / 412 / 390 / 375;
- launchery nie wystają poza viewport, nie generują poziomego scrolla;
- istniejące offsety `env(safe-area-inset-bottom)` **zachowane bez zmian**,
  zgodnie z §9.

Przejściowe nakładki (FAB nad linkiem przy konkretnej pozycji przewinięcia)
występują i są normalnym zachowaniem przycisku pływającego — nie blokują
dostępu do treści. Pozycjonowanie chatbota **nie było zmieniane**.

---

## 9. Rzeczy świadomie nietknięte

- logika wyszukiwania, dostępności, taryf, cen, rezerwacji i płatności hoteli;
- cała warstwa lotów: search, verify, prebook, payment, booking, recovery,
  idempotencja, wiązanie `payment_intent`, webhooki, e-maile;
- integracje: LiteAPI / Nuitee, Stripe, Resend, Upstash;
- kontrakty API i akcje serwerowe;
- treść i układ wyników hoteli, sidebara, filtrów, kart, mapy i CTA;
- treść stopki (zmieniona wyłącznie jej powłoka: karta → pas);
- logika chatbota i konsjerża;
- `/jak-pracujemy` — układ osi kroków (uzasadnienie w §3 wyżej).

---

## 10. RUNDA DRUGA (2026-09-02) — jeden gutter nagłówka i pełna szerokość discovery

Preview z rundy pierwszej nie został przyjęty. Dwie uwagi właściciela, obie trafne.

### 10.1 Logo skakało między trasami

Runda pierwsza dawała rzędowi nagłówka limit szerokości **zgrany z treścią pod
spodem** — po to, żeby logo stało w jednej linii z pierwszą kartą. Efekt uboczny
był gorszy niż problem, który to rozwiązywało:

| trasa (1920 px) | logo x — runda 1 | logo x — runda 2 |
|---|---|---|
| homepage | 32 | **32** |
| `/kierunki` | 160 | **32** |
| `/inspiracje` | 160 | **32** |
| `/city-breaki` | 160 | **32** |
| `/regulamin` | 160 | **32** |
| hotel results | 40 | **32** |
| flight results | 100 | **32** |

Najgorszy przypadek to `/regulamin`: nagłówek wyrównywał się tam do kolumny
**tekstu** szerokiej na 720 px, więc logo lądowało 128 px dalej niż na stronie
głównej. Nagłówek należy do OKNA, nie do artykułu pod nim.

Poprawka: `SITE_HEADER_GUTTER` — jedna wartość dla całego serwisu
(16 / 24 / 32 px), rząd nagłówka **bez żadnego limitu szerokości**. Wyrównanie
nagłówka i szerokość treści są od siebie niezależne. Wartości wzięte ze strony
głównej, więc homepage nie drgnęła.

Zniknęły przy tym `isHotelWide` i `isFlights` z powłoki — powstały wyłącznie po
to, żeby prosić ramę o wyjątek na szerokość, a rama niczego już nie ogranicza.

### 10.2 Discovery dalej wyglądało jak box na środku

1600 px na monitorze 1920 to 160 px marginesu z każdej strony — właściciel:
*„nadal wygląda zbyt mocno jak centralny box"*, z warstwą hotelową jako punktem
odniesienia.

| trasa (1920 px) | treść — runda 1 | treść — runda 2 | pustka |
|---|---|---|---|
| `/kierunki` | 1536 | **1856** | 40 % → 20 % → **3,3 %** |
| `/inspiracje` | 1536 | **1856** | 43,3 % → 20 % → **3,3 %** |
| `/city-breaki` | 1536 | **1856** | 40 % → 20 % → **3,3 %** |
| `/wyjazdy/plaza` | 1536 | **1856** | 40 % → 20 % → **3,3 %** |
| `/mapa-serwisu`, `/porownanie` | 1536 | **1856** | 42,5 % → 20 % → **3,3 %** |

Treść zaczyna się teraz na `x = 32`, czyli w tej samej linii pionowej co logo.
To nie było wymaganiem (brief mówi, że alignment i szerokość mają być
niezależne) — wyszło jako efekt wspólnego guttera i jest lepsze niż wymóg.

Limit `max-w-[2000px]` nie jest powrotem do boxa: na 1920 i 2560 nie daje o sobie
znać, a chroni układ na 3840 px, gdzie cztery kolumny kart miałyby po ~940 px.

Siatki kart na `/inspiracje` i `/wyjazdy/*` dostały czwartą kolumnę od 1440 px —
przy 1856 px trzy kolumny dawały karty ~600 px, czyli rzadkie i rozciągnięte.

### 10.3 Czego runda druga NIE zmieniła

- **homepage** — logo 32, treść 1920, luka przed stopką 113 px: identycznie jak
  w rundzie pierwszej i przed całą przebudową;
- **hotele** — treść 1760 px startująca na `x = 80`, siatka `320px 1408px`,
  powłoka 1840 px. Zmienił się wyłącznie nagłówek;
- **loty** — treść 1640 px na `x = 140`, sufit `FLIGHT_SHELL_WIDE` nietknięty;
- **strony tekstowe** — `/regulamin` i `/polityka-prywatnosci` dalej 720 px
  kolumny w pasie pełnej szerokości.
