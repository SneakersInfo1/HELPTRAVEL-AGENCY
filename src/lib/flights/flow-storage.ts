"use client";

// Stan przepływu rezerwacji lotu przenoszony między stronami (wyniki →
// pasażerowie → płatność) przez sessionStorage. Klient-only. Lekki — sam
// kontekst wyboru + identyfikatory; wrażliwych danych (secretKey) nie
// trzymamy dłużej niż potrzeba (czyszczone po wejściu w płatność/sukces).

import type { DisplayOffer } from "./display";

const KEY = "ht_flight_flow_v1";

export interface FlightFlow {
  // Kontekst wyszukiwania (IATA + daty + pasażerowie) — z URL wyników.
  origin: string;
  destination: string;
  depart: string;
  ret?: string;
  adults: number;
  children: number;
  infants: number;
  // Wybrana oferta (po verify).
  offerId: string;
  offer: DisplayOffer;
  verifiedTotal: number | null;
  verifiedCurrency: string;
  verifiedAt: number; // epoch ms — do reguły „re-verify po 10 min"
  // Wybrana taryfa (krok „Bagaż / taryfa", Faza D) — do podsumowania w checkoutcie.
  fare?: { name: string; hasCarryOnBag: boolean; hasCheckedBag: boolean };
  // Po prebooku (ustawiane na stronie pasażerów).
  sessionId?: string;
  secretKey?: string;
  widgetEnv?: "live" | "sandbox";
}

export function saveFlightFlow(flow: FlightFlow): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(flow));
  } catch {
    /* sessionStorage może być niedostępny (tryb prywatny) — best-effort */
  }
}

export function loadFlightFlow(): FlightFlow | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as FlightFlow) : null;
  } catch {
    return null;
  }
}

export function patchFlightFlow(patch: Partial<FlightFlow>): FlightFlow | null {
  const cur = loadFlightFlow();
  if (!cur) return null;
  const next = { ...cur, ...patch };
  saveFlightFlow(next);
  return next;
}

export function clearFlightFlow(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* best-effort */
  }
}
