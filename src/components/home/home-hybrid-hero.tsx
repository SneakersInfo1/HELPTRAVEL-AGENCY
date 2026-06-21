import { CinematicBackdrop } from "./cinematic-backdrop";
import { DestinationTile } from "./destination-tile";
import { HomeSearchTabs } from "./home-search-tabs";
import { MoodChips } from "./mood-chips";
import { PaymentMethods } from "./payment-methods";
import type { DestinationProfile } from "@/lib/mvp/types";

interface FeaturedTile {
  destination: DestinationProfile;
  heroImage: string;
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
        {/* Cinematic tlo */}
        <CinematicBackdrop images={backdropImages} />

        {/* Content — wyśrodkowany, dopracowany układ; form widoczny w pierwszym
            viewporcie. Mniej konkurujących elementów u góry niż poprzednio:
            jedna elegancka linia „eyebrow" zamiast dwóch pigułek, większy
            nagłówek, a sygnały zaufania zebrane w jeden rząd pod wyszukiwarką. */}
        <div className="relative z-20 flex min-h-[600px] flex-col items-center justify-center px-5 py-10 text-center sm:min-h-[640px] sm:px-8 sm:py-12 lg:min-h-[680px] lg:px-12 lg:py-14">
          {/* Eyebrow — jedna, dopracowana linia */}
          <span className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/90 shadow-[0_2px_12px_rgba(0,0,0,0.18)] backdrop-blur-md sm:tracking-[0.24em] sm:text-[11px]">
            <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
            Loty · Hotele · Plan wyjazdu
          </span>

          {/* Headline */}
          <h1 className="mt-7 max-w-3xl font-display text-[2.15rem] font-semibold leading-[1.03] text-white drop-shadow-[0_2px_28px_rgba(0,0,0,0.55)] sm:mt-8 sm:text-5xl lg:text-[3.75rem]">
            Gdzie{" "}
            <span className="bg-gradient-to-r from-amber-300 via-orange-300 to-rose-300 bg-clip-text text-transparent">
              uciekasz
            </span>{" "}
            tym razem?
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-white/85 drop-shadow-[0_1px_10px_rgba(0,0,0,0.4)] sm:text-base sm:leading-8">
            Kierunek, daty, pasażerowie — w 3 minuty gotowy plan z lotem i hotelem.
            Z Polski albo z całej Europy.
          </p>

          {/* Mood chips */}
          <div className="mt-7 w-full max-w-2xl sm:mt-8">
            <MoodChips />
          </div>

          {/* Wyszukiwarka — toggle Hotele/Loty + pasek (Faza 2). Bez zmian
              funkcjonalnych: ten sam formularz, te same eventy GA4.
              max-w-4xl (nie 3xl) — tryb LOTY ma 5 pól (Skąd/Dokąd/Termin/
              Pasażerowie/CTA), na 3xl pole „Skąd" się zgniatało. */}
          {/* relative z-30: pasek ma `backdrop-blur-xl` (tworzy własny kontekst
              stackingu), przez co popovery formularza (kalendarz/„Dokąd"/goście)
              z-50 były UWIĘZIONE w tym kontekście, a późniejsze w DOM rodzeństwo
              (rząd zaufania, metody płatności) malowało SIĘ NA WIERZCHU — białe
              napisy „prześwitywały" przez biały kalendarz. Podniesienie całego
              poddrzewa formularza ponad to rodzeństwo gasi przeświecanie. */}
          <div className="relative z-30 mt-6 w-full max-w-4xl sm:mt-7">
            <HomeSearchTabs />
          </div>

          {/* Sygnały zaufania — jeden elegancki rząd. */}
          <ul className="mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[11px] font-medium text-white/85 drop-shadow-[0_1px_8px_rgba(0,0,0,0.45)] sm:mt-6 sm:text-xs">
            {["Loty z ponad 80 lotnisk", "Bez rejestracji", "Tylko sprawdzeni partnerzy"].map((item) => (
              <li key={item} className="inline-flex items-center gap-1.5">
                <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-amber-300">
                  <path d="M8.05 13.6 4.4 9.95l1.4-1.4 2.25 2.25 6.15-6.15 1.4 1.4z" />
                </svg>
                {item}
              </li>
            ))}
          </ul>

          {/* Akceptowane metody płatności — zastępuje dawny chip „100% darmowe". */}
          <div className="mt-5 sm:mt-6">
            <PaymentMethods />
          </div>
        </div>

        {/* Kafelki pod hero — "gotowy pomysl" */}
        <div className="relative z-10 border-t border-white/15 bg-gradient-to-b from-emerald-950/40 via-emerald-950/70 to-emerald-950/90 px-5 py-6 backdrop-blur-md sm:px-8 sm:py-8 lg:px-12">
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
