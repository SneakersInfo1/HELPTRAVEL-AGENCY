import Image from "next/image";

import { LocalizedLink } from "@/components/site/localized-link";

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
}

export function ThemeTiles({ tiles }: { tiles: ThemeTile[] }) {
  if (tiles.length === 0) return null;

  return (
    <section aria-labelledby="theme-tiles" className="mx-auto w-full max-w-[2160px] px-4 sm:px-6 xl:px-8">
      <h2 id="theme-tiles" className="font-display text-2xl leading-tight text-emerald-950 sm:text-3xl">
        Nie wiesz, dokąd jechać?
      </h2>
      <p className="mt-1 text-xs leading-5 text-neutral-500 sm:text-sm">
        Zacznij od typu wyjazdu — każdy prowadzi do sprawdzonych kierunków z cenami.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {tiles.map((tile) => (
          <LocalizedLink
            key={tile.slug}
            href={`/wyjazdy/${tile.slug}`}
            className="group relative flex aspect-[4/3] overflow-hidden rounded-2xl border border-emerald-900/10 bg-emerald-50 shadow-[0_8px_24px_rgba(16,84,48,0.08)] transition hover:-translate-y-1 hover:shadow-[0_16px_36px_rgba(16,84,48,0.16)] lg:aspect-[4/3]"
          >
            <Image
              src={tile.heroImage}
              alt={tile.imageAlt}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 50vw, 25vw"
              className="object-cover transition duration-300 group-hover:scale-[1.04]"
            />
            <div className="relative z-10 mt-auto w-full bg-[linear-gradient(180deg,rgba(5,18,11,0)_0%,rgba(5,18,11,0.85)_55%,rgba(5,18,11,0.92)_100%)] p-3 text-white sm:p-4">
              <h3 className="font-display text-lg leading-tight sm:text-xl">{tile.label}</h3>
              <p className="mt-0.5 hidden text-[11px] text-white/80 sm:block">{tile.tagline}</p>
              <p className="mt-1 text-[11px] font-semibold text-amber-300">
                Zobacz kierunki <span aria-hidden>→</span>
              </p>
            </div>
          </LocalizedLink>
        ))}
      </div>
    </section>
  );
}
