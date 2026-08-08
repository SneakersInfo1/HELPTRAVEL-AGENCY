"use client";

// Lista polubionych obiektów (brief V3 §17).
//
// CZEGO TU CELOWO NIE MA: CENY. Zapisana cena zależy od terminu, liczby osób,
// taryfy i dostępności — po tygodniu jest nieprawdą, a pokazana jako aktualna
// byłaby obietnicą, której nie dotrzymamy. Zamiast tego każdy kafel prowadzi
// do obiektu, gdzie cena pobiera się na żywo (brief §16).
//
// Renderowanie po stronie klienta, bo źródłem jest localStorage. Do pierwszego
// odczytu pokazujemy szkielet — nie pusty stan, bo „nie masz polubionych"
// mignięte gościowi, który ich ma, jest gorsze niż chwila ciszy.

import Image from "next/image";
import Link from "next/link";
import { Heart, MapPin, Trash2 } from "lucide-react";


import { removeFavorite, useFavorites } from "@/lib/hotels/favorites-store";
import { ratingLabel } from "@/lib/hotels/rating";
import { localizeCountry } from "@/lib/mvp/i18n-geo";
import { useHydrated } from "@/lib/ui/use-hydrated";

export function FavoritesList() {
  const hotels = useFavorites();
  // Na serwerze store zwraca pustą listę, więc bez tej flagi pierwszy render
  // pokazałby „nie masz polubionych" gościowi, który je ma.
  const gotowe = useHydrated();

  if (!gotowe) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-64 animate-pulse rounded-2xl bg-neutral-100 motion-reduce:animate-none" />
        ))}
      </div>
    );
  }

  if (hotels.length === 0) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white px-6 py-14 text-center">
        <Heart aria-hidden className="mx-auto h-10 w-10 text-rose-200" />
        <h2 className="mt-4 text-lg font-bold text-neutral-900">
          Nie masz jeszcze polubionych hoteli
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-neutral-600">
          Kliknij serce przy obiekcie, aby zachować go tutaj. Wrócisz do niego,
          kiedy zechcesz — także z innego urządzenia po ponownym zapisaniu.
        </p>
        <Link
          href="/#hero"
          className="mt-6 inline-flex h-11 items-center justify-center rounded-lg bg-emerald-700 px-6 text-sm font-semibold text-white transition hover:bg-emerald-800"
        >
          Znajdź hotel
        </Link>
      </div>
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {hotels.map((h) => (
        <li
          key={h.id}
          className="group relative overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_4px_16px_rgba(16,84,48,0.06)] transition hover:border-emerald-300 hover:shadow-[0_12px_28px_rgba(16,84,48,0.12)]"
        >
          <Link href={h.href} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">
            <div className="relative aspect-[16/10] bg-neutral-100">
              {h.image ? (
                <Image
                  src={h.image}
                  alt=""
                  fill
                  sizes="(max-width: 639px) 92vw, (max-width: 1279px) 46vw, 30vw"
                  className="object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-700 to-emerald-900 p-4 text-center">
                  <span className="line-clamp-3 text-sm font-semibold text-white">{h.name}</span>
                </div>
              )}
            </div>
            <div className="p-4">
              <h2 className="truncate text-base font-semibold text-neutral-900">{h.name}</h2>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-neutral-500">
                <MapPin aria-hidden className="h-3.5 w-3.5 text-emerald-600" />
                {[h.city, h.country ? localizeCountry(h.country) : null].filter(Boolean).join(", ")}
              </p>
              {typeof h.rating === "number" && h.rating > 0 && (
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 text-emerald-800">
                  <span className="rounded bg-emerald-700 px-1.5 py-0.5 text-xs font-bold text-white">
                    {h.rating.toFixed(1)}
                  </span>
                  <span className="text-xs font-semibold">{ratingLabel(h.rating)}</span>
                </p>
              )}
              {/* Świadomie: „sprawdź cenę", nie cena. Zapisana kwota po kilku
                  dniach jest nieprawdą — patrz komentarz na górze pliku. */}
              <p className="mt-3 text-sm font-semibold text-emerald-700">
                Sprawdź aktualną dostępność →
              </p>
            </div>
          </Link>

          <button
            type="button"
            onClick={() => removeFavorite(h.id)}
            aria-label={`Usuń z polubionych: ${h.name}`}
            className="absolute right-2 top-2 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-neutral-700 shadow-sm backdrop-blur-sm transition hover:bg-white hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
          >
            <Trash2 aria-hidden className="h-5 w-5" />
          </button>
        </li>
      ))}
    </ul>
  );
}
