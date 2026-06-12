# HelpTravel — Master Plan SEO (cel: 100 000 zł przychodu do 31.12.2026)

> **Cel tego pliku:** trwała pamięć całego planu SEO + statusu postępów.
> Czytaj to JAKO PIERWSZE po czyszczeniu kontekstu. Aktualizuj sekcję
> "Status" po każdej zmianie. Plik jest w repo (git) → przeżywa kompakcję.

**Ostatnia aktualizacja:** 2026-06-04
**Właściciel biznesowy:** kuba.ogra123@gmail.com
**Stack:** Next.js 16.2.1 (App Router, Turbopack), React 19, Tailwind v4, LiteAPI (hotele), Aviasales/Travelpayouts (loty), Upstash Redis, Resend (email), Vercel.

---

## ⚠️ TWARDE OGRANICZENIA (NIE ŁAMAĆ)

1. **Homepage nietykalna** — NIE modyfikować `src/app/page.tsx` ani `src/components/home/**` bez wyraźnej prośby użytkownika.
2. **Planer = tylko Travelpayouts** — loty przez Aviasales/Travelpayouts, hotele przez LiteAPI (już w kodzie). Nie wprowadzać nowych integracji (Duffel/Hotelbeds wycofane).
3. **NON-NEGOTIABLE RULE 6** — nigdy po cichu nie gubić rekordów paid-but-unbooked.
4. Build MUSI być clean, testy MUSZĄ przechodzić (114/114) przed każdym merge.

---

## 📊 STAN WYJŚCIOWY (GSC, 28.02 → 28.05.2026)

| Wskaźnik | Wartość | Benchmark | Status |
|---|---|---|---|
| Kliknięcia (3 mies.) | 113 | — | 🔴 |
| Wyświetlenia | 18 600 | — | — |
| **CTR** | **0.6%** | 2-4% (travel) | 🔴 5x gorzej |
| **Pozycja śr.** | **11.1** | top 5 | 🔴 page 2 |
| Polska traffic | 98/113 (87%) | — | ✅ |
| Zindeksowane | 3 090 | — | ✅ |
| Nie zindeksowane | 355 (228 "scanned not indexed") | <5% | 🟡 |

**Diagnoza:** rankujemy na informational ("X pogoda Y" — 200+ wariantów), ZERO na commercial ("hotel barcelona", "wakacje grecja"). Rankujemy gdzie nikt nie kupuje, nie rankujemy gdzie wszyscy kupują.

**Top strony (kliknięcia):** `/` (40, CTR 18.6%), `/cennik` (3), `/o-nas` (2), `/porownanie/malaga-vs-valencia` (2, CTR 4.3%).
**Strony z ZERO kliknięć mimo wyświetleń:** `/kierunki/kos-greece/czerwiec` (271 wyśw.), `/kierunki/palermo-italy/czerwiec` (246), `/kierunki/bari-italy/czerwiec` (189).

---

## 💰 MATEMATYKA 100K

**Założenia:** avg booking ~2000 zł, commission 6-10% → **~150 zł/booking**. Aviasales EPC ~8 zł. Conversion post-fix 1-3%.

| Źródło | Target | Wymagane |
|---|---|---|
| Hotel bookings | 70K zł | 467 bookings (~67/mies.) |
| Aviasales affiliate | 25K zł | 3125 clicks (~450/mies.) |
| Inne | 5K zł | minor |

**Wymagany ruch:** ~10 000 sesji/mies. Aktualnie ~38 kliknięć/mies → potrzeba ~260x wzrost w 7 mies. Wykonalne tylko przez iloczyn lewerów (CTR 4x × pozycja 2x × nowe commercial pages × brand searches).

**EV realistyczne: ~70K zł. Szansa na pełne 100K: ~45%** (rośnie do >50% jeśli: sprint wykonany szybko + content writer od początku + paid budget od września).

---

## 🗓️ PLAN 7-MIESIĘCZNY

### Czerwiec 2026 — TECHNICAL FOUNDATION ← JESTEŚMY TUTAJ
Sprint 1 (ten): diakrytyki, meta intent-match, /en redirect, sitemap, schema, 10 commercial landing pages, conversion elements, tracking, internal linking.
**Target:** CTR 0.6→1.2%, kliknięcia 38→100/mies.

### Lipiec 2026 — COMMERCIAL CONTENT
- Kolejne 10-20 commercial landing pages (`/hotele/w/[miasto]` — rozszerzyć listę w `commercial-cities.ts`)
- Content calendar: 2 artykuły/tydzień (`/inspiracje`)
- A/B testy title/meta na top 20 stron
**Target:** CTR 1.8%, kliknięcia 280/mies, revenue 8-12K.

### Sierpień 2026 — SCALE
- ✅ Month pages → unikalny content data-driven (sezon, morze, kiedy-taniej) na CAŁYM szablonie ~2800 stron (PR #70, zrobione wcześniej). NEXT opcjonalnie: lokalne wydarzenia/święta + live ceny LiteAPI na top 30.
- Link building outreach (10 inquiries/tydzień): travelovista, kobieta-na-walizkach, HARO PL
**Target:** kliknięcia 600/mies, revenue 18-25K.

### Wrzesień-Listopad 2026 — GROWTH + PAID
- Google Ads (remarketing, brand defense) — budget ~5K zł/mies, ROAS 3x+
- Email marketing (z save-destination leadów)
- Influencer outreach (3-5 współprac)
**Target:** kliknięcia 1800/mies, revenue 50-70K cumulative.

### Grudzień 2026 — PUSH TO 100K
- Last-minute zimowe kampanie, Black Friday travel, email+retargeting blast.
**Target:** 100K zł kumulatywnie.

---

## ✅ STATUS POSTĘPÓW

### ZROBIONE I WMERGOWANE

**PR #66** (merged `7ec1148`) — wyszukiwarka hoteli:
- Hide unavailable hotels (entry===null filtrowane)
- Global price sort (cała pula 1000 sortowana client-side)
- Page size 30→20, pool 200→1000
- `language=pl` do LiteAPI getHotelDetail (+ fallback dla EN opisów)
- Whole-card clickable (fix 2-click bug)

**PR #67** (merged `318a70e`) — perf:
- Cold scan ~5s → ~1.5s (BATCH_SIZE 24→50, MAX_CONCURRENT 5→10)
- stays-search limit 60→200/min
- Priority queue: bieżąca strona ładuje ceny pierwsza

**PR #68** (merged `81c29c8`) — SEO Sprint 1, część 1:
- ✅ Diakrytyki: 159 zamian w 18 plikach (`leciec→lecieć`, `Mozliwe→Możliwe`, etc.)
- ✅ Titles/meta intent-match `/kierunki/[slug]/[miesiac]` (~2800 stron): `"Palermo w czerwcu 2026: pogoda 26°C, hotele od 1450 zł"`
- ✅ Titles/meta `/kierunki/[slug]` (~235 stron): `"Malaga 2026: hotele od 950 zł, lot 4.1 h, przewodnik"`
- ✅ `/en/*` redirect hardening (X-Robots-Tag: noindex na 308)
- ✅ Sitemap rebalance (guides 0.9, comparisons 0.85, months 0.5, +commercial 0.95, -search URLs)
- ✅ robots.ts: Disallow /hotele/szukaj
- ✅ Schema: Offer (priceRange→"od X zł" badge) + FAQPage (4 Q) + datePublished/Modified na month pages
- ✅ 10 commercial landing pages `/hotele/w/[miasto]`: barcelona, madryt, rzym, paryz, londyn, dubaj, stambul, lizbona, ateny, praga
  - Plik danych: `src/lib/mvp/commercial-cities.ts`
  - Template: `src/app/hotele/w/[miasto]/page.tsx`
  - Każda: hero+H1 locative, LiteAPI hotels (24h cache), why-us, best-time, month picker, FAQ schema, cross-link cluster

### ZROBIONE — Sprint 1, część 2 (PR #68, dołączone do tej samej gałęzi)

- ✅ **D5 — GA4 funnel tracking**: typowany helper `src/lib/analytics/track.ts` (event catalogue: hotel_search_submit, hotel_card_click, hotel_detail_view, booking_prebook_start, booking_complete, landing_view, landing_cta_click, **affiliate_click**, destination_save). GA4 + Consent Mode v2 już były w `components/site/google-analytics.tsx` — to dodaje warstwę funnel. Beacony:
  - `components/analytics/track-view.tsx` — fire-once view beacon (drop do server pages)
  - `components/analytics/tracked-affiliate-link.tsx` — affiliate_click przed nawigacją
  - Podpięte: `landing_view` (commercial landing), `hotel_detail_view` (hotel detail), `affiliate_click` (AviasalesCta).
  - **GA4 setup po stronie usera:** oznaczyć `booking_complete` i `affiliate_click` jako key events (Admin → Events → mark as key event) żeby liczyły się jako konwersje.
- ✅ **D6 — Internal linking guide→commercial**: `findCommercialCityByDestinationId()` + prominentny baner na `/kierunki/[slug]` linkujący do `/hotele/w/[miasto]` gdy istnieje. Przekazuje link equity z ~235 guide pages do 10 money pages. Commercial landing pages już cross-linkują między sobą (6 sąsiadów każda) + do month pages.

### ZROBIONE — Sprint 1.1 (commercial expansion) — PR #69

- ✅ **Commercial landing pages 10 → 25**: dodane Wiedeń, Mediolan, Wenecja, Florencja, Neapol, Amsterdam, Porto, Malaga, Walencja, Sewilla, Antalya, Hurghada, Split, Dubrownik, Marrakesz. Wszystkie z poprawną deklinacją PL (locative/genitive) i przyimkiem „w". Każda ma realny profil (hero image, klimat, czas lotu) — zweryfikowane w buildzie (25/25 prerendered).
- ✅ **Unikalny content per miasto (ANTI-DOORWAY)**: nowe pola w `commercial-cities.ts` — `intro` (2-3 zdania, unikalny hook) + `neighborhoods` (3-4 dzielnice „Gdzie się zatrzymać" z opisem) + 6. pytanie FAQ o okolice. To różnicuje strony (broni przed „scanned, not indexed"/doorway-page przy skalowaniu) i trafia w intent „hotele {miasto} centrum".
- ✅ **FIX BUGA: Londyn renderował się zdegradowany** — `destinationId` był „london-united-kingdom", ale profil ma slug „london-uk" (jedyny curated z niestandardowym slugiem; reszta używa konwencji `city-country`). Skutek na produkcji: brak hero image, klimatu, czasu lotu, month-pickera ORAZ brak banera commercial na `/kierunki/london-uk`. Naprawione (`destinationId` → „london-uk"). Potwierdzone gripem na prerendered HTML (sekcje profile-gated renderują się).
- ✅ **`preposition` field** ("w"/"na") wprowadzone i przewleczone przez WSZYSTKIE nagłówki locative (H1, meta, OG, schema, FAQ, cross-linki) — gotowe pod batch wysp ("na Teneryfie", "na Rodos") bez łamania gramatyki.
- ✅ **Cross-linking same-country-first** (do 8 sąsiadów zamiast 6) + sitemap auto-publikuje nowe miasta (priority 0.95, bez zmian w kodzie sitemap — czyta `commercialCitySlugs()`).
- Build clean, testy **113/113**, 0 nowych błędów TS (jedyny błąd to pre-existing `booking-confirmation.test.ts` TS5097 — niezwiązany).

### ZROBIONE — Sprint 1.2 (month-page enrichment, fix P1-5) — PR #70

Cel: **zmonetyzować ruch, który JUŻ mamy** (18 600 wyświetleń na stronach miesięcznych — np. kos-greece/czerwiec 271 wyśw./0 klik.) + naprawić 228 „scanned not indexed" unikalnym, data-driven contentem. Szablon `/kierunki/[slug]/[miesiac]/page.tsx` (~2800 stron):

- ✅ **Model temperatury morza** (coastal, `beachScore ≥ 0.6`) — lag 1-2 mies. od temp. powietrza; pokazywany tylko dla kierunków plażowych (dla inland suppressed). Trafia w intent „czy morze ciepłe w {miesiącu}".
- ✅ **Klasyfikacja sezonu** (peak/shoulder/low) → content „kiedy taniej / mniej turystów" konwertujący researcherów w klikających do bookingu.
- ✅ **Daty wyszukiwarki dopasowane do miesiąca** — „Sprawdź hotele w czerwcu" ląduje na dostępności NA czerwiec (lepsza konwersja niż generyczna data). 10. dnia miesiąca, w tym roku jeśli ≥3 dni do przodu, inaczej rok następny.
- ✅ **Link do commercial landing** (gdy miasto je ma, np. Praga → `/hotele/w/praga`) + cross-linki do najcieplejszego/najtańszego miesiąca (internal linking + „kiedy najtaniej" intent).
- ✅ **Unikalny intro + sekcja „Sezon, ceny i morze" + 2 nowe FAQ** (morze, kiedy najtaniej) per miasto×miesiąc → różnicowanie treści = indeksacja (fix P1-5).
- Build 2800+ month pages OK, testy **113/113**, typecheck clean. Zweryfikowane na kos-greece/czerwiec (morze, sezon, daty czerwiec) i prague-czechia/styczen (brak morza, link commercial, daty 2027).

### ZROBIONE — Sprint 1.3 (D4 conversion na hotel detail) — PR #71

Cel: podnieść współczynnik konwersji na stronie hotelu — lift mnoży KAŻDĄ rezerwację z całego ruchu. Wersja **uczciwa i bezpieczna** (user dał zielone światło na autonomię + „najlepsza konwersja"):

- ✅ **Uczciwy social proof**: eksponowany blok z PRAWDZIWYM ratingiem LiteAPI (0-10) + etykieta jakościowa (Wyjątkowy/Świetny/Bardzo dobry/Dobry/Przyzwoity) + liczba opinii (poprawna polska odmiana opinia/opinie/opinii). Pokazywane TYLKO gdy realne dane istnieją — zero fabrykacji.
- ✅ **„Zapisz na później"** (`save-hotel-button.tsx`): localStorage + event `hotel_save`. Sygnał intencji/lead. Zero PII, zero backendu, **nie dotyka booking/payment** (RULE 6 nietknięte).
- ✅ **Uczciwy trust strip** pod tytułem: „Ceny finalne w PLN · Bezpłatna anulacja w wybranych ofertach · Polskie wsparcie" (wszystko prawdziwe site-wide).
- ✅ Nowy typ eventu `hotel_save` w `track.ts`. Build OK (`/hotele/[hotelId]` dynamic ƒ), testy 113/113.
- ⛔ **ŚWIADOMIE NIE zrobione (dark patterns)**: fabrykowana pilność („23 osoby oglądają", fałszywe odliczanie, „ostatni pokój" bez pokrycia w danych). Nigdy — ryzyko prawne/brandowe.
- ⬜ NEXT (osobny, ostrożny pass — nie dotyka paymentu): wzmocnić wizualnie prawdziwe „Bezpłatna anulacja do {data}" per-rate w PriceView/booking-widget.

### ZROBIONE — Sprint 1.4 (batch wysp) — PR #73

- ✅ **+6 wysp commercial** (`/hotele/w/{teneryfa,kreta,rodos,majorka,malta,cypr}`) — najwyższy wolumen pakietów wakacyjnych PL (Kreta 30K, Teneryfa 27K, Rodos 22K, Cypr 20K, Majorka 18K, Malta 14K). Razem **31 commercial pages**.
- ✅ **Gramatyka „na"** zrobiona porządnie: pole `preposition` + nowe `cityAccusative`. Template rozróżnia kierunek: mainland „do {dopełniacz}" (do Barcelony) vs wyspa „na {biernik}" (na Kretę, lot z Polski na Cypr). Zweryfikowane w prerendered HTML — 0 błędnych „do Krety".
- ✅ **Dedup parens dla wysp-państw** (Malta/Cypr, gdzie miasto == kraj): brak redundancji „Hotele na Cyprze (na Cyprze)". Mainland bez zmian („… (Hiszpanii)").
- ✅ **Curated klimat Teneryfy** w `destinations.ts` (Kanary ~20-29°C cały rok, nie mainland-Spain ~11°C zimą) — poprawne budżety/sezon także na stronach miesięcznych.
- ✅ **Fix tracking: `booking_complete`** był zdefiniowany, ale NIGDY nie odpalany → naprawione (fire-once na potwierdzeniu rezerwacji, PR #72). Bez tego konwersja w GA4 = 0.
- Build OK (31/31 commercial prerendered), testy 113/113, 0 nowych błędów TS.

### ZROBIONE — Sprint 1.5 (redesign 3 stron contentowych) — PR #79

Cel: `/o-nas`, `/jak-pracujemy`, `/inspiracje` były „ścianą tekstu" bez zdjęć i CTA. Przebudowane do poziomu wizualnego homepage (realne foto Pexels, gradient amber→orange→rose, dark sekcje, glass cards, konwersyjne CTA, responsywne mobile).

- ✅ **Wspólne komponenty**: `MediaHero` (foto hero + gradient, jak commercial landing; min-h+flex → brak clippingu H1 na mobile) + `FinalCtaBanner` (dark emerald z gradientowym CTA jak homepage „Zacznij teraz").
- ✅ **/o-nas**: hero (Barcelona) + sekcja misji + pasek statystyk + 3 karty (dla kogo/co/czego nie) + ścieżka 3 kroki + uczciwy model + kafelki realnych kierunków (`DestinationTile` → konwersja) + final CTA.
- ✅ **/jak-pracujemy**: hero (Rzym) + 3-krokowy timeline + „co dostajesz" grid + przykład na żywo (foto Lizbony + konkretne kroki + CTA) + „czego nie robimy" + FAQ accordion (**FAQPage schema**) + final CTA.
- ✅ **/inspiracje**: hero (Ateny) + 6 kafelków kategorii ZE ZDJĘCIAMI + galeria artykułów ZE ZDJĘCIAMI (`EditorialArticleCard` rozszerzony o opcjonalny `imageUrl`, zachowuje click-tracking) + kafelki kierunków + final CTA. JSON-LD (CollectionPage/ItemList) zachowane.
- ✅ **FIX BUGA: `/tanie-podroze` renderowała się PUSTA** + `/cieple-kierunki` miała 0 artykułów — slug danych miał diakrytyki („tanie-podróże", „ciepłe-kierunki") niezgodne z ASCII-route. Nowy `foldCategorySlug` (`category-slug.ts`) → diacritic-insensitive lookup w `getEditorialCategoryBySlug`/`getArticlesForCategory`. Naprawia OBA site-wide BEZ zmiany slugów danych. Wszystkie linki kategorii (kafelki + chipsy artykułów) teraz ASCII.
- ⬜ NEXT (osobny task): pełna rekoncyliacja slugów kategorii w danych (diakrytyki vs ASCII — `tanie-podróże`/`ciepłe-kierunki` rozsiane w 7+/11+ miejscach: dane, localization, inferDestinationCategorySlugs).
- Build OK (3 strony async ISR z Pexels), testy 113/113, typecheck clean. Zweryfikowane wizualnie desktop + mobile (375px) w Preview — hero, kafelki, galeria, CTA, brak błędów konsoli.

### ZROBIONE — Sprint 1.6 (redesign huba /kierunki) — PR #84

Cel: `/kierunki` (hub katalogu, NIE month/guide pages) był płaski — biały hero bez zdjęcia + obronny ton „nie wszystko ma opis". Przebudowany na konwersyjny, mocno wizualny hub kierujący link equity + użytkowników do 31 commercial money pages.

- ✅ **MediaHero** (foto Barcelony) + gradientowy H1 + 2 CTA (wyszukiwarka, #style) + chipy danych (235+ kierunków, hotele od X zł, loty z 22 lotnisk, ceny w PLN) + chipy kategorii.
- ✅ **„Popularne kierunki w {miesiącu}"** — siatka 8× `DestinationTile` (foto + ocena + „od X zł" + czas lotu → `/hotele/szukaj`). Miesiąc w poprawnym miejscowniku (tabela, nie hack „+u").
- ✅ **„Hotele w popularnych miastach i na wyspach"** — KLUCZOWA sekcja SEO/konwersji: dark emerald-950 + 12 kart commercial (sortowane po `monthlySearchVolumePL`) → `/hotele/w/[miasto]` z foto + „od X zł" + czas lotu + temp. teraz. Przekazuje link equity z huba do money pages (wzmacnia D6).
- ✅ **Kafelki kategorii ze zdjęciami** (diacritic-safe `foldCategorySlug` — naprawia też latentny bug linków kategorii z diakrytykami na /kierunki) + **kafelki sezonowe** (4, ze zdjęciami → `/najlepsze-kierunki/[sezon]`).
- ✅ **Pełne przewodniki** (`DestinationGuideCard`) + **katalog wg regionu** (12 miast/region) zachowane i odświeżone.
- ✅ **FAQ (FAQPage schema)** — 6 pytań high-intent (city break, ciepło zimą, koszt wakacji, bez wizy, morze latem, skąd loty) z linkami wewnętrznymi.
- ✅ **Mocniejsze SEO**: intent-match title („Kierunki na wakacje i city break 2026 — hotele od 499 zł") + opis, rozbudowany JSON-LD (CollectionPage + BreadcrumbList + ItemList[commercial+guides] + FAQPage). Kontrakt bilingual (`DestinationsIndexPageView`/`getDestinationsIndexMetadata`) zachowany; EN niezmieniony (noindex, brak route).
- Build OK (`/kierunki` prerender ○ ISR, 3178/3178 stron), testy **114/114**, tsc + eslint clean. Zweryfikowane w Preview: hero (desktop), pełna kompozycja (tall viewport) — 8 sekcji, 55 obrazów załadowanych, 0 błędów konsoli. (Screenshot toolu miał problem ze scrollowaną, bardzo wysoką stroną — nie defekt strony; potwierdzone DOM + SSR.)
- ⬜ NEXT (opcjonalnie): dorzucić więcej kart commercial gdy lista urośnie do 40-50 miast; rozważyć sekcję „najtańsze teraz" gdy podłączymy live ceny LiteAPI.

---

### ZROBIONE — Sprint 1.7 (pre-launch polish, przed promocją FB) — PR #83-#87

Seria poprawek zgłoszonych przez właściciela przed startem promocji:
- ✅ **Booking e-mail + ekran potwierdzenia** (#83): mail wysyłany od razu (Resend), ekran pokazuje pełne szczegóły + „wysłaliśmy na <email>". Wymaga `RESEND_API_KEY` w Vercel (ustawione, działa).
- ✅ **Instant nav hotelu** (#83): `loading.tsx` dla `/hotele/[hotelId]` — koniec „podwójnego kliknięcia".
- ✅ **Redesign huba `/kierunki`** (#84): MediaHero, 12 kart commercial → money pages, FAQ schema, mocne SEO.
- ✅ **Czas rezerwacji ~37s → bookHotel-bound** (#85): usunięty zbędny pre-flight reconcile (do ~20s) z każdej rezerwacji + logi `book_ms`/`email_ms`.
- ✅ **Galeria hotelu = karuzela** (#86): auto-przewijanie ~2,2s, do 15 zdjęć, miniatury (LiteAPI nie ma zdjęć per-pokój).
- ✅ **Fallback zdjęć w wynikach** (#86): `onError` → brandowy placeholder, koniec „złamanych" obrazków.
- ✅ **Mniej alertów** (#86): ~co 14s → ~co 31s. **Live-visitor 100-200** (było ~600).
- ✅ **`/hotele` wycofane** (#86): 308 → `/`, usunięte z sitemap, wszystkie linki przepięte (breadcrumby → `/kierunki`).
- ✅ **Diakrytyki** (#86): toasty, error/global-error, stopka, affiliate-disclosure, hero.
- ✅ **Treść guide pages — start (#87)**: tylko 4 kierunki miały kuratorowany content (reszta = generyczny fallback). Dodany bogaty, ekspercki wpis dla **Aten** (Akropol, Koukaki, Plaka, Pireus…) + naprawione literówki w istniejących (Barcelona/Malaga/Lizbona/Walencja). **NEXT (rekomendacja):** rozszerzyć kuratorowane `DestinationStory` na top ~25 kierunków (NIE masowo generować 235 — ryzyko „helpful content"/spam u Google). Osobno: zlokalizować nazwy miast (Athens→Ateny, Rome→Rzym) w tytułach/H1.

---

### ZROBIONE — Sprint 1.8 (lokalizacja nazw miast + rollout treści guide) — PR #89

Po pre-launch polish — dwie rzeczy podbijające SEO organiczne:
- ✅ **Lokalizacja nazw miast na `/kierunki/[slug]`**: tytuł, H1, opis, OG/Twitter, breadcrumb, schema (Article/TouristDestination/Breadcrumb), keywords, alt → polskie nazwy przez `localizeCity` (Athens→Ateny, Rome→Rzym, Venice→Wenecja…). Trafia w realne zapytania PL. **Tylko mianownik** (tytuł/H1 są w mianowniku — poprawne); konteksty odmienione („hotele **w** {miasto}", „loty **do** {miasto}") zostawione po ang., żeby NIE generować błędów typu „w Ateny" zamiast „w Atenach" (deklinacja to osobny temat — commercial pages już ją mają przez cityLocative/Genitive).
- ✅ **Wyspy używają kuratorowanej nazwy** (np. `/kierunki/heraklion-greece` → H1 „Kreta", nie „Heraklion"): `getStoryBySlug(slug)?.name ?? localizeCity(city)`.
- ✅ **Rollout kuratorowanej treści: +16 kierunków** (Rzym, Mediolan, Wenecja, Florencja, Neapol, Madryt, Sewilla, Porto, Paryż, Londyn, Praga, Wiedeń, Stambuł, Kreta, Rodos, Teneryfa) → **21 kuratorowanych** łącznie. Napisane przez 2 agentów-copywriterów (real specifics, poprawna polszczyzna + diakrytyki, island-aware), zweryfikowane i zintegrowane przeze mnie. `DestinationStory` ma teraz opcjonalne media (zawsze nadpisywane przez `getDestinationStory`). Naprawione literówki cudzysłowów (typograficzne).
- Build clean (3178/3178), testy 114/114, tsc + eslint clean. Zweryfikowane w Preview: tytuły PL (Ateny/Rzym/Wenecja/Kreta), treść kuratorowana (Koloseum/Murano/Knossos), brak generycznego fallbacku.
- ⬜ NEXT: kolejne kuratorowane (Majorka, Cypr, Malta, Antalya, Hurghada, Split, Dubrownik, Marrakesz, Amsterdam, Dubaj) + lokalizacja nazw na month pages (2800) **z deklinacją** (locative/genitive — wymaga mapy odmian lub reużycia commercial-cities).

---

### ZROBIONE — Sprint 1.9 (mood landing pages + fixy UX zgłoszone przez użytkownika) — 2026-06-03 — PR #90

Cztery rzeczy z bezpośredniego zgłoszenia (priorytet: krytyczny bug + nowe strony SEO):
- 🐞 **KRYTYCZNY FIX — strona hotelu „skakała do góry"**: karuzela galerii co rotację wołała `el.scrollIntoView({block:"nearest"})`, które przewija CAŁY łańcuch przodków → gdy użytkownik zjechał w dół i pasek miniatur wyszedł z viewportu, okno było szarpane do góry co kilka sekund (strona nie do użycia). Zamienione na `strip.scrollBy({left})` — przewija tylko poziomy pasek, nigdy okna. Zweryfikowane A/B na żywym DOM: stary mechanizm = okno -1301px, nowy = 0px. `src/app/hotele/[hotelId]/_components/hotel-gallery.tsx`.
- 🐞 **FIX — wyniki hoteli „przeskakiwały" podczas ładowania**: `ResultsList` re-sortował całą listę przy każdym dochodzącym cenniku → karty zmieniały pozycję pod kursorem. Dodany stabilny porządek (akumulacja): raz pokazana karta trzyma miejsce, nowo wycenione dopisują się na końcu; pełny re-sort tylko przy zmianie kontrolki (sort/filtr/daty) — `controlSig`. Zweryfikowane: 4 próbki przez 7 s = pozycje stałe. `src/app/hotele/szukaj/_components/results-list.tsx`.
- ✅ **Hotel detail — DUŻO więcej prawdziwych informacji**: schemat Zod zrzucał najbogatsze pola LiteAPI (`hotelFacilities`, `facilities`, `hotelImportantInformation`, rozszerzone godziny check-in) — `amenities` bywa puste, stąd „mało informacji". Teraz: scalone + odszumione + zlokalizowane na PL + pogrupowane udogodnienia (zweryfikowane: **69 udogodnień** w 6 grupach vs stary limit 30), kafelki „Najważniejsze informacje" (godziny, ocena, liczba zdjęć/udogodnień), pełna polityka (bez limitu 6) + „Ważne informacje". Wszystko 100% z danych dostawcy (brak fabrykowania — kafelek bez danych po prostu się nie pokazuje). `src/lib/liteapi/types.ts`, `src/lib/liteapi/facilities.ts`, `src/app/hotele/[hotelId]/page.tsx`.
- ✅ **Galeria: auto-przewijanie co 5 s + większe zdjęcia** (stage 440→560px na lg, większe miniatury). Mniej „przyciętego" wrażenia.
- 🆕 **6 stron landingowych „nastrojów" `/wyjazdy/[typ]`** (SEO) — pod chipy z homepage (Plaża, City break, Góry, Kultura, Budżet, Słońce zimą), które wcześniej NIC nie robiły (scroll do `#hero`). Każdy nastrój ma **kuratorowaną listę 6 kierunków** (ręcznie pisane 1-zdaniowe opisy, tagi, najlepszy sezon) — pełna kontrola redakcyjna i spójny wygląd. **Góry mają realne kierunki górskie** (rozwiązany problem „za bardzo śródziemnomorskie"): Innsbruck (Alpy Tyrolskie), Teneryfa (Teide), Madera, Tirana (Alpy Albańskie), Bergen (fiordy), Lublana (Alpy Julijskie). `slug` ustawiany tylko gdy istnieje guide → CTA „Przewodnik"; CTA „Zobacz hotele i loty" z domyślnymi datami (+30/+34 dni) ląduje na realnych wynikach (LiteAPI rozwiązuje dowolne miasto). Zdjęcia: real profile z recipe gdy slug, inaczej syntetyczny profil → Pexels po nazwie lub bezpieczny fallback. Futurystyczny hero, sekcje + 3× FAQ (ręczna polszczyzna), JSON-LD w SSR HTML (CollectionPage/ItemList/FAQPage/Breadcrumb), switcher nastrojów. Nowa karta `MoodDestinationCard`. Dodane do `sitemap.ts` (priority 0.8). `src/lib/mvp/travel-moods.ts`, `src/components/publisher/mood-landing.tsx`, `src/components/publisher/mood-destination-card.tsx`, `src/app/wyjazdy/[typ]/page.tsx`.
- tsc + eslint clean (jedyny błąd to wcześniej-istniejący w pliku testowym `.ts`-import, nie z tej zmiany). Zweryfikowane w Preview: **wszystkie 6** stron `/wyjazdy/*` → 200, po 6 kart, brak błędów konsoli, JSON-LD w SSR HTML, chipy linkują, CTA z datami + slugami guide poprawne.
- ⚠️ **Homepage:** dotknięty wyłącznie `mood-chips.tsx` (przyciski → linki) na wyraźną prośbę użytkownika; hero i reszta homepage NIE ruszane.
- ⬜ NEXT (deploy): odpalić build, sprawdzić indeksację `/wyjazdy/*` w GSC; rozważyć link z `/inspiracje` do nastrojów.

### ZROBIONE — Sprint 1.10 (SEO milestone: porównania + lokalizacja + fixy widoczności) — 2026-06-03 — PR #90 (kontynuacja)

Trzy zadania zgłoszone z PRODUKCJI (helptravel.pl działa już na gałęzi #90) + krok milowy SEO pod organiczne pozyskiwanie klientów:
- ✅ **Udogodnienia hotelu w 100% po polsku**: słownik EN→PL rozszerzony z ~60 do **~180 haseł** (cała częsta paleta LiteAPI/Cupid: internet, parking, transport, jedzenie, basen/wellness, usługi, **bezpieczeństwo/higiena**, wyposażenie pokoi, rodzina, dostępność, widoki). Dodatkowy **dedup po polskiej etykiecie** — znikają duplikaty „Restauracja ×2"/„Basen ×2" (LiteAPI zwraca wariant EN i PL tego samego). Zweryfikowane na żywym hotelu: **0 angielskich pozostałości** z listy kontrolnej. `src/lib/liteapi/facilities.ts`.
- ✅ **Fix niewidocznych białych przycisków** (zgłoszone: na `/wyjazdy/*` przycisk „Otwórz wyszukiwarkę" był biały-na-białym). **Root cause:** `globals.css` ma **nielayerowaną** regułę `a { color: inherit }`, która w Tailwind v4 bije utility `text-*` (są w `@layer utilities`) → link dziedziczył biały tekst hero. Fix **bez ruszania globalnego CSS/homepage**: etykiety CTA owinięte w `<span class="text-...">` (span nie jest `<a>`, więc utility działa) + primary CTA zmieniony na **bursztynowy** (wysoki kontrast, on-brand). Ten sam latentny bug naprawiony na kartach nastrojów i na stronach porównań (białe „Zobacz hotele"). `mood-landing.tsx`, `mood-destination-card.tsx`, `porownanie/[para]/page.tsx`.
- ✅ **Porównania — krok milowy SEO** (najwyższy CTR w GSC = 4.4%, 2× średnia → skalujemy ostrożnie i jakościowo):
  - **+14 par o wysokiej intencji** (28 → **42**), głównie „X czy Y" wakacje plażowe z Polski: Kreta/Rodos/Majorka vs Turcja/Cypr, Madera vs Teneryfa, oraz klasyki city break (Rzym vs Ateny, Lizbona vs Rzym). Każda **różnicowana realnymi danymi** (pogoda/koszt/plaża/dolot) → zgodne z polityką Google (NIE „scaled content abuse"). Wszystkie 14 zweryfikowane = 200.
  - **Blok „Szybka odpowiedź"** u góry każdej strony — bezpośredni werdykt składany z danych (plaża/miasto/budżet/dolot) → **pod featured snippet i wysoki CTR**.
  - **Nowy hub `/porownanie`** — rankowalny landing („porównanie kierunków") + węzeł linkowania wewnętrznego do wszystkich par (CollectionPage/ItemList/BreadcrumbList JSON-LD). Dodany do `sitemap.ts` (priority 0.95) i podlinkowany z każdej strony porównania. `src/app/porownanie/page.tsx`.
- **Zgodność z polityką Google (świadomie zastosowane):** people-first/helpful content (każda strona realnie pomaga w decyzji), brak doorway/scaled-content (różnicowanie danymi), E-E-A-T (Organization author, konkrety zamiast lania wody), structured data (Article+FAQPage+Breadcrumb+CollectionPage+ItemList), internal linking hub-and-spoke, featured-snippet optimization (blok „Szybka odpowiedź"), poprawne title/meta/canonical/H1.
- tsc + eslint clean. Zweryfikowane (fetch SSR): hotel 0× EN, `/wyjazdy/slonce-zima` przycisk bursztynowy, 14 nowych par = 200, `/porownanie` = 200.
- ⬜ NEXT: link `/kierunki/[slug]` → powiązane porównania (`getComparisonsForDestination` już istnieje, podpiąć baner); rozważyć kolejne 10-15 par po nowych kuratorowanych kierunkach; A/B title na top porównaniach.

### ZROBIONE — Sprint 1.11 (internal linking przewodnik→porównanie + skala porównań + PL tytuły) — 2026-06-03 — PR #90 (kontynuacja)

Domknięcie NEXT-ów ze Sprintu 1.10 — wszystkie 3 rzeczy zgłoszone przez użytkownika:
- ✅ **Baner „Porównaj X z innym kierunkiem" na `/kierunki/[slug]`** (235 przewodników) — sekcja z linkami do realnych stron `/porownanie/[para]` dla danego kierunku (`getComparisonsForDestination`). Wcześniej linki „Porównaj kierunki" prowadziły tylko do `/kierunki` (indeks). Teraz przekazują link equity z przewodników do wysoko-CTR-owych porównań i łapią intencję „X czy Y". Zweryfikowane: Malaga → 5 linków porównań. `src/app/kierunki/[slug]/page.tsx`.
- ✅ **+13 par porównań (42 → 55)** z istniejącej puli przewodników: Kreta/Rodos/Majorka vs Malta, Barcelona/Berlin vs Londyn, Stambuł vs Rzym, Ateny vs Lizbona, Maroko vs Cypr/Kanary, Agadir vs Teneryfa/Madera. Wszystkie 13 = 200, dane-różnicowane (Google-policy OK). `src/lib/mvp/comparisons.ts`.
- ✅ **A/B tytułów porównań**: ulepszony domyślny szablon (świeżość = rok + korzyści): `„{A} czy {B}? Porównanie 2026 (pogoda, ceny)"` + pole `metaTitle?` na ręczne dopracowanie top stron (np. Malaga vs Walencja) — wariant „B" do pomiaru CTR w GSC.
- ✅ **FIX SEO: polskie nazwy miast w porównaniach.** Strony porównań pokazywały ang. nazwy („Athens czy Rome") zamiast pol. („Ateny czy Rzym") — tytuł/H1/tabela/FAQ/schema. Teraz `pair.label ?? getStoryBySlug().name ?? localizeCity()` (jak na przewodnikach). Łapie realne zapytania PL „Ateny czy Rzym". Zweryfikowane: title+H1 = „Ateny czy Rzym", „Stambuł czy Rzym".
- tsc + eslint clean. `/porownanie` hub: **54-55 par**.

---

### ZROBIONE — Sprint 1.12 (E-E-A-T + odchudzanie + raport danych + fix JSON-LD SSR) — 2026-06-04

Po pełnym audycie SEO (Google 2026: „scaled content abuse" = priorytet egzekucji marcowego core update, Helpful Content = sygnał **site-wide**, Experience = najważniejszy element E-E-A-T). 4 zlecone działania (A-D) + 1 odkryty bug krytyczny:

- ✅ **A. Warstwa E-E-A-T (autor-człowiek + Person schema + bylines).** Nowy `src/lib/mvp/authors.ts` (EDITOR_IN_CHIEF = założyciel „Kuba", uczciwe bio + metodologia; **⚠️ EDIT-ME**: nazwisko/zdjęcie/sameAs do uzupełnienia — nie fabrykuję osoby), `personSchema()` (Person ↔ Organization przez `worksFor`), komponent `AuthorByline`, nowa strona **`/redakcja`** (ProfilePage + Person + sekcja „skąd biorą się dane"). Autor w schemacie zmieniony Organization → **Person** na przewodnikach (235), porównaniach, month pages, commercial, raporcie + widoczny byline. Sitewide link do `/redakcja` w stopce (PL+EN). Plik: `authors.ts`, `components/publisher/author-byline.tsx`, `app/redakcja/page.tsx`.
- ✅ **B. „Operacja odchudzanie" month pages (zbalansowane ~top 35%).** `src/lib/mvp/month-index-policy.ts` — `isMonthIndexable(dest, monthIndex)` zostawia w indeksie tylko realnie intencyjne (kuratorowane/commercial w ciepłych mies., plaże ≥22°C, mocne city-breaki 16-32°C, świąteczny grudzień), resztę **`noindex` + usunięte z sitemap**. Zmierzone: **1039/2820 = 36,8%** indeksowalnych (test `month-index-policy.test.ts`, 3 asercje). Zdejmuje site-wide thin-content drag bez utraty wygrywających stron. Zweryfikowane: berlin/styczeń=noindex, berlin/lipiec + antalya/lipiec=index; sitemap wyklucza noindex.
- ✅ **C. Pogłębienie top 15 porównań (information gain).** `live-hotel-stats.ts` + `topComparisonSlugs`. Sekcja „Realne hotele w naszej bazie" z PRAWDZIWYMI danymi LiteAPI (liczba obiektów + średnia ocena gości z N + wysoko oceniane). **Świadomie BEZ live „od X zł"**: /hotels/rates zwraca 2-9 MB (>2 MB limit cache Next) a min z top-rated zawyżałby „od" (mylące → łamie 100% prawdziwe). Aktualne ceny zostają na wyszukiwarce/stronie hotelu (link). Cacheable (/data/hotels 24h), w pełni graceful.
- ✅ **D. Pierwszy linkowalny asset (digital PR).** `reports.ts` (ranking liczony z własnych danych 235+ kierunków) + hub **`/raporty`** + **`/raporty/gdzie-cieplo-i-tanio-2026`**. Autorski ranking „ciepło i tanio" (top 30) + 3 cytowalne findings (Najdłużej ciepło: **Agadir** 12 mies.; Najtaniej + Najbliżej: **Tirana**), metodologia, blok „Cytuj ten raport" (gotowy cytat + CTA), **Dataset + Article(Person) + Breadcrumb** schema, linki do przewodników. W sitemap (0.85) + stopce.
- 🐞 **FIX KRYTYCZNY (odkryty w trakcie): structured data NIE renderowała się server-side.** ~12 szablonów używało `next/script <Script type="application/ld+json">` → JSON-LD wstrzykiwany po hydracji (klient), poza surowym HTML = zawodne dla crawlera. Zamienione na `<script dangerouslySetInnerHTML>` (jak layout/guide, Google-recommended) w: porównania, month, commercial, `/kierunki` hub, `/inspiracje` hub, faq, jak-pracujemy, najlepsze-kierunki, category-page + nowe redakcja/raporty. **Zweryfikowane: ld+json bloki obecne w SSR HTML** (Article/FAQPage/Person/Dataset/ProfilePage). Realny site-wide zysk rich-results.
- Build clean (3215/3215), tsc clean, eslint clean (moje pliki), **testy 117/117**. Zweryfikowane na produkcyjnym serwerze (`next start`): wszystkie znaczniki zielone.
- ⚠️ **Pre-existing lint (NIE moje, nie blokuje buildu)**: react-hooks errors w `save-hotel-button`/`cookie-consent-banner`/`google-analytics`/`results-list` — osobny sprint.
- ⬜ **NEXT (właściciel):** (1) uzupełnij `authors.ts` o prawdziwe nazwisko/zdjęcie/profile (max E-E-A-T); (2) GSC: zgłoś `/redakcja`, `/raporty/gdzie-cieplo-i-tanio-2026`, re-submit `sitemap.xml`; (3) digital PR: roześlij raport (HARO PL, blogi travel, dziennikarze) — to silnik backlinków; (4) commit/push gdy zaakceptujesz (zmiany NIE są jeszcze zacommitowane).

---

### ZROBIONE — Sprint 1.13 (audyt konwersji: fix lejka rezerwacji + UX wyników) — 2026-06-09 — branch `feat/conversion-funnel-fixes`

Pełny audyt po danych GA (316 userów/7 dni, 26 na checkout, 0 realnych rezerwacji) + GSC + logi produkcyjne Vercel:

- 🐞 **ROOT CAUSE „70 kliknięć Zarezerwuj → 0 rezerwacji" (część techniczna):** LiteAPI na prebook z wygasłym/wycofanym offerId odpowiada **HTTP 400 `{code:4002, "invalid offerId"}`** → mapowane na `LITEAPI_UNKNOWN` → `LITEAPI_DOWN` → 503 z komunikatem „Chwilowy problem po stronie dostawcy. **Spróbuj ponownie**" → użytkownik ponawiał MARTWĄ ofertę (produkcja 2026-06-09: 4×503 w 70 s od jednego usera, potem odbicie). **Fix:** (1) `errors.ts` — celowane mapowanie 400+4002 → `LITEAPI_RATE_EXPIRED` (test w `client.test.ts`, suite 118/118); (2) `reservation-form.tsx` — klasyfikacja błędów prebook: dla deterministycznych (expired/unavailable/provider-reject) panel z CTA **„Wybierz ofertę ponownie →"** (deep-link do hotelu z datami/osobami). Zweryfikowane e2e na dev: realny prebook z martwym offerId → „Cena tej oferty wygasła…" + działający przycisk.
- 📊 **Checkout przestaje być czarną dziurą analityczną** — nowe eventy GA4: `checkout_view`, `booking_prebook_start`, `booking_prebook_error` (z kodem), `booking_payment_shown` (widget faktycznie namalowany), `checkout_webview_detected`. Dotąd między `hotel_detail_view` a `booking_complete` nie było NIC.
- 📱 **Webview escape-hatch**: checkout w przeglądarce in-app (TikTok/IG/FB — wykrycie po UA) pokazuje baner „otwórz w Chrome/Safari" + „Kopiuj link" — 3D Secure w webview to klasyczny silent-killer płatności przy ruchu z TikToka (72% ruchu = mobile).
- ⭐ **Trustpilot** (konto zweryfikowane): kafelek w TrustStrip + punkt w karcie zaufania kroku płatności → `pl.trustpilot.com/review/helptravel.pl`.
- 🔎 **Wyniki wyszukiwania:** (1) usunięta zielona karta „Zobacz loty" nad hotelami (Clarity: duży drop-off; panel lotów na dole strony zostaje); (2) przycisk „Filtry i sortowanie" na mobile = **pływający FAB** na dole viewportu (wcześniej uciekał przy scrollu — trzeba było wracać na górę, zgłoszenie właściciela).
- Testy **118/118**, tsc bez nowych błędów (jedyny = pre-existing TS5097 w pliku testowym), eslint clean na zmienionych plikach. Zweryfikowane wizualnie: mobile 375px (FAB, sheet filtrów, panel błędu, trust strip) + desktop 1280px (sidebar wraca, FAB znika).
- ⬜ NEXT (rekomendacje z audytu, NIE zrobione): landing `/tiktok` pod link w bio (oferta z wideo ≠ homepage), GA4 oznaczyć `checkout_view`/`booking_payment_shown` w lejku eksploracji, rozważyć BLIK/Przelewy24 (LiteAPI roadmap?), obserwować `booking_prebook_error` po deployu.

---

### ZROBIONE — Sprint 1.14 (redesign checkout na wzór Booking.com) — 2026-06-10 — PR #96

Pełny redesign `/hotele/rezerwacja` (4 fazy wg briefu właściciela; cel: konwersja checkout→booking w stronę 20%):

- 🐞 **FIX KRYTYCZNY: nazwy własne hoteli były maszynowo tłumaczone** („Siedemdziesiąt Barcelona") — LiteAPI `/data/hotel?language=pl` tłumaczy też pole `name` (zweryfikowane live: pl→„Siedemdziesiąt", en→„Seventy"). Fix w `getHotelDetail`: treść PL + nazwa z równoległego callu EN (oba cache 24h, graceful degradation). Naprawia H1/title/schema hotelu, checkout, płatność i mail potwierdzający. 3 testy regresyjne (`hotel.test.ts`), suite 121/121.
- ✅ **Krok „Dane"**: wskaźnik kroków 1→2→3 (`checkout-steps.tsx`), karta podsumowania jak prawy panel Booking (`booking-summary-card.tsx`: zdjęcie, gwiazdki, ocena 0–10 + liczba opinii, termin „15–17 lip 2026", goście, wyżywienie, badge anulacji, rozbicie „N nocy × Y zł" + Razem; sticky na lg, nad formularzem na mobile, na OBU krokach — na płatności cena z prebooka). Nagłówek „Już prawie gotowe! Uzupełnij dane", walidacja inline przy blur (PL komunikaty, aria-invalid/describedby, focus-first-error), hinty pól (telefon: „tylko w razie problemów"), CTA „Przejdź do płatności →" + „🔒 Nic jeszcze nie pobieramy" + jednolinijkowa akceptacja Regulaminu.
- ✅ **Krok „Płatność"**: wielki zielony box zaufania → JEDNA linijka „🔒 Bezpieczna płatność Stripe · 3D Secure" + małe Visa/MC; wyjaśnienie NUITEE TRAVEL w zwijanym `<details>` „Co zobaczę na wyciągu z banku?"; przycisk widgetu = **„Zapłać {kwota} zł"** (submitButton.text SDK). Potwierdzenie = krok 3 wskaźnika.
- ✅ **Polityka anulowania w lejku**: `cancel=free|nrf` + `cancelUntil` w linku oferty (rooms-section) → badge na karcie (wcześniej ginęła między stroną hotelu a checkoutem).
- ✅ **Footer**: minimalny na `/hotele/rezerwacja*` (logo + 5 linków prawnych — zero wyjść z lejka); globalnie usunięte „Oficjalne źródła" (4 zewn. linki) i sekcja partnerów (→ 1 linijka w meta), chipy kierunków/tras na mobile w `<details>` (linki w DOM = SEO bez strat).
- Logika prebook/book/eventów GA4 NIETKNIĘTA (RULE 6). Zweryfikowane na dev z realnym prebookiem (390px + 1440px): widget zamontowany, kwota na przycisku, walidacja, sticky karta.
- ⬜ NEXT (właściciel): test prawdziwej płatności na preview, GPay na realnym Androidzie, Lighthouse na preview/prod (dev niemiarodajny), mail z LiteAPI: BLIK + „is holder.phone optional on /rates/book?" (wtedy telefon → opcjonalny).

---

### ZROBIONE — Sprint 1.15 (zadania właściciela: homepage cleanup + wyszukiwarka Booking-style) — 2026-06-11 — PR #97 + #98

- ✅ **Zadanie 3 (PR #97, live):** zero fake social proof na homepage — usunięte ConversionToasts/LiveVisitorBadge/UrgencyStrip/badge „4.8/5·2341"/„Bezpieczne płatności u partnerów" + generator `destination-social-proof.ts` (oceny/ceny/opinie = hash sluga). `DestinationTile` (/, /kierunki, /o-nas, /inspiracje): tylko zdjęcie+kraj+miasto+czas lotu. 6→12 kart (+Stambuł, Funchal, Paryż, Porto, Neapol, Heraklion). `/kierunki`: title bez fikcyjnego „od 499 zł", karty commercial i FAQ bez zmyślonych kwot. −397 linii.
- ✅ **Zadanie 1 (PR #98):** wyszukiwarka jak Booking — `react-day-picker` v9 + `date-fns/pl` (lazy): jedno pole dat, 2 miesiące na desktopie / pełnoekranowy sheet na mobile, logika klik-klik z restartem; popover gości Dorośli(1-9)/Dzieci(0-6) z polską odmianą, **`adults` w URL = suma** (decyzja produktowa, dzieci jak dorośli dla LiteAPI/lotów) + informacyjny `kids=N`; „Skąd" opcjonalne (combobox 22 lotnisk, diakrytyki+IATA, puste = wyniki bez sekcji lotów). GA4: `hotel_search_submit` wreszcie podpięty (+`children_count`, `origin_provided`) — **właściciel: sprawdź DebugView po deployu**. Limit osób 8→15 end-to-end. Komponenty: `src/components/search/*`.
- ⬜ NEXT: zadanie 4 (polskie nazwy pokoi), zadanie 5 (weryfikacja stanu grupowania taryf), zadanie 2 (wyspy — po 1).

### ZROBIONE — Sprint 1.17 (zadanie 2: wyspy i regiony + submit bez wyboru z listy) — 2026-06-12 — PR (branch `feat/region-search`, PREVIEW, bez merge)

- ✅ **Wyspy/regiony (zadanie 2, strategia A):** LiteAPI `/data/hotels` przyjmuje `placeId` z `/data/places` — zweryfikowane empirycznie (Majorka 1000 hoteli/cap, Gozo 170). Słownik 20 wysp w `data/regions.ts` (placeId + aliasy PL/EN + archipelagi kanary/baleary + IATA + filterPoints), czyste funkcje w `src/lib/hotels/regions.ts` (matchRegions/isInRegion). URL: `/hotele/szukaj?region=<slug>`; nagłówek „Hotele: Majorka"; loty po IATA wyspy.
- ✅ **Filtr haversine + countryCode** tnie zmierzone przecieki placeId-search: Gozo→Malta (80 szt.), Sycylia→Malta (383!), Korfu→Albania (Ksamil 2 km od Kassiopi — geometria nie wystarcza, rozstrzyga countryCode). Promienie briefu skorygowane na żywych danych (Teneryfa 45→55 — Anaga; Sardynia +Oristano; Cypr +Larnaka/Nikozja; Lanzarote 2 punkty — cieśnina 12 km do Fuerteventury). Po korektach drop = wyłącznie sąsiednie wyspy/kraje.
- ✅ **Submit jak Booking (uwaga właściciela):** wpisany tekst bez wyboru z listy NIE blokuje — submit bierze najlepszą podpowiedź („warszaw"→Warszawa, „gozo"→wyspa); błąd tylko przy zerze podpowiedzi. Suggest API: wyspy nad miastami z metką „wyspa · kraj", dedupe duplikatu miasta o nazwie wyspy. Nagłówek wyników miast: polska nazwa („Hotele w Rzym", nie „w Rome").
- ✅ Weryfikacja: testy 8/8 (regions) + 129/129 całość, build czysty, smoke na dev: Majorka 548 dostępnych, Gozo 37, regresja Barcelona/Rzym OK, konsola bez błędów. Cache: Next Data Cache 24h kluczem placeId (osobne wpisy per region); **warming w GH Actions nie istnieje** (założenie briefu — jest tylko build-destinations.yml).
- ℹ️ Sprint 1.16 (grupowanie taryf + fix kalendarza) czeka w PR #99 na test płatności właściciela — wpis w SEO_MASTER_PLAN na tamtej gałęzi.

---

## 📋 12 PROBLEMÓW Z AUDYTU (priorytet wg revenue)

| # | Problem | Status | PR |
|---|---|---|---|
| P0-1 | Brak diakrytyków (191+ w 30 plikach; +2 duże pliki content MVP: destination/publisher) | ✅ DONE | #68/#76 |
| P0-2 | Title/meta nie matchują intencji | ✅ DONE | #68 |
| P0-3 | Brak commercial landing pages | ✅ DONE (31, +6 wysp) | #68/#69/#73 |
| P0-4 | /en/* w Google mimo redirectu | ✅ DONE | #68 |
| P1-5 | 228 "scanned not indexed" | ✅ DONE (unikalny content/miesiąc) | #68/#70 |
| P1-6 | Słaby CTR przez ubogie snippety | ✅ DONE (schema Offer+FAQ) | #68 |
| P1-7 | Crawl budget tracony (~4500 URLs) | ✅ DONE (search URLs usunięte) | #68 |
| P1-8 | Brak conversion elements na hotel detail | ✅ DONE (uczciwy social proof + save) | #71 |
| P2-9 | Brak measurement (funnel events) | ✅ DONE (track.ts + beacony) | #68 |
| P2-10 | Core Web Vitals | 🟡 sprawdzić w GSC po deploy | — |
| P2-11 | Brak link buildingu / authority | ⬜ TODO (sierpień) | — |
| P2-12 | Brak content calendar | ⬜ TODO (lipiec) | — |
| D6 | Internal linking guide→commercial | ✅ DONE | #68 |

---

## 🔧 KLUCZOWE PLIKI (mapa dla przyszłego kontekstu)

| Obszar | Plik |
|---|---|
| Commercial cities (top 10 + deklinacje PL) | `src/lib/mvp/commercial-cities.ts` |
| Commercial landing template | `src/app/hotele/w/[miasto]/page.tsx` |
| Month page (2800 stron) | `src/app/kierunki/[slug]/[miesiac]/page.tsx` |
| Destination guide (235 stron) | `src/app/kierunki/[slug]/page.tsx` |
| Sitemap (priorytety) | `src/app/sitemap.ts` |
| Robots | `src/app/robots.ts` |
| Middleware (/en redirect, admin auth) | `middleware.ts` |
| Search results | `src/app/hotele/szukaj/page.tsx` + `_components/results-list.tsx` |
| Hotel detail | `src/app/hotele/[hotelId]/page.tsx` |
| LiteAPI client | `src/lib/liteapi/` (search.ts, hotel.ts, rates.ts, client.ts) |
| Price batcher (perf) | `src/lib/hotels/price-batcher.ts` |
| Rate limit | `src/lib/rate-limit.ts` |
| Destinations data | `data/destinations.json`, `src/lib/mvp/destinations.ts` |

---

## 🚀 AKCJE UŻYTKOWNIKA PO DEPLOY (ważne!)

Po wmergowaniu PR #68 i deployu Vercel:

1. **GSC → Sprawdzenie adresu URL → Request Indexing** na próbkach z każdego bucketu:
   - `/hotele/w/barcelona` (nowa commercial)
   - `/kierunki/malaga-spain` (nowy title)
   - `/kierunki/palermo-italy/czerwiec` (nowy title + schema)
2. **GSC → Mapy witryn → resubmit** `sitemap.xml` (forsuje re-crawl z nowymi priorytetami)
3. **GSC → Usunięcia** (opcjonalnie): tymczasowe usunięcie prefiksu `/en/`
4. **Monitor tygodniowo:** CTR top 10 stron w GSC (powinien rosnąć w 7-14 dni)
5. **Rich Results Test** (search.google.com/test/rich-results) na `/kierunki/palermo-italy/czerwiec` — sprawdź czy FAQ + Offer widoczne
6. **Pierwszy sygnał sukcesu:** kliknięcie z "hotele barcelona" lub podobnego = landing rankuje

---

## 📈 MIERNIKI — TRACK WEEKLY (poniedziałek 15 min)

1. GSC: CTR, avg position, kliknięcia per top 20 URL
2. GA4 (po D5): sesje, conversion rate, revenue
3. LiteAPI: bookings count, avg booking value
4. Aviasales: clicks, EPC, total commission
5. Velocity: P0/P1 zaczęte vs skończone

Setup: Google Looker Studio (free) agregujący GSC + GA4 + LiteAPI events.

---

## 🔮 BACKLOG (po Sprincie 1)

- ✅ commercial-cities → **31 miast** (PR #69 + wyspy #73). Wyspy: Teneryfa, Kreta, Rodos, Majorka, Malta, Cypr — z poprawnym „na" (locative + biernik dla kierunku „na Kretę") oraz curated klimatem Teneryfy (Kanary, nie mainland-Spain). **NEXT:** dalej do 40-50 (Alicante, Faro, Sycylia/Palermo, Costa Brava, Zanzibar…) + warianty „all inclusive".
- Pre-warm Redis cron dla top 20 kierunków (sub-1s scan)
- Unique content na top 30 month pages (sierpień, fix P1-5)
- AggregateRating schema gdy będą prawdziwe recenzje
- Email capture / newsletter (save-destination → lead)
- Blog/content engine: 2 art./tydzień
- Link building outreach pipeline
