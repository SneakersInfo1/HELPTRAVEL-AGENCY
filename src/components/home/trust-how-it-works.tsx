import Link from "next/link";

// Sekcja zaufania pod kafelkami (server component, zero fetch). Zastępuje
// dawną sekcję „Zacznij od pomysłu na wyjazd" (6 kart), która DUBLOWAŁA chipy
// nastrojów z hero — homepage jest przez to netto krótszy. Treść = wyłącznie
// weryfikowalne fakty (świeży projekt: zero zmyślonych liczb — patrz
// PRODUCT.md „Anti-references").

const STEPS = [
  {
    n: "1",
    title: "Wyszukujesz",
    desc: "Hotele i loty w jednym miejscu. Ceny finalne w PLN — bez ukrytych opłat doliczanych na końcu.",
  },
  {
    n: "2",
    title: "Płacisz bezpiecznie",
    desc: "Płatność obsługuje Stripe — karta, BLIK lub Google Pay. Dane karty nie przechodzą przez nasze serwery.",
  },
  {
    n: "3",
    title: "Masz potwierdzenie",
    desc: "Rezerwacja potwierdzana od razu, szczegóły dostajesz na e-mail. Bez zakładania konta.",
  },
] as const;

export function TrustHowItWorks() {
  return (
    <section
      aria-labelledby="how-it-works"
      className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 xl:px-8"
    >
      <div className="grid gap-6 rounded-[2rem] border border-emerald-900/10 bg-white p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)] sm:p-8 lg:grid-cols-[1.5fr_1fr] lg:gap-10">
        {/* Kolumna A — 3 kroki */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-600">
            Jak to działa
          </p>
          <h2 id="how-it-works" className="mt-2 font-display text-2xl leading-tight text-emerald-950 sm:text-3xl">
            Rezerwujesz w trzech krokach
          </h2>
          <ol className="mt-5 grid gap-4 sm:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="rounded-2xl bg-emerald-50/60 p-4">
                <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-700 text-sm font-bold text-white">
                  {s.n}
                </span>
                <h3 className="mt-3 text-sm font-bold text-emerald-950">{s.title}</h3>
                <p className="mt-1 text-xs leading-6 text-emerald-900/75">{s.desc}</p>
              </li>
            ))}
          </ol>
        </div>

        {/* Kolumna B — kto za tym stoi (fakty weryfikowalne) */}
        <div className="flex flex-col rounded-2xl border border-emerald-900/10 bg-emerald-950 p-5 text-white sm:p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-200">
            Kto za tym stoi
          </p>
          <p className="mt-3 text-sm leading-7 text-white/85">
            Rezerwacje realizuje <strong className="font-semibold text-white">LiteAPI</strong> — globalna
            platforma rezerwacyjna, z której korzystają serwisy podróżnicze na całym świecie.
            Płatności przetwarza <strong className="font-semibold text-white">Stripe</strong>.
          </p>
          <div className="mt-auto flex flex-wrap gap-2 pt-5">
            <a
              href="https://pl.trustpilot.com/review/helptravel.pl"
              target="_blank"
              rel="noopener nofollow"
              className="inline-flex min-h-10 items-center justify-center rounded-full bg-white/10 px-4 py-2 text-sm font-semibold ring-1 ring-white/25 transition hover:bg-white/20"
            >
              {/* span: globalne a{color:inherit} bije text-* na <a> */}
              <span className="text-white">★ Opinie na Trustpilot</span>
            </a>
            <Link
              href="/o-nas"
              className="inline-flex min-h-10 items-center justify-center rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-white/25 transition hover:bg-white/10"
            >
              <span className="text-white/90">Poznaj nas →</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
