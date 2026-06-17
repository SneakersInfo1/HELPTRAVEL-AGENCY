import Link from "next/link";

import { TRAVEL_MOODS } from "@/lib/mvp/travel-moods";

// Sekcja pod hero (server component, treść PL): „Zacznij od pomysłu na wyjazd"
// to atrakcyjne kafelki-kolekcje (TRAVEL_MOODS) z linkiem do /wyjazdy/<slug> →
// dalej do wyszukiwarki. Prowadzi użytkownika od pomysłu do akcji.

// Kolejność kolekcji dobrana „sprzedażowo" (najpierw to, co najczęściej klikane).
const COLLECTION_SLUGS = ["plaza", "slonce-zima", "city-break", "kultura", "gory", "budzet"] as const;

const COLLECTION_BLURB: Record<string, string> = {
  plaza: "Ciepłe morze i plaża blisko hotelu.",
  "slonce-zima": "Złap słońce, kiedy w Polsce szaro.",
  "city-break": "Krótki wypad do miasta na 3–4 dni.",
  kultura: "Zabytki, historia i klimat starówek.",
  gory: "Szlaki, widoki i natura w zasięgu lotu.",
  budzet: "Dobre kierunki w przyjaznej cenie.",
};

export function HomePageSections() {
  const collections = COLLECTION_SLUGS.map((slug) => TRAVEL_MOODS.find((m) => m.slug === slug)).filter(
    (m): m is (typeof TRAVEL_MOODS)[number] => Boolean(m),
  );

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-10 px-4 sm:gap-14 sm:px-6 xl:px-8">
      {/* ── Wyjazd w Twoim stylu (kolekcje) ───────────────────────────── */}
      <section aria-labelledby="collections">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-600">
              Nie wiesz dokąd?
            </p>
            <h2 id="collections" className="mt-2 font-display text-2xl leading-tight text-emerald-950 sm:text-3xl md:text-4xl">
              Zacznij od pomysłu na wyjazd
            </h2>
          </div>
          <Link
            href="/inspiracje"
            className="hidden rounded-full border border-emerald-700 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 sm:inline-flex"
          >
            Wszystkie pomysły →
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
          {collections.map((mood) => (
            <Link
              key={mood.slug}
              href={`/wyjazdy/${mood.slug}`}
              className="group relative flex flex-col overflow-hidden rounded-2xl border border-emerald-900/10 bg-white p-4 shadow-[0_8px_24px_rgba(16,84,48,0.06)] transition hover:-translate-y-1.5 hover:shadow-[0_18px_42px_rgba(16,84,48,0.14)] sm:p-5"
            >
              <div aria-hidden className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${mood.aura} opacity-90 transition group-hover:opacity-100`} />
              <div className="relative flex flex-1 flex-col">
                <span className="text-3xl drop-shadow-sm sm:text-4xl">{mood.icon}</span>
                <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700/90">
                  {mood.eyebrow}
                </p>
                <h3 className="mt-0.5 font-display text-lg leading-tight text-emerald-950 sm:text-xl">
                  {mood.label}
                </h3>
                <p className="mt-1 hidden text-xs leading-5 text-emerald-900/70 sm:block">
                  {COLLECTION_BLURB[mood.slug]}
                </p>
                <span className="mt-auto inline-flex items-center gap-1 pt-3 text-sm font-semibold text-emerald-700 transition-all group-hover:gap-2">
                  Zobacz kierunki
                  <span aria-hidden>→</span>
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
