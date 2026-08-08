"use client";

// Serce „zapisz obiekt" — karta wyniku i strona hotelu (brief V3 §15).
//
// Jeden komponent na oba miejsca, żeby stan i etykiety nie rozjechały się
// między widokami. Wariant `card` to okrągły przycisk na zdjęciu, wariant
// `inline` to przycisk z podpisem obok tytułu hotelu.
//
// DOSTĘPNOŚĆ: to `button` z `aria-pressed`, nie ikona z `onClick` na `div`.
// Działa klawiaturą, czytnik ekranu mówi „Zapisz obiekt, przycisk,
// niezaznaczony". Cel dotyku 44 px (WCAG 2.2 AA).
//
// UWAGA NA ZAGNIEŻDŻENIE: karta wyniku jest JEDNYM wielkim `<Link>`.
// Przycisk wewnątrz linku to prawidłowy HTML tylko dlatego, że zatrzymujemy
// zdarzenie — bez `preventDefault` klik w serce nawigowałby do hotelu.

import { Heart } from "lucide-react";
import { useCallback } from "react";

import { track } from "@/lib/analytics/track";
import { toggleFavorite, useIsFavorite, type FavoriteHotel } from "@/lib/hotels/favorites-store";

export function FavoriteButton({
  hotel,
  variant = "card",
}: {
  hotel: Omit<FavoriteHotel, "savedAt">;
  variant?: "card" | "inline";
}) {
  const saved = useIsFavorite(hotel.id);

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      // Karta wyniku jest linkiem — bez tego klik w serce otwierałby hotel.
      e.preventDefault();
      e.stopPropagation();
      const added = toggleFavorite(hotel);
      if (added) track("hotel_save", { hotel_id: hotel.id, destination: hotel.city });
    },
    [hotel],
  );

  const label = saved ? "Usuń z polubionych" : "Dodaj do polubionych";

  if (variant === "inline") {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={saved}
        aria-label={label}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-800 transition hover:border-rose-300 hover:text-rose-700"
      >
        <Heart
          aria-hidden
          className={`h-4 w-4 transition ${saved ? "fill-rose-600 text-rose-600" : "text-neutral-500"}`}
        />
        {saved ? "Zapisane" : "Zapisz"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={saved}
      aria-label={label}
      title={label}
      className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur-sm transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
    >
      <Heart
        aria-hidden
        className={`h-5 w-5 transition ${saved ? "fill-rose-600 text-rose-600" : "text-neutral-700"}`}
      />
    </button>
  );
}
