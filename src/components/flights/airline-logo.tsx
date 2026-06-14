"use client";

// Logo przewoźnika z bezpiecznym fallbackiem (zadanie 3 / 6).
//
// LiteAPI zwraca `carrier.marketingLogo` (np. .../static/images/airlines/BA.png).
// Domena jest dopuszczona w CSP (next.config.ts img-src *.nuitee.flights). Mimo
// to NIGDY nie pokazujemy broken image: brak URL-a albo błąd ładowania (404 /
// blokada) → neutralny badge z kodem IATA przewoźnika (np. „BA"), a gdy i tego
// brak — ikona samolotu. Czysty, reużywalny komponent (wyniki, szczegóły, mail).

import { useState } from "react";

interface Props {
  /** carrier.marketingLogo z LiteAPI. */
  logoUrl?: string;
  /** Kod IATA przewoźnika, np. „BA" — używany jako inicjały fallbacku. */
  code?: string;
  /** Pełna nazwa, np. „British Airways" — alt + tooltip. */
  name?: string;
  /** Rozmiar boku w px (kwadrat). Domyślnie 24. */
  size?: number;
  className?: string;
}

export function AirlineLogo({ logoUrl, code, name, size = 24, className = "" }: Props) {
  const [failed, setFailed] = useState(false);
  const label = name || code || "Przewoźnik";
  const badge = (code || name || "").trim().slice(0, 2).toUpperCase();

  if (!logoUrl || failed) {
    return (
      <span
        role="img"
        aria-label={label}
        title={label}
        style={{ width: size, height: size }}
        className={`grid shrink-0 place-items-center rounded bg-emerald-50 text-[10px] font-bold leading-none text-emerald-700 ${className}`}
      >
        {badge || "✈"}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl}
      alt={label}
      title={label}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      style={{ width: size, height: size }}
      className={`shrink-0 rounded bg-white object-contain ${className}`}
    />
  );
}
