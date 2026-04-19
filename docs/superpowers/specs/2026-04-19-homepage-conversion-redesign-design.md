# Homepage Conversion Redesign — Design Spec

**Data:** 2026-04-19
**Autor brief:** Jakub (wlasciciel HelpTravel)
**Sciezka decyzji:** plannerusage = jedyna mierzona konwersja; obecna homepage to przeladowanie informacja zniechecajace do uzycia plannera.

## Problem

Obecna `src/app/page.tsx` to **1455 linii** kodu (sam hero `premium-home-hero.tsx` to 826 linii, plus 5 ciezkich sekcji w `home-page-sections.tsx`). Pierwsze wrazenie to sciana tresci — uzytkownik nie widzi nad fold-em jasnego "co mam zrobic", wiec scrolluje, meczy sie i wychodzi bez kliknieca w planner.

Mierzona konwersja **(B)**: uzytkownik trafia do `/planner` z preselected destynacja albo z pustym formularzem. Wszystko inne na homepage jest podporzadkowane temu celowi.

## Cel

Zbudowac homepage w **filozofii Hybrid (C)**:
- **Nad fold-em**: mini-planner (3 pola) + 6 kafli kierunkow → kazda interakcja prowadzi do `/planner` z odpowiednio ustawionymi parametrami.
- **Pod fold-em**: maksymalnie **3 wspierajace sekcje** zamiast obecnych 5 — krotkie, konkretne, bez powtarzania tej samej narracji.
- **Cel objetosci:** docelowo cala homepage <500 linii kodu razem (vs obecne 1455). Czas do First Meaningful Paint < 1.5s na 4G.

## Architektura — co znika, co zostaje, co nowe

### Znika (lub mocno przycinamy)
- `premium-home-hero.tsx` (826 linii) — zastepujemy nowym `HomeHybridHero` (~150 linii)
- 2 z 5 sekcji w `home-page-sections.tsx` — zostawiamy 3 najmocniejsze, reszta wylatuje

### Zostaje (slim down)
- 3 sekcje w `home-page-sections.tsx` — kazda przycinana do max ~80 linii i ~150 slow tekstu

### Nowe komponenty
- `src/components/home/home-hybrid-hero.tsx` — nowy hero z mini-plannerem i kaflami
- `src/components/home/mini-planner-form.tsx` — formularz 3-polowy (Skad / Dokad / Kiedy)
- `src/components/home/destination-tile.tsx` — pojedynczy kafel kierunku z preselect

## Layout pierwszego ekranu (above the fold)

```
┌────────────────────────────────────────────────────────────┐
│  HELPTRAVEL                                  [PL] [Menu]   │
├────────────────────────────────────────────────────────────┤
│                                                            │
│   Wyjazd, ktory zaplanujesz w 3 minuty.                    │
│   Wybierz kierunek, my pokazujemy najlepszy termin,        │
│   noclegi i loty z Polski w jednym miejscu.                │
│                                                            │
│   ┌─────────────────────────────────────────────────────┐  │
│   │  [Skad: Warszawa ▼] [Dokad: ___] [Kiedy: ___] [→]  │  │
│   └─────────────────────────────────────────────────────┘  │
│                                                            │
│   Albo wybierz gotowy pomysl ↓                             │
│                                                            │
│   ┌────────┐ ┌────────┐ ┌────────┐                         │
│   │ Malaga │ │Barcelona│ │ Lizbona│                         │
│   │ ~3.5h  │ │ ~3h     │ │ ~4h    │                         │
│   └────────┘ └────────┘ └────────┘                         │
│   ┌────────┐ ┌────────┐ ┌────────┐                         │
│   │ Rzym   │ │ Stambul │ │ Valencja│                        │
│   └────────┘ └────────┘ └────────┘                         │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### Mini-planner (`MiniPlannerForm`)
- **3 pola, jedna linia desktop / stacked mobile**
- Skad: select z 6 lotnisk PL: **Warszawa, Krakow, Gdansk, Wroclaw, Katowice, Poznan**, default = Warszawa
- Dokad: text input z autocomplete na podstawie `getAllDestinationProfiles()` (mozna zostawic puste)
- Kiedy: date picker pojedynczy, default = +14 dni
- Submit → `/planner?origin=X&destination=Y&startDate=Z&nights=4&travelers=2&mode=standard`
- Walidacja: tylko data wymagana; jak dokad puste → planner pokazuje wyszukiwarke ogolna

### Kafle kierunkow (`DestinationTile` x 6)
- 6 najmocniejszych kierunkow (handpicked w nowym module `src/lib/mvp/featured-destinations.ts`)
- Kazdy kafel: zdjecie hero (16:10), nazwa miasta, kraj, czas lotu, 1 tag (np. "City break", "Plaza")
- Klik → `/planner?destination=X&origin=Warszawa&...` (preselect → uzytkownik nie wpisuje, tylko klika "Sprawdz")
- Hover effect: lekkie podniesienie + cien
- Mobile: 2 kolumny, scroll vertical

## Sekcje pod fold-em (max 3)

### Sekcja 1 — "Jak to dziala" (3 kroki)
- 3 kafle horyzontalne: **1. Wybierz kierunek** | **2. Ustaw daty** | **3. Sprawdz hotele i loty**
- Kazdy: ikonka + 1 zdanie. **Max 60 slow lacznie.**
- Bez "naszej misji", bez "filozofii redakcyjnej", bez storytellingu.

### Sekcja 2 — "Najpopularniejsze tematy" (kategorie)
- 4-6 chipow do najpopularniejszych kategorii: City breaki, Plaza, Bez wizy, Tanie podroze, Weekendowe wyjazdy
- Klik → odpowiednia strona kategorii
- 1 zdanie naglowka. **Max 30 slow.**

### Sekcja 3 — Final CTA do plannera
- Duzy emerald CTA "Otworz planner" + drugorzedny link "Wszystkie kierunki"
- 1 zdanie zachety. **Max 30 slow.**

**Zero** w nowej homepage:
- ❌ "Najnowsze inspiracje" (5 artykulow)
- ❌ "Polecane porownania kierunkow"
- ❌ "Standard redakcyjny" / "Jak pracujemy" — to jest w stopce
- ❌ Powtorzenia tego samego CTA 4x w roznych formach

## Co siedzi pod maska (data flow)

```
homepage (server component)
  ├─> getFeaturedDestinations() → 6 destynacji  [nowy modul]
  ├─> resolveDestinationMedia() x 6  [istniejacy]
  └─> render <HomeHybridHero> + <SlimSections>

<HomeHybridHero> (client jezeli planner ma stan, inaczej server)
  ├─> <MiniPlannerForm>           [client — formularz]
  └─> <DestinationTile> x 6       [linki, server-renderable]
```

## Mierzalne kryteria sukcesu

1. **Linie kodu homepage**: < 500 (vs obecne 1455)
2. **Kafelki nad fold-em na desktop 1366×768**: minimum 3 widoczne bez scrolla, mini-planner widoczny w calosci
3. **Mobile (iPhone 14 viewport 390×844)**: mini-planner + minimum 1 kafel widoczne bez scrolla
4. **LCP < 2.5s** (vitals.ts juz mierzy — sprawdzamy w Vercel Analytics po wdrozeniu)
5. **Wszystkie 6 kafli + submit mini-plannera prowadza do `/planner` z poprawnym query stringiem** (manual smoke test po deploy)

## Co NIE jest w tym sprincie (decompose)

- **Slim down `/kierunki/[slug]`** — osobny PR, osobny spec. Te strony tez sa za grube, ale dotykac ich teraz to skok zakresu.
- **Slim down stron miesiecznych i porownan** — osobny PR.
- **Refactor plannera** (sam interfejs `/planner`) — osobny ticket. Najpierw weryfikujemy czy nowa homepage podnosi konwersje do plannera; dopiero potem ewentualnie tunoujemy planner.
- **A/B test starej vs nowej homepage** — opcjonalny followup; na poczatek po prostu wystawiamy nowa wersje.

## Ryzyka

1. **SEO** — homepage ma teraz duzo tresci ktore mozg moze interpretowac jako "ranking signal". Slim down moze chwilowo (3-7 dni) zachwiac pozycjami fraz `helptravel`/brand. Mitygacja: zostawiamy bogate strony `/kierunki/[slug]` (long-tail) — homepage rankuje glownie na brand.
2. **Strata istniejacych userow** — jezeli ktos juz nawigowal po starej homepage i wraca, nowa moze go zaskoczyc. Mitygacja: nawigacja w naglowku zostaje bez zmian, struktura URL bez zmian.
3. **Mini-planner z pustymi polami** — jezeli uzytkownik kliknie submit z pustymi polami, planner musi sobie poradzic. Sprawdzimy ze `/planner` bez query stringa otwiera sie w trybie discovery.

## Plan wdrozenia (skrot — szczegoly w writing-plans)

1. Stworz nowe komponenty (`HomeHybridHero`, `MiniPlannerForm`, `DestinationTile`)
2. Stworz `lib/mvp/featured-destinations.ts` z handpicked lista 6 destynacji
3. Przepisz `src/app/page.tsx` na nowy layout, podlacz nowy hero
4. Slim down `home-page-sections.tsx` z 5 do 3 sekcji
5. Usun `premium-home-hero.tsx` (i powiazane assets jak nieuzywane)
6. Walidacja: tsc + lint + build, smoke test wszystkich 6 kafli i submita mini-plannera
7. PR + merge + monitor Vercel Analytics przez 7 dni
