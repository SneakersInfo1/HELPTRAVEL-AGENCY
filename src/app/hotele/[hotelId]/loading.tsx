// Instant loading state for /hotele/[hotelId].
//
// WHY THIS FILE EXISTS (bug: "muszę dwa razy kliknąć, strona ładuje się ~3 s"):
// the hotel detail page is a DYNAMIC route — it reads `searchParams` and awaits
// an uncached LiteAPI `getRates` call (15-min cache, but each user's date combo
// is a cold ~3 s miss). Per the Next.js prefetching rules, a dynamic route is
// NOT prefetched and its navigation BLOCKS on the server render UNLESS a
// `loading.js` boundary exists. Without this file the previous page stayed
// frozen on screen for the whole rates fetch, so the click felt dead and users
// clicked again ("two clicks to open"). With it, Next prefetches the
// layout→loading shell and paints this skeleton the instant the link is
// clicked, then streams the real page in when the data resolves.
//
// The skeleton mirrors the real layout's dimensions (photo grid height, sticky
// widget width) so the swap to real content causes no layout shift (good CLS).

function Bar({ className = "" }: { className?: string }) {
  return <div className={`rounded bg-neutral-200/80 ${className}`} />;
}

export default function HotelDetailLoading() {
  return (
    <main
      role="status"
      aria-busy="true"
      className="min-h-screen animate-pulse bg-neutral-50 pb-24 motion-reduce:animate-none lg:pb-0"
    >
      <span className="sr-only">Ładujemy ofertę hotelu…</span>

      {/* Breadcrumb bar */}
      <nav className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2.5">
          <Bar className="h-3 w-16" />
          <Bar className="h-3 w-3" />
          <Bar className="h-3 w-14" />
          <Bar className="h-3 w-3" />
          <Bar className="h-3 w-28" />
        </div>
      </nav>

      {/* Photo gallery — matches the real grid height (260px → 420px) */}
      <section className="mx-auto max-w-7xl px-4 pt-4">
        <div className="grid h-[260px] grid-cols-4 grid-rows-2 gap-2 overflow-hidden rounded-2xl sm:h-[420px]">
          <div className="col-span-4 row-span-2 bg-neutral-200/80 sm:col-span-2" />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="hidden bg-neutral-200/70 sm:block" />
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-6">
        {/* Title + rating */}
        <Bar className="h-8 w-2/3 max-w-md sm:h-9" />
        <Bar className="mt-3 h-4 w-1/2 max-w-sm" />
        <Bar className="mt-3 h-8 w-44" />

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
          {/* Left column */}
          <div className="space-y-6">
            {/* Tabs */}
            <div className="flex gap-2 rounded-xl bg-white p-2 ring-1 ring-neutral-200">
              {["w-16", "w-14", "w-24", "w-20", "w-16"].map((w, i) => (
                <Bar key={i} className={`h-7 ${w}`} />
              ))}
            </div>

            {/* Overview card */}
            <div className="rounded-2xl bg-white p-6 ring-1 ring-neutral-200">
              <Bar className="h-5 w-32" />
              <Bar className="mt-4 h-4 w-full" />
              <Bar className="mt-2 h-4 w-11/12" />
              <Bar className="mt-2 h-4 w-4/5" />
            </div>

            {/* Rooms card — the slow part (rates) */}
            <div className="rounded-2xl border border-neutral-200 bg-white p-6">
              <Bar className="h-6 w-40" />
              <div className="mt-5 space-y-4">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-4 rounded-xl border border-neutral-100 p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <Bar className="h-4 w-40" />
                      <Bar className="mt-2 h-3 w-28" />
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Bar className="h-5 w-24" />
                      <Bar className="h-10 w-28" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sticky booking widget — matches the real 320px column */}
          <div className="rounded-2xl bg-white p-5 ring-1 ring-neutral-200">
            <Bar className="h-6 w-28" />
            <Bar className="mt-4 h-11 w-full" />
            <Bar className="mt-3 h-11 w-full" />
            <Bar className="mt-3 h-11 w-full" />
            <Bar className="mt-5 h-12 w-full" />
            <Bar className="mt-3 h-3 w-2/3" />
          </div>
        </div>
      </section>
    </main>
  );
}
