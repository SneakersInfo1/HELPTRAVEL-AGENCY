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
}

interface HomeHybridHeroProps {
  featured: FeaturedTile[];
}

export function HomeHybridHero({ featured }: HomeHybridHeroProps) {
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
                  className="inline-flex items-center gap-1.5 underline-offset-2 transition hover:underline"
                >
                  <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-amber-300">
                    <path d="M10 1.6l2.47 5.01 5.53.8-4 3.9.94 5.5L10 14.2l-4.95 2.6.94-5.5-4-3.9 5.53-.8z" />
                  </svg>
                  {/* span: globalne a{color:inherit} bije text-*, kolor na span */}
                  <span className="text-white/90">Opinie na Trustpilot</span>
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
            (backdrop już tu nie sięga). */}
        <div className="relative z-10 border-t border-white/10 bg-emerald-950 px-5 py-6 sm:px-8 sm:py-8 lg:px-12">
          <div className="mb-4 flex items-end justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200">
              Popularne kierunki
            </p>
            <span className="hidden text-[11px] text-white/60 sm:inline">Ceny w PLN · z lotem i hotelem</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
            {featured.map((tile) => (
              <DestinationTile
                key={tile.destination.slug}
                destination={tile.destination}
                heroImage={tile.heroImage}
                fromPricePerNight={tile.fromPricePerNight}
                size="lg"
                badge="Polecane"
              />
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
