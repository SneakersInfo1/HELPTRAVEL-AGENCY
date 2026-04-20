# /kierunki/[slug] Above-Fold Redesign — Sprint 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restrukturyzacja `src/app/kierunki/[slug]/page.tsx` (905 → ~700 linii) przez wprowadzenie wspolnego komponentu `KierunkiHeroCta` (planner CTA + Stay22 widget obok siebie) nad fold-em, bez ciecia tresci unikatowej dla SEO.

**Architecture:** Nowy komponent `KierunkiHeroCta` (server) oraz helper `planner-links.ts` centralizujacy budowanie URL do `/planner`. Slim hero w `page.tsx`, usuniecie istniejacej sekcji Stay22+Aviasales z dolu (linia 606) — Stay22 idzie do hero-CTA, Aviasales zostaje gdzie byl ale jako oddzielna sekcja. Reszta sekcji pozostaje bez zmian.

**Tech Stack:** Next.js 16 App Router, React 19 server components, TypeScript strict, Tailwind 4. `node --test` dla testow helpera. Polish commit messages.

**Spec:** `docs/superpowers/specs/2026-04-20-kierunki-above-fold-redesign-design.md`

**Branch base:** `origin/main`. Plan zaklada nowy branch `claude/kierunki-sprint-1`.

---

## File Structure

### Nowe pliki
- `src/lib/mvp/planner-links.ts` — helper `buildPlannerLink(opts)` zwracajacy string URL do `/planner` z poprawnymi query params
- `src/lib/mvp/planner-links.test.ts` — testy node:test dla helpera
- `src/components/kierunki/kierunki-hero-cta.tsx` — wspolny CTA block dla stron kierunkowych (server component)

### Pliki modyfikowane
- `src/app/kierunki/[slug]/page.tsx` — slim hero, mount `<KierunkiHeroCta>` tuz pod hero, usuniecie starej sekcji Stay22 z linii 606-626, re-order sekcji
- `package.json` — dodanie `planner-links.test.ts` do scriptu `test`

### Pliki nietykane
- `src/app/kierunki/[slug]/opengraph-image.tsx` — OG generator zostaje
- `src/app/kierunki/[slug]/[miesiac]/page.tsx` — Sprint 2, osobny plan
- Istniejace komponenty affiliate (`Stay22Widget`, `AviasalesCta`, `YesimCta`) — uzywamy bez zmian

---

## Pre-flight

- [ ] **Step 1: Weryfikacja ze homepage PR jest juz w main**

```bash
cd "C:/Users/kubao/Documents/New project/helptravel-agency/.claude/worktrees/distracted-brattain-8838ba"
git fetch origin main
git log origin/main --oneline | head -5
```

Expected: w ostatnich commitach widac `refactor: homepage Hybrid...` albo podobne (efekt remote agenta z Sprint 0). Jezeli NIE ma — zatrzymaj sie, ping wlasciciela, poczekaj az homepage PR sie zmergeuje.

- [ ] **Step 2: Utworz branch ze swiezego main**

```bash
git checkout -b claude/kierunki-sprint-1 origin/main
git status
```

Expected: `On branch claude/kierunki-sprint-1 / nothing to commit, working tree clean`

---

## Task 1: Helper planner-links.ts + testy

**Files:**
- Create: `src/lib/mvp/planner-links.ts`
- Create: `src/lib/mvp/planner-links.test.ts`
- Modify: `package.json`

**Cel:** Centralizacja budowania URL do `/planner`. Dzis ten sam kod siedzi w 3 miejscach (`mini-planner-form.tsx`, `destination-tile.tsx`, `src/app/kierunki/[slug]/page.tsx` linia 286-295). Bierzemy jako wzorzec wariant z kierunkow bo jest najbogatszy (ma `budget` i `q`).

- [ ] **Step 1: Napisz test**

Plik: `src/lib/mvp/planner-links.test.ts`

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildPlannerLink } from "./planner-links";

describe("buildPlannerLink", () => {
  it("zwraca URL z minimalnymi parametrami (destination, origin)", () => {
    const url = buildPlannerLink({ destination: "Malaga", origin: "Warszawa" });
    assert.match(url, /^\/planner\?/);
    const qs = new URLSearchParams(url.split("?")[1]);
    assert.equal(qs.get("mode"), "standard");
    assert.equal(qs.get("destination"), "Malaga");
    assert.equal(qs.get("origin"), "Warszawa");
    assert.equal(qs.get("nights"), "4");
    assert.equal(qs.get("travelers"), "2");
  });

  it("dodaje startDate jezeli podany", () => {
    const url = buildPlannerLink({
      destination: "Barcelona",
      origin: "Warszawa",
      startDate: "2026-06-08",
    });
    const qs = new URLSearchParams(url.split("?")[1]);
    assert.equal(qs.get("startDate"), "2026-06-08");
  });

  it("pomija destination jezeli puste (discovery mode)", () => {
    const url = buildPlannerLink({ destination: "", origin: "Warszawa" });
    const qs = new URLSearchParams(url.split("?")[1]);
    assert.equal(qs.has("destination"), false);
    assert.equal(qs.get("origin"), "Warszawa");
  });

  it("przyjmuje budget i q jako opcjonalne", () => {
    const url = buildPlannerLink({
      destination: "Rzym",
      origin: "Warszawa",
      budget: 3500,
      q: "Rzym",
    });
    const qs = new URLSearchParams(url.split("?")[1]);
    assert.equal(qs.get("budget"), "3500");
    assert.equal(qs.get("q"), "Rzym");
  });

  it("nadpisuje nights i travelers jezeli przekazane", () => {
    const url = buildPlannerLink({
      destination: "Lizbona",
      origin: "Warszawa",
      nights: 7,
      travelers: 4,
    });
    const qs = new URLSearchParams(url.split("?")[1]);
    assert.equal(qs.get("nights"), "7");
    assert.equal(qs.get("travelers"), "4");
  });
});
```

- [ ] **Step 2: Dodaj test do scriptu test w package.json**

Znajdz linie (po homepage merge powinna konczyc sie na `... featured-destinations.test.ts`):

```
"test": "node --import tsx --test src/lib/mvp/parser.test.ts src/lib/mvp/scoring.test.ts src/lib/mvp/cj-stays.test.ts src/lib/mvp/featured-destinations.test.ts",
```

Dopisz na koniec ` src/lib/mvp/planner-links.test.ts`.

- [ ] **Step 3: Uruchom test, sprawdz ze faila**

```bash
npm test
```
Expected: `Cannot find module './planner-links'`.

- [ ] **Step 4: Stworz helper**

Plik: `src/lib/mvp/planner-links.ts`

```typescript
// Buduje URL do /planner z query params kompatybilnymi z PlannerClient.
// Centralizuje logike uzywana w: MiniPlannerForm (homepage), DestinationTile (homepage),
// KierunkiHeroCta (strony kierunkowe), potencjalnie w [miesiac] i /kierunki list.
//
// Flag `mode=standard` + pole `destination` (lub `q`) triggeruje autoRunStandardSearch
// w PlannerClient (patrz src/app/planner/page.tsx).

export interface PlannerLinkOptions {
  destination: string;
  origin: string;
  startDate?: string;
  nights?: number;
  travelers?: number;
  budget?: number;
  q?: string;
}

export function buildPlannerLink(opts: PlannerLinkOptions): string {
  const params = new URLSearchParams({
    mode: "standard",
    origin: opts.origin,
    nights: String(opts.nights ?? 4),
    travelers: String(opts.travelers ?? 2),
  });
  const trimmedDestination = opts.destination.trim();
  if (trimmedDestination.length > 0) {
    params.set("destination", trimmedDestination);
  }
  if (opts.startDate) {
    params.set("startDate", opts.startDate);
  }
  if (typeof opts.budget === "number") {
    params.set("budget", String(opts.budget));
  }
  if (opts.q) {
    params.set("q", opts.q);
  }
  return `/planner?${params.toString()}`;
}
```

- [ ] **Step 5: Uruchom testy**

```bash
npm test
```
Expected: wszystkie zielone, 5 nowych testow przechodzi.

- [ ] **Step 6: Commit**

```bash
git add src/lib/mvp/planner-links.ts src/lib/mvp/planner-links.test.ts package.json
git commit -m "feat: helper buildPlannerLink — centralizacja URL do /planner"
```

---

## Task 2: Komponent KierunkiHeroCta

**Files:**
- Create: `src/components/kierunki/kierunki-hero-cta.tsx`

**Cel:** Server component-wrapper polaczony z lewej planner CTA i z prawej Stay22 mapy hoteli. Na mobile stack vertikal. Uzywany na wszystkich 3 szablonach `/kierunki/*` (w Sprint 1 tylko `[slug]`).

- [ ] **Step 1: Stworz komponent**

Plik: `src/components/kierunki/kierunki-hero-cta.tsx`

```tsx
import { Stay22Widget } from "@/components/affiliate/stay22-widget";
import { LocalizedLink } from "@/components/site/localized-link";
import { buildPlannerLink } from "@/lib/mvp/planner-links";

interface KierunkiHeroCtaProps {
  city: string;
  country: string;
  campaign: string;
  stay22Aid: string | null;
  // Parametry przekazywane do plannera i Stay22.
  startDate?: string;
  checkOutDate?: string;
  nights?: number;
  travelers?: number;
  budget?: number;
}

// Wspolny above-fold CTA dla stron kierunkow.
// Lewa: grube klikalne CTA do plannera z preselected destynacja i rozsadnymi defaultami.
// Prawa: Stay22 widget (CTA-button wariant, bez iframe — stabilne CSP, szybszy LCP).
// Mobile: stack vertykalny, CTA plannera pierwsze.
export function KierunkiHeroCta({
  city,
  country,
  campaign,
  stay22Aid,
  startDate,
  checkOutDate,
  nights = 4,
  travelers = 2,
  budget,
}: KierunkiHeroCtaProps) {
  const plannerHref = buildPlannerLink({
    destination: city,
    origin: "Warszawa",
    startDate,
    nights,
    travelers,
    budget,
    q: city,
  });

  return (
    <section className="grid gap-4 lg:grid-cols-2 lg:items-stretch">
      <article className="flex flex-col justify-between rounded-[1.8rem] border border-emerald-900/10 bg-emerald-950 p-6 text-white shadow-[0_18px_42px_rgba(7,31,18,0.18)]">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300">
            Zaplanuj wyjazd
          </p>
          <h2 className="mt-2 font-display text-3xl leading-tight">
            {city} w jednym widoku — noclegi, loty i atrakcje.
          </h2>
          <p className="mt-3 text-sm leading-7 text-emerald-100/85">
            Otworz planner z gotowymi ustawieniami ({nights} nocy, {travelers} osoby, start z Warszawy).
            Zmienisz dowolny parametr w planerze jednym kliknieciem.
          </p>
        </div>
        <div className="mt-5">
          <LocalizedLink
            href={plannerHref}
            className="inline-flex items-center justify-center rounded-full bg-emerald-400 px-6 py-3 text-sm font-bold text-emerald-950 transition hover:bg-emerald-300"
          >
            Zaplanuj wyjazd do {city}
          </LocalizedLink>
        </div>
      </article>
      <div>
        <Stay22Widget
          city={city}
          country={country}
          aid={stay22Aid}
          campaign={campaign}
          checkin={startDate}
          checkout={checkOutDate}
        />
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Sanity check kompilacji**

```bash
npx tsc --noEmit
```
Expected: brak bledow.

- [ ] **Step 3: Commit**

```bash
git add src/components/kierunki/kierunki-hero-cta.tsx
git commit -m "feat: KierunkiHeroCta — wspolny above-fold CTA dla stron kierunkow"
```

---

## Task 3: Slim hero + mount KierunkiHeroCta w page.tsx

**Files:**
- Modify: `src/app/kierunki/[slug]/page.tsx`

**Cel:** Wymien ciezki 2-kolumnowy hero (linie 371-417, ~47 linii JSX) na kompaktowy hero (~30 linii) + `<KierunkiHeroCta>` bezposrednio pod nim. Nie tykamy reszty strony w tym tasku.

Ze wzgledu na dlugosc page.tsx tasky sa rozbite na 3 czesci (3, 4, 5). Po kazdym czescie budujemy i weryfikujemy.

- [ ] **Step 1: Dodaj import KierunkiHeroCta na gorze pliku**

W `src/app/kierunki/[slug]/page.tsx`, znajdz blok importow (linie 1-32). Po imporcie `Stay22Widget` dodaj:

```tsx
import { KierunkiHeroCta } from "@/components/kierunki/kierunki-hero-cta";
```

- [ ] **Step 2: Przeczytaj obecny hero (linie ~371-417) zeby wiedziec co zastepujesz**

```bash
sed -n '371,420p' src/app/kierunki/[slug]/page.tsx
```

Jest to `<section className="overflow-hidden rounded-[2rem]...">` z 2-kolumnowym gridem (hero image + quick facts). **Caly ten `<section>` zastepujesz.**

- [ ] **Step 3: Wymien hero na slim version + KierunkiHeroCta**

Znajdz `<section className="overflow-hidden rounded-[2rem] border border-emerald-900/10 bg-white shadow-[0_20px_60px_rgba(16,84,48,0.08)]">` (linia 371) i zamieniaj **caly ten `<section>...</section>` blok** (konczy sie przed nastepnym `<section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">`) na:

```tsx
      {/* Slim hero — tylko breadcrumb + naglowek + 4 quick-fact chipsy. Ciezki 2-kolumnowy hero
          z obrazkiem zostal wchloniety: obrazek pojawia sie w sekcji ponizej, quick facts w chipsach. */}
      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
        <Breadcrumbs
          items={[
            { label: "Kierunki", href: "/kierunki" },
            { label: guide.destination.city },
          ]}
        />
        <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">
          {guide.destination.country} · {tripProfile}
        </p>
        <h1 className="mt-2 font-display text-4xl leading-[1.05] text-emerald-950 sm:text-5xl">
          {guide.destination.city}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-emerald-900/78 sm:text-base">
          {story.lead}
        </p>
        <ul className="mt-5 flex flex-wrap gap-2 text-xs font-semibold text-emerald-950">
          <li className="rounded-full border border-emerald-900/10 bg-emerald-50 px-3 py-1.5">
            ~{guide.destination.typicalFlightHoursFromPL.toFixed(1)} h z PL
          </li>
          <li className="rounded-full border border-emerald-900/10 bg-emerald-50 px-3 py-1.5">
            Najlepiej: {bestMonths.map(monthLabel).join(", ")}
          </li>
          <li className="rounded-full border border-emerald-900/10 bg-emerald-50 px-3 py-1.5">
            {routeComfort}
          </li>
          <li className="rounded-full border border-emerald-900/10 bg-emerald-50 px-3 py-1.5">
            {visaNote}
          </li>
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <SaveDestinationButton
            slug={guide.destination.slug}
            city={guide.destination.city}
            country={guide.destination.country}
          />
          <EditorialMetaBar updatedAt={guide.updatedAt ?? null} />
        </div>
      </section>

      <KierunkiHeroCta
        city={guide.destination.city}
        country={guide.destination.country}
        campaign={affiliateCampaign}
        stay22Aid={config.stay22Aid}
        startDate={defaultStartDate}
        checkOutDate={defaultCheckOutDate}
        nights={defaultNights}
        travelers={2}
        budget={budget.max}
      />
```

**UWAGA:** jezeli obecny hero uzywa pol ze `story` lub `guide` ktore nie sa w `tripProfile`/`routeComfort`/`visaNote`/`bestMonths` — dostosuj. Powyzsze zmienne juz sa obliczone na linii 246-268 page.tsx, wiec sa dostepne w scope.

Jezeli `story.lead` nie istnieje — uzyj pierwszego akapitu z obecnego hero (prawdopodobnie `story.description` albo `story.intro` — sprawdz `getDestinationStory` sygnature jezeli trzeba).

- [ ] **Step 4: Sanity check**

```bash
npx tsc --noEmit
```

Jezeli TS narzeka na nieistniejace pole w `story` — popraw na faktyczne pole (np. `story.description`). Jezeli narzeka na `SaveDestinationButton` props — sprawdz signature tego komponentu, dostosuj.

- [ ] **Step 5: Commit (partial — hero tylko)**

```bash
git add src/app/kierunki/[slug]/page.tsx
git commit -m "refactor: slim hero na /kierunki/[slug] + mount KierunkiHeroCta"
```

---

## Task 4: Usun stara sekcje Stay22+Aviasales z dolu page.tsx

**Files:**
- Modify: `src/app/kierunki/[slug]/page.tsx`

**Cel:** Stara sekcja `<section className="grid gap-5 lg:grid-cols-2">` zawierajaca `Stay22Widget` + `AviasalesCta` + `YesimCta` (linie ~606-626) jest teraz duplikacja. Stay22 siedzi juz w hero-CTA. Aviasales i Yesim wycinamy z tej sekcji i dajemy jako osobna, wezsza sekcje pod spodem (nie usuwamy tresci partnera — tylko restrukturyzacja).

- [ ] **Step 1: Zastap sekcje Stay22+Aviasales**

Znajdz w page.tsx:

```tsx
      <section className="grid gap-5 lg:grid-cols-2">
        <Stay22Widget
          city={guide.destination.city}
          country={guide.destination.country}
          aid={config.stay22Aid}
          campaign={affiliateCampaign}
          checkin={defaultStartDate}
          checkout={defaultCheckOutDate}
        />
        <div className="flex flex-col gap-4">
          <AviasalesCta
            city={guide.destination.city}
            country={guide.destination.country}
            campaign={affiliateCampaign}
            flightHours={guide.destination.typicalFlightHoursFromPL}
          />
          {showYesim ? (
            <YesimCta country={guide.destination.country} campaign={affiliateCampaign} />
          ) : null}
        </div>
      </section>
```

Zamien na:

```tsx
      {/* Stay22 przeniesiony do KierunkiHeroCta powyzej. Tutaj zostaja Aviasales + Yesim
          w osobnej wezszej sekcji zeby nadal byly widoczne na stronie. */}
      <section className="grid gap-4 sm:grid-cols-2">
        <AviasalesCta
          city={guide.destination.city}
          country={guide.destination.country}
          campaign={affiliateCampaign}
          flightHours={guide.destination.typicalFlightHoursFromPL}
        />
        {showYesim ? (
          <YesimCta country={guide.destination.country} campaign={affiliateCampaign} />
        ) : null}
      </section>
```

- [ ] **Step 2: Usun niepotrzebny import Stay22Widget z page.tsx**

Skoro Stay22 nie jest juz uzywany bezposrednio w page.tsx (uzywa go KierunkiHeroCta), usun import:

```tsx
import { Stay22Widget } from "@/components/affiliate/stay22-widget";
```

- [ ] **Step 3: Sanity check**

```bash
npx tsc --noEmit
```
Expected: czysto.

- [ ] **Step 4: Lint**

```bash
npm run lint
```
Expected: czysto (jezeli ESLint narzeka na nieuzywany `Stay22Widget`, to znaczy ze nie usunales importu w step 2).

- [ ] **Step 5: Commit**

```bash
git add src/app/kierunki/[slug]/page.tsx
git commit -m "refactor: usun duplikat Stay22 z /kierunki/[slug] (teraz w hero-CTA)"
```

---

## Task 5: Re-order sekcji — hotele/loty wyzej, filozofia nizej

**Files:**
- Modify: `src/app/kierunki/[slug]/page.tsx`

**Cel:** Sekcje typu "winning scenarios", "hotele/plaska guidance", "comparison" powinny byc wyzej, a "Jak czytac ta strone" / "Standard redakcyjny" / "avoid notes" nizej. Nie tykamy zawartosci sekcji — tylko ich kolejnosci.

**UWAGA:** Ten task jest najbardziej "manualny". Zamiast zmieniac kolejnosc w pliku w jednym edycji, uzywamy Edit tool do konkretnych przesuniec. Przed przeniesieniem — zidentyfikuj kazda sekcje po pierwszym `<section className="...">`.

- [ ] **Step 1: Zidentyfikuj sekcje po zmianach z Task 3-4**

```bash
grep -n "^      <section\|^        <section" src/app/kierunki/[slug]/page.tsx | head -20
```

Wypisz (na papierze lub w pamieci) obecna kolejnosc sekcji po Task 3-4 (powinno byc ~13 sekcji, bo zmienilismy hero i usunelismy duplikat Stay22).

- [ ] **Step 2: Docelowa kolejnosc**

Cel (od gory pod hero-CTA + Aviasales sekcja):

1. ~~Hero~~ — jest (Task 3)
2. ~~KierunkiHeroCta~~ — jest (Task 3)
3. ~~Aviasales + Yesim~~ — jest (Task 4)
4. **Winning scenarios** (to chce byc zaraz po CTA) — obecnie ~linia 461
5. **Hotel area guidance** (hotele = konwersja)
6. **Quick facts / Szybka ocena kierunku** (~linia 628)
7. **Best months** / klimat
8. **Atrakcje** (jezeli jest)
9. **Comparison signals**
10. **Related articles / categories**
11. **Avoid notes + Jak czytac ta strone** — nizej
12. **Related destinations + Final CTA**

- [ ] **Step 3: Ocen czy re-order wymaga zmian**

W praktyce: obecna kolejnosc moze byc juz blisko docelowej. Zrob ocene:
- Czy "winning scenarios" jest przed "quick facts"? Jezeli TAK → nie zmieniaj.
- Czy "Jak czytac ta strone" jest nizej niz polowa sekcji? Jezeli TAK → nie zmieniaj.

Jezeli obecna kolejnosc jest "akceptowalna" (tj. hotele i winning scenarios sa w gornej polowie, filozoficzne sekcje w dolnej) — **pomin Task 5 steps 4-6 i przejdz do Task 6**. Dopisz w commit message ze re-order nie byl potrzebny.

Jezeli jednak kolejnosc jest zla:

- [ ] **Step 4: Wykonaj re-order Edit'ami w pliku**

Uzyj Edit tool do wyciecia i wklejenia calych blokow sekcji w nowe miejsca. Rob to po jednej sekcji naraz, sprawdzajac `npx tsc --noEmit` po kazdym ruchu.

- [ ] **Step 5: Sanity check**

```bash
npx tsc --noEmit && npm run lint
```
Expected: czysto.

- [ ] **Step 6: Commit**

```bash
git add src/app/kierunki/[slug]/page.tsx
git commit -m "refactor: re-order sekcji /kierunki/[slug] — konwersja wyzej, filozofia nizej"
```

(Jezeli re-order nie byl potrzebny, pomin commit i przejdz do Task 6.)

---

## Task 6: Verify linie kodu + production build

**Files:** brak modyfikacji.

**Cel:** Zweryfikowac ze cel `<750 linii` jest osiagniety, build przechodzi.

- [ ] **Step 1: Policz linie kodu**

```bash
wc -l src/app/kierunki/[slug]/page.tsx src/components/kierunki/kierunki-hero-cta.tsx src/lib/mvp/planner-links.ts
```

Expected:
- `page.tsx` < 750 linii (vs obecne 905)
- `kierunki-hero-cta.tsx` ~80 linii
- `planner-links.ts` ~35 linii

Jezeli `page.tsx` > 750 — przejrzyj dodatkowo, ktore sekcje mozna dalej slimowac (ale **nie tniemy unikatowej tresci**). Mozliwe szybkie winy: inline styles → Tailwind classes, skonsolidowanie powtarzajacych sie chipsy-templates.

- [ ] **Step 2: Pelny build**

```bash
npm run build
```

Expected:
- Build OK.
- W tabeli routes `/kierunki/[slug]` jest jako `●` (static przez `generateStaticParams`) lub `ISR` (revalidate 86400).
- Brak TS/lint errors.

- [ ] **Step 3: Jezeli build fail**

Przeczytaj error, zrob fixup commit, buduj znowu. Nie idziemy do PR dopoki build nie jest czysty.

---

## Task 7: PR + squash-merge

- [ ] **Step 1: Push brancha**

```bash
git push -u origin claude/kierunki-sprint-1
```

- [ ] **Step 2: Stworz PR**

```bash
TOKEN=$(git credential-manager get <<EOF 2>/dev/null | grep '^password=' | cut -d= -f2-
protocol=https
host=github.com

EOF
)
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/SneakersInfo1/HELPTRAVEL-AGENCY/pulls \
  -d '{"title":"refactor: /kierunki/[slug] Above-fold (hero-CTA + re-order) — slim 905\u2192<750","head":"claude/kierunki-sprint-1","base":"main","body":"Spec: docs/superpowers/specs/2026-04-20-kierunki-above-fold-redesign-design.md\nPlan: docs/superpowers/plans/2026-04-20-kierunki-sprint-1-slug-redesign.md\n\nSprint 1 of 3 for /kierunki redesign.\n\n- Nowy komponent KierunkiHeroCta (planner CTA + Stay22 obok siebie)\n- Nowy helper planner-links.ts (DRY query-string building) + 5 testow\n- Slim hero w /kierunki/[slug] (breadcrumb + 4 chipsy + story lead)\n- Stay22 przeniesiony z dolu strony do hero-CTA\n- Re-order sekcji (konwersyjne wyzej, filozoficzne nizej)\n- Zero tresci unikatowej wycietej (SEO-safe)\n- tsc OK, lint OK, build OK"}' \
  | grep -E '"(number|html_url)"' | head -2
```

- [ ] **Step 3: Squash-merge**

```bash
PR=$(curl -s -H "Authorization: Bearer $TOKEN" "https://api.github.com/repos/SneakersInfo1/HELPTRAVEL-AGENCY/pulls?head=SneakersInfo1:claude/kierunki-sprint-1&state=open" | grep '"number"' | head -1 | grep -oE '[0-9]+')
echo "PR #$PR"
sleep 8
curl -s -X PUT -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/SneakersInfo1/HELPTRAVEL-AGENCY/pulls/$PR/merge" \
  -d '{"merge_method":"squash"}' | grep -E '"(merged|message)"'
```

Expected: `"merged": true`.

---

## Manualny smoke test po deploy

Po ~2 min od merge Vercel zrobi auto-deploy. Wejdz na https://helptravel.pl/kierunki/malaga-spain i sprawdz:

1. ✅ Slim hero widoczny (breadcrumb, nazwa miasta, 4 chipsy, opis)
2. ✅ `KierunkiHeroCta` widoczny **zaraz pod hero** — dwie kolumny na desktop
3. ✅ Lewa kolumna CTA: przycisk "Zaplanuj wyjazd do Malaga" — klik otwiera `/planner?mode=standard&destination=Malaga&origin=Warszawa&nights=4&travelers=2&startDate=YYYY-MM-DD&budget=...&q=Malaga`
4. ✅ Planner startuje auto-search (nie widzi pustego formularza)
5. ✅ Prawa kolumna: Stay22 CTA button dziala, otwiera mape hoteli w nowej karcie
6. ✅ Stara sekcja Stay22+Aviasales u dolu znikla, zostal tylko sam Aviasales (i Yesim dla krajow spoza UE)
7. ✅ Wszystkie inne sekcje sa (hotele, loty, winning scenarios, best months, comparison, related articles, avoid notes) — zadna nie zniknela
8. ✅ Mobile (iPhone 14 viewport): hero + 1 kolumna CTA widoczna bez scrolla
9. ✅ LCP nie wzrosl (Vercel Analytics)
10. ✅ Sprawdz drugi kierunek — np. https://helptravel.pl/kierunki/istanbul-turkey — hero-CTA tez dziala

Jezeli ktorys punkt fail-uje → fix-up commit na nowym branchu, NIE commitujemy bezposrednio na main.

---

## Po wdrozeniu — co obserwowac (7 dni)

1. **Vercel Analytics** — LCP i CLS na `/kierunki/[slug]`
2. **Google Search Console** — pozycje fraz long-tail:
   - `wakacje malaga`, `malaga kiedy jechac`
   - `wakacje barcelona`, `barcelona co zwiedzic`
   - `weekend w rzymie`
   Akceptowalna dewiacja: ±3 pozycje. Wieksze spadki → analiza, ewentualny rollback.
3. **Konwersja do plannera z kierunku** — jak dodasz event tracking `planner_open_from_kierunki`, baseline w 7 dni
4. **Klik w Stay22 CTA** — obecnie Travelpayouts/Stay22 dashboard ma cliki, porownaj przed/po

Po 7 dniach pozytywnego monitoringu → zaczynamy Sprint 2 (`/kierunki/[slug]/[miesiac]` — osobny plan).

---

## Self-review (wykonane przy pisaniu planu)

- **Spec coverage:** wszystkie 6 mierzalnych kryteriow ze specu (above-fold widoczny, <750 linii, planner auto-search, Stay22 click-through, GSC pozycje, LCP) sa pokryte przez Task 6 step 1-2 i smoke test punkty 2-9.
- **Type consistency:** `buildPlannerLink` sygnatura (`PlannerLinkOptions`) uzywana konsystentnie w Task 1 testach, Task 2 `KierunkiHeroCta`, Task 3 (poprzez hero-CTA). Pola: `destination`, `origin`, `startDate`, `nights`, `travelers`, `budget`, `q`.
- **Scope:** Sprint 1 tylko `[slug]`. `[miesiac]` i `/kierunki` list explicite wykluczone — osobne plany.
- **Placeholder scan:** brak "TBD"/"TODO"/"similar to Task N".
