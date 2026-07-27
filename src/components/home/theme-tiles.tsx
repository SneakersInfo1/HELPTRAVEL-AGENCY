import Image from "next/image";

import { LocalizedLink } from "@/components/site/localized-link";
import { AssistantTile, ThemeGrid, TrackedTile } from "./theme-tiles-client";
import { HOME_COPY } from "@/lib/home/copy";
// `formatPricePln`, a NIE `formatPLN` z lib/money: to drugie zostawia kwoty
// czterocyfrowe bez separatora (`1137 zł`), bo `Intl` dla pl-PL domyślnie
// grupuje dopiero od pięciu cyfr. Kafle pokazywały przez to „od 1137 zł/os."
// dwa ekrany pod kartami z „od 1 480 zł" — ta sama liczba w dwóch zapisach
// na jednym ekranie podważa obie.
import { formatPricePln } from "@/lib/home/deal-card";

// „Nie wiesz, dokąd jechać?" — 4 duże kafle tematyczne → /wyjazdy/[typ]
// (2026-07-03, decyzja właściciela: wizualna wersja mood-chipów wypełnia
// desktop i daje niezdecydowanym drugą, obrazkową ścieżkę). Zdjęcia =
// media pierwszego picka moodu (ten sam resolver Pexels co kafelki
// kierunków — zero nowych zależności).

export interface ThemeTile {
  slug: string;
  label: string;
  /** Krótki podtytuł (eyebrow moodu z travel-moods — treść redakcyjna). */
  tagline: string;
  heroImage: string;
  imageAlt: string;
  /**
   * Najtańszy świeży pakiet (lot+hotel, na osobę) wśród kierunków kategorii.
   * Brak = kafel bez linii ceny. NIGDY nie liczone tutaj — patrz page.tsx.
   */
  fromPerPersonPln?: number;
}

export function ThemeTiles({
  tiles,
  heading = HOME_COPY.themes.heading,
}: {
  tiles: ThemeTile[];
  /** Nagłówek podbloku — propsem, żeby dało się go testować. */
  heading?: string;
}) {
  if (tiles.length === 0) return null;

  return (
    // PODBLOK sekcji „Nie wiesz, dokąd jechać?", nie własna sekcja. Do fazy 3a
    // kafle miały tu <section> z własnym <h2> o TEJ SAMEJ treści co nagłówek
    // sekcji, w której teraz siedzą — dokument miał dwa identyczne nagłówki
    // drugiego poziomu i sekcję zagnieżdżoną w sekcji, a czytnik ekranu
    // zapowiadał „Nie wiesz, dokąd jechać?" dwa razy pod rząd. Zostaje <h3>,
    // który mówi, czym te kafle różnią się od dobieracza nad nimi.
    <div className="mt-8">
      <h3 className="font-display text-xl leading-tight text-ink">{heading}</h3>

      <ThemeGrid
        className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
        items={tiles.map((t) => ({
          slug: t.slug,
          label: t.label,
          fromPerPersonPln: t.fromPerPersonPln,
        }))}
      >
        {/* Kafel konsjerża PIERWSZY: to jedyna ścieżka, która nie wymaga od
            użytkownika żadnej decyzji z góry — a sekcja istnieje właśnie dla
            niezdecydowanych. */}
        <AssistantTile />
        {tiles.map((tile, index) => (
          <TrackedTile
            key={tile.slug}
            slug={tile.slug}
            position={index + 1}
            label={tile.label}
            fromPerPersonPln={tile.fromPerPersonPln}
          >
          <LocalizedLink
            href={`/wyjazdy/${tile.slug}`}
            className="group relative flex aspect-[4/3] overflow-hidden rounded-2xl border border-line bg-brand-soft shadow-md transition duration-200 ease-out hover:-translate-y-1 hover:shadow-lg active:scale-[0.99] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100 lg:aspect-[4/3]"
          >
            <Image
              src={tile.heroImage}
              alt={tile.imageAlt}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 50vw, 25vw"
              className="object-cover transition duration-200 ease-out group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
            />
            {/* Scrim jak na kafelkach sekcji A: przejście NAD tekstem, blok
                tekstowy startuje od krycia 0,72. Przy gradiencie zaczynającym
                się od przezroczystości nazwa klimatu stała na kryciu bliskim
                zeru — na jasnym zdjęciu to ~1,3:1 przy wymaganych 4,5:1. */}
            <div className="relative z-10 mt-auto w-full text-white">
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-full h-10 bg-[linear-gradient(to_top,rgba(5,18,11,0.72),rgba(5,18,11,0))]"
              />
              <div className="relative bg-[linear-gradient(180deg,rgba(5,18,11,0.72)_0%,rgba(5,18,11,0.9)_45%,rgba(5,18,11,0.94)_100%)] p-3 sm:p-4">
              {/* h4, nie h3: nagłówkiem tej grupy jest teraz „Albo wybierz po
                  klimacie", więc kafle są o poziom niżej. */}
              <h4 className="font-display text-lg leading-tight sm:text-xl">{tile.label}</h4>
              <p className="mt-0.5 hidden text-xs text-white/80 sm:block">{tile.tagline}</p>
              {tile.fromPerPersonPln ? (
                // Cena zamiast „Zobacz kierunki": etykieta nawigacyjna nie
                // niosła żadnej informacji (link i tak prowadzi dalej), a
                // liczba odpowiada na pytanie, które realnie blokuje kliknięcie.
                // Akcent amber jest tu na miejscu — jest zarezerwowany właśnie
                // dla ceny, to ta sama rola co na kafelkach kierunków.
                <p className="mt-1 text-sm font-bold leading-snug text-accent-bright">
                  <span className="whitespace-nowrap">
                    od {formatPricePln(tile.fromPerPersonPln)}
                    <span className="text-[11px] font-semibold text-white/75">/os.</span>
                  </span>
                </p>
              ) : (
                <p className="mt-1 text-xs font-semibold text-white/90">
                  Zobacz kierunki <span aria-hidden>→</span>
                </p>
              )}
              </div>
            </div>
          </LocalizedLink>
          </TrackedTile>
        ))}
      </ThemeGrid>
    </div>
  );
}
