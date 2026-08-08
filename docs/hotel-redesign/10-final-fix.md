# 10 — FINAL FIX (2026-08-08)

**Gałąź:** `feat/hotel-experience-redesign` · `main` NIETKNIĘTY, zero wdrożeń.
**Wyniki:** `pnpm test` 640/640 · `pnpm e2e` 33/33 (dwa przebiegi) ·
`npx tsc --noEmit` czysto · `pnpm lint` czysto · `pnpm build` EXIT 0.

---

## 1. Cztery przyczyny źródłowe — każda zmierzona, nie zgadnięta

### 1.1 `roomMapping: true` wycinał dostępność (oferty widmo)

Strona hotelu pytała o stawki WYŁĄCZNIE z `roomMapping: true`, żeby dostać
`mappedRoomId` i pokazać zdjęcia pokoju. Ten parametr nie jest wzbogaceniem
odpowiedzi — jest **filtrem**: dostawca zwraca tylko taryfy, które umiał
przypiąć do wpisu w `rooms[]`.

Sonda `pnpm probe:availability-drift` (Rodos, 50 hoteli, **dwa przebiegi
z identycznym wynikiem co do jednej taryfy**):

| zapytanie | hotele z dostępnością | taryfy |
|---|---|---|
| bez `roomMapping` | 40 / 50 | 5031 |
| z `roomMapping: true` | 37 / 50 | **355** |

Kontrola szumu: dwa identyczne wywołania bez mapowania dały **0** różnicy, więc
to nie jest zmienność dostawcy.

Pojedyncze hotele:

| hotel | bez mapowania | z mapowaniem |
|---|---|---|
| Trinity Boutique `lpa7a97` | 12 taryf | **0** |
| Moschos `lp80e66` | 2 taryfy | **0** |
| Hotel Mediterranean `lp67dd6` | 200 taryf / 41 nazw | **1 / 1** |
| Paralos Rodos `lp6558036a` | 200 taryf / 44 nazwy | 7 / 6 |

**Naprawa.** Dostępność bierze się z zapytania BEZ mapowania; mapowanie leci
RÓWNOLEGLE (`Promise.all`) i służy wyłącznie dopięciu zdjęć przez indeks
„nazwa taryfy → `rooms[].id`". Klucz złączenia to nazwa taryfy, nie
`roomTypeId` — ten drugi bywa niestabilny między wywołaniami (zmierzone: 0/5
trafień na `lp6558036a`, przy 4/5 dla nazwy).

Weryfikacja po naprawie: `lp67dd6` renderuje **10 grup pokoi** zamiast jednej,
`lpa7a97` ma pokoje zamiast „Brak dostępności".

### 1.2 Schemat Zod wywracał całą stronę hotelu

Wyłapane przez nowy test E2E, nie przez oko. `checkinCheckoutTimes.instructions`
było zadeklarowane jako `string[]`, a dostawca zwraca dla części obiektów listę
OBIEKTÓW. Zod odrzucał wtedy całą odpowiedź `/data/hotel` → `LITEAPI_VALIDATION`
→ error boundary → gość klikał ofertę z ceną i widział **„Mamy chwilowy
problem"** (Trianta Hotel Apartments `lp80e50`).

To druga odmiana tego samego zgłoszenia: lista obiecuje hotel, a strona się nie
otwiera. Pole **nigdzie nie jest renderowane**, więc nie ma prawa blokować
strony — ta sama lekcja co przy `rooms: null` w incydencie z lipca.

### 1.3 Podgląd mapy nad filtrami zwracał 502 na KAŻDYM wyszukiwaniu

`URLSearchParams.set("marker", "…color:%23047857…")` koduje procent ponownie,
więc na drut szło `%2523`. Geoapify:

```
400 {"message":"\"marker[0][2]\" does not match any of the allowed types"}
```

Nasza trasa mapowała to na 502, a komponent rysował szary prostokąt. Podgląd nie
był „niedokończony" — był **martwy od pierwszego dnia**. Logika adresu wyszła do
`lib/hotels/static-map-url.ts` i ma 4 testy, w tym jeden pilnujący dokładnie
podwójnego kodowania.

### 1.4 Znaczniki uciekały spod kursora

Reprezentant komórki grupującej brał się z KOLEJNOŚCI punktów, a ta zmienia się
przy każdej dochodzącej cenie (lista przelicza sortowanie). Zmierzone
przesunięcie znacznika po kliknięciu:

| widok | przed | po |
|---|---|---|
| desktop 1920 | 46 × 43 px | **0 × 0** |
| laptop 1440 | 31 × 39 px | **0 × 0** |
| tablet 768 | 44 × −263 px | **0 × 0** |
| telefon 390 | −75 × −30 px | **0 × 0** |

Trzy niezależne przyczyny, wszystkie usunięte:
- reprezentant komórki liczony deterministycznie (najniższy `hotelId`),
- `scale-110` na zaznaczeniu zmieniało pole trafienia **w chwili kliknięcia** —
  wyróżnienie robi teraz sam kolor,
- na telefonie karta podglądu była SĄSIADEM mapy w kolumnie, więc jej pojawienie
  się odbierało mapie wysokość (stąd −263 px). Teraz jest nakładką.

---

## 2. Wydajność mapy — pomiar A/B

Kafelki 256 px → 512 px (`@2x`). Ta sama powierzchnia to 9 żądań zamiast ~35.
Czas od kliknięcia „Mapa" do ostatniego kafelka, ten sam serwer, ten sam kierunek:

| wariant | czas |
|---|---|
| 256 px | **5943 ms** |
| 512 px `@2x` | **2761–2955 ms** |

To jest zgłoszone „nawet około 5 sekund". Na buildzie produkcyjnym: mapa w pełni
narysowana po **1070 ms** (desktop) i **694 ms** (telefon).

Dodatkowo: `ResizeObserver` → `map.resize()`. MapLibre mierzy kontener raz przy
tworzeniu, a kontener zmienia rozmiar bez udziału okna (znika sidebar, dochodzi
pasek filtrów). Bez tego canvas zostawał w starym rozmiarze — stąd niepokryty
biały pas na zrzutach.

Kadrowanie: `fitBounds` przestało odpalać przy każdej dochodzącej cenie.
Kadrujemy przy pierwszym dopasowaniu oraz gdy w kadrze nie został ANI JEDEN
punkt. Wcześniej mapa przekadrowywała się kilkadziesiąt razy z rzędu.

Znaczniki nie czekają już na ceny — na mapie stają też hotele jeszcze skanowane
(z zastrzeżeniem: przy aktywnym filtrze ceny, wyżywienia lub anulacji czekamy na
taryfę, bo inaczej nie wiemy, czy hotel filtr spełnia).

Paczka mapy (944 kB) pobiera się dopiero **po zakończeniu skanu cen** i tylko na
łączu, które na to stać (`saveData`, `2g`/`slow-2g` → nie pobieramy).

---

## 3. Górne paski, filtry, karty

**Paski.** Nagłówek serwisu jest pływającą pastylką (`rounded-[1.2rem]`,
`mx-4 sm:mx-6 xl:mx-10`), a pasek wyszukiwania był prostokątem na całą
szerokość — dwie warstwy z dwóch różnych serwisów. Teraz to ta sama pastylka:
identyczne marginesy, promień i obramowanie, różni je tylko wysokość cienia.

**Offsety.** Były wpisane ręcznie w trzech miejscach i w trzech wartościach
(`top-[72px]`, `lg:top-[148px]`, `top-[9rem]`). Zmierzone: nagłówek kończył się
na 82 px, pasek przyklejał na 84 px — przez cały czas przewijania prześwitywały
2 px treści. Teraz jedno źródło: `--ht-header-h`, mierzone `ResizeObserver`.

**Filtry.** Każdy blok to karta z ikoną w kaflu marki; jedna klasa pola zamiast
trzech różnych wysokości i promieni; wiersze wyboru mają 44 px; „Filtry
zastosowane" przestało być wyblakłym zielonym prostokątem wyglądającym na
zepsuty przycisk.

**Karty.** `sm:min-h-[12.5rem]`, szersze zdjęcie, większa plakietka oceny, cena
2xl, CTA 44 px ze strzałką. Od `xl` treść dzieli się na TRZY strefy
(tożsamość | udogodnienia | cena) — wcześniej kolumna informacji miała na
1920 px ~1090 px i mieściła nazwę oraz jeden rządek chipów, czyli środek karty
był pusty. Ocena przestała zawijać się pod nazwę zależnie od jej długości.

Warianty `dense` i `compact` istnieją, bo punkty przełamania Tailwinda mierzą
OKNO, nie kontener: w trybie mapy karta ma ~955 px przy oknie 1920 px i bez tego
włączał się układ zaprojektowany na 1400 px.

---

## 4. Czego NIE zrobiono i dlaczego

- **Zgodność listing → hotel nie jest i nie będzie 100%.** Lista czyta cenę
  z cache (Redis, TTL 60 min), a strona hotelu pyta na żywo. Hotel potrafi się
  wyprzedać w tym oknie — zweryfikowane w tej sesji na `lp80e66`, który miał
  2 taryfy o 13:00 i 0 taryf 25 minut później. To jest prawda o rynku, nie błąd
  w kodzie. Stan pustej dostępności ma teraz uczciwy komunikat i dwie konkretne
  drogi wyjścia zamiast jednego zdania.
- **Historii cen nie rozbudowano** (brief tego zabraniał), ale audyt Codeksa
  wykazał, że `getRedis()` stało POZA `try` — błędny URL Upstasha wywracał render
  strony. Poprawione. Etykieta zmieniona z „Najniższa cena z 30 dni" na
  „Najtańsza oferta tego obiektu w ostatnich 30 dniach", bo to drugie jest
  prawdą, a pierwsze brzmi jak cena odniesienia w rozumieniu Omnibusa (porównywany
  wariant mógł mieć inny pokój, wyżywienie i zasady anulacji).
- **Przecen dalej nie ma** poza realnym `initialPrice` — bez zmian względem V3.

## 5. Nowe narzędzia

- `pnpm probe:availability-drift` — sonda rozjazdu dostępności (READ-ONLY).
- `npx tsx e2e/audit-shots.ts <etykieta>` — zrzuty na 4 widokach + `pomiary.json`
  (overflow, cele dotykowe, czasy mapy, przesunięcie znacznika po kliknięciu).
- `e2e/final-fix.spec.ts` — 8 testów pilnujących dokładnie tych przyczyn.
