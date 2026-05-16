import Link from "next/link";

// Server-side pagination for the hotel result list. Renders plain Links
// (no client JS) so it works with the page's ISR/streaming model and is
// crawlable. Each link preserves the full search + filter query and only
// swaps the `strona` (page) cursor. Next.js scrolls to top on navigation.

function buildHref(baseQuery: string, n: number): string {
  const qs = baseQuery ? `${baseQuery}&strona=${n}` : `strona=${n}`;
  return `/hotele/szukaj?${qs}`;
}

// Windowed page list: 1 … (p-1) p (p+1) … last, collapsing gaps with "…".
function pageWindow(page: number, totalPages: number): Array<number | "ellipsis"> {
  const pages = new Set<number>([1, totalPages, page, page - 1, page + 1]);
  const sorted = [...pages].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
  const out: Array<number | "ellipsis"> = [];
  let prev = 0;
  for (const n of sorted) {
    if (prev && n - prev > 1) out.push("ellipsis");
    out.push(n);
    prev = n;
  }
  return out;
}

export function HotelPagination({
  page,
  totalPages,
  baseQuery,
}: {
  page: number;
  totalPages: number;
  baseQuery: string;
}) {
  if (totalPages <= 1) return null;

  const items = pageWindow(page, totalPages);
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  const baseBtn =
    "inline-flex h-10 min-w-10 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition";
  const idle = "border-neutral-200 bg-white text-neutral-700 hover:border-emerald-300 hover:text-emerald-700";
  const active = "border-emerald-600 bg-emerald-600 text-white";
  const disabled = "pointer-events-none border-neutral-100 bg-neutral-50 text-neutral-300";

  return (
    <nav
      aria-label="Strony wyników"
      className="mt-6 flex flex-wrap items-center justify-center gap-2 border-t border-neutral-100 pt-6"
    >
      {hasPrev ? (
        <Link href={buildHref(baseQuery, page - 1)} rel="prev" className={`${baseBtn} ${idle}`}>
          ← Poprzednia
        </Link>
      ) : (
        <span aria-hidden className={`${baseBtn} ${disabled}`}>← Poprzednia</span>
      )}

      {items.map((it, i) =>
        it === "ellipsis" ? (
          <span key={`e${i}`} aria-hidden className="px-1 text-neutral-400">
            …
          </span>
        ) : it === page ? (
          <span key={it} aria-current="page" className={`${baseBtn} ${active}`}>
            {it}
          </span>
        ) : (
          <Link key={it} href={buildHref(baseQuery, it)} className={`${baseBtn} ${idle}`}>
            {it}
          </Link>
        ),
      )}

      {hasNext ? (
        <Link href={buildHref(baseQuery, page + 1)} rel="next" className={`${baseBtn} ${idle}`}>
          Następna →
        </Link>
      ) : (
        <span aria-hidden className={`${baseBtn} ${disabled}`}>Następna →</span>
      )}
    </nav>
  );
}
