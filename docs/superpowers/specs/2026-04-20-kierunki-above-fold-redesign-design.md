# /kierunki Above-Fold Redesign — Design Spec

**Data:** 2026-04-20
**Autor brief:** Jakub (wlasciciel HelpTravel)
**Sciezka decyzji:** cel konwersji = Hybrid (planner + Stay22), filozofia = restrukturyzacja hierarchii (Above-fold first) bez ciecia tresci, zakres = wszystkie 3 szablony `/kierunki/*`.

## Problem

Strony kierunkow sa ciezkie — `/kierunki/[slug]/page.tsx` to **905 linii i 15 sekcji**. Nad fold-em uzytkownik dostaje 2-kolumnowy marketing hero, ale zadnego CTA ktore go ruszy do konwersji. Planner CTA i Stay22 siedza nizej na stronie, user scrolluje albo wychodzi.

Dodatkowo strony rankuja na long-tail w Google (np. "wakacje malaga", "malaga kiedy jechac"), wiec **ciecie tresci jest ryzykowne dla SEO**. Rozwiazanie: nie tniemy tresci, przenosimy CTA na gore.

## Cel

Zbudowac wspolny **Above-fold first pattern** dla trzech szablonow:
- `/kierunki/[slug]` — strona kierunku (905 linii)
- `/kierunki/[slug]/[miesiac]` — strona miesieczna (304 linii)
- `/kierunki` — lista kierunkow (255 linii)

Kluczowy komponent: **`KierunkiHeroCta`** — re-uzywalny block z planner CTA + Stay22 widget siedzacy bezposrednio pod hero naglowkiem na kazdej ze stron.

## Architektura wspolna — Pattern

```
[Header / breadcrumb]
[Hero compact: city + kluczowe fakty 1 linijka]
[ KIERUNKI-HERO-CTA ]  ← nowy wspolny komponent (2 kolumny na desktop)
   │   Lewa: "Zaplanuj wyjazd do {city}" → /planner?mode=standard&destination=...
   │   Prawa: Stay22 widget (CTA-button wariant, bez iframe)
[ ... reszta tresci strony (re-order, nie usuwanie) ... ]
[Final CTA do plannera]
```

`KierunkiHeroCta`:
- Server component
- Props: `{ city: string, country: string, campaign: string, startDate?: string, nights?: number, travelers?: number }`
- Lewa kolumna: link do `/planner?mode=standard&destination={city}&origin=Warszawa&nights={nights||4}&travelers={travelers||2}&startDate={startDate||""}`
- Prawa kolumna: `<Stay22Widget city={city} country={country} aid={env.STAY22_AID} campaign={campaign} />`
- Mobile: stack vertical, planner CTA pierwszy

## Zmiany per szablon

### `/kierunki/[slug]` (Sprint 1 — ten spec → plan)

Cel: 905 → **~700 linii**. Hero slim, pozostale sekcje re-ordered.

- Hero compact (obecne ~120 linii → ~60): wywalic 2-kolumnowy gradient hero, zostawic breadcrumb + naglowek + 4 quick-fact chipsy (czas lotu, klimat, best months, indeks kosztow)
- Mount `<KierunkiHeroCta>` bezposrednio pod hero
- Re-order sekcji pod CTA:
  1. Stay22 (obecnie linia 606) → idzie do `KierunkiHeroCta`, usuwamy z tego miejsca
  2. Winning scenarios / Hotele / Loty (wyzej)
  3. Atrakcje / Best months / Comparison (srodek)
  4. Avoid notes / reszta (nizej)
- Usuniecie 1-2 powtarzajacych sie "filozoficznych" sekcji gdzie tresc duplikuje sie z wyzszymi

### `/kierunki/[slug]/[miesiac]` (Sprint 2 — osobny plan pozniej)

Cel: 304 → **~250 linii**.
- Ten sam `<KierunkiHeroCta>` z **preselected startDate** = pierwszy poniedzialek miesiaca + 7 dni buffer (np. czerwiec 2026 → startDate=2026-06-08, nights=7)
- Hero dostosowany: "Malaga w czerwcu" + 3-4 fakty charakterystyczne dla miesiaca (srednia temp, zatloczenie, ceny)

### `/kierunki` lista (Sprint 3 — osobny plan pozniej)

Cel: 255 → **~200 linii**.
- Usuniecie duzych blokow tekstu "dlaczego wybrac"
- **Re-uzycie `DestinationTile`** z `src/components/home/destination-tile.tsx` (juz istnieje) — grid 3-4 kolumny
- Opcjonalny filtr (czas lotu, typ) — YAGNI, odkladamy

## File structure

### Nowe pliki
- `src/components/kierunki/kierunki-hero-cta.tsx` (~80 linii) — wspolny CTA block
- `src/lib/mvp/planner-links.ts` (~30 linii) — helper `buildPlannerLink({destination, origin?, startDate?, nights?, travelers?})` centralizujacy query-string building (dzis ten sam kod w DestinationTile, MiniPlannerForm, i byl by potrzebny w KierunkiHeroCta)

### Modyfikowane (jeden PR na szablon, sekwencyjnie)
- **Sprint 1 PR:** `src/app/kierunki/[slug]/page.tsx` (905 → ~700)
- **Sprint 2 PR:** `src/app/kierunki/[slug]/[miesiac]/page.tsx` (304 → ~250)
- **Sprint 3 PR:** `src/app/kierunki/page.tsx` (255 → ~200)

### Re-uzycie istniejacego kodu
- `DestinationTile` z home → Sprint 3
- `Stay22Widget` (CTA-button wariant z PR #19) → Sprint 1 (embedded w KierunkiHeroCta)
- `LocalizedLink` → wszedzie

## Mierzalne kryteria sukcesu (Sprint 1)

1. `KierunkiHeroCta` widoczny nad fold-em na desktop 1366×768 i mobile 390×844
2. Linie `src/app/kierunki/[slug]/page.tsx` < 750 (vs obecne 905)
3. Planner CTA trafia do `/planner?mode=standard&destination={city}&...` i uruchamia auto-search
4. Stay22 CTA otwiera mape hoteli z poprawnym `aid` + `campaign`
5. GSC — pozycje long-tail fraz (`wakacje malaga`, `malaga kiedy`) nie spadaja >3 pozycji w ciagu 14 dni
6. Vercel Analytics — LCP nie rosnie (cel: spadek dzieki lzejszemu hero)

## Ryzyka

1. **SEO regresja** — glowne ryzyko. Mitygacja: **nie tniemy** unikalnej tresci, tylko reorganizujemy. Wszystkie H2/H3 zostaja.
2. **Stay22 widget wolny** — obecnie CTA-button wariant (bez iframe), wiec zero external JS do pierwszego klikniecia. OK.
3. **Spojnosc 3 szablonow** — mitygacja: wspolny `KierunkiHeroCta`, kazdy szablon tylko montuje.
4. **Breakage [miesiac] przy zmianie [slug]** — obie uzywaja tych samych helperow (`getDestinationGuideBySlug`, `buildHotelAreaGuidance`, etc.). Mitygacja: Sprint 1 nie dotyka helperow, tylko layout page.tsx.
5. **`planner-links.ts` edge cases** — mitygacja: pierwsza implementacja 1:1 z DestinationTile, dopiero potem refactor DestinationTile na uzycie helpera.

## Co NIE jest w tym sprincie (decompose)

- Sprint 2 (`[miesiac]`) i Sprint 3 (`/kierunki` lista) — osobne plany pisane po walidacji Sprint 1 (7 dni produkcji)
- Refactor `PlannerClient` — osobny ticket
- A/B test starej vs nowej — opcjonalny followup
- Nowe integracje afiliacyjne — uzywamy tylko Stay22 (juz zintegrowany) i Travelpayouts (w plannerze)
- Nowe sekcje/content — tylko reorganizacja istniejacych
- Redesign wizualny (kolory, fonty, spacingi) — utrzymujemy obecny design system

## Plan wdrozenia (skrot — szczegoly w writing-plans dla Sprint 1)

1. Nowy branch `claude/kierunki-sprint-1` z `main` (po merge homepage redesign)
2. Stworz `src/lib/mvp/planner-links.ts` + testy
3. Stworz `src/components/kierunki/kierunki-hero-cta.tsx`
4. Refactor `src/app/kierunki/[slug]/page.tsx` (slim hero, mount hero-CTA, re-order sekcji)
5. Optional: refactor `DestinationTile` na uzycie `planner-links.ts` (DRY)
6. tsc + lint + build OK
7. PR + squash-merge
8. Monitor Vercel Analytics i GSC przez 7 dni
9. Jezeli metryki OK → Sprint 2 ([miesiac]) nastepnym planem
