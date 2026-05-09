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
import { useEffect, useMemo, useState } from "react";

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
    a.board.join(",") === b.board.join(",")
  );
}

export function FiltersSidebar() {
  const router = useRouter();
  const sp = useSearchParams();
  const urlDraft = useMemo(() => readDraftFromUrl(sp), [sp]);
  const [draft, setDraft] = useState<Draft>(urlDraft);
  const [openOnMobile, setOpenOnMobile] = useState(false);

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
    router.replace(`/hotele/szukaj?${next.toString()}`, { scroll: false });
    setOpenOnMobile(false);
  };

  const reset = () => {
    setDraft(EMPTY_DRAFT);
    // also clear the URL — the user's intent is "show me everything".
    const next = new URLSearchParams(sp.toString());
    for (const k of [
      "minPrice", "maxPrice", "minStars", "minRating",
      "cancel", "sort", "q", "propertyType", "board",
    ]) {
      next.delete(k);
    }
    router.replace(`/hotele/szukaj?${next.toString()}`, { scroll: false });
  };

  const toggle = (key: "propertyType" | "board", value: string) => {
    setDraft((d) => {
      const current = d[key];
      const has = current.includes(value);
      return { ...d, [key]: has ? current.filter((v) => v !== value) : [...current, value] };
    });
  };

  return (
    <>
      {/* Mobile trigger */}
      <button
        type="button"
        onClick={() => setOpenOnMobile(true)}
        className="mb-3 inline-flex h-10 items-center justify-center rounded-lg border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-800 lg:hidden"
      >
        Filtry i sortowanie {stagedCount > 0 ? `(${stagedCount})` : ""}
      </button>

      <aside
        className={
          openOnMobile
            ? "fixed inset-0 z-40 flex flex-col bg-white lg:static lg:block"
            : "hidden lg:block"
        }
      >
        {openOnMobile && (
          <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3 lg:hidden">
            <h2 className="text-lg font-semibold">Filtry</h2>
            <button
              type="button"
              onClick={() => setOpenOnMobile(false)}
              className="rounded-md px-3 py-1 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              Zamknij
            </button>
          </div>
        )}
        <div className={`space-y-6 lg:sticky lg:top-20 ${openOnMobile ? "flex-1 overflow-auto p-5" : ""}`}>
          {/* Apply / reset row at top — Booking-style. The whole sidebar is
              sticky on desktop, so the action stays in view as the user
              scrolls through filter content. */}
          <div className="-mx-1 flex gap-2 border-b border-neutral-200 pb-4">
            <button
              type="button"
              onClick={reset}
              className="rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
            >
              Wyczyść
            </button>
            <button
              type="button"
              onClick={apply}
              disabled={!dirty}
              className="flex-1 rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-default disabled:bg-emerald-700/40"
            >
              {dirty ? `Zastosuj filtry${stagedCount > 0 ? ` (${stagedCount})` : ""}` : "Filtry zastosowane"}
            </button>
          </div>

          <FilterBlock title="Sortuj">
            <select
              value={draft.sort}
              onChange={(e) => setDraft((d) => ({ ...d, sort: e.target.value }))}
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </FilterBlock>

          <FilterBlock title="Cena za pobyt (PLN)">
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="numeric"
                placeholder="od"
                value={draft.minPrice}
                onChange={(e) => setDraft((d) => ({ ...d, minPrice: e.target.value }))}
                className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
              />
              <span className="text-neutral-400">—</span>
              <input
                type="number"
                inputMode="numeric"
                placeholder="do"
                value={draft.maxPrice}
                onChange={(e) => setDraft((d) => ({ ...d, maxPrice: e.target.value }))}
                className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
              />
            </div>
          </FilterBlock>

          <FilterBlock title="Standard hotelu">
            <div className="space-y-1">
              {STARS.map((s) => (
                <label key={s} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="minStars"
                    checked={String(s) === draft.minStars}
                    onChange={() => setDraft((d) => ({ ...d, minStars: String(s) }))}
                    className="h-4 w-4 accent-emerald-600"
                  />
                  <span className="text-amber-500">{"★".repeat(s)}</span>
                  <span className="text-neutral-600">i więcej</span>
                </label>
              ))}
              <button
                type="button"
                onClick={() => setDraft((d) => ({ ...d, minStars: "" }))}
                className="mt-1 text-xs font-medium text-emerald-700 hover:text-emerald-800"
              >
                Wyczyść standard
              </button>
            </div>
          </FilterBlock>

          <FilterBlock title="Ocena gości">
            <select
              value={draft.minRating}
              onChange={(e) => setDraft((d) => ({ ...d, minRating: e.target.value }))}
              className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
            >
              <option value="">Wszystkie</option>
              <option value="9">Wspaniały (9+)</option>
              <option value="8">Bardzo dobry (8+)</option>
              <option value="7">Dobry (7+)</option>
            </select>
          </FilterBlock>

          <FilterBlock title="Anulacja">
            <div className="space-y-1">
              {CANCEL.map((c) => (
                <label key={c.value} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="cancel"
                    checked={draft.cancel === c.value}
                    onChange={() => setDraft((d) => ({ ...d, cancel: c.value }))}
                    className="h-4 w-4 accent-emerald-600"
                  />
                  <span>{c.label}</span>
                </label>
              ))}
            </div>
          </FilterBlock>

          <FilterBlock title="Słowa kluczowe">
            <input
              type="text"
              placeholder="np. spa, basen, centrum"
              value={draft.q}
              onChange={(e) => setDraft((d) => ({ ...d, q: e.target.value }))}
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
            />
          </FilterBlock>

          <FilterBlock title="Typ obiektu">
            <div className="space-y-1 text-sm">
              {PROPERTY_TYPES.map((p) => (
                <label key={p.value} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={draft.propertyType.includes(p.value)}
                    onChange={() => toggle("propertyType", p.value)}
                    className="h-4 w-4 accent-emerald-600"
                  />
                  <span>{p.label}</span>
                </label>
              ))}
            </div>
          </FilterBlock>

          <FilterBlock title="Wyżywienie">
            <div className="space-y-1 text-sm">
              {BOARD_TYPES.map((b) => (
                <label key={b.value} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={draft.board.includes(b.value)}
                    onChange={() => toggle("board", b.value)}
                    className="h-4 w-4 accent-emerald-600"
                  />
                  <span>{b.label}</span>
                </label>
              ))}
            </div>
          </FilterBlock>

          {/* Udogodnienia: see Sesja C1 FIX 4 — list endpoint doesn't return
              amenities, so this filter waits for an adapter extension. UI
              kept disabled with a clear "(wkrótce)" so users see the surface
              area but don't get fooled by a no-op. */}
          <FilterBlock title="Udogodnienia (wkrótce)">
            <div className="space-y-1 text-sm text-neutral-400">
              {["WiFi", "Parking", "Basen", "Klimatyzacja", "Śniadanie"].map((a) => (
                <label key={a} className="flex items-center gap-2 opacity-60">
                  <input type="checkbox" disabled className="h-4 w-4" />
                  <span>{a}</span>
                </label>
              ))}
            </div>
          </FilterBlock>
        </div>

        {/* Mobile-only sticky-bottom apply (desktop has it at top). */}
        {openOnMobile && (
          <div className="sticky bottom-0 mt-auto flex gap-2 border-t border-neutral-200 bg-white p-4 lg:hidden">
            <button
              type="button"
              onClick={reset}
              className="rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
            >
              Wyczyść
            </button>
            <button
              type="button"
              onClick={apply}
              disabled={!dirty}
              className="flex-1 rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-default disabled:bg-emerald-700/40"
            >
              {dirty ? `Zastosuj filtry${stagedCount > 0 ? ` (${stagedCount})` : ""}` : "Filtry zastosowane"}
            </button>
          </div>
        )}
      </aside>
    </>
  );
}

function FilterBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-neutral-900">{title}</h3>
      {children}
    </div>
  );
}

// applyFiltersAndSort lives in ./filters-logic so the server page can call
// it directly. Re-exported here for callers that already imported from
// this module pre-extraction.
export { applyFiltersAndSort } from "./filters-logic";
