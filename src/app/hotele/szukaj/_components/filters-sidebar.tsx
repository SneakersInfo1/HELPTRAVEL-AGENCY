"use client";

// Sesja C1 FIX 5 — staged-then-apply filter pattern. Each control writes
// to a local draft state; the URL only updates when the user clicks
// "Zastosuj filtry". This keeps Booking-style 1-click batch filtering and
// stops six controls from triggering six re-fetches.
//
// "Wyczyść" resets the draft to defaults AND clears the URL in one go
// (Booking pattern: clear → see all results immediately).
//
// "Zastosuj filtry (N)" badge shows count of staged filters that DIFFER
// from what's currently in the URL — gives the user a visual cue that
// changes are pending.

import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowUpDown,
  BadgeCheck,
  Building2,
  CalendarCheck,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Smile,
  Sparkles,
  Star,
  UtensilsCrossed,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import {
  getFilterOptions,
  getServerFilterOptions,
  subscribeFilterOptions,
} from "@/lib/hotels/filter-options-store";

import { MiniMapPreview } from "./mini-map-preview";

/** Jedna klasa pola formularza — wcześniej co drugi input miał inny promień
 *  i inną wysokość (`rounded-lg px-3 py-2` obok `rounded px-2 py-1`), przez co
 *  panel wyglądał na złożony z części różnych stron. */
const POLE =
  "min-h-11 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm text-neutral-900 transition focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20";

const STARS = [5, 4, 3, 2, 1];
const CANCEL = [
  { value: "free", label: "Bezpłatna anulacja" },
  { value: "any", label: "Wszystkie" },
] as const;
const SORTS = [
  { value: "recommended", label: "Rekomendowane" },
  { value: "price_asc", label: "Cena rosnąco" },
  { value: "price_desc", label: "Cena malejąco" },
  { value: "rating", label: "Ocena gości" },
] as const;
const PROPERTY_TYPES = [
  { value: "hotel", label: "Hotel" },
  { value: "apartment", label: "Apartament" },
  { value: "aparthotel", label: "Aparthotel" },
  { value: "hostel", label: "Hostel" },
  { value: "guesthouse", label: "Pensjonat" },
] as const;
const BOARD_TYPES = [
  { value: "room_only", label: "Bez wyżywienia" },
  { value: "breakfast", label: "Ze śniadaniem" },
  { value: "half_board", label: "HB (ze obiadokolacją)" },
  { value: "full_board", label: "FB (pełne wyżywienie)" },
  { value: "all_inclusive", label: "All Inclusive" },
] as const;

interface Draft {
  minPrice: string;
  maxPrice: string;
  minStars: string;
  minRating: string;
  cancel: string;
  sort: string;
  q: string;
  propertyType: string[];
  board: string[];
  /** Klucze filtrów udogodnień (FACILITY_FILTERS) — pula ma tylko facilityId. */
  facilities: string[];
  /** Nazwy sieci hotelowych, dokładnie jak zwraca dostawca. */
  chains: string[];
}

const EMPTY_DRAFT: Draft = {
  minPrice: "",
  maxPrice: "",
  minStars: "",
  minRating: "",
  cancel: "any",
  sort: "recommended",
  q: "",
  propertyType: [],
  board: [],
  facilities: [],
  chains: [],
};

function readDraftFromUrl(sp: URLSearchParams): Draft {
  return {
    minPrice: sp.get("minPrice") ?? "",
    maxPrice: sp.get("maxPrice") ?? "",
    minStars: sp.get("minStars") ?? "",
    minRating: sp.get("minRating") ?? "",
    cancel: sp.get("cancel") ?? "any",
    sort: sp.get("sort") ?? "recommended",
    q: sp.get("q") ?? "",
    propertyType: (sp.get("propertyType") ?? "").split(",").filter(Boolean),
    board: (sp.get("board") ?? "").split(",").filter(Boolean),
    facilities: (sp.get("facilities") ?? "").split(",").filter(Boolean),
    // Separator „|", bo nazwy sieci potrafią zawierać przecinki.
    chains: (sp.get("chains") ?? "").split("|").filter(Boolean),
  };
}

// Count of fields that depart from default — used in "Zastosuj filtry (N)".
function countActive(d: Draft): number {
  let n = 0;
  if (d.minPrice) n++;
  if (d.maxPrice) n++;
  if (d.minStars) n++;
  if (d.minRating) n++;
  if (d.cancel !== "any") n++;
  if (d.sort !== "recommended") n++;
  if (d.q) n++;
  n += d.propertyType.length;
  n += d.board.length;
  n += d.facilities.length;
  n += d.chains.length;
  return n;
}

function draftsEqual(a: Draft, b: Draft): boolean {
  return (
    a.minPrice === b.minPrice &&
    a.maxPrice === b.maxPrice &&
    a.minStars === b.minStars &&
    a.minRating === b.minRating &&
    a.cancel === b.cancel &&
    a.sort === b.sort &&
    a.q === b.q &&
    a.propertyType.join(",") === b.propertyType.join(",") &&
    a.board.join(",") === b.board.join(",") &&
    a.facilities.join(",") === b.facilities.join(",") &&
    a.chains.join("|") === b.chains.join("|")
  );
}

export function FiltersSidebar() {
  const router = useRouter();
  const sp = useSearchParams();
  const urlDraft = useMemo(() => readDraftFromUrl(sp), [sp]);
  const [draft, setDraft] = useState<Draft>(urlDraft);
  const [openOnMobile, setOpenOnMobile] = useState(false);
  // Opcje zależne od puli wyników — publikuje je lista (patrz
  // lib/hotels/filter-options-store.ts). Snapshot serwerowy jest pusty, więc
  // SSR renderuje panel bez tych sekcji i hydracja jest spójna.
  const options = useSyncExternalStore(subscribeFilterOptions, getFilterOptions, getServerFilterOptions);

  // Reseed local draft when URL changes (e.g. when other parts of the page
  // navigate, like the search-bar resubmit).
  useEffect(() => {
    setDraft(urlDraft);
  }, [urlDraft]);

  const stagedCount = countActive(draft);
  const dirty = !draftsEqual(draft, urlDraft);

  const apply = () => {
    const next = new URLSearchParams(sp.toString());
    const set = (k: string, v: string | null) => {
      if (!v) next.delete(k);
      else next.set(k, v);
    };
    set("minPrice", draft.minPrice || null);
    set("maxPrice", draft.maxPrice || null);
    set("minStars", draft.minStars || null);
    set("minRating", draft.minRating || null);
    set("cancel", draft.cancel === "any" ? null : draft.cancel);
    set("sort", draft.sort === "recommended" ? null : draft.sort);
    set("q", draft.q || null);
    set("propertyType", draft.propertyType.length ? draft.propertyType.join(",") : null);
    set("board", draft.board.length ? draft.board.join(",") : null);
    set("facilities", draft.facilities.length ? draft.facilities.join(",") : null);
    set("chains", draft.chains.length ? draft.chains.join("|") : null);
    router.replace(`/hotele/szukaj?${next.toString()}`, { scroll: false });
    setOpenOnMobile(false);
  };

  const reset = () => {
    setDraft(EMPTY_DRAFT);
    // also clear the URL — the user's intent is "show me everything".
    const next = new URLSearchParams(sp.toString());
    for (const k of [
      "minPrice", "maxPrice", "minStars", "minRating",
      "cancel", "sort", "q", "propertyType", "board", "facilities", "chains",
    ]) {
      next.delete(k);
    }
    router.replace(`/hotele/szukaj?${next.toString()}`, { scroll: false });
  };

  const toggle = (key: "propertyType" | "board" | "facilities" | "chains", value: string) => {
    setDraft((d) => {
      const current = d[key];
      const has = current.includes(value);
      return { ...d, [key]: has ? current.filter((v) => v !== value) : [...current, value] };
    });
  };

  return (
    <>
      {/* Mobile trigger — FLOATING action button, fixed to the bottom of the
          viewport so it stays reachable while the user scrolls the results
          (previously it sat in-flow above the list: after one swipe it was
          gone and users had to scroll back up to filter — Clarity/owner
          report 2026-06-09). z-30 sits above cards, below the open sheet
          (z-40). bottom uses max() so iOS home-indicator never covers it. */}
      <button
        type="button"
        onClick={() => setOpenOnMobile(true)}
        className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-30 inline-flex h-12 -translate-x-1/2 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-emerald-700 px-6 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(6,78,59,0.35)] transition hover:bg-emerald-800 lg:hidden"
      >
        <SlidersHorizontal aria-hidden className="h-4 w-4" />
        Filtry i sortowanie
        {stagedCount > 0 && (
          <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-xs font-bold text-emerald-800">
            {stagedCount}
          </span>
        )}
      </button>

      {/* z-50 (nie z-40): otwarty panel musi przykrywać dymek konsierża
          (fixed z-40) — wcześniej FAB renderował się NAD przyciskiem
          „Zastosuj filtry" w otwartym panelu (screenshot właściciela
          2026-07-11). */}
      <aside
        className={
          openOnMobile
            ? "fixed inset-0 z-50 flex flex-col bg-white lg:static lg:block"
            : "hidden lg:block"
        }
      >
        {openOnMobile && (
          <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-2 lg:hidden">
            <h2 className="inline-flex items-center gap-2 text-lg font-bold text-neutral-900">
              <SlidersHorizontal aria-hidden className="h-5 w-5 text-emerald-700" />
              Filtry i sortowanie
            </h2>
            <button
              type="button"
              onClick={() => setOpenOnMobile(false)}
              aria-label="Zamknij filtry"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-neutral-700 transition hover:bg-neutral-100"
            >
              <X aria-hidden className="h-5 w-5" />
            </button>
          </div>
        )}
        {/* PANEL BOCZNY NIE GONI PRZEWIJANIA — decyzja produktowa właściciela
            (2026-08-11), ta sama zasada co dla paska kierunku i zakładek
            hotelu.

            Było tu `lg:sticky` z offsetem liczonym z `--ht-header-h`. Panel
            stał wtedy w oknie przez całe przewijanie listy, a mini-mapa nad
            filtrami jechała razem z nim. Teraz sidebar, mini-mapa,
            sortowanie i filtry mają JEDNO miejsce w normalnym przepływie
            dokumentu i naturalnie znikają nad krawędzią okna.

            `sticky bottom-0` przy przycisku „Zastosuj" niżej ZOSTAJE — to
            wnętrze pełnoekranowego arkusza mobilnego (własny kontekst
            przewijania), a nie przyklejenie do strony. */}
        <div
          className={`space-y-5 ${openOnMobile ? "flex-1 overflow-y-auto overscroll-contain p-5" : ""}`}
        >
          {/* Podgląd mapy NAD filtrami (brief V3 §4) — jak w interfejsie
              referencyjnym. Statyczny obraz, zero JavaScriptu mapy; pełny
              widok otwiera się jednym kliknięciem. Na telefonie pomijamy:
              tam mapa ma własny przycisk, a panel filtrów jest pełnoekranowy
              i podgląd tylko odsuwałby filtry poza ekran. */}
          <div className="hidden lg:block">
            <MiniMapPreview onOpen={() => setOpenOnMobile(false)} />
          </div>

          {/* Apply / reset row at top — Booking-style. Stoi NA GÓRZE panelu,
              bo panel nie jest już przyklejony: gość widzi akcję od razu po
              wejściu w filtry, zamiast szukać jej pod listą pól. */}
          <div className="-mx-1 flex gap-2 border-b border-neutral-200 pb-4">
            <button
              type="button"
              onClick={reset}
              disabled={stagedCount === 0}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-default disabled:opacity-45"
            >
              <RotateCcw aria-hidden className="h-4 w-4" />
              Wyczyść
            </button>
            <button
              type="button"
              onClick={apply}
              disabled={!dirty}
              // Stan „nic do zastosowania" był wyblakłym zielonym prostokątem,
              // który czytał się jak zepsuty przycisk. Teraz to neutralny,
              // spokojny komunikat — przycisk nabiera koloru marki dopiero
              // wtedy, gdy naprawdę jest co kliknąć.
              className={`inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full px-5 text-sm font-semibold transition ${
                dirty
                  ? "bg-emerald-700 text-white shadow-sm hover:bg-emerald-800"
                  : "cursor-default border border-neutral-200 bg-neutral-50 text-neutral-500"
              }`}
            >
              {dirty ? (
                <>
                  <SlidersHorizontal aria-hidden className="h-4 w-4" />
                  {`Zastosuj filtry${stagedCount > 0 ? ` (${stagedCount})` : ""}`}
                </>
              ) : (
                "Filtry zastosowane"
              )}
            </button>
          </div>

          <FilterBlock title="Sortuj" icon={ArrowUpDown}>
            <select
              value={draft.sort}
              onChange={(e) => setDraft((d) => ({ ...d, sort: e.target.value }))}
              className={POLE}
              aria-label="Sortowanie wyników"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </FilterBlock>

          <FilterBlock title="Cena za pobyt (PLN)" icon={Wallet}>
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="numeric"
                placeholder="od"
                aria-label="Cena od"
                value={draft.minPrice}
                onChange={(e) => setDraft((d) => ({ ...d, minPrice: e.target.value }))}
                className={POLE}
              />
              <span aria-hidden className="text-neutral-400">—</span>
              <input
                type="number"
                inputMode="numeric"
                placeholder="do"
                aria-label="Cena do"
                value={draft.maxPrice}
                onChange={(e) => setDraft((d) => ({ ...d, maxPrice: e.target.value }))}
                className={POLE}
              />
            </div>
          </FilterBlock>

          <FilterBlock title="Standard hotelu" icon={Star}>
            <div className="space-y-0.5">
              {STARS.map((s) => (
                <ChoiceRow key={s} checked={String(s) === draft.minStars}>
                  <input
                    type="radio"
                    name="minStars"
                    checked={String(s) === draft.minStars}
                    onChange={() => setDraft((d) => ({ ...d, minStars: String(s) }))}
                    className="h-4 w-4 accent-emerald-600"
                  />
                  <span className="text-amber-500">{"★".repeat(s)}</span>
                  <span className="text-neutral-600">i więcej</span>
                </ChoiceRow>
              ))}
              {draft.minStars && (
                <button
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, minStars: "" }))}
                  className="mt-1 inline-flex min-h-11 items-center px-2 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                >
                  Wyczyść standard
                </button>
              )}
            </div>
          </FilterBlock>

          <FilterBlock title="Ocena gości" icon={Smile}>
            <select
              value={draft.minRating}
              onChange={(e) => setDraft((d) => ({ ...d, minRating: e.target.value }))}
              className={POLE}
              aria-label="Minimalna ocena gości"
            >
              <option value="">Wszystkie</option>
              <option value="9">Wspaniały (9+)</option>
              <option value="8">Bardzo dobry (8+)</option>
              <option value="7">Dobry (7+)</option>
            </select>
          </FilterBlock>

          <FilterBlock title="Anulacja" icon={CalendarCheck}>
            <div className="space-y-0.5">
              {CANCEL.map((c) => (
                <ChoiceRow key={c.value} checked={draft.cancel === c.value}>
                  <input
                    type="radio"
                    name="cancel"
                    checked={draft.cancel === c.value}
                    onChange={() => setDraft((d) => ({ ...d, cancel: c.value }))}
                    className="h-4 w-4 accent-emerald-600"
                  />
                  <span>{c.label}</span>
                </ChoiceRow>
              ))}
            </div>
          </FilterBlock>

          <FilterBlock title="Słowa kluczowe" icon={Search}>
            <input
              type="text"
              placeholder="np. spa, basen, centrum"
              aria-label="Szukaj w nazwach obiektów"
              value={draft.q}
              onChange={(e) => setDraft((d) => ({ ...d, q: e.target.value }))}
              className={POLE}
            />
          </FilterBlock>

          <FilterBlock title="Typ obiektu" icon={Building2}>
            <div className="space-y-0.5 text-sm">
              {PROPERTY_TYPES.map((p) => (
                <ChoiceRow key={p.value} checked={draft.propertyType.includes(p.value)}>
                  <input
                    type="checkbox"
                    checked={draft.propertyType.includes(p.value)}
                    onChange={() => toggle("propertyType", p.value)}
                    className="h-4 w-4 accent-emerald-600"
                  />
                  <span>{p.label}</span>
                </ChoiceRow>
              ))}
            </div>
          </FilterBlock>

          {/* Udogodnienia i marki pojawiają się TYLKO wtedy, gdy bieżąca pula
              je zawiera (brief §9). Liczba przy etykiecie to realna liczba
              obiektów — filtr, który po kliknięciu daje zero wyników, psuje
              zaufanie do wszystkich pozostałych. */}
          {options.facilities.length > 0 && (
            <FilterBlock title="Udogodnienia" icon={Sparkles}>
              <div className="space-y-0.5 text-sm">
                {options.facilities.map(({ filter, count }) => (
                  <ChoiceRow key={filter.key} checked={draft.facilities.includes(filter.key)}>
                    <input
                      type="checkbox"
                      checked={draft.facilities.includes(filter.key)}
                      onChange={() => toggle("facilities", filter.key)}
                      className="h-4 w-4 accent-emerald-600"
                    />
                    <span className="flex-1">{filter.label}</span>
                    <span className="text-xs tabular-nums text-neutral-500">{count}</span>
                  </ChoiceRow>
                ))}
              </div>
            </FilterBlock>
          )}

          {options.chains.length > 0 && (
            <FilterBlock title="Marka hotelowa" icon={BadgeCheck}>
              <div className="space-y-0.5 text-sm">
                {options.chains.map(({ name, count }) => (
                  <ChoiceRow key={name} checked={draft.chains.includes(name)}>
                    <input
                      type="checkbox"
                      checked={draft.chains.includes(name)}
                      onChange={() => toggle("chains", name)}
                      className="h-4 w-4 accent-emerald-600"
                    />
                    <span className="flex-1 truncate" title={name}>
                      {name}
                    </span>
                    <span className="text-xs tabular-nums text-neutral-500">{count}</span>
                  </ChoiceRow>
                ))}
              </div>
            </FilterBlock>
          )}

          <FilterBlock title="Wyżywienie" icon={UtensilsCrossed}>
            <div className="space-y-0.5 text-sm">
              {BOARD_TYPES.map((b) => (
                <ChoiceRow key={b.value} checked={draft.board.includes(b.value)}>
                  <input
                    type="checkbox"
                    checked={draft.board.includes(b.value)}
                    onChange={() => toggle("board", b.value)}
                    className="h-4 w-4 accent-emerald-600"
                  />
                  <span>{b.label}</span>
                </ChoiceRow>
              ))}
            </div>
          </FilterBlock>
        </div>

        {/* Mobile-only sticky-bottom apply (desktop has it at top). */}
        {openOnMobile && (
          <div className="sticky bottom-0 mt-auto flex gap-2 border-t border-neutral-200 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:hidden">
            <button
              type="button"
              onClick={reset}
              disabled={stagedCount === 0}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-default disabled:opacity-45"
            >
              <RotateCcw aria-hidden className="h-4 w-4" />
              Wyczyść
            </button>
            <button
              type="button"
              onClick={apply}
              disabled={!dirty}
              // Stan „nic do zastosowania" był wyblakłym zielonym prostokątem,
              // który czytał się jak zepsuty przycisk. Teraz to neutralny,
              // spokojny komunikat — przycisk nabiera koloru marki dopiero
              // wtedy, gdy naprawdę jest co kliknąć.
              className={`inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full px-5 text-sm font-semibold transition ${
                dirty
                  ? "bg-emerald-700 text-white shadow-sm hover:bg-emerald-800"
                  : "cursor-default border border-neutral-200 bg-neutral-50 text-neutral-500"
              }`}
            >
              {dirty ? (
                <>
                  <SlidersHorizontal aria-hidden className="h-4 w-4" />
                  {`Zastosuj filtry${stagedCount > 0 ? ` (${stagedCount})` : ""}`}
                </>
              ) : (
                "Filtry zastosowane"
              )}
            </button>
          </div>
        )}
      </aside>
    </>
  );
}

/**
 * Blok filtra jako KARTA z ikoną.
 *
 * Wcześniej blokiem był goły nagłówek `h3` nad kontrolkami, bez żadnego
 * obramowania i bez ikony — dziewięć takich bloków jeden pod drugim czytało się
 * jak surowy formularz z lat 2000, a nie jak panel produktu (zgłoszenie
 * 2026-08-08: „filtry nie mają ikon", „wygląda cienko"). Ikona daje każdemu
 * blokowi punkt zaczepienia dla wzroku przy przewijaniu, a wspólna ramka
 * grupuje kontrolki, które do siebie należą.
 */
function FilterBlock({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-900">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
          <Icon aria-hidden className="h-4 w-4" />
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

/** Wiersz wyboru o wysokości celu dotykowego — wspólny dla radio i checkbox. */
function ChoiceRow({
  children,
  checked,
}: {
  children: React.ReactNode;
  checked: boolean;
}) {
  return (
    <label
      className={`flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-sm transition ${
        checked ? "bg-emerald-50/70 font-medium text-emerald-900" : "hover:bg-neutral-50"
      }`}
    >
      {children}
    </label>
  );
}

// applyFiltersAndSort lives in ./filters-logic so the server page can call
// it directly. Re-exported here for callers that already imported from
// this module pre-extraction.
export { applyFiltersAndSort } from "./filters-logic";
