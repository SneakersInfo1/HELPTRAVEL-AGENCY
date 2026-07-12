// Budowa linku karta pakietu → krok 2 „Wybierz lot" (/pakiety/oferta).
// Stan wybranego hotelu niesiemy w URL (Faza 1 — bez server-session; sesja
// Redis §3.3 dochodzi w Fazie 2). Cena hotelu = wartość WYŚWIETLENIOWA
// (re-weryfikowana przy rezerwacji), więc bezpiecznie w query.

import type { PackageOffer } from "./types";

export interface OfferHrefContext {
  destination: string; // miasto (EN) — spójne z searchem
  dateFrom: string;
  dateTo: string;
  adults: number;
}

export function buildOfferHref(ctx: OfferHrefContext, offer: PackageOffer): string {
  const p = new URLSearchParams({
    destination: ctx.destination,
    dateFrom: ctx.dateFrom,
    dateTo: ctx.dateTo,
    adults: String(ctx.adults),
    hotelId: offer.hotel.hotelId,
    hotelName: offer.hotel.name,
    hotelPln: String(offer.pricing.breakdown.hotel.amount),
    nights: String(offer.hotel.nights),
  });
  if (offer.hotel.stars) p.set("stars", String(offer.hotel.stars));
  if (offer.hotel.boardName) p.set("board", offer.hotel.boardName);
  if (offer.hotel.freeCancellationUntil) p.set("freeCancel", offer.hotel.freeCancellationUntil);
  return `/pakiety/oferta?${p.toString()}`;
}
