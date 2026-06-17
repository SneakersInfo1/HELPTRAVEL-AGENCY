import Link from "next/link";

import { TRAVEL_MOODS } from "@/lib/mvp/travel-moods";

// Sekcje pod hero (server component, treść PL). Po usunięciu starej sekcji
// „Booking pokaże hotel" homepage zrobił się pusty — te bloki wypełniają go i
// prowadzą użytkownika do akcji: (1) „Jak to działa" buduje zaufanie i kieruje
// do wyszukiwarki, (2) „Wyjazd w Twoim stylu" to atrakcyjne kafelki-kolekcje
// (TRAVEL_MOODS) z linkiem do /wyjazdy/<slug> → dalej do wyszukiwarki.

const STEPS = [
  {
    icon: "🔍",
    title: "Wyszukaj",
    body: "Wpisz kierunek, daty i liczbę osób. Sprawdzamy loty i hotele w jednym miejscu.",
  },
  {
    icon: "⚖️",
    title: "Porównaj i wybierz",
    body: "Prawdziwe ceny w PLN, filtry jak na Booking, bez ukrytych kosztów i rejestracji.",
  },
  {
    icon: "🎒",
    title: "Zarezerwuj i leć",
    body: "Płacisz bezpiecznie u partnera. Dostajesz gotowy plan — lot, hotel i kolejne kroki.",
  },
] as const;

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
      {/* ── Jak to działa ─────────────────────────────────────────────── */}
      <section aria-labelledby="how-it-works" className="relative overflow-hidden rounded-[2.2rem] border border-emerald-900/10 bg-white px-6 py-9 shadow-[0_24px_70px_rgba(16,84,48,0.08)] sm:px-10 sm:py-12">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(110,231,183,0.16),transparent_38%)]"
        />
        <div className="relative">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-600">
            Prosto i bez chaosu
          </p>
          <h2 id="how-it-works" className="mt-2 max-w-2xl font-display text-2xl leading-tight text-emerald-950 sm:text-3xl md:text-4xl">
            Cały wyjazd w 3 krokach — lot, hotel i plan w jednym miejscu
          </h2>

          <ol className="mt-7 grid gap-4 sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <li
                key={step.title}
                className="group relative rounded-2xl border border-emerald-900/10 bg-emerald-50/40 p-5 transition hover:-translate-y-1 hover:border-emerald-300/60 hover:bg-emerald-50"
              >
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-2xl shadow-sm">
                    {step.icon}
                  </span>
                  <span className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-600">
                    Krok {i + 1}
                  </span>
                </div>
                <h3 className="mt-3 text-lg font-bold text-emerald-950">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-emerald-900/72">{step.body}</p>
              </li>
            ))}
          </ol>

          <div className="mt-7 flex flex-wrap items-center gap-4">
            <Link
              href="/#hero"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-amber-400 via-orange-400 to-rose-400 px-6 py-3 text-sm font-bold uppercase tracking-[0.08em] text-emerald-950 shadow-[0_12px_40px_rgba(234,88,12,0.4)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_50px_rgba(234,88,12,0.55)]"
            >
              Zaplanuj wyjazd
              <span aria-hidden>→</span>
            </Link>
            <span className="text-sm font-medium text-emerald-900/70">
              100% darmowe · bez rejestracji · płacisz dopiero u partnera
            </span>
          </div>
        </div>
      </section>

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
