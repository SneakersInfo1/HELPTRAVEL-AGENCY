# Planner cleanup — progres (resumable)

> **Cel pliku:** Mozliwosc kontynuacji bez palenia tokenow na re-discussion.
> Otworz w nowej sesji i powiedz: "Czytaj `docs/planner-cleanup-progress.md` i kontynuuj od PROGRESS POINT".

---

## Stan na dzis (2026-04-25)

### ✅ Decyzje uzytkownika (zatwierdzone)

| Q | Decyzja | Co |
|---|---|---|
| Q1 | **A** | Wyciagnac `<PlannerForm>` jako wspolny komponent. Top form i settings panel uzywaja tego samego komponentu (settings = drawer/sheet). |
| Q2 | **A** | Mobile: tylko 1 sticky bottom bar — primary "Zarezerwuj" + icon "edytuj plan". Usunac top sticky bar. |
| Q3 | **B+** | TransferOffersPanel: dziedziczy origin/date/passengers z main, zostaje tylko "Godzina przylotu". TravelPackagePanel: dziedziczy WSZYSTKIE 4 pola. Dodac w main `<PlannerForm>` checkbox "Z dziecmi" (rozwija children/infants inputs) — przekazywane do TransferOffersPanel. |
| Q4 | **A** | DecisionLenses + RemainingOptions → 1 collapsed sekcja "Inne propozycje (N)". Default: collapsed. |

### ✅ Audyt (KROK 1) — wykonany
Pelny audyt w sesji. Kluczowe znaleziska:
- 2231 LOC w `planner-client.tsx`
- 18 sekcji widoku
- 8 primary CTA jednoczesnie na ekranie wynikow
- Formularz duplikowany 2× (top + settings)
- 3 sticky warstwy mobile
- Duplikacja: `postJson` × 6, `formatMoney` × 5, `Spinner` × 7, `copy` pattern × 6
- Brak Cormorant w naglowkach planera (vs homepage)
- Brak `rounded-[2.2rem]` i `emerald-950` dark hero z homepage
- Stay 24 ofert na start (LCP killer)

### ✅ Propozycja (KROK 2) — zatwierdzona
3 etapy planera: search → wyniki (hero+tabs) → alternatywy (collapsed).
Tokeny z homepage: `font-display Cormorant_Garamond`, `emerald-950` hero, `rounded-[2.2rem]`, gradient CTA `from-amber-400 via-orange-400 to-rose-400`.

### 🟡 Implementacja (KROK 3) — 2 z 5 commitow

**PR:** https://github.com/SneakersInfo1/HELPTRAVEL-AGENCY/pull/39
**Branch:** `feat/planner-cleanup-v2`
**Status:** OTWARTE, **nie merged** — czeka na user review na Vercel preview

**Commitki ktore poszly:**
1. `4108d67` — `refactor(planner): extract shared utilities (postJson, formatMoney, Spinner)`
   - Nowe pliki: `src/lib/fetch-json.ts`, `src/lib/format.ts`, `src/components/ui/spinner.tsx`
   - Refactor 6 paneli: usuniety duplikat
2. `620a839` — `feat(planner): mobile single-CTA bottom bar + remove top sticky + tighter stay paging`
   - Usuniety top sticky bar (stary line ~1873)
   - Dodany `<MobileBottomBar>` z primary "Zarezerwuj" (uzywa `bookingDeck[0].href`) + icon "edytuj"
   - Stay initial offers: 24 → 6
   - Dodane `bookNow` keys w copy PL/EN
   - LOC `planner-client.tsx`: 2231 → 2189 (-42)

---

## ⏸ PROGRESS POINT — zostalo 3 commity

### Commit 3 (NASTEPNY) — Extract `<PlannerForm>` shared component (Q1)

**Plik nowy:** `src/components/mvp/planner-form.tsx`

**Props:**
- `mode: "discovery" | "standard"`
- `setMode`, `query`, `setQuery`, `destinationHint`, `setDestinationHint`
- `originCity`, `setOriginCity`
- `travelStartDate`, `setTravelStartDate`, `travelEndDate`, `setTravelEndDate`
- `travelers`, `setTravelers`, `rooms`, `setRooms`
- `budget`, `setBudget`, `minDays`, `setMinDays`, `maxDays`, `setMaxDays`
- `withChildren: boolean`, `setWithChildren`, `children: number`, `setChildren`, `infants: number`, `setInfants` ← **NOWE pola dla Q3**
- `onSubmit: () => void`
- `compact?: boolean` — w drawerze ukrywa H1, kompresuje padding
- `destinationSuggestions`, `onDestinationLookup` — dla autocomplete
- `presets?: { discovery: string[]; standard: string[] }` — chips z kierunkami/zapytaniami

**Co dodac w stosunku do obecnego formularza:**
- Checkbox "Z dziecmi" — gdy zaznaczony, ukazuja sie inline 2 male inputy: "Dzieci" (number 0-8) + "Niemowleta" (number 0-8)
- Caly stan ten sam co przedtem (bez dodatkowych eventow analytics — wystarcza istniejace `planner_submitted`)

**Zastapic 2 miejsca w `planner-client.tsx`:**
- Linia ~1265-1396 (top form) → `<PlannerForm ... />`
- Linia ~1945-1985 (settings panel form) → wewnatrz nowego drawera, `<PlannerForm ... compact />`

**Settings panel staje sie drawerem:**
- Komponent: `<dialog>` element (HTML native, brak nowych zaleznosci) lub fixed overlay z `position: fixed inset-0 z-50`
- Trigger: button "Edytuj plan" (juz istnieje, teraz otwiera drawer zamiast inline section)
- Animacja: `transition transform duration-200 translate-x-full` → `translate-x-0` (slide from right na desktop, slide from bottom na mobile)
- Close: backdrop click + X button + Escape key

**Verify:**
- `npx tsc --noEmit` ✓
- `npm run lint` ✓
- Test: top form i settings drawer renderuja te same pola, stan sie syncuje

**Commit:** `refactor(planner): extract PlannerForm shared component`

### Commit 4 — Clean results stage (hero + tabs + 1 primary CTA)

**Hero section** (zastapic linie ~1705-1817):
```
emerald-950 background, white text
H1: nazwa miasta (font-display Cormorant_Garamond, 5xl)
subtitle: typ wyjazdu + dni + cena od (text-emerald-200/80)
1 primary CTA "Zarezerwuj →" (gradient amber→orange→rose, text-emerald-950, uzywa bookingDeck[0].href)
icon row: ♡ zapisz (toggle), ⓘ szczegoly (rozwija why-now)
shadow: shadow-[0_28px_80px_rgba(6,29,16,0.22)]
radius: rounded-[2.2rem]
```

**Usunac Booking deck** (linie ~1818-1872) — funkcja przeniesiona do tabs.

**Tabs system** (zastapic stacked panels ~1999-2046):
```tsx
const [activeTab, setActiveTab] = useState<"stays" | "flights" | "attractions" | "cars">("stays");

<div className="flex gap-2 overflow-x-auto sm:overflow-visible">
  {[
    { key: "stays", label: "Pobyt" },
    { key: "flights", label: "Loty" },
    { key: "attractions", label: "Atrakcje" },
    { key: "cars", label: "Auta" },
  ].map((tab) => (
    <button
      key={tab.key}
      onClick={() => setActiveTab(tab.key as any)}
      className={cn(
        "shrink-0 rounded-full px-5 py-2.5 text-sm font-bold transition",
        activeTab === tab.key
          ? "bg-emerald-950 text-white"
          : "border border-emerald-900/15 text-emerald-900 hover:bg-emerald-50"
      )}
    >
      {tab.label}
    </button>
  ))}
</div>

{activeTab === "stays" && <StayOffersPanel ... />}
{activeTab === "flights" && <FlightOffersPanel ... />}
{activeTab === "attractions" && (
  <>
    <ActivityOffersPanel ... />
    <DestinationAttractionsPanel ... />
  </>
)}
{activeTab === "cars" && (
  <div className="rounded-3xl border border-emerald-900/10 bg-white p-6">
    <h3 className="text-xl font-bold">Wynajem aut w {city}</h3>
    <p className="mt-2 text-sm text-emerald-900/70">Otworz porownywarke aut u naszego partnera.</p>
    <a
      href={carRedirectHref}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => sendClientEvent("affiliate_clicked", { type: "cars", source: "planner_tab", city })}
      className="mt-4 inline-flex rounded-full bg-gradient-to-br from-amber-400 via-orange-400 to-rose-400 px-6 py-3 text-sm font-bold text-emerald-950"
    >
      Otworz porownywarke aut →
    </a>
  </div>
)}
```

**Inne porzadki:**
- Usunac `scroll-mt-36` z paneli (top sticky juz nie ma)
- Usunac dekoracyjne triple eyebrow+title+subtitle headers — bold H2/H3 only
- Sprawdzic czy `bookingDeck[0]` jest nadal computowany (trzeba zostawic — uzywany przez mobile bottom bar)

**Commit:** `feat(planner): clean results stage — Cormorant hero, tabs, single primary CTA`

### Commit 5 — Panel form inheritance (Q3)

**TransferOffersPanel:**
- USUNAC z props/state: `originCity`, `departureDate`, `passengers` (i ich inputy w UI)
- DODAC z props (przekazywane z planner-client): `originCity`, `departureDate`, `adults` (= travelers), `children` (= z main "Z dziecmi"), `infants`
- ZOSTAWIC: input "Godzina przylotu" (time, default 12:00) — to jest legitnie transfer-specific
- UI: pokazac compact summary "Z {originCity} → {city}, {departureDate}, {adults+children+infants} osob" + tylko 1 input "Godzina przylotu"

**TravelPackagePanel:**
- USUNAC wszystkie 4 inputy: origin, departure date, nights, passengers
- USUNAC odpowiedni state/setState
- DODAC z props: te same wartosci z main planner state
- UI: zamiast formularza, compact summary card "Twoja konfiguracja: {origin} → {city}, {date}, {nights} nocy, {passengers} osob" + dwa CTA "Zobacz lot" / "Zobacz hotel"

**`planner-client.tsx`:**
- Przekazac do `<TransferOffersPanel>`: `originCity`, `departureDate`, `adults={travelers}`, `children={withChildren ? children : 0}`, `infants={withChildren ? infants : 0}`
- Przekazac do `<TravelPackagePanel>`: `origin`, `departureDate`, `nights`, `passengers`

**Commit:** `feat(planner): panel form inheritance — Transfer + TravelPackage`

### Commit 6 — Collapsed "Inne propozycje" (Q4)

- Usunac DecisionLenses z obecnego miejsca (linia ~910 w planner-client.tsx — ale to memo w stalej, sprawdzic gdzie sie renderuje)
- Usunac RemainingOptions z obecnego miejsca (linia ~2046)
- Stworzyc nowy komponent `<AlternativeDestinations>` lub inline w planner-client:
```tsx
const [altOpen, setAltOpen] = useState(false);

<section className="rounded-[2.2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_18px_56px_rgba(16,84,48,0.06)]">
  <button
    type="button"
    onClick={() => setAltOpen(!altOpen)}
    aria-expanded={altOpen}
    className="flex w-full items-center justify-between"
  >
    <span className="text-base font-bold text-emerald-950">
      Inne propozycje ({remainingOptions.length})
    </span>
    <span aria-hidden className={`transition ${altOpen ? "rotate-180" : ""}`}>▼</span>
  </button>
  {altOpen && (
    <div className="mt-6 space-y-6">
      <DecisionLenses ... />
      <RemainingOptionsGrid ... />
    </div>
  )}
</section>
```
- Wszystkie istniejace `comparison_selected` analytics events ZOSTAJA

**Commit:** `feat(planner): collapse alternative destinations + decision lenses`

---

## Po commitach 3-6: 

1. `git push origin feat/planner-cleanup-v2`
2. PR #39 sie sam zaktualizuje (juz istnieje)
3. **NIE MERGE** — user chce review na Vercel preview

---

## Test plan przed merge (do uzupelnienia w PR)

- [ ] Mobile 375px (iPhone SE): forma kompaktowa, drawer dziala, sticky bottom widoczny tylko w wynikach
- [ ] Tablet 768px (iPad): tabki w 1 rzedzie, drawer slide-from-right
- [ ] Desktop 1024px+: 2-col layout, brak sticky mobile
- [ ] Affiliate clicks: kazda tab i hero CTA -> sprawdzic ze `affiliate_clicked` event leci (DevTools Network → look for analytics POST)
- [ ] Save trip: nadal dziala
- [ ] Form drawer: opens/closes z X, backdrop, Escape
- [ ] Z dziecmi checkbox: rozwija children/infants, dane leca do TransferOffersPanel
- [ ] Inne propozycje: collapsed default, click rozwija, decision lenses + grid widoczne
- [ ] Stay panel: 6 ofert na start, "Pokaz wiecej" → 12 wiecej
- [ ] tsc + lint czyste
- [ ] No console errors

## Czego NIE ruszac (przypomnienie)

- API routes `/api/*`
- `sendClientEvent(...)` — wszystkie 8 eventow musza nadal lecieć:
  - `planner_mode_selected`, `planner_submitted`, `search_saved`, `planner_restored`, `destination_saved`, `comparison_selected`, `saved_plan_clicked`, `affiliate_clicked`
- `buildRedirectHref()`, Stay22, TravelPayouts integracje
- URL strukture (`/planner` zostaje)
- Backend logic
- Brak nowych npm dependencies
- Voice copy: ASCII bez diakrytyk (planer to project standard)

---

## Inne tematy zapisane na potem

### SEO (po launchu)
- GSC monitoring: pozycja, CTR, top queries (cel: pozycja <8, CTR >1.5% w 30 dni)
- Po launch sequence (Reddit → FB → PH → HN), zbierac feedback i iterowac
- `docs/launch-kit.md` ma gotowe copy

### Other PRs juz mergedone w tej sesji
- #30 SEO title/meta + structured data
- #31 SEO internal links + enriched schema
- #32 Brand: nowe logo SVG (potem zastapione real PNG #37)
- #33 Slim planner v1 (poprzednia tura, czesciowe odchudzenie)
- #34 Analytics tracking events
- #35 Mobile perf (lazy hero backdrop)
- #36 Launch kit docs
- #37 Real logo PNG (1254×1254)
- #38 Cienszy header + transparent favicon

### Nastepne kroki po planerze (priorytet po stronie biznesu)
1. **Reddit launch** (r/Polska wieczor, post w `docs/launch-kit.md`)
2. Czekac 7-14 dni na SEO settling
3. Analiza GSC: nowe keywords + position trend
4. Iterowac na bazie REAL danych z analytics
