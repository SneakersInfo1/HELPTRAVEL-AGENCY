"use client";

// Wpis „Polubione" w głównej nawigacji (brief V3 §14).
//
// Osobny komponent, bo licznik pochodzi z localStorage — a `SiteShell` ma
// zostać komponentem, który renderuje się identycznie na serwerze i kliencie.
// Tu licznik pojawia się dopiero po odczycie, więc hydracja jest spójna:
// serwer i pierwszy render klienta pokazują sam link bez liczby.
//
// Nawigacja jest WSPÓLNA dla całego serwisu (homepage też), więc ten wpis
// widać wszędzie — o to chodziło: gość ma wiedzieć, gdzie wrócić po zapisane
// obiekty, niezależnie od tego, gdzie akurat jest.

import { Heart } from "lucide-react";


import { LocalizedLink } from "@/components/site/localized-link";
import { useFavorites } from "@/lib/hotels/favorites-store";
import { useHydrated } from "@/lib/ui/use-hydrated";

export function FavoritesNavLink({
  label,
  active,
  variant = "desktop",
}: {
  label: string;
  active: boolean;
  variant?: "desktop" | "mobile";
}) {
  const hotels = useFavorites();
  const gotowe = useHydrated();
  const count = gotowe ? hotels.length : 0;

  if (variant === "mobile") {
    return (
      <LocalizedLink
        href="/polubione"
        className={`inline-flex items-center gap-2 rounded-[1.2rem] border px-4 py-3 text-sm font-semibold transition ${
          active
            ? "border-emerald-700 bg-emerald-700 text-white"
            : "border-emerald-900/10 bg-white text-emerald-950 hover:bg-emerald-50"
        }`}
      >
        <Heart aria-hidden className={`h-4 w-4 ${count > 0 ? "fill-rose-600 text-rose-600" : ""}`} />
        {label}
        {count > 0 && <span className="text-xs font-bold">({count})</span>}
      </LocalizedLink>
    );
  }

  return (
    <LocalizedLink
      href="/polubione"
      aria-current={active ? "page" : undefined}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm transition-colors ${
        active ? "font-semibold text-brand" : "font-medium text-ink-muted hover:text-ink"
      }`}
    >
      <Heart
        aria-hidden
        className={`h-4 w-4 ${count > 0 ? "fill-rose-600 text-rose-600" : ""}`}
        strokeWidth={2}
      />
      <span>{label}</span>
      {count > 0 && (
        <span className="rounded-full bg-rose-600 px-1.5 text-[11px] font-bold leading-5 text-white">
          {count}
        </span>
      )}
    </LocalizedLink>
  );
}
