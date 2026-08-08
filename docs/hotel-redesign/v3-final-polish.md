# V3 — dopracowanie produktu (brief V3, 2026-08-08)

**Gałąź:** `feat/hotel-experience-redesign` · `main` nietknięty
**Wyniki:** `pnpm test` 627/627 · `pnpm e2e` 25/25 · `tsc` czysto · `pnpm build` OK
**Lint:** 3 błędy — wszystkie sprzed sesji (o jeden mniej niż w V2)

---

## MAPA

### Problem
Dwie wady widoczne na zrzutach właściciela:
1. Wielki pusty panel z napisem „Wczytuję mapę…" przez kilka sekund.
2. Po wejściu w tryb mapy na ekranie stały **trzy kolumny** — filtry, wąska
   lista i mapa. Karty hoteli były zgniatane, teksty się łamały, przycisk
   zajmował prawie całą szerokość karty.

### Przyczyna źródłowa
**Wolne ładowanie:** `setReady(true)` czekało na zdarzenie `load` MapLibre,
a to odpala się dopiero **po pobraniu pierwszych kafelków**. Zmierzone:

| zdarzenie | czas |
|---|---|
| powłoka `.maplibregl-map` | 880 ms |
| canvas | 921 ms |
| znaczniki | **3035 ms** |

Przez ponad dwie sekundy nakładka przykrywała **działającą już** mapę.

**Rozjechany układ:** mapa renderowała się WEWNĄTRZ prawej kolumny siatki
`[300px_1fr]` ze `szukaj/page.tsx`, więc dziedziczyła sidebar. Zmierzone na
1920 px: sidebar 320 + lista 762 + mapa 626 (mapa 33% ekranu).

### Rozwiązanie
- `ready` przestawione z `load` na **`styledata`** — odpala się po sparsowaniu
  stylu, czyli wtedy, gdy `project()` i `getBounds()` już działają. To wszystko,
  czego potrzebują znaczniki; kafelki dociągają się pod spodem.
- Nakładka zamieniona na **szkielet** o tej samej geometrii co gotowa mapa
  (zarys kontrolek, delikatny puls, płynne zanikanie). Zero skoku układu.
- **Wstępne pobranie paczki** w bezczynności (`requestIdleCallback`, zapasowo
  timeout dla Safari) oraz przy najechaniu na przełącznik. Paczka jest
  w pamięci, zanim padnie klik.
- Nowy `view-mode-store` — tryb widoku znają OBIE gałęzie drzewa, więc sidebar
  potrafi zniknąć. `ResultsLayout` przełącza siatkę na jedną kolumnę.

### Wydajność przed / po

| | przed | po |
|---|---|---|
| powłoka mapy | 880 ms | ~880 ms (bez zmian) |
| **znaczniki** | **3035 ms** | **~2700 ms, w tym 123 ms po powłoce** |
| odstęp powłoka → znaczniki | 2155 ms | **123 ms** |
| dodatkowe zapytania o hotele po kliku | 0 | **0** (potwierdzone testem) |

Najważniejsza liczba to **123 ms**: tyle mija od pokazania mapy do pojawienia
się znaczników. Wcześniej były to ponad dwie sekundy patrzenia w pustkę.

### Układ przed / po (1920 px, tryb mapy)

| | przed | po |
|---|---|---|
| sidebar filtrów | **widoczny** | ukryty |
| karta hotelu | 762 px | **955 px** |
| mapa | 626 px (33%) | **785 px (43%)** |
| szybkie filtry | brak | 8 chipów + „Wszystkie filtry" |

### Podgląd mapy nad filtrami
Statyczny obraz z `/api/map/static` (Geoapify Static Maps przez nasze proxy,
klucz zostaje na serwerze). **Zero JavaScriptu mapy** — podgląd stoi na każdym
wyszukiwaniu, także u gościa, który mapy nigdy nie otworzy. Środek liczony
z **mediany** współrzędnych puli, nie średniej: pojedynczy hotel z błędnymi
danymi przesunąłby średnią w pustkę.

---

## POLUBIONE

### Stan zastany
`SaveHotelButton` zapisywał do localStorage pod kluczem `ht_saved_hotels`,
ale **nic tych zapisów nie czytało**: brak serca na kartach wyników, brak
wpisu w nawigacji, brak strony z listą. Zapis istniał, powrót — nie.

### Implementacja
- `lib/hotels/favorites-store.ts` — store na `useSyncExternalStore`,
  z nasłuchem zdarzenia `storage` (zapis w jednej karcie odświeża drugą).
- `components/hotels/favorite-button.tsx` — JEDEN komponent dla karty wyniku
  i strony hotelu. Stary `SaveHotelButton` usunięty (przy okazji znika jeden
  z błędów lintu sprzed sesji).
- `FavoritesNavLink` w **wspólnej** nawigacji — widoczny też na homepage,
  z licznikiem.
- `/polubione` — siatka kafli, usuwanie, pusty stan z CTA.

### Trwałość
localStorage, bo projekt **nie ma kont** (Prisma obsługuje analitykę
i rezerwacje, nie użytkowników). Budowanie systemu logowania pod „zapisz na
później" byłoby nieproporcjonalne — brief §16 tego zabrania. Gdy konta
powstaną, wystarczy podmienić warstwę zapisu pod tym samym interfejsem.

**Czego NIE zapisujemy: CENY.** Zależy od terminu, liczby osób, taryfy
i dostępności — po tygodniu jest nieprawdą. Kafel prowadzi po aktualną cenę.

---

## POKOJE

### Przed
Wąski pasek nagłówka nad listą taryf: miniatura **128×96 px** i cztery
PIERWSZE udogodnienia z API. Na stronie o szerokości 1760 px wyglądało to jak
notatka, nie jak opis produktu za kilka tysięcy złotych.

### Po
Dwie kolumny (34% / 66%):
- **lewa** — zdjęcie **~415×245 px** (3× większe), nazwa, metraż, pojemność,
  łóżko, 6 udogodnień wybranych po WAŻNOŚCI, link do szczegółów,
- **prawa** — warianty cenowe w trzech sekcjach: oferta | cena | akcja.

### Priorytet udogodnień
`topRoomAmenities` — Tier 1 (klimatyzacja, prywatna łazienka, balkon, widok,
Wi-Fi, aneks kuchenny), Tier 2 (minibar, ekspres, TV, sejf, suszarka,
prysznic), reszta na końcu. Szum (papier toaletowy, mydło, ręczniki, pościel)
odsiany z podglądu — ale **nie znika**: pełna lista jest w szczegółach.

Test pilnuje dokładnie przypadku z briefu: przy wejściu
`["Papier toaletowy", "Mydło", "Ręczniki", "Klimatyzacja", "Prywatna łazienka",
"Minibar"]` wynikiem są trzy ostatnie, nie trzy pierwsze.

---

## MODAL POKOJU

### Błąd krytyczny: surowy HTML
Gość widział dosłownie `<p><strong>Łóżko podwójne…</strong></p><p><b>Internet
</b> — Bezpłatne Wi-Fi</p>`.

**Przyczyna:** `rooms[].description` przychodzi jako HTML (sprawdzone na żywym
API: 100% opisów ma znaczniki), a modal renderował je jako zwykły tekst
z `whitespace-pre-line`.

**Rozwiązanie:** `parseRoomDescription` rozbija opis na pary etykieta/treść.
Do DOM trafia **wyłącznie tekst** — `dangerouslySetInnerHTML` w tej ścieżce nie
występuje w ogóle, więc powierzchnia ataku jest zerowa, a nie „sanityzowana".
Etykiety, które dublują dane strukturalne (metraż, pojemność, łóżka), są
pomijane — stoją wyżej jako ikony i liczby.

### Kadrowanie
`object-cover` na sztywnej wysokości zjadał połowę pokoju, bo zdjęcia bywają
pionowe. Główne zdjęcie ma teraz **`object-contain`** na neutralnym tle —
kompozycja zostaje nienaruszona. Miniatury dalej używają `cover`: tam liczy się
rozpoznanie kadru, nie jego kompozycja.

### Rozmiar
`min(90vw, 1350px)` × `min(90dvh)`, dwie kolumny: zdjęcia i opis po lewej,
warianty cenowe po prawej. Na telefonie pełny ekran.

---

## PRZECENY I HISTORIA CEN 30 DNI

### Dlaczego Nuitee pokazuje więcej przecen niż my
Na Rodos (15–20 września, 2 dorosłych, **3118 taryf**):

| źródło | trafień | udział |
|---|---:|---:|
| `initialPrice > total` | 152 | **4,9%** |
| `suggestedSellingPrice > total` | 3098 | **99,4%** |

Nuitee pokazuje 9–14% obniżki, co odpowiada rozkładowi `suggestedSellingPrice`
— czyli **przekreśla cenę Booking.com**. My tego nie robimy: byłaby to wieczna,
nigdy nieznikająca „promocja" na każdej ofercie w serwisie.

### Historia 30 dni (decyzja właściciela)
`lib/hotels/price-history.ts` — dobowe MINIMUM ceny w Upstashu, klucz
`phist:v1:<hotel>:<checkin>:<checkout>:<obłożenie>:<waluta>`, TTL 35 dni.

Trzy reguły zapisane jako testy, bo pomyłka byłaby błędem wobec **przepisu**,
nie tylko wobec UX:
1. okno to dokładnie 30 dni wstecz,
2. **dzisiejszy wpis się nie liczy** — inaczej „najniższa cena z 30 dni"
   równałaby się cenie na ekranie,
3. brak danych daje „nie wiemy", nigdy „nie było taniej".

Zapis jest best-effort (`void`, strona nie czeka), odczyt degraduje do `null`.
Daty pobytu są częścią klucza: pobyt 15–17 września to inny produkt niż
20–22 września i ich historii nie wolno mieszać.

**Uwaga o narastaniu danych:** historia buduje się od wdrożenia. Przez
pierwsze dni zdanie „Najniższa cena z 30 dni" nie pojawi się prawie nigdzie —
i tak ma być. Pokazanie go bez danych byłoby dokładnie tym, czego przepis
zabrania.

---

## NAPRAWIONE BŁĘDY

1. **Surowy HTML w opisie pokoju** — gość widział znaczniki.
2. **Trzy kolumny w trybie mapy** — karty zgniatane do 762 px.
3. **Nakładka „Wczytuję mapę…"** przykrywająca gotową mapę przez 2 s.
4. **Agresywne kadrowanie zdjęcia pokoju** — znikała połowa pomieszczenia.
5. **Miniatura pokoju 128×96 px** przy stronie o szerokości 1760 px.
6. **Cztery pierwsze udogodnienia z API** zamiast czterech najważniejszych.
7. **Polubione bez powrotu** — zapis działał, odczyt nie istniał.
8. **Modal za mały** — zdjęcie pokoju dostawało 940×320 px.

---

## TESTY

**Jednostkowe (627, +18):**
- `room-description`: znaczniki nie wychodzą do widoku, etykieta/treść, encje,
  pusty opis, deduplikacja akapitów (6)
- `topRoomAmenities`: klimatyzacja bije papier toaletowy, Tier 1 przed Tier 2,
  sam szum lepszy niż pustka, determinizm (4)
- `price-history`: brak Redisa, minimum doby, pominięcie dzisiaj, okno 30 dni,
  odcięcie starszych, rozdzielne klucze dat, uszkodzone wartości, cisza przy
  równej kwocie (8)

**E2E (25, +8):**
- podgląd mapy stoi NAD filtrami,
- tryb mapy ukrywa sidebar; karta > 900 px, mapa > 700 px,
- pasek szybkich filtrów istnieje,
- otwarcie mapy **nie powtarza** wyszukiwania hoteli,
- serce zapisuje, przetrwa odświeżenie, usuwanie też jest trwałe,
- pusty stan `/polubione` ma CTA, nie białą stronę,
- zdjęcie pokoju > 300×180 px,
- modal bez surowego HTML, szerszy niż 1000 px, `object-fit: contain`.

### Trzy testy z V2 zaktualizowane — zmiana zachowania, nie regresja
1. **licznik N/N** — stary regex trafiał w ładunek RSC wewnątrz `<script>`,
   czyli w coś, czego gość nie widzi. Teraz sprawdzamy widoczny tekst.
2. **paczka mapy** — dawniej „lista nie pobiera mapy nigdy". Teraz: nie pobiera
   **do czasu pokazania pierwszych wyników**, potem dociąga w bezczynności,
   a **kafelki** czekają na realne otwarcie mapy.
3. **nagłówek modalu** — tytułem jest NAZWA POKOJU, „Szczegóły pokoju" zeszło
   do podtytułu.

---

## CZEGO NIE ZROBIONO

- **Lighthouse przed/po** — reguła z sesji 6 obowiązuje: na tej maszynie
  rozrzut sięga 43 → 65 → 19 dla NIEZMIENIONEJ strony.
- **Opis pokoju po angielsku** — dostawca dla części obiektów nie ma polskiej
  wersji. Strona hotelu wykrywa to dla opisu OBIEKTU
  (`descriptionIsLikelyNotPolish`); opis POKOJU jeszcze nie. Osobne zadanie.
- **Deduplikacja pojęciowa udogodnień pokoju** — dostawca zwraca obok siebie
  „Klimatyzacja" i „Klimatyzacja w pokoju jednoosobowym dla gości". Warstwa
  `amenity.ts` robi to dla udogodnień OBIEKTU po `facilityId`; pokoje mają
  tylko nazwy, więc wymagałoby to słownika pojęć.
