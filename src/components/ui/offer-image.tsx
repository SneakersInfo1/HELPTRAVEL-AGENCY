"use client";

// Zdjęcie oferty z deterministycznym zastępnikiem.
//
// PO CO — zgłoszenie właściciela 2026-08-04: „w ciągu dnia pojawiały się
// oferty, przy których zdjęcie się nie ładowało". Audyt repo potwierdził
// przyczynę systemową: na 33 miejsca renderujące zdjęcia 29 nie miało ŻADNEJ
// obsługi błędu. Karta sprawdzała najwyżej, czy URL istnieje — a to nie to
// samo, co czy da się go pobrać.
//
// Realne powody padania konkretnego zdjęcia przy działającej reszcie strony:
// wygasający URL z CDN dostawcy, 403 po zmianie polityki hotlinkowania, 404 po
// usunięciu zdjęcia u źródła, timeout proxy, host spoza allowlisty CSP.
// Wszystkie kończyły się pustym prostokątem albo ikoną zepsutego obrazka.
//
// `next/image` przyjmuje `onError` tylko w komponencie KLIENCKIM, a karty ofert
// są serwerowe — stąd ten cienki wrapper zamiast obsługi w każdej karcie.

import Image from "next/image";
import { Building2, MapPin, Plane } from "lucide-react";
import { useState } from "react";

import { wybierzTloZastepnika } from "./offer-image-fallback";

export type WariantZastepnika = "lot" | "hotel" | "kierunek";

const IKONY = {
  lot: Plane,
  hotel: Building2,
  kierunek: MapPin,
} as const;

interface Props {
  src: string | null | undefined;
  alt: string;
  sizes: string;
  /** Klucz determinujący wygląd zastępnika — id kierunku, hotelu albo trasy. */
  kluczZastepnika: string;
  wariant: WariantZastepnika;
  className?: string;
  priority?: boolean;
}

export function OfferImage({
  src,
  alt,
  sizes,
  kluczZastepnika,
  wariant,
  className,
  priority,
}: Props) {
  // Zapamiętujemy KTÓRY adres padł, a nie samo „padło".
  //
  // Znalezione w review: zwykły boolean przywiera do instancji komponentu, a nie
  // do zdjęcia. Karty ofert rotują co pół godziny i React chętnie użyje tego
  // samego węzła dla nowej oferty — wtedy poprawne zdjęcie nowego kierunku
  // nadal pokazywałoby zastępnik po nieudanym zdjęciu poprzedniego. Porównanie
  // z bieżącym `src` sprawia, że nieudany adres blokuje wyłącznie sam siebie.
  const [adresKtoryPadl, setAdresKtoryPadl] = useState<string | null>(null);
  const Ikona = IKONY[wariant];

  // Brak URL i nieudane pobranie prowadzą do TEGO SAMEGO widoku — dla
  // użytkownika to ta sama sytuacja („nie ma zdjęcia"), więc nie ma powodu,
  // żeby wyglądały inaczej.
  if (!src || adresKtoryPadl === src) {
    return (
      <span
        aria-hidden
        className={`grid h-full w-full place-items-center ${wybierzTloZastepnika(kluczZastepnika)}`}
      >
        <Ikona className="h-5 w-5 text-brand/70" strokeWidth={1.75} />
      </span>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      // Bez `unoptimized`: loader projektu i tak omija /_next/image, a błąd
      // sieciowy złapiemy niżej.
      onError={() => setAdresKtoryPadl(src)}
      className={className}
    />
  );
}
