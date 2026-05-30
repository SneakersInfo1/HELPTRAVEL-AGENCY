# HelpTravel — Master Plan SEO (cel: 100 000 zł przychodu do 31.12.2026)

> **Cel tego pliku:** trwała pamięć całego planu SEO + statusu postępów.
> Czytaj to JAKO PIERWSZE po czyszczeniu kontekstu. Aktualizuj sekcję
> "Status" po każdej zmianie. Plik jest w repo (git) → przeżywa kompakcję.

**Ostatnia aktualizacja:** 2026-05-29
**Właściciel biznesowy:** kuba.ogra123@gmail.com
**Stack:** Next.js 16.2.1 (App Router, Turbopack), React 19, Tailwind v4, LiteAPI (hotele), Aviasales/Travelpayouts (loty), Upstash Redis, Resend (email), Vercel.

---

## ⚠️ TWARDE OGRANICZENIA (NIE ŁAMAĆ)

1. **Homepage nietykalna** — NIE modyfikować `src/app/page.tsx` ani `src/components/home/**` bez wyraźnej prośby użytkownika.
2. **Planer = tylko Travelpayouts** — loty przez Aviasales/Travelpayouts, hotele przez LiteAPI (już w kodzie). Nie wprowadzać nowych integracji (Duffel/Hotelbeds wycofane).
3. **NON-NEGOTIABLE RULE 6** — nigdy po cichu nie gubić rekordów paid-but-unbooked.
4. Build MUSI być clean, testy MUSZĄ przechodzić (113/113) przed każdym merge.

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
