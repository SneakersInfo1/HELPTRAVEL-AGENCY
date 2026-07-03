# Homepage „pełny": fix kafelków, Trustpilot 4,2/5 auto, pakiety, kierunki tematyczne, gęsty desktop

Data: 2026-07-03 · Właściciel zatwierdził design w rozmowie („tak dokładnie…").
Kontekst: kontynuacja kroku milowego PR #116/#117. Zasady nadrzędne bez zmian:
mobile-first (90% ruchu), WSZYSTKIE liczby z realnych danych (historia
2026-06-11), search-first, Impeccable jako bramka jakości.

## Decyzje właściciela (AskUserQuestion 2026-07-03)

1. Sekcje pod wyszukiwarką: **pakiety „Lot + hotel od X zł/os."** + **kierunki
   tematyczne z obrazkami** + **wzbogacenie istniejącego pasa korzyści**.
2. Ocena Trustpilot: **hero + sekcja „Kto za tym stoi"**, auto-odświeżana
   „raz na jakiś czas" (dobowo).
3. Desktop: **szerzej + gęściej + nowe sekcje** (homepage ma wypełniać monitor
   jak Trip/eSky; mobile zostaje kompaktowy).

## A. Fix łamania cen na kafelkach (bug, screenshot właściciela 375px)

Problem: `Hotel od 265 zł /` + `noc` w osobnych liniach; `zł` lotu spada
samotnie do nowej linii. Przy 2 kolumnach na 375px kafelek ma ~150px treści.

Fix w `destination-tile.tsx`:
- jednostka ceny hotelu = JEDEN niełamliwy token: `265 zł/noc`
  (`whitespace-nowrap` na spanie ceny+jednostki, bez spacji wokół „/"),
- linia lotu: `od 1136 zł` niełamliwe; zawinięcie dozwolone tylko po
  „Lot z Warszawy”,
- weryfikacja markupem na 375px i 320px (preview-MCP nie renderuje homepage —
  ken-burns; DOM-checki + Vercel preview).

## B. Trustpilot snapshot (`src/lib/trust/trustpilot-snapshot.ts`)

Wzorzec identyczny z `dstprice:v1` (best-effort, degrade-to-miss, test seam):

- `parseTrustpilotRating(html): { score: number; reviewCount: number } | null`
  — wyciąga dane z bloków `<script type="application/ld+json">` profilu
  `https://pl.trustpilot.com/review/helptravel.pl` (AggregateRating:
  `ratingValue`, `reviewCount`). Odporny na: wiele bloków, JSON z tablicą,
  brak ratingu → null. TDD na fixture HTML.
- Redis klucz `trustpilot:v1`: `{ score, reviewCount, fetchedAt }`, TTL 30 dni.
- `refreshTrustpilotSnapshot()`: fetch profilu TYLKO gdy `fetchedAt` starsze
  niż 24 h (throttle — cron chodzi co 30 min, Trustpilot ma być odpytywany
  ~1×/dobę); porażka fetcha/parsera → zostaje stary wpis (nigdy nie kasujemy).
- `readTrustpilotSnapshot()` + `isFreshTrustpilot(entry)`: świeżość 7 dni.
  Stare/nieobecne dane → UI pokazuje sam link bez liczby (uczciwość >
  kompletność; NIGDY nie hardkodujemy „4,2").
- Wywołanie w cronie `warm-rates` po hotelach/lotach, w try/catch, wynik w
  summary (`trustpilot: refreshed|skipped|failed`).

UI:
- hero, pas zaufania: `★ 4,2/5 na Trustpilot` (link jak dziś; liczba tylko
  gdy świeża),
- „Kto za tym stoi": `4,2/5 · 37 opinii na Trustpilot` w przycisku/obok.
- Format polski: przecinek dziesiętny.

## C1. Sekcja „Cały wyjazd od X zł/os." (pakiety)

Dane — rozszerzenie snapshotu `dstprice:v1` o pola pakietu (opcjonalne):
`pkgPerPersonPln`, `pkgCheckin`, `pkgCheckout`, `pkgComputedAt`.

Liczenie w cronie (uczciwe: TE SAME daty dla lotu i hotelu):
- dla każdego tania-okna `w`, jeśli kierunek ma w `w` cenę hotelu
  (`hotel_w` zł/noc, pokój 2 os.) ORAZ cenę lotu RT (`flight_w` zł/os.):
  `pkg_w = flight_w + ceil(nights_w × hotel_w / 2)`,
- zapisywane minimum po oknach wraz z datami okna zwycięskiego.
- Wymaga per-okno śledzenia w cronie (dziś trzymamy tylko minima globalne) —
  mapy `hotelByWindow`/`flightByWindow` w pamięci przebiegu.
- TDD: `computePackagePerPerson` (zaokrąglanie, nights z dat, null gdy brak
  którejkolwiek składowej), wybór minimum po oknach.

UI `PackageDeals` (server component, czyta ten sam snapshot co kafelki):
- do 6 kart z kierunków HOME_TILE (te z polami pkg), sortowane rosnąco po cenie,
- karta: zdjęcie (media już rozwiązane dla kafelków), „Malaga", termin
  („18–25 paź"), „od 1 890 zł/os." + stała etykieta sekcji: „Cena łączna:
  lot z Warszawy w obie strony + 7 nocy w hotelu, na osobę przy 2 osobach.
  Z realnych wyszukań — kliknij i rezerwuj te terminy.",
- CTA → `/hotele/szukaj?destination=…&checkin=pkgCheckin&checkout=pkgCheckout&adults=2`,
- mobile: karuzela pozioma ze snapem (1,2 karty w kadrze), desktop: grid 3×2.

## C2. Kierunki tematyczne z obrazkami + pas korzyści

- `ThemeTiles`: 4 kafle z TRAVEL_MOODS (plaza, city-break, slonce-zima,
  kultura) → `/wyjazdy/[typ]`. Obraz = `resolveDestinationMedia` seedu
  pierwszego picka danego moodu (ISR, ten sam wzorzec co kafelki). Kafel:
  zdjęcie + tytuł moodu + 1 linia opisu + strzałka. Mobile 2×2, desktop 4×1.
- Pas korzyści: rząd 4 pozycji z ikonami nad „Jak to działa"
  (Bez rejestracji · Potwierdzenie od razu na e-mail · Polskie wsparcie ·
  Ceny finalne w PLN). Zero nowych obietnic — tylko fakty już komunikowane.

## D. Desktop „pełny"

- Kafelki „Popularne kierunki": `lg:grid-cols-4 xl:grid-cols-6`
  (12 kafli = równe 2×6 na monitorze).
- Wspólna rama treści `max-w-[1600px]` dla wszystkich sekcji; `gap-8 → gap-6`
  w `main`; nowe sekcje pełną szerokością ramy.
- Mobile bez zmian układu (nowe sekcje stackują się kompaktowo).

Kolejność strony: hero (wyszukiwarka) → Popularne kierunki → Pakiety →
Kierunki tematyczne → pas korzyści + Jak to działa/Kto za tym stoi.

## Jakość / anty-slop (wymóg właściciela)

- Impeccable: `detect` po każdej edycji (hook) + `audit` całości przed PR;
  zakazy: gradient-text w NOWYCH elementach, identyczne card-gridy bez
  hierarchii, eyebrow nad każdą sekcją (są już 2 — nowe sekcje różnicują
  nagłówki), side-stripes.
- Kontrast ≥4,5:1 (ceny na zdjęciach zawsze na gradencie), touch targety
  ≥40px, focus states na nowych linkach.
- Weryfikacja: testy jednostkowe, build, DOM-checki 375/1280, cron end-to-end
  lokalnie (zasila PROD Redis — celowo, jak w Fazie 5/6), screenshot desktop
  z preview + mobile z Vercel preview.

## Poza zakresem

Wyszukiwarka (nie ruszamy — GA4), /wyjazdy, checkout, loty. Gradient-text
istniejącego H1 — osobna decyzja właściciela.
