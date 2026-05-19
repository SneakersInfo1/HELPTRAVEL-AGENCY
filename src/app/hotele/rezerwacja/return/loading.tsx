// Shown while the return page server-side finalizes /api/booking/book
// (book can be slow at the OTA — see 60s timeout note, Phase 1 deviation #2).

export default function ReturnLoading() {
  return (
    <main className="min-h-screen bg-neutral-50">
      <section className="mx-auto max-w-2xl px-4 py-12">
        <div
          role="status"
          aria-busy="true"
          className="rounded-2xl border border-neutral-200 bg-white p-8"
        >
          <p className="text-sm font-medium text-neutral-700">
            Potwierdzamy Twoją rezerwację… Nie zamykaj tej strony.
          </p>
          <div className="mt-4 animate-pulse space-y-3 motion-reduce:animate-none">
            <div className="h-6 w-2/3 rounded bg-neutral-100" />
            <div className="h-4 w-full rounded bg-neutral-100" />
            <div className="h-4 w-5/6 rounded bg-neutral-100" />
            <div className="h-10 w-1/2 rounded bg-neutral-100" />
          </div>
          <span className="sr-only">Trwa potwierdzanie rezerwacji</span>
        </div>
      </section>
    </main>
  );
}
