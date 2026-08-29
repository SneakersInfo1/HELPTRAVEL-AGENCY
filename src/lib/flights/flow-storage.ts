"use client";

// Stan przepływu rezerwacji lotu przenoszony między stronami (wyniki →
// taryfa → pasażerowie → płatność) przez sessionStorage. Klient-only.
//
// ── NAZEWNICTWO KWOT (zmiana 2026-08-29) ─────────────────────────────────────
//
// Do tej pory było JEDNO pole `verifiedTotal` i przechodziły przez nie trzy
// różne rzeczy: cena z listy (nic nie zweryfikowane), cena po verify i cena
// locka z prebooka. Nazwa kłamała w dwóch z trzech przypadków, a skutek nie był
// kosmetyczny: strona pasażerów po prostu nadpisywała `verifiedTotal` kwotą
// z prebooka, więc kwota zaakceptowana przez klienta znikała bez śladu i bez
// pytania. Rozdzielenie na dwa pola sprawia, że rozjazd jest widoczny w typach,
// a nie tylko w intencjach.
//
//   selectedTotal — co użytkownik WIDZIAŁ i na co się zgodził na tym kroku
//   lockedTotal   — co zablokował dostawca w prebooku (to obciąży kartę)
//
// Różnica między nimi ZAWSZE przechodzi przez świadomą akceptację.
//
// Klucz podbity do `v2`, żeby sesje z otwartą starą kartą nie próbowały czytać
// nieistniejących pól.

import type { DisplayOffer } from "./display";

const KEY = "ht_flight_flow_v2";

export interface FlightFlow {
  // Kontekst wyszukiwania (IATA + daty + pasażerowie) — z URL wyników.
  origin: string;
  destination: string;
  depart: string;
  ret?: string;
  adults: number;
  children: number;
  infants: number;
  // Wybrana oferta.
  offerId: string;
  offer: DisplayOffer;
  /** Kwota pokazana użytkownikowi na tym kroku (lista → verify → akceptacja). */
  selectedTotal: number | null;
  selectedCurrency: string;
  /** Kiedy `selectedTotal` ostatnio potwierdzono przez verify (epoch ms). */
  verifiedAt: number;
  /** `true` = `selectedTotal` pochodzi z /flights/verify, nie z listy wyników. */
  verified: boolean;
  // Wybrana taryfa (krok „Bagaż / taryfa") — do podsumowania w checkoutcie.
  fare?: { name: string; hasCarryOnBag: boolean; hasCheckedBag: boolean };
  // Po prebooku (ustawiane na stronie pasażerów).
  sessionId?: string;
  secretKey?: string;
  widgetEnv?: "live" | "sandbox";
  /** Kwota locka z prebooka — dokładnie ta obciąży kartę. */
  lockedTotal?: number;
  lockedCurrency?: string;
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

/** Liczba podróżnych w tym przepływie (dorośli + dzieci + niemowlęta). */
export function flowTravellers(flow: Pick<FlightFlow, "adults" | "children" | "infants">): number {
  return flow.adults + flow.children + flow.infants;
}
