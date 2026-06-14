// Typy + mapper ancillaries (zadanie 6) — FUNDAMENT Faza D2. servicesAttachable
// z prebooka mapowany na typy domenowe. CELOWO NIEWPIĘTE jeszcze w UI/booking:
// kontrakt attach→booking dotyka ścieżki płatności i weryfikujemy go dopiero
// realną rezerwacją (test z kartą) — patrz decyzja zakresu Fazy D.
//
// Kształt zweryfikowany empirycznie (prebook 2026-06-14):
//   servicesAttachable.groups[] = { category:"seat"|"baggage", label, services[] }
//   service = { serviceId, name, category, pricing.display.{amount,currency},
//               passengerType, segmentKey,
//               metadata.seat?{seatNumber,seatRow,seatColumn,position,seatType,available} }
// Zaobserwowane: 478 miejsc (0–188 PLN) + „Extra Baggage" 10/20/40/60 kg (178–639 PLN).

export type AncillaryCategory = "seat" | "baggage" | "other";

export interface SeatMeta {
  seatNumber?: string;
  seatRow?: number;
  seatColumn?: string;
  /** window / middle / aisle */
  position?: string;
  /** standard / exit_row / … */
  seatType?: string;
  available: boolean;
}

export interface FlightAncillary {
  serviceId: string;
  category: AncillaryCategory;
  name: string;
  price: number;
  currency: string;
  passengerType?: string;
  segmentKey?: string;
  seat?: SeatMeta;
}

export interface FlightAncillaryGroup {
  category: AncillaryCategory;
  label: string;
  services: FlightAncillary[];
}

/** Dodatek wybrany przez użytkownika (do podsumowania ceny i przekazania do API). */
export interface SelectedAncillary {
  serviceId: string;
  category: AncillaryCategory;
  name: string;
  price: number;
  currency: string;
  passengerIndex?: number;
  segmentKey?: string;
}

// ── Mapper: servicesAttachable → grupy domenowe (Faza D2) ─────────────────────

interface RawService {
  serviceId?: string;
  name?: string;
  category?: string;
  pricing?: { display?: { amount?: number; currency?: string } };
  passengerType?: string;
  segmentKey?: string;
  metadata?: { seat?: Partial<SeatMeta> & { available?: boolean } };
}
interface RawGroup { category?: string; label?: string; services?: RawService[] }

function toCategory(v: string | undefined): AncillaryCategory {
  return v === "seat" || v === "baggage" ? v : "other";
}

/** Czysty mapper kształtu LiteAPI → FlightAncillaryGroup[]. Tolerancyjny na braki. */
export function mapServicesAttachable(servicesAttachable: unknown): FlightAncillaryGroup[] {
  const groups = (servicesAttachable as { groups?: RawGroup[] } | null)?.groups ?? [];
  return groups.map((g) => ({
    category: toCategory(g.category),
    label: g.label ?? "",
    services: (g.services ?? [])
      .filter((s): s is RawService & { serviceId: string } => Boolean(s.serviceId))
      .map((s) => ({
        serviceId: s.serviceId,
        category: toCategory(s.category ?? g.category),
        name: s.name ?? "",
        price: s.pricing?.display?.amount ?? 0,
        currency: s.pricing?.display?.currency ?? "PLN",
        passengerType: s.passengerType,
        segmentKey: s.segmentKey,
        seat: s.metadata?.seat ? { ...s.metadata.seat, available: s.metadata.seat.available !== false } : undefined,
      })),
  }));
}

/** Suma cen wybranych dodatków (do podsumowania końcowego). */
export function selectedAncillariesTotal(selected: SelectedAncillary[]): number {
  return selected.reduce((sum, s) => sum + s.price, 0);
}
