"use client";

// URL-driven filters sidebar (desktop) + bottom-sheet trigger (mobile).
// Every filter writes to the URL so every results page is shareable.
// Per master spec §5.2.

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

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

export function FiltersSidebar() {
  const router = useRouter();
  const sp = useSearchParams();

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(sp.toString());
    if (!value) next.delete(key);
    else next.set(key, value);
    router.replace(`/hotele/szukaj?${next.toString()}`, { scroll: false });
  };

  const minPrice = sp.get("minPrice") ?? "";
  const maxPrice = sp.get("maxPrice") ?? "";
  const minStars = sp.get("minStars");
  const minRating = sp.get("minRating");
  const cancel = sp.get("cancel") ?? "any";
  const sort = sp.get("sort") ?? "recommended";

  const [openOnMobile, setOpenOnMobile] = useState(false);

  return (
    <>
      {/* Mobile trigger */}
      <button
        type="button"
        onClick={() => setOpenOnMobile(true)}
        className="mb-3 inline-flex h-10 items-center justify-center rounded-lg border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-800 lg:hidden"
      >
        Filtry i sortowanie
      </button>

      <aside
        className={
          openOnMobile
            ? "fixed inset-0 z-40 overflow-auto bg-white p-5 lg:static lg:block lg:p-0"
            : "hidden lg:block"
        }
      >
        {openOnMobile && (
          <div className="mb-4 flex items-center justify-between lg:hidden">
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
        <div className="space-y-6 lg:sticky lg:top-20">
          {/* Sort */}
          <FilterBlock title="Sortuj">
            <select
              value={sort}
              onChange={(e) => setParam("sort", e.target.value === "recommended" ? null : e.target.value)}
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </FilterBlock>

          {/* Price */}
          <FilterBlock title="Cena za pobyt (PLN)">
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="numeric"
                placeholder="od"
                value={minPrice}
                onChange={(e) => setParam("minPrice", e.target.value || null)}
                className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
              />
              <span className="text-neutral-400">—</span>
              <input
                type="number"
                inputMode="numeric"
                placeholder="do"
                value={maxPrice}
                onChange={(e) => setParam("maxPrice", e.target.value || null)}
                className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
              />
            </div>
          </FilterBlock>

          {/* Stars */}
          <FilterBlock title="Standard hotelu">
            <div className="space-y-1">
              {STARS.map((s) => (
                <label key={s} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="minStars"
                    checked={String(s) === minStars}
                    onChange={() => setParam("minStars", String(s))}
                    className="h-4 w-4 accent-emerald-600"
                  />
                  <span className="text-amber-500">{"★".repeat(s)}</span>
                  <span className="text-neutral-600">i więcej</span>
                </label>
              ))}
              <button
                type="button"
                onClick={() => setParam("minStars", null)}
                className="mt-1 text-xs font-medium text-emerald-700 hover:text-emerald-800"
              >
                Wyczyść
              </button>
            </div>
          </FilterBlock>

          {/* Guest score */}
          <FilterBlock title="Ocena gości">
            <select
              value={minRating ?? ""}
              onChange={(e) => setParam("minRating", e.target.value || null)}
              className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
            >
              <option value="">Wszystkie</option>
              <option value="9">Wspaniały (9+)</option>
              <option value="8">Bardzo dobry (8+)</option>
              <option value="7">Dobry (7+)</option>
            </select>
          </FilterBlock>

          {/* Cancellation */}
          <FilterBlock title="Anulacja">
            <div className="space-y-1">
              {CANCEL.map((c) => (
                <label key={c.value} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="cancel"
                    checked={cancel === c.value}
                    onChange={() => setParam("cancel", c.value === "any" ? null : c.value)}
                    className="h-4 w-4 accent-emerald-600"
                  />
                  <span>{c.label}</span>
                </label>
              ))}
            </div>
          </FilterBlock>

          {openOnMobile && (
            <button
              type="button"
              onClick={() => setOpenOnMobile(false)}
              className="w-full rounded-lg bg-emerald-600 py-3 text-sm font-semibold text-white"
            >
              Pokaż wyniki
            </button>
          )}
        </div>
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

export function applyFiltersAndSort<T extends {
  cheapestRate: { totalAmount: number; refundableTag?: string; cancellationDeadline?: string };
  stars?: number;
  rating?: number;
}>(
  offers: T[],
  params: {
    minPrice?: number;
    maxPrice?: number;
    minStars?: number;
    minRating?: number;
    cancel?: string;
    sort?: string;
  },
): T[] {
  let filtered = [...offers];
  if (params.minPrice !== undefined)
    filtered = filtered.filter((o) => o.cheapestRate.totalAmount >= params.minPrice!);
  if (params.maxPrice !== undefined)
    filtered = filtered.filter((o) => o.cheapestRate.totalAmount <= params.maxPrice!);
  if (params.minStars !== undefined)
    filtered = filtered.filter((o) => (o.stars ?? 0) >= params.minStars!);
  if (params.minRating !== undefined)
    filtered = filtered.filter((o) => (o.rating ?? 0) >= params.minRating!);
  if (params.cancel === "free")
    filtered = filtered.filter(
      (o) => o.cheapestRate.refundableTag === "RFN" || Boolean(o.cheapestRate.cancellationDeadline),
    );

  switch (params.sort) {
    case "price_asc":
      filtered.sort((a, b) => a.cheapestRate.totalAmount - b.cheapestRate.totalAmount);
      break;
    case "price_desc":
      filtered.sort((a, b) => b.cheapestRate.totalAmount - a.cheapestRate.totalAmount);
      break;
    case "rating":
      filtered.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
      break;
    default:
      // recommended: rating-weighted-by-price-discount heuristic
      filtered.sort((a, b) => {
        const score = (o: typeof a) =>
          (o.rating ?? 7) * 100 - o.cheapestRate.totalAmount / 10 + (o.cheapestRate.refundableTag === "RFN" ? 50 : 0);
        return score(b) - score(a);
      });
  }
  return filtered;
}
