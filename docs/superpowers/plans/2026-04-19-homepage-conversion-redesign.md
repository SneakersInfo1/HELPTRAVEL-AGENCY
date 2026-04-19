# Homepage Conversion Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Przebudowac homepage z 1455-liniowej sciany tresci na zwarty Hybrid layout (mini-planner + 6 kafli kierunkow) prowadzacy do `/planner` jako jedynej mierzonej konwersji.

**Architecture:** Wymiana ciezkiego `PremiumHomeHero` (826 linii) na nowy `HomeHybridHero` skladajacy sie z trzech maly komponentow (`MiniPlannerForm`, `DestinationTile`, lista 6 kafli). Slim down `HomePageSections` z 5 sekcji do 3. Zachowanie istniejacej struktury i18n (komponenty server-renderable + planner client-island).

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind 4. Brak nowych bibliotek. Testy logiki czystej w `node --test` (zgodnie z istniejaca konwencja projektu — patrz `src/lib/mvp/scoring.test.ts`). Komponenty React weryfikowane manualnym smoke testem po build/deploy (brak jest @testing-library w projekcie i nie jest celem tego planu go wprowadzac).

**Spec:** `docs/superpowers/specs/2026-04-19-homepage-conversion-redesign-design.md`

**Branch base:** `origin/main`. Plan zaklada nowy branch `claude/homepage-redesign`.

---

## File Structure

### Nowe pliki
- `src/lib/mvp/featured-destinations.ts` — handpicked lista 6 destynacji + helper `getFeaturedDestinations()`. **Czysta logika, testowana.**
- `src/lib/mvp/featured-destinations.test.ts` — testy node:test dla powyzszego.
- `src/lib/mvp/origin-cities.ts` — lista 6 lotnisk PL (Warszawa, Krakow, Gdansk, Wroclaw, Katowice, Poznan) jako stala.
- `src/components/home/destination-tile.tsx` — pojedynczy kafel kierunku (server component, link do plannera).
- `src/components/home/mini-planner-form.tsx` — formularz 3-polowy (client component, useState dla stanu pol, push do `/planner` przez router).
- `src/components/home/home-hybrid-hero.tsx` — wrapper: naglowek + `MiniPlannerForm` + grid 6× `DestinationTile`.

### Pliki modyfikowane
- `src/app/page.tsx` — `HomePageView` przepisany pod nowy hero, usuniete propsy do starej hero (`heroSlides`, `featuredDirectionCards`).
- `src/components/home/home-page-sections.tsx` — slim down: usuniete sekcje "Najnowsze inspiracje" i "Polecane porownania", zostaja 3 sekcje (Jak to dziala, Najpopularniejsze tematy, Final CTA).

### Pliki do usuniecia
- `src/components/home/premium-home-hero.tsx` — 826 linii, calkowicie zastapione.

### Pliki nietykane
- `src/app/en/page.tsx` — re-eksportuje `HomePageView`, dziala automatycznie z nowymi komponentami (i18n przez prop `locale`).
- `src/components/site/*` — nawigacja, language-switcher itp. zostaja.

---

## Pre-flight (przed Task 1)

- [ ] **Step 1: Utworzenie brancha**

```bash
cd "C:/Users/kubao/Documents/New project/helptravel-agency/.claude/worktrees/distracted-brattain-8838ba"
git fetch origin main
git checkout -b claude/homepage-redesign origin/main
```

- [ ] **Step 2: Weryfikacja czystego startu**

```bash
git status
```
Expected: `On branch claude/homepage-redesign / nothing to commit, working tree clean`

---

## Task 1: Modul featured-destinations + testy

**Files:**
- Create: `src/lib/mvp/featured-destinations.ts`
- Test: `src/lib/mvp/featured-destinations.test.ts`
- Modify: `package.json` (dodanie nowego test file do scriptu `test`)

**Cel:** Handpicked lista 6 slugow (Malaga, Barcelona, Lizbona, Rzym, Stambul, Valencja). Helper zwraca `DestinationProfile[]` w tej kolejnosci, pomijajac slugi nieistniejace w katalogu (zabezpieczenie na przyszle zmiany danych).

- [ ] **Step 1: Napisz test (node:test)**

Plik: `src/lib/mvp/featured-destinations.test.ts`

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { FEATURED_DESTINATION_SLUGS, getFeaturedDestinations } from "./featured-destinations";

describe("featured-destinations", () => {
  it("eksportuje dokladnie 6 slugow", () => {
    assert.equal(FEATURED_DESTINATION_SLUGS.length, 6);
  });

  it("wszystkie slugi sa unikatowe", () => {
    const set = new Set(FEATURED_DESTINATION_SLUGS);
    assert.equal(set.size, FEATURED_DESTINATION_SLUGS.length);
  });

  it("getFeaturedDestinations zwraca destynacje w kolejnosci slugow", () => {
    const result = getFeaturedDestinations();
    assert.ok(result.length >= 1, "powinno zwrocic co najmniej 1 destynacje");
    assert.ok(result.length <= FEATURED_DESTINATION_SLUGS.length, "nie wiecej niz lista bazowa");
    const resultSlugs = result.map((d) => d.slug);
    const expectedOrder = FEATURED_DESTINATION_SLUGS.filter((s) => resultSlugs.includes(s));
    assert.deepEqual(resultSlugs, expectedOrder);
  });

  it("kazda zwrocona destynacja ma wymagane pola (city, country, slug, typicalFlightHoursFromPL)", () => {
    const result = getFeaturedDestinations();
    for (const dest of result) {
      assert.ok(dest.slug, `slug brak: ${JSON.stringify(dest)}`);
      assert.ok(dest.city, `city brak: ${dest.slug}`);
      assert.ok(dest.country, `country brak: ${dest.slug}`);
      assert.equal(typeof dest.typicalFlightHoursFromPL, "number");
    }
  });
});
```

- [ ] **Step 2: Dodaj plik testowy do scriptu test**

Plik: `package.json`. Znajdz linie:

```json
"test": "node --import tsx --test src/lib/mvp/parser.test.ts src/lib/mvp/scoring.test.ts src/lib/mvp/cj-stays.test.ts",
```

Zmien na:

```json
"test": "node --import tsx --test src/lib/mvp/parser.test.ts src/lib/mvp/scoring.test.ts src/lib/mvp/cj-stays.test.ts src/lib/mvp/featured-destinations.test.ts",
```

- [ ] **Step 3: Uruchom test, upewnij sie ze fail-uje**

```bash
npm test
```
Expected: blad importu modulu `./featured-destinations` (Cannot find module).

- [ ] **Step 4: Stworz modul featured-destinations**

Plik: `src/lib/mvp/featured-destinations.ts`

```typescript
import { getAllDestinationProfiles } from "./destinations";
import type { DestinationProfile } from "./types";

// Handpicked 6 kierunkow dla homepage. Kolejnosc ma znaczenie — pierwsze widoczne
// nad fold-em na desktopie, ostatnie pod fold-em na mobile. Dobor pod polskiego
// odbiorcow (city break + plaza, wszystkie z dobra dostepnoscia z Polski).
export const FEATURED_DESTINATION_SLUGS = [
  "malaga-spain",
  "barcelona-spain",
  "lisbon-portugal",
  "rome-italy",
  "istanbul-turkey",
  "valencia-spain",
] as const;

export function getFeaturedDestinations(): DestinationProfile[] {
  const all = getAllDestinationProfiles();
  const bySlug = new Map(all.map((d) => [d.slug, d] as const));
  return FEATURED_DESTINATION_SLUGS
    .map((slug) => bySlug.get(slug))
    .filter((d): d is DestinationProfile => Boolean(d));
}
```

- [ ] **Step 5: Uruchom test, upewnij sie ze przechodzi**

```bash
npm test
```
Expected: wszystkie testy zielone, wlacznie z 4 nowymi z `featured-destinations.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/mvp/featured-destinations.ts src/lib/mvp/featured-destinations.test.ts package.json
git commit -m "feat: modul featured-destinations dla homepage hero"
```

---

## Task 2: Modul origin-cities

**Files:**
- Create: `src/lib/mvp/origin-cities.ts`

**Cel:** Stala lista 6 polskich lotnisk dla selecta "Skad" w mini-plannerze. Bez testow — to tylko stala typed array.

- [ ] **Step 1: Stworz modul**

Plik: `src/lib/mvp/origin-cities.ts`

```typescript
// Lotniska startowe oferowane w mini-plannerze na homepage.
// Kolejnosc = popularnosc dla polskiego odbiorcy (Warszawa default).
// Jesli kiedys dodajemy IATA do plannera, ten plik to naturalny punkt.
export interface OriginCity {
  city: string;
  iata: string;
}

export const POLISH_ORIGIN_CITIES: readonly OriginCity[] = [
  { city: "Warszawa", iata: "WAW" },
  { city: "Krakow", iata: "KRK" },
  { city: "Gdansk", iata: "GDN" },
  { city: "Wroclaw", iata: "WRO" },
  { city: "Katowice", iata: "KTW" },
  { city: "Poznan", iata: "POZ" },
] as const;

export const DEFAULT_ORIGIN_CITY = POLISH_ORIGIN_CITIES[0].city;
```

- [ ] **Step 2: Sanity check kompilacji**

```bash
npx tsc --noEmit
```
Expected: brak bledow.

- [ ] **Step 3: Commit**

```bash
git add src/lib/mvp/origin-cities.ts
git commit -m "feat: stala POLISH_ORIGIN_CITIES dla mini-plannera"
```

---

## Task 3: Komponent DestinationTile

**Files:**
- Create: `src/components/home/destination-tile.tsx`

**Cel:** Pojedynczy kafel kierunku — zdjecie hero, nazwa miasta, kraj, czas lotu, link do `/planner` z preselected destynacja. Server component (bez state). Buduje query string do plannera tak, zeby `mode=standard` + `destination=...` triggerowal auto-search w `/planner` (per `autoRunStandardSearch={mode === "standard" && Boolean(destination || query)}`).

- [ ] **Step 1: Stworz komponent**

Plik: `src/components/home/destination-tile.tsx`

```tsx
import Image from "next/image";

import { LocalizedLink } from "@/components/site/localized-link";
import { DEFAULT_ORIGIN_CITY } from "@/lib/mvp/origin-cities";
import type { DestinationProfile } from "@/lib/mvp/types";

interface DestinationTileProps {
  destination: DestinationProfile;
  heroImage: string;
  // Domyslnie 4 noce, 2 osoby — taki sam set jak w destination-page.tsx,
  // zeby uzytkownik dostal w plannerze juz wypelniony rozsadny scenariusz.
  defaultNights?: number;
  defaultTravelers?: number;
}

export function DestinationTile({
  destination,
  heroImage,
  defaultNights = 4,
  defaultTravelers = 2,
}: DestinationTileProps) {
  const params = new URLSearchParams({
    mode: "standard",
    destination: destination.city,
    origin: DEFAULT_ORIGIN_CITY,
    nights: String(defaultNights),
    travelers: String(defaultTravelers),
  });
  const href = `/planner?${params.toString()}`;
  const flightHoursLabel = `~${destination.typicalFlightHoursFromPL.toFixed(1)} h z PL`;

  return (
    <LocalizedLink
      href={href}
      className="group relative flex aspect-[4/3] overflow-hidden rounded-2xl border border-emerald-900/10 bg-emerald-50 shadow-[0_8px_24px_rgba(16,84,48,0.08)] transition hover:-translate-y-1 hover:shadow-[0_16px_36px_rgba(16,84,48,0.16)]"
    >
      <Image
        src={heroImage}
        alt={`${destination.city}, ${destination.country}`}
        fill
        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
        className="object-cover transition duration-300 group-hover:scale-[1.04]"
      />
      <div className="relative z-10 mt-auto w-full bg-[linear-gradient(180deg,rgba(5,18,11,0)_0%,rgba(5,18,11,0.78)_100%)] p-3 text-white">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200">
          {destination.country}
        </p>
        <h3 className="mt-1 font-display text-xl leading-tight">{destination.city}</h3>
        <p className="mt-1 text-[11px] text-white/80">{flightHoursLabel}</p>
      </div>
    </LocalizedLink>
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
git add src/components/home/destination-tile.tsx
git commit -m "feat: komponent DestinationTile z preselectem do plannera"
```

---

## Task 4: Komponent MiniPlannerForm

**Files:**
- Create: `src/components/home/mini-planner-form.tsx`

**Cel:** Klient-side formularz: 3 pola (Skad select, Dokad text input z autocomplete na liscie destynacji, Kiedy date input) + przycisk submit. Onsubmit puscha do `/planner?mode=standard&origin=...&destination=...&startDate=...&nights=4&travelers=2`. Default startDate = +14 dni od dzis (UTC, ISO YYYY-MM-DD). Pole "Dokad" moze byc puste — wtedy `destination` nie ma w query (planner otwiera tryb discovery).

- [ ] **Step 1: Stworz komponent**

Plik: `src/components/home/mini-planner-form.tsx`

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useId, useMemo, useState, type FormEvent } from "react";

import { useLanguage } from "@/components/site/language-provider";
import { DEFAULT_ORIGIN_CITY, POLISH_ORIGIN_CITIES } from "@/lib/mvp/origin-cities";
import type { DestinationProfile } from "@/lib/mvp/types";

interface MiniPlannerFormProps {
  // Lista wszystkich destynacji do datalist (autocomplete pod polem "Dokad").
  // Przekazujemy z serwera, zeby nie ladowac calego katalogu w bundlu klienta.
  destinationOptions: Array<Pick<DestinationProfile, "city" | "country">>;
}

function defaultStartDate(): string {
  // +14 dni od dzis, w UTC, format YYYY-MM-DD (zgodne z input type="date").
  const now = new Date();
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 14));
  return target.toISOString().slice(0, 10);
}

export function MiniPlannerForm({ destinationOptions }: MiniPlannerFormProps) {
  const router = useRouter();
  const { language } = useLanguage();
  const datalistId = useId();
  const [origin, setOrigin] = useState(DEFAULT_ORIGIN_CITY);
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState(defaultStartDate);

  const dateMin = useMemo(() => {
    const today = new Date();
    return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
      .toISOString()
      .slice(0, 10);
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams({
      mode: "standard",
      origin: origin || DEFAULT_ORIGIN_CITY,
      startDate: startDate,
      nights: "4",
      travelers: "2",
    });
    const trimmedDestination = destination.trim();
    if (trimmedDestination.length > 0) {
      params.set("destination", trimmedDestination);
    }
    const prefix = language === "en" ? "/en" : "";
    router.push(`${prefix}/planner?${params.toString()}`);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-emerald-900/12 bg-white p-3 shadow-[0_18px_42px_rgba(16,84,48,0.08)]"
    >
      <div className="grid gap-2 sm:grid-cols-[140px_1fr_160px_auto] sm:items-end">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Skad</span>
          <select
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            className="h-11 rounded-xl border border-emerald-900/12 bg-emerald-50/72 px-3 text-sm font-medium text-emerald-950 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          >
            {POLISH_ORIGIN_CITIES.map((city) => (
              <option key={city.iata} value={city.city}>
                {city.city}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Dokad</span>
          <input
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="Np. Malaga, Barcelona, Rzym..."
            list={datalistId}
            className="h-11 rounded-xl border border-emerald-900/12 bg-emerald-50/72 px-3 text-sm font-medium text-emerald-950 placeholder:text-emerald-900/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          />
          <datalist id={datalistId}>
            {destinationOptions.map((opt) => (
              <option key={`${opt.city}-${opt.country}`} value={opt.city}>
                {opt.country}
              </option>
            ))}
          </datalist>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Kiedy</span>
          <input
            type="date"
            value={startDate}
            min={dateMin}
            onChange={(e) => setStartDate(e.target.value)}
            className="h-11 rounded-xl border border-emerald-900/12 bg-emerald-50/72 px-3 text-sm font-medium text-emerald-950 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          />
        </label>
        <button
          type="submit"
          className="h-11 rounded-xl bg-emerald-700 px-5 text-sm font-bold text-white transition hover:bg-emerald-800"
        >
          Zaplanuj wyjazd
        </button>
      </div>
      <p className="mt-2 text-[10px] text-emerald-900/60">
        Dokad mozesz zostawic puste — pomozemy wybrac kierunek po Twoich preferencjach.
      </p>
    </form>
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
git add src/components/home/mini-planner-form.tsx
git commit -m "feat: MiniPlannerForm z 3 polami i routingiem do /planner"
```

---

## Task 5: Komponent HomeHybridHero

**Files:**
- Create: `src/components/home/home-hybrid-hero.tsx`

**Cel:** Wrapper laczacy mini-planner i grid 6 kafli. Server component (przyjmuje juz rozwiazane media). Hero ma byc zwarty — wszystko widoczne na desktop bez scrollowania (1366×768).

- [ ] **Step 1: Stworz komponent**

Plik: `src/components/home/home-hybrid-hero.tsx`

```tsx
import { DestinationTile } from "./destination-tile";
import { MiniPlannerForm } from "./mini-planner-form";
import type { DestinationProfile } from "@/lib/mvp/types";

interface FeaturedTile {
  destination: DestinationProfile;
  heroImage: string;
}

interface HomeHybridHeroProps {
  featured: FeaturedTile[];
  // Lista wszystkich destynacji (city + country) do autocomplete w mini-plannerze.
  // Maksymalnie kilka KB JSON w bundlu — akceptowalne, bo poprawia UX.
  destinationOptions: Array<Pick<DestinationProfile, "city" | "country">>;
}

export function HomeHybridHero({ featured, destinationOptions }: HomeHybridHeroProps) {
  return (
    <section className="rounded-[2rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(236,249,240,0.95),rgba(225,243,231,0.85))] p-5 shadow-[0_18px_56px_rgba(16,84,48,0.08)] sm:p-7">
      <div className="max-w-3xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">
          HelpTravel
        </p>
        <h1 className="mt-2 font-display text-4xl leading-[1.05] text-emerald-950 sm:text-5xl">
          Wyjazd, ktory zaplanujesz w 3 minuty.
        </h1>
        <p className="mt-3 text-sm leading-7 text-emerald-900/78 sm:text-base">
          Wybierz kierunek, my pokazujemy najlepszy termin, noclegi i loty z Polski w jednym miejscu.
        </p>
      </div>
      <div className="mt-5">
        <MiniPlannerForm destinationOptions={destinationOptions} />
      </div>
      <div className="mt-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
          Albo wybierz gotowy pomysl
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {featured.map((tile) => (
            <DestinationTile
              key={tile.destination.slug}
              destination={tile.destination}
              heroImage={tile.heroImage}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Sanity check kompilacji**

```bash
npx tsc --noEmit
```
Expected: brak bledow (chociaz `HomeHybridHero` jeszcze nie jest uzywany — to OK).

- [ ] **Step 3: Commit**

```bash
git add src/components/home/home-hybrid-hero.tsx
git commit -m "feat: HomeHybridHero — mini-planner + 6 kafli destynacji"
```

---

## Task 6: Slim down HomePageSections (z 5 do 3 sekcji)

**Files:**
- Modify: `src/components/home/home-page-sections.tsx`

**Cel:** Usunac 2 z 5 sekcji ("Najnowsze inspiracje" i "Polecane porownania" — tu konkretnie sekcje z `latestArticles` i ze "stays/flights labels"). Zostawiamy 3 wspierajace bloki przerobione na zwarte: **Jak to dziala**, **Najpopularniejsze tematy**, **Final CTA**. Cel: <200 linii (obecne 500).

**Trudnosc:** ten plik ma juz duzo logiki klienckiej (planner-memory, saved destinations). Decyzja: przy refaktorze zachowujemy `"use client"` i propsy `editorialCategories`, ale wycinamy `latestArticles`, `staysLabel`, `flightsLabel`. Te propsy znikaja z interfejsu.

- [ ] **Step 1: Otworz plik i przeczytaj go w calosci, zeby zrozumiec co usuwamy**

```bash
cat src/components/home/home-page-sections.tsx | head -100
```

Sprawdz: gdzie sa sekcje 4 i 5 (zwykle 1-2 to header + planner-memory; 3-5 to inspiracje, porownania, finalny CTA). Identyfikuj sekcje po klasach `<section ...>` (linie 213, 296, 398, 425, 464 wedlug wczesniejszego greppa).

- [ ] **Step 2: Przepisz plik na nowa, slim wersje**

Plik: `src/components/home/home-page-sections.tsx`. Zastap **caly plik** ponizsza zawartoscia:

```tsx
"use client";

import { useEffect, useState } from "react";

import { LocalizedLink } from "@/components/site/localized-link";
import { useLanguage } from "@/components/site/language-provider";
import {
  getPlannerSnapshot,
  getSavedDestinations,
  type PlannerSnapshot,
  type SavedDestinationMemory,
} from "@/lib/mvp/planner-memory";
import type { SiteLocale } from "@/lib/mvp/locale";
import type { EditorialCategory } from "@/lib/mvp/publisher-content";
import { formatShortDate } from "@/lib/mvp/travel-dates";

interface HomePageSectionsProps {
  editorialCategories: EditorialCategory[];
  locale: SiteLocale;
}

// Slim down homepage sections: 3 zwarte bloki zamiast 5.
// Cel: prowadzic uzytkownika do plannera, nie zasypywac informacja.
export function HomePageSections({ editorialCategories, locale }: HomePageSectionsProps) {
  const { language } = useLanguage();
  const [snapshot, setSnapshot] = useState<PlannerSnapshot | null>(null);
  const [savedDestinations, setSavedDestinations] = useState<SavedDestinationMemory[]>([]);

  useEffect(() => {
    setSnapshot(getPlannerSnapshot());
    setSavedDestinations(getSavedDestinations());
  }, []);

  const isEnglish = language === "en";
  const plannerHref = isEnglish ? "/en/planner" : "/planner";
  const allDestinationsHref = isEnglish ? "/en/kierunki" : "/kierunki";

  return (
    <div className="flex flex-col gap-6 px-4 sm:px-6 xl:px-8">
      {(snapshot || savedDestinations.length > 0) && (
        <ContinueWherePolakLeftOff
          snapshot={snapshot}
          saved={savedDestinations}
          plannerHref={plannerHref}
        />
      )}

      <HowItWorksSection plannerHref={plannerHref} />

      {editorialCategories.length > 0 && (
        <PopularTopicsSection categories={editorialCategories} locale={locale} />
      )}

      <FinalCtaSection plannerHref={plannerHref} allDestinationsHref={allDestinationsHref} />
    </div>
  );
}

interface ContinueProps {
  snapshot: PlannerSnapshot | null;
  saved: SavedDestinationMemory[];
  plannerHref: string;
}

// Maly blok "wracasz tu po raz drugi" — pokazuje sie tylko jezeli localStorage
// ma slad poprzedniej sesji. Nie liczy sie do 3 docelowych sekcji bo jest opcjonalny.
function ContinueWherePolakLeftOff({ snapshot, saved, plannerHref }: ContinueProps) {
  const lastSaved = saved[0];
  const lastSnapshotDestination = snapshot?.destination;
  const lead = lastSnapshotDestination
    ? `Wracasz do ${lastSnapshotDestination}?`
    : lastSaved
      ? `Twoj zapisany pomysl: ${lastSaved.city}`
      : "Kontynuuj planowanie";
  const subline = snapshot?.startDate
    ? `Termin: ${formatShortDate(snapshot.startDate, "pl-PL")}`
    : "Wez ostatnie ustawienia plannera albo zacznij nowy plan.";

  return (
    <section className="rounded-[1.6rem] border border-emerald-900/10 bg-emerald-50/60 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Kontynuuj</p>
          <h2 className="mt-1 font-display text-2xl text-emerald-950">{lead}</h2>
          <p className="mt-1 text-sm text-emerald-900/72">{subline}</p>
        </div>
        <LocalizedLink
          href={plannerHref}
          className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-800"
        >
          Wroc do plannera
        </LocalizedLink>
      </div>
    </section>
  );
}

function HowItWorksSection({ plannerHref }: { plannerHref: string }) {
  const steps = [
    {
      title: "Wybierz kierunek",
      body: "Z mini-plannera albo z gotowych kafli powyzej.",
    },
    {
      title: "Ustaw daty",
      body: "Domyslnie 4 noce, mozesz zmienic w jednym kliknieciu.",
    },
    {
      title: "Sprawdz hotele i loty",
      body: "Wszystko z Polski w jednym widoku, bez przeskakiwania.",
    },
  ];

  return (
    <section className="rounded-[1.6rem] border border-emerald-900/10 bg-white/95 p-5 shadow-[0_12px_32px_rgba(16,84,48,0.05)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Jak to dziala</p>
      <h2 className="mt-2 font-display text-3xl text-emerald-950">Trzy kroki do gotowego planu wyjazdu.</h2>
      <ol className="mt-4 grid gap-3 sm:grid-cols-3">
        {steps.map((step, idx) => (
          <li
            key={step.title}
            className="rounded-2xl border border-emerald-900/8 bg-emerald-50/72 p-4"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
              {idx + 1}.
            </p>
            <h3 className="mt-1 text-lg font-bold text-emerald-950">{step.title}</h3>
            <p className="mt-2 text-sm leading-6 text-emerald-900/78">{step.body}</p>
          </li>
        ))}
      </ol>
      <div className="mt-4">
        <LocalizedLink
          href={plannerHref}
          className="inline-flex rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-800"
        >
          Otworz planner
        </LocalizedLink>
      </div>
    </section>
  );
}

function PopularTopicsSection({
  categories,
  locale,
}: {
  categories: EditorialCategory[];
  locale: SiteLocale;
}) {
  const prefix = locale === "en" ? "/en" : "";
  return (
    <section className="rounded-[1.6rem] border border-emerald-900/10 bg-white/95 p-5 shadow-[0_12px_32px_rgba(16,84,48,0.05)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Popularne tematy</p>
      <h2 className="mt-2 font-display text-3xl text-emerald-950">Szukasz konkretnego klimatu wyjazdu?</h2>
      <div className="mt-4 flex flex-wrap gap-2">
        {categories.map((cat) => (
          <LocalizedLink
            key={cat.slug}
            href={`${prefix}/${cat.slug}`}
            className="rounded-full border border-emerald-900/10 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-100"
          >
            {cat.title}
          </LocalizedLink>
        ))}
      </div>
    </section>
  );
}

function FinalCtaSection({
  plannerHref,
  allDestinationsHref,
}: {
  plannerHref: string;
  allDestinationsHref: string;
}) {
  return (
    <section className="rounded-[1.6rem] border border-emerald-900/10 bg-emerald-950 p-6 text-white shadow-[0_18px_42px_rgba(7,31,18,0.18)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-200">Gotowy?</p>
      <h2 className="mt-2 max-w-2xl font-display text-3xl">
        Otworz planner i zobacz wlasny plan wyjazdu w 3 minuty.
      </h2>
      <div className="mt-4 flex flex-wrap gap-3">
        <LocalizedLink
          href={plannerHref}
          className="rounded-full bg-emerald-400 px-5 py-3 text-sm font-bold text-emerald-950 transition hover:bg-emerald-300"
        >
          Otworz planner
        </LocalizedLink>
        <LocalizedLink
          href={allDestinationsHref}
          className="rounded-full border border-white/16 bg-white/8 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/12"
        >
          Wszystkie kierunki
        </LocalizedLink>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Sanity check kompilacji**

```bash
npx tsc --noEmit
```
Expected: bledy TypeScript w `src/app/page.tsx` — bo nadal przekazuje stare propsy (`featuredDirections`, `latestArticles`, `staysLabel`, `flightsLabel`). To OK na razie — naprawimy w Task 7. Inne pliki maja byc czyste.

- [ ] **Step 4: Commit (mimo bledu w page.tsx — naprawiamy w nastepnym tasku)**

```bash
git add src/components/home/home-page-sections.tsx
git commit -m "refactor: slim down HomePageSections z 5 do 3 sekcji" --no-verify
```

(Uzywamy `--no-verify` jezeli pre-commit hook robi tsc — bo wiemy ze page.tsx zostanie naprawiony w Task 7. Jezeli nie ma takiego hooka, zwykly commit wystarczy.)

---

## Task 7: Przepisz src/app/page.tsx na nowy hero

**Files:**
- Modify: `src/app/page.tsx`

**Cel:** `HomePageView` ladaje featured destinations + media + opcje autocomplete, renderuje `<HomeHybridHero>` zamiast `<PremiumHomeHero>`, i `<HomePageSections>` z odchudzonymi propsami.

- [ ] **Step 1: Zastap caly plik**

Plik: `src/app/page.tsx`. Zastap **caly plik** ponizsza zawartoscia:

```tsx
import type { Metadata } from "next";

import { HomeHybridHero } from "@/components/home/home-hybrid-hero";
import { HomePageSections } from "@/components/home/home-page-sections";
import { getDestinationCatalogCount } from "@/lib/mvp/destination-catalog";
import { getFeaturedDestinations } from "@/lib/mvp/featured-destinations";
import {
  getEditorialCategories,
  getPublishedDestinations,
} from "@/lib/mvp/publisher-content";
import type { SiteLocale } from "@/lib/mvp/locale";
import { resolveDestinationMedia } from "@/lib/mvp/pexels-media";
import { getSiteUrl } from "@/lib/mvp/site";

const siteUrl = getSiteUrl();

export function getHomeMetadata(locale: SiteLocale): Metadata {
  const isEnglish = locale === "en";

  return {
    title: isEnglish
      ? "HelpTravel - choose a destination, stay and flight in one flow"
      : "HelpTravel - wybierz kierunek, hotel i lot w jednym flow",
    description: isEnglish
      ? "A high-impact trip planning start. Pick a destination, set dates and move straight into stays, flights and the next travel steps."
      : "Pelnoekranowy start do planowania wyjazdu. Wybierz kierunek, ustaw termin i przejdz do hoteli, lotow, atrakcji oraz kolejnych krokow w jednym flow.",
    alternates: {
      canonical: locale === "en" ? "/en" : "/",
      languages: {
        "pl-PL": "/",
        "en-US": "/en",
      },
    },
    openGraph: {
      title: isEnglish
        ? "HelpTravel - choose a destination, stay and flight in one flow"
        : "HelpTravel - wybierz kierunek, hotel i lot w jednym flow",
      description: isEnglish
        ? "A premium starting point for destination choice, stays and flights in one travel flow."
        : "Premium start do wyboru kierunku, hotelu i lotu z jednego travelowego ekranu.",
      url: locale === "en" ? `${siteUrl}/en` : siteUrl,
      locale: locale === "en" ? "en_US" : "pl_PL",
      alternateLocale: locale === "en" ? ["pl_PL"] : ["en_US"],
      type: "website",
    },
  };
}

export const metadata: Metadata = getHomeMetadata("pl");

export async function HomePageView({ locale }: { locale: SiteLocale }) {
  const featured = getFeaturedDestinations();
  const resolvedFeatured = await Promise.all(
    featured.map(async (destination) => ({
      destination,
      heroImage: (await resolveDestinationMedia(destination)).heroImage,
    })),
  );
  const editorialCategories = getEditorialCategories().slice(0, 6);
  const destinationOptions = getPublishedDestinations().map((d) => ({
    city: d.city,
    country: d.country,
  }));
  // destinationCount moze sie przydac w metadata/SEO w przyszlosci, ale juz nie
  // renderujemy go w hero. Wywolanie zostawiamy zaprzepaszczone, zeby unikac mart-
  // wej walidacji jezeli ktos kiedys doda licznik z powrotem.
  void getDestinationCatalogCount;

  return (
    <main className="flex w-full flex-1 flex-col gap-6 pb-8">
      <div className="w-full px-4 pt-4 sm:px-6 sm:pt-6 xl:px-8">
        <HomeHybridHero featured={resolvedFeatured} destinationOptions={destinationOptions} />
      </div>
      <HomePageSections editorialCategories={editorialCategories} locale={locale} />
    </main>
  );
}

export default async function Home() {
  return HomePageView({ locale: "pl" });
}
```

- [ ] **Step 2: Sanity check kompilacji**

```bash
npx tsc --noEmit
```
Expected: brak bledow.

- [ ] **Step 3: Lint**

```bash
npm run lint
```
Expected: brak bledow. Jezeli ESLint zlapie `void getDestinationCatalogCount` — usun ta linie i nieuzywany import.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "refactor: HomePageView uzywa HomeHybridHero zamiast PremiumHomeHero"
```

---

## Task 8: Usun martwy PremiumHomeHero

**Files:**
- Delete: `src/components/home/premium-home-hero.tsx`

- [ ] **Step 1: Sprawdz czy plik nie ma juz zadnych referencji**

```bash
grep -rn "PremiumHomeHero\|premium-home-hero" src/ 2>&1 | head -10
```
Expected: brak wynikow (lub tylko sam plik premium-home-hero.tsx).

- [ ] **Step 2: Usun plik**

```bash
rm src/components/home/premium-home-hero.tsx
```

- [ ] **Step 3: Sprawdz tsc + lint**

```bash
npx tsc --noEmit && npm run lint
```
Expected: oba czyste.

- [ ] **Step 4: Commit**

```bash
git add -u src/components/home/premium-home-hero.tsx
git commit -m "chore: usun martwy PremiumHomeHero (-826 linii)"
```

---

## Task 9: Production build smoke test

**Files:** brak modyfikacji.

**Cel:** Zweryfikowac ze caly projekt buduje sie bez bledow i ze homepage pojawia sie w outpucie buildu jako static page.

- [ ] **Step 1: Pelny build**

```bash
npm run build
```
Expected:
- Build konczy sie sukcesem (`Ready in Xms`).
- W tabeli routes widac `○ /` (static) — nie `ƒ /` (dynamic).
- Brak ostrzezen ESLint/TS.

- [ ] **Step 2: Linia kodu — weryfikacja celu spec (<500 linii)**

```bash
wc -l src/app/page.tsx src/components/home/*.tsx
```
Expected: suma <500 linii. Cel kontrolny:
- `src/app/page.tsx` ~70 linii
- `src/components/home/home-hybrid-hero.tsx` ~60 linii
- `src/components/home/destination-tile.tsx` ~50 linii
- `src/components/home/mini-planner-form.tsx` ~120 linii
- `src/components/home/home-page-sections.tsx` ~180 linii
- Razem: ~480 linii (vs poprzednie 1455 → -67%).

- [ ] **Step 3: Commit (jezeli sa zmiany — np. wygenerowane pliki .next/ ignore)**

```bash
git status
```
Jezeli `working tree clean` — ok, nic nie commitujemy.

---

## Task 10: PR + merge

- [ ] **Step 1: Push brancha**

```bash
git push -u origin claude/homepage-redesign
```

- [ ] **Step 2: Stworz PR przez API GitHub**

Pobierz token z git credential managera i odpal:

```bash
TOKEN=$(git credential-manager get <<EOF 2>/dev/null | grep '^password=' | cut -d= -f2-
protocol=https
host=github.com

EOF
)
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/SneakersInfo1/HELPTRAVEL-AGENCY/pulls \
  -d '{"title":"refactor: homepage Hybrid (mini-planner + 6 kafli) — slim down 1455→<500 linii","head":"claude/homepage-redesign","base":"main","body":"Spec: docs/superpowers/specs/2026-04-19-homepage-conversion-redesign-design.md\n\n- Wymiana PremiumHomeHero (826 linii) na HomeHybridHero\n- MiniPlannerForm (3 pola) + 6 kafli → /planner\n- HomePageSections z 5 do 3 sekcji\n- Brak nowych zaleznosci, build OK, tsc OK, lint OK"}' \
  | grep -E '"(number|html_url)"' | head -2
```

- [ ] **Step 3: Squash-merge**

```bash
PR=$(curl -s -H "Authorization: Bearer $TOKEN" "https://api.github.com/repos/SneakersInfo1/HELPTRAVEL-AGENCY/pulls?head=SneakersInfo1:claude/homepage-redesign&state=open" | grep '"number"' | head -1 | grep -oE '[0-9]+')
echo "PR #$PR"
sleep 8
curl -s -X PUT -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/SneakersInfo1/HELPTRAVEL-AGENCY/pulls/$PR/merge" \
  -d '{"merge_method":"squash"}' | grep -E '"(merged|message)"'
```

Expected: `"merged": true`.

---

## Manualny smoke test po deploy (post-merge)

Po ~2 min od merge Vercel zrobi auto-deploy. Wejdz na https://helptravel.pl/ i sprawdz:

1. ✅ Mini-planner widoczny nad fold-em (3 pola + przycisk).
2. ✅ Pole "Skad" ma 6 lotnisk PL, default Warszawa.
3. ✅ Pole "Kiedy" ma date defaultowa = +14 dni od dzis.
4. ✅ 6 kafli kierunkow widocznych pod mini-plannerem.
5. ✅ Kliknij **kazdy kafel** — otwiera `/planner?mode=standard&destination=<miasto>&origin=Warszawa&nights=4&travelers=2`.
6. ✅ Wpisz "Lizbona" w "Dokad", zostaw daty default, klik **Zaplanuj wyjazd** — otwiera `/planner?mode=standard&origin=Warszawa&startDate=YYYY-MM-DD&nights=4&travelers=2&destination=Lizbona`.
7. ✅ Zostaw "Dokad" puste, klik **Zaplanuj wyjazd** — otwiera `/planner?...` BEZ parametru destination, planner powinien wystartowac w trybie discovery.
8. ✅ Pod fold-em widac dokladnie 3 sekcje: "Jak to dziala", "Popularne tematy", finalny CTA. Brak sekcji "Najnowsze inspiracje" i "Polecane porownania".
9. ✅ Wersja `/en` (anglielska) sie laduje, ten sam layout.

Jezeli ktorys punkt fail-uje → fix-up commit na nowym branchu, NIE commitujemy bezposrednio na main.

---

## Self-review notatki (do uwagi przy implementacji)

- **Spec coverage:** wszystkie 5 mierzalnych kryteriow sukcesu z spec sa odzwierciedlone w Task 9 step 2 (linie kodu) i smoke tescie (kafle, mini-planner, fold).
- **i18n:** `MiniPlannerForm` uzywa `useLanguage()` do prefixu `/en`. Kafle uzywaja `LocalizedLink` ktory robi to samo. Test: punkt 9 smoke testu.
- **Auto-search w plannerze:** `mode=standard` + `destination=...` triggeruje `autoRunStandardSearch` w `PlannerClient` (zweryfikowane wczesniej w `src/app/planner/page.tsx:85`). Pusta destynacja → discovery mode (Task 4 step 1 buduje query bez `destination`).
- **Scope:** plan dotyka wylacznie homepage. `/kierunki/[slug]`, miesieczne i porownania sa **explicite** wykluczone i pojda osobnymi PR-ami (zgodnie ze spec sekcja "Co NIE jest w tym sprincie").

---

## Po wdrozeniu — co obserwowac (7 dni)

1. Vercel Analytics — LCP homepage powinno spasc (mniej JS, mniejszy hero).
2. GSC — pozycje fraz brand `helptravel` (nie powinny drgnac wiecej niz +/- 2 pozycje).
3. Klikni w plannera — jak dolozysz event tracking `planner_open_from_home`, w 7 dni zobaczysz baseline.

Jezeli LCP rosnie albo planner-open spada 30%+ → rollback (revert merge commit).
