import { CinematicBackdrop } from "./cinematic-backdrop";
import { DestinationTile } from "./destination-tile";
import { HomeSearchTabs } from "./home-search-tabs";
import { MoodChips } from "./mood-chips";
import { PaymentMethods } from "./payment-methods";
import type { DestinationProfile } from "@/lib/mvp/types";

interface FeaturedTile {
  destination: DestinationProfile;
  heroImage: string;
  /** Prawdziwa cena ze snapshotu dstprice:v1 (patrz DestinationTile). */
  fromPricePerNight?: number;
  /** Najtańszy lot w obie strony z WAW (snapshot, Faza 6). */
  flightFromPln?: number;
}

export interface TrustpilotDisplay {
  score: number;
  reviewCount: number | null;
}

interface HomeHybridHeroProps {
  featured: FeaturedTile[];
  /** Świeża ocena Trustpilot (snapshot z crona) — null = pokazujemy sam link. */
  trustpilot?: TrustpilotDisplay | null;
  /**
   * Pas „Popularne kierunki" pod hero. false, gdy jego rolę przejmuje sekcja
   * „Perełki" (flaga pakietów, właściciel 2026-07-14) — `featured` nadal
   * potrzebne: karmi CinematicBackdrop.
   */
  showDestinations?: boolean;
}

// Polski zapis oceny: 4.2 → „4,2".
function formatScore(score: number): string {
  return score.toFixed(1).replace(".", ",");
}

export function HomeHybridHero({ featured, trustpilot, showDestinations = true }: HomeHybridHeroProps) {
  const backdropImages = featured.slice(0, 6).map((tile) => ({
    src: tile.heroImage,
    alt: `${tile.destination.city}, ${tile.destination.country}`,
  }));

  return (
    <>
      <section id="hero" className="relative scroll-mt-20 overflow-hidden rounded-b-[2rem] shadow-[0_30px_80px_rgba(16,84,48,0.22)] sm:rounded-[2rem]">
        {/* HERO (nagłówek + formularz) — tło zdjęciowe jest tutaj, a NIE na całej
            sekcji. Wcześniej backdrop pokrywał też pas kafelków (~2089 px wys.),
            więc object-cover musiał ~5× powiększać zdjęcie → pikseloza. Teraz
            obraz pokrywa tylko ten obszar (~620 px) → ostro. */}
        <div className="relative overflow-hidden">
          <CinematicBackdrop images={backdropImages} />

          {/* Lekki, konwersyjny układ: jedna obietnica + jedno zdanie + DUŻY
              formularz jako kotwica. Mood-chipy zeszły POD formularz (mniej
              konkurencji o „gdzie kliknąć"). */}
          <div className="relative z-20 flex min-h-[600px] flex-col items-center justify-center px-5 py-10 text-center sm:min-h-[620px] sm:px-8 sm:py-12 lg:min-h-[640px] lg:px-12">
            {/* Eyebrow — jedna, dopracowana linia */}
            <span className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/90 shadow-[0_2px_12px_rgba(0,0,0,0.18)] backdrop-blur-md sm:tracking-[0.24em] sm:text-[11px]">
              <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
              Loty · Hotele · cały wyjazd
            </span>

            {/* Headline — jasna obietnica „co to za serwis" (wybór właściciela). */}
            <h1 className="mt-6 max-w-3xl font-display text-[2.15rem] font-semibold leading-[1.05] text-white drop-shadow-[0_2px_28px_rgba(0,0,0,0.55)] sm:mt-7 sm:text-5xl lg:text-[3.5rem]">
              Lot i hotel{" "}
              <span className="bg-gradient-to-r from-amber-300 via-orange-300 to-rose-300 bg-clip-text text-transparent">
                w jednym miejscu
              </span>
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-white/90 drop-shadow-[0_1px_10px_rgba(0,0,0,0.45)] sm:text-base sm:leading-8">
              Ceny w PLN, płatność jak w sklepie, bez rejestracji.
              Z Polski albo z całej Europy.
            </p>

            {/* Wyszukiwarka — KOTWICA. Bez zmian funkcjonalnych: ten sam formularz,
                te same eventy GA4. max-w-4xl bo tryb LOTY ma 5 pól.
                relative z-30: pasek ma `backdrop-blur-xl` (własny kontekst
                stackingu) → popovery formularza (kalendarz/„Dokąd"/goście) z-50
                były uwięzione, a późniejsze rodzeństwo malowało się na wierzchu
                (białe napisy „prześwitywały"). z-30 podnosi całe poddrzewo. */}
            <div className="relative z-30 mt-6 w-full max-w-4xl sm:mt-7">
              <HomeSearchTabs />
            </div>

            {/* Sygnały zaufania — WYŁĄCZNIE weryfikowalne fakty (świeży projekt,
                zero ogólników typu „sprawdzeni partnerzy"): prawdziwy profil
                Trustpilot (ten sam co na checkoucie), realny procesor płatności,
                realna waluta rozliczeń. */}
            <ul className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-[11px] font-medium text-white/85 drop-shadow-[0_1px_8px_rgba(0,0,0,0.45)] sm:mt-5 sm:text-xs">
              <li>
                <a
                  href="https://pl.trustpilot.com/review/helptravel.pl"
                  target="_blank"
                  rel="noopener nofollow"
                  // -my-2/py-2: hit area ≥ 33px (WCAG 2.2 min 24px) bez zmiany
                  // wizualnej wysokości pasa — audyt mobilny 2026-07-03 zmierzył 17px.
                  className="-my-2 inline-flex items-center gap-1.5 py-2 underline decoration-white/40 underline-offset-2 transition hover:decoration-white"
                >
                  <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-amber-300">
                    <path d="M10 1.6l2.47 5.01 5.53.8-4 3.9.94 5.5L10 14.2l-4.95 2.6.94-5.5-4-3.9 5.53-.8z" />
                  </svg>
                  {/* span: globalne a{color:inherit} bije text-*, kolor na span.
                      Stałe (subtelne) podkreślenie: link musi być rozpoznawalny
                      bez hovera (audyt a11y F4). */}
                  <span className="text-white/90">
                    {trustpilot ? (
                      <>
                        <strong className="font-bold text-white">{formatScore(trustpilot.score)}/5</strong> na
                        Trustpilot
                      </>
                    ) : (
                      "Opinie na Trustpilot"
                    )}
                  </span>
                </a>
              </li>
              {["Płatności obsługuje Stripe", "Ceny finalne w PLN"].map((item) => (
                <li key={item} className="inline-flex items-center gap-1.5">
                  <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-amber-300">
                    <path d="M8.05 13.6 4.4 9.95l1.4-1.4 2.25 2.25 6.15-6.15 1.4 1.4z" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>

            {/* Metody płatności — drobne, tuż pod zaufaniem. */}
            <div className="mt-3.5 sm:mt-4">
              <PaymentMethods />
            </div>

            {/* Mood-chipy — ZDEGRADOWANE pod formularz: drugorzędna ścieżka
                „przeglądania", nie konkurują z głównym CTA (wyszukiwarką). */}
            <div className="mt-7 w-full max-w-2xl sm:mt-8">
              <p className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.16em] text-white/70">
                Lub zacznij od pomysłu na wyjazd
              </p>
              <MoodChips />
            </div>
          </div>
        </div>

        {/* Kafelki pod hero — OSOBNA sekcja z własnym, nieprzezroczystym tłem
            (backdrop już tu nie sięga). Ukrywana, gdy rolę przejmują „Perełki". */}
        {showDestinations && (
        <div className="relative z-10 border-t border-white/10 bg-emerald-950 px-5 py-6 sm:px-8 sm:py-8 lg:px-12">
          <div className="mb-4 flex items-end justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200">
              Popularne kierunki
            </p>
            {/* Widoczny też na mobile: kafelki skracają tam „Lot z Warszawy"
                do „Lot", więc kontekst wylotu niesie podtytuł sekcji. */}
            <span className="text-right text-[11px] leading-tight text-white/60">
              Loty z Warszawy · ceny w PLN
            </span>
          </div>
          {/* Poziomy pasek zamiast siatki (właściciel 2026-07-04: 18 kafli
              w 3 rzędach zajmowało za dużo pionu). Jeden rząd ze snapem;
              szerokości dobrane tak, by ZAWSZE wystawał „podgląd" kolejnego
              kafelka (jawny sygnał, że można przewijać). Ujemne marginesy =
              scroll bleeduje do krawędzi sekcji, pierwszy kafel wyrównany do
              treści. */}
          <div className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 sm:-mx-8 sm:gap-4 sm:px-8 lg:-mx-12 lg:px-12 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]">
            {featured.map((tile) => (
              <div
                key={tile.destination.slug}
                className="w-[42%] shrink-0 snap-start sm:w-[30%] md:w-[22%] lg:w-[18%] xl:w-[14.5%]"
              >
                <DestinationTile
                  destination={tile.destination}
                  heroImage={tile.heroImage}
                  fromPricePerNight={tile.fromPricePerNight}
                  flightFromPln={tile.flightFromPln}
                  size="lg"
                  badge="Polecane"
                />
              </div>
            ))}
          </div>
        </div>
        )}
      </section>
    </>
  );
}
