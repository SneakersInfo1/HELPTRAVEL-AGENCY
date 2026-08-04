import Link from "next/link";

// Ostatni blok treści przed stopką: jak przebiega rezerwacja i kto za nią stoi
// (server component, zero fetch).
//
// Redesign 2026-07 — dwie rzeczy były tu realnie zepsute:
//
// 1. WAGA WIZUALNA. Sekcja miała trzy zagnieżdżone powierzchnie: biała karta →
//    w niej trzy podkarty kroków → obok ciemny slab `emerald-950`. Ciemny slab
//    przyciągał wzrok pierwszy, więc informacja POBOCZNA („kto za tym stoi")
//    krzyczała głośniej niż GŁÓWNA („jak zarezerwować"). Teraz jedna
//    powierzchnia, hierarchia z typografii i kolejności, a „kto za tym stoi"
//    jest podpisem pod krokami — czyli tym, czym jest.
//
// 2. FAKT. Krok 2 obiecywał BLIK. Checkout go NIE oferuje (patrz
//    `hotele/rezerwacja/_components/payment-brands.tsx` — świadomie ukryty,
//    dopóki LiteAPI/Nuitee nie włączą go dla PLN), a czat konsjerża wprost
//    odmawia („BLIK-u na razie nie obsługujemy", `concierge/system-prompt.ts`).
//    Strona główna obiecywała więc metodę płatności, której produkt nie ma.
//    Doszła za to informacja o NUITEE TRAVEL na wyciągu — nieznana nazwa na
//    liście transakcji to najczęstszy powód reklamacji, a my znamy ją z góry.

const STEPS = [
  {
    n: "1",
    title: "Wyszukujesz",
    desc: "Hotele i loty w jednym miejscu. Ceny finalne w PLN — bez ukrytych opłat doliczanych na końcu.",
  },
  {
    n: "2",
    title: "Płacisz bezpiecznie",
    desc: "Płatność obsługuje Stripe — kartą lub Google Pay. Dane karty nie przechodzą przez nasze serwery.",
  },
  {
    n: "3",
    title: "Masz potwierdzenie",
    desc: "Rezerwacja potwierdzana od razu, szczegóły dostajesz na e-mail. Bez zakładania konta.",
  },
] as const;

interface TrustHowItWorksProps {
  /** Świeża ocena Trustpilot (snapshot z crona) — null = sam link bez liczby. */
  trustpilot?: { score: number; reviewCount: number | null } | null;
}

// Polska odmiana: 1 opinia, 2-4 opinie, 5+ opinii (z wyjątkiem 12-14).
function reviewsLabel(n: number): string {
  if (n === 1) return "1 opinia";
  const d = n % 10;
  const h = n % 100;
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return `${n} opinie`;
  return `${n} opinii`;
}

/** Link-pastylka w pasku „kto za tym stoi". Wysokość 44 px = próg dotykowy. */
const PILL =
  "inline-flex h-11 items-center justify-center rounded-full border border-line px-4 text-sm font-semibold transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2";

export function TrustHowItWorks({ trustpilot }: TrustHowItWorksProps = {}) {
  return (
    <section
      aria-labelledby="how-it-works"
      className="mx-auto w-full max-w-[2160px] px-4 sm:px-6 xl:px-8"
    >
      <div className="rounded-md border border-line bg-surface-raised p-6 shadow-[var(--shadow-md)] sm:p-8 lg:p-10">
        {/* Bez nadtytułu „Jak to działa": nagłówek już to mówi, a nadtytuł nad
            każdą sekcją to najbardziej rozpoznawalny szablon generowanych
            stron (PRODUCT.md → anti-references). */}
        <h2 id="how-it-works" className="max-w-xl text-balance text-2xl font-bold leading-tight tracking-[-0.02em] text-ink sm:text-3xl">
          Rezerwujesz w trzech krokach
        </h2>

        {/* Numeracja zostaje, bo to REALNA sekwencja, a nie ozdobnik — kroki
            dzieją się po kolei i kolejność niesie informację. Kreska łącząca
            numery (tylko ≥sm, gdzie układ jest poziomy) pokazuje ciągłość,
            której same cyfry nie dają. */}
        <ol className="mt-6 grid gap-6 sm:mt-8 sm:grid-cols-3 sm:gap-8">
          {STEPS.map((s, i) => (
            <li key={s.n} className="relative">
              {i < STEPS.length - 1 && (
                <span
                  aria-hidden
                  // left-9 = tuż za kółkiem (2 rem) + 0,25 rem oddechu;
                  // szerokość dobija do numeru następnego kroku przez gap-8.
                  className="absolute left-9 top-4 hidden h-px w-[calc(100%-0.25rem)] bg-line sm:block"
                />
              )}
              <span
                aria-hidden
                className="relative flex h-8 w-8 items-center justify-center rounded-full bg-brand text-sm font-bold text-white"
              >
                {s.n}
              </span>
              <h3 className="mt-3 text-sm font-bold text-ink">{s.title}</h3>
              <p className="mt-1 max-w-[38ch] text-sm leading-6 text-ink-muted">{s.desc}</p>
            </li>
          ))}
        </ol>

        {/* „Kto za tym stoi" — ta sama powierzchnia, oddzielona włoskową linią.
            Informacja podrzędna wobec kroków, więc i traktowana podrzędnie. */}
        <div className="mt-8 border-t border-line pt-6 sm:mt-10 sm:flex sm:items-end sm:justify-between sm:gap-8">
          <div className="max-w-[62ch]">
            <h3 className="text-sm font-bold text-ink">Kto za tym stoi</h3>
            <p className="mt-1.5 text-sm leading-6 text-ink-muted">
              Rezerwacje realizuje <strong className="font-semibold text-ink">LiteAPI</strong> — globalna
              platforma rezerwacyjna, z której korzystają serwisy podróżnicze na całym świecie. Płatności
              przetwarza <strong className="font-semibold text-ink">Stripe</strong>. Na wyciągu z karty
              zobaczysz <strong className="font-semibold text-ink">NUITEE TRAVEL</strong> — to partner
              rozliczeniowy HelpTravel, nie obca transakcja.
            </p>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 sm:mt-0 sm:shrink-0">
            <a
              href="https://pl.trustpilot.com/review/helptravel.pl"
              target="_blank"
              rel="noopener nofollow"
              className={PILL}
            >
              {/* span: globalne a{color:inherit} bije text-* na <a> */}
              <span className="text-ink">
                {trustpilot ? (
                  <>
                    ★ {trustpilot.score.toFixed(1).replace(".", ",")}/5 na Trustpilot
                    {typeof trustpilot.reviewCount === "number" && trustpilot.reviewCount > 0 && (
                      <span className="font-medium text-ink-muted"> · {reviewsLabel(trustpilot.reviewCount)}</span>
                    )}
                  </>
                ) : (
                  "★ Opinie na Trustpilot"
                )}
              </span>
            </a>
            <Link href="/o-nas" className={PILL}>
              <span className="text-ink">Poznaj nas →</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
