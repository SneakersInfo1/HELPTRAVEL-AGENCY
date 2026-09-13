import { isBookableStart } from "@/lib/concierge/travel-dates";
import { priceFreshness } from "@/lib/snapshot/coverage";
import { travelToday } from "@/lib/time/travel-now";

// Kontrakt kwoty w tytule, opisie i OG strony.
//
// Tytuł żyje dłużej niż cena: w cache ISR (do doby) i w indeksie Google (dni).
// Dlatego kwota trafia tam wyłącznie z rekordu, który w chwili renderu jest
// FRESH (≤ 12 h — ta sama definicja co w snapshocie konsjerża) i dotyczy
// terminu, który da się jeszcze kupić. Cena modelowana (estimateBudget) nie ma
// ani `pricedAt`, ani terminu, więc przez ten kontrakt nie przejdzie.
//
// Strona, która podłączy realne źródło, musi mieć revalidate ≤ 12 h — inaczej
// tytuł przeżyje świeżość ceny, którą pokazuje.

declare const verifiedPrice: unique symbol;

export interface PriceObservation {
  /** Kwota w PLN z realnego rekordu (np. `hotelPlnPerNight` ze snapshotu). */
  amountPln: number | null;
  /** Epoch ms wyliczenia ceny. */
  pricedAt: number;
  /** Pierwszy dzień terminu, którego dotyczy cena (YYYY-MM-DD). */
  startIso: string;
}

/**
 * Kwota dopuszczona do tytułu. Oznaczona typem, którego nie da się złożyć
 * literałem — powstaje wyłącznie w `verifyTitlePrice`.
 */
export interface VerifiedTitlePrice {
  readonly amountPln: number;
  readonly startIso: string;
  readonly [verifiedPrice]: true;
}

export function verifyTitlePrice(
  observation: PriceObservation | null | undefined,
  nowMs: number,
): VerifiedTitlePrice | null {
  if (!observation) return null;
  const { amountPln, pricedAt, startIso } = observation;
  if (typeof amountPln !== "number" || !Number.isFinite(amountPln) || amountPln <= 0) return null;
  if (priceFreshness(pricedAt, nowMs) !== "FRESH") return null;
  if (!isBookableStart(startIso, travelToday(nowMs))) return null;
  return { amountPln: Math.round(amountPln), startIso } as VerifiedTitlePrice;
}
