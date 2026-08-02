import { CinematicBackdrop } from "./cinematic-backdrop";
import { DestinationCarousel } from "./destination-carousel";
import { InspireTile } from "./inspire-tile";
import { ShieldCheck, UserRoundX, Wallet } from "lucide-react";

import { HomeSearchTabs } from "./home-search-tabs";
import { HOME_COPY } from "@/lib/home/copy";
import { localizeCity, localizeCountry } from "@/lib/mvp/i18n-geo";
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
  /** Nagłówek pasa kierunków — propsem, żeby dało się go testować. */
  bandHeading?: string;
}

// Polski zapis oceny: 4.2 → „4,2".
function formatScore(score: number): string {
  return score.toFixed(1).replace(".", ",");
}

export function HomeHybridHero({
  featured,
  trustpilot,
  bandHeading = HOME_COPY.inspire.heading,
}: HomeHybridHeroProps) {
  const backdropImages = featured.slice(0, 6).map((tile) => ({
    src: tile.heroImage,
    alt: `${tile.destination.city}, ${tile.destination.country}`,
  }));

  return (
    <>
      {/* BEZ promienia i BEZ cienia (2026-08-02). Oba miały sens, dopóki hero
          był kartą leżącą na tle strony — po przejściu na pełną szerokość
          zaokrąglone rogi zostawiały cztery białe trójkąty przy krawędziach
          ekranu, a rzucany cień padał na nic. Pas idący od brzegu do brzegu
          nie potrzebuje udawać, że unosi się nad czymś. */}
      <section id="hero" className="relative scroll-mt-20 overflow-hidden">
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
            {/* USUNIĘTY eyebrow „Loty · Hotele · cały wyjazd": powtarzał treść
                nagłówka, a na mobile spychał formularz poniżej pierwszego
                ekranu. Wraz z chipami (przeniesionymi do sekcji kategorii)
                to ~120 px odzyskane nad wyszukiwarką. */}

            {/* Headline — jasna obietnica „co to za serwis" (wybór właściciela).
                Bez gradientu na tekście: jednolita biel czyta się lepiej na
                zdjęciu i nie jest najbardziej rozpoznawalnym znakiem AI-slopu. */}
            <h1 className="max-w-3xl text-balance font-display text-hero font-semibold text-white drop-shadow-[0_2px_28px_rgba(0,0,0,0.55)]">
              Lot i hotel w jednym miejscu
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
              {/* JEDEN pas zaufania, max 4 punkty. Te same fakty powtarzały
                  się wcześniej także w sekcji „Jak to działa" — powtórzony
                  sygnał zaufania nie sumuje się, tylko rozcieńcza. */}
              {[
                { Icon: ShieldCheck, text: "Płatność przez Stripe" },
                { Icon: Wallet, text: "Ceny finalne w PLN" },
                { Icon: UserRoundX, text: "Bez zakładania konta" },
              ].map(({ Icon, text }) => (
                <li key={text} className="inline-flex items-center gap-1.5">
                  <Icon aria-hidden strokeWidth={2} className="h-3.5 w-3.5 shrink-0 text-white/70" />
                  {text}
                </li>
              ))}
            </ul>

            {/* Logotypy płatności ZDJĘTE z hero (redesign 2026-07): w miejscu
                wyboru kierunku nie pomagają, a przy checkoucie — gdzie
                użytkownik realnie sięga po kartę — są już pokazane. */}

            {/* USUNIĘTE: pas chipów „Lub zacznij od pomysłu na wyjazd".
                Duplikował sekcję „Nie wiesz, dokąd jechać?" niżej — i to z
                INNĄ listą kategorii (Góry i Budżet były tylko tutaj). Jedno
                miejsce z kategoriami, jedna lista: ThemeTiles. */}
          </div>
        </div>

        {/* Kafelki pod hero — OSOBNA sekcja z własnym, nieprzezroczystym tłem
            (backdrop już tu nie sięga). */}
        {/* `[--focus-ring:#fff]`: globalny pierścień focusu jest zielony
            (`--brand`), co na tym pasie daje 1,87:1 przy wymaganych 3:1 —
            osoba nawigująca klawiaturą nie widziałaby, na której z osiemnastu
            kart stoi. Zmienną czyta reguła `:focus-visible` w globals.css
            i dziedziczą ją też strzałki karuzeli. */}
        <div className="relative z-10 border-t border-white/10 bg-emerald-950 px-5 py-6 [--focus-ring:#fff] sm:px-8 sm:py-8 lg:px-12">
          {/* Nagłówek pasa (tytuł + dopisek + strzałki) renderuje sama karuzela
              — inaczej strzałki, pozycjonowane absolutnie, wchodziły na dopisek.
              Embla zamiast natywnego overflow-x: znika szary pasek przewijania
              (wyglądał na niedokończony interfejs), dochodzą strzałki, snap
              i obsługa klawiatury. Ucięta karta po prawej zostaje — to
              świadomy sygnał „jest więcej". */}
          <DestinationCarousel
            tone="dark"
            listId="home_inspire"
            listName={bandHeading}
            // Karty ~1,4× szersze niż wcześniej. Na 375 px kafelek miał ~150 px
            // szerokości i mieścił pięć wierszy tekstu — nadtytuł schodził do
            // 10 px, a cena łamała się w środku. Szerszy kafelek to ten sam pas
            // i ta sama liczba kierunków, tylko czytelna; liczba kart została
            // bez zmian (18 to jawna decyzja właściciela z 2026-07-03).
            slideClassName="min-w-0 shrink-0 basis-[58%] pl-3 sm:basis-[38%] sm:pl-4 md:basis-[29%] lg:basis-[24%] xl:basis-[19%]"
            header={
              // <h2>, nie <p>: nazwy miast na kartach to <h3>, więc z tym
              // nadtytułem jako akapitem dokument skakał z H1 hero prosto na
              // H3 — czytnik ekranu nie miał czym nazwać tego pasa. Wygląd
              // bez zmian; ten napis I TAK był nagłówkiem sekcji, tylko
              // zapisanym niewłaściwym znacznikiem.
              <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-bright">
                {bandHeading}
              </h2>
            }
            aside={
              // Widoczny też na mobile: kafelki skracają tam „Lot z Warszawy"
              // do „Lot", więc kontekst wylotu niesie ten dopisek.
              <span className="text-right text-[11px] leading-tight text-white/60">
                Loty z Warszawy · ceny w PLN
              </span>
            }
            items={featured.map((tile) => ({
              slug: tile.destination.slug,
              name: localizeCity(tile.destination.city),
              category: localizeCountry(tile.destination.country),
              node: (
                // Bez badge'a „Polecane": był na KAŻDEJ karcie, więc nie
                // znaczył nic. Zamiast niego chip z czasem lotu — etykieta,
                // która na każdej karcie mówi co innego.
                <InspireTile
                  destination={tile.destination}
                  heroImage={tile.heroImage}
                  fromPricePerNight={tile.fromPricePerNight}
                  flightFromPln={tile.flightFromPln}
                />
              ),
            }))}
          />
        </div>
      </section>
    </>
  );
}
