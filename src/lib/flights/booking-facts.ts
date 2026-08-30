// Odczyt FAKTÓW o rezerwacji z odpowiedzi lotniczej LiteAPI.
//
// ── DLACZEGO POWSTAŁ (pomiar 2026-08-30) ─────────────────────────────────────
//
// Trzy miejsca w kodzie parsowały odpowiedź rezerwacji NIEZALEŻNIE —
// `finalize.ts` (`readBookingFacts`), webhook lotów i `GET /api/flights/booking/[id]`
// (po `ticketingFromLive`) — i wszystkie trzy schodziły do `data[0]`, po czym
// czytały `status`, `pnr`, `eTicketNumbers` WPROST z tego węzła.
//
// Odczyt PRAWDZIWEJ rezerwacji z produkcji (`GET /flights/bookings/{id}`,
// szkielet w `docs/liteapi-flights-sample-booking.json`) pokazał, że dostawca
// pakuje rekord o POZIOM GŁĘBIEJ:
//
//   { data: [ { booking: { bookingId, status, timestamp, journey, passengers,
//                          contact, pricing } } ] }
//
// Czyli `data[0].status` NIE ISTNIEJE. Skutki na ścieżce pieniędzy:
//
//   • `mapBookingStatus(undefined)` w `finalize.ts` wpada w gałąź domyślną i
//     zwraca `"confirmed"`. Rezerwacja `pending` albo `cancelled` u dostawcy
//     zostałaby u nas zapisana jako POTWIERDZONA — i taki mail dostałby klient.
//   • `extractBookingId` nie znajduje `bookingId`, więc finalizacja podstawia
//     `prebookId`. Adres potwierdzenia i indeks `bybooking` wskazywałyby wtedy
//     identyfikator, którego `GET /flights/bookings/{id}` nie zna.
//   • `pnr` i numery biletów nigdy nie trafiają na stronę potwierdzenia.
//
// Ten moduł jest JEDNYM miejscem, które wie, jak wygląda ta odpowiedź. Czyta
// OBA poziomy (`data[0]` i `data[0].booking`), preferując ten, który faktycznie
// niesie dane — więc działa tak samo, jeżeli dostawca kiedyś spłaszczy kształt.

import type { FlightTicketingStatus } from "./session";

export interface FlightBookingFacts {
  bookingId?: string;
  status?: string;
  pnr?: string;
  eTicketNumbers?: string[];
  ticketingStatus: FlightTicketingStatus;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/**
 * Węzły-kandydaci, od najbardziej zagnieżdżonego do najpłytszego.
 *
 * Kolejność ma znaczenie: `data[0].booking` wygrywa z `data[0]`, bo to on
 * niesie rekord w zmierzonym kształcie. Każdy kandydat jest sprawdzany
 * osobno per POLE — dzięki temu odpowiedź hybrydowa (część pól na wierzchu,
 * część w `booking`) też zostanie odczytana w całości.
 */
function candidateNodes(payload: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const root = asRecord(payload);
  const dataField = root?.data;
  const first = Array.isArray(dataField) ? dataField[0] : (dataField ?? payload);

  const firstRec = asRecord(first);
  if (firstRec) {
    const nested = asRecord(firstRec.booking);
    if (nested) out.push(nested);
    out.push(firstRec);
  }
  if (root && root !== firstRec) out.push(root);
  return out;
}

function pickString(nodes: Record<string, unknown>[], ...keys: string[]): string | undefined {
  for (const node of nodes) {
    for (const key of keys) {
      const v = node[key];
      if (typeof v === "string" && v.trim() !== "") return v.trim();
    }
  }
  return undefined;
}

function pickStringArray(nodes: Record<string, unknown>[], key: string): string[] | undefined {
  for (const node of nodes) {
    const v = node[key];
    if (Array.isArray(v)) {
      const strings = v.filter((x): x is string => typeof x === "string" && x.trim() !== "");
      if (strings.length > 0) return strings;
    }
  }
  return undefined;
}

/**
 * Wyciąga fakty z odpowiedzi `POST /flights/bookings` albo
 * `GET /flights/bookings/{id}`.
 *
 * Wszystko jest opcjonalne poza `ticketingStatus`: brak numerów biletów to
 * `"pending"`, nie błąd — bilet bywa wystawiany po rezerwacji.
 */
export function readFlightBookingFacts(payload: unknown): FlightBookingFacts {
  const nodes = candidateNodes(payload);
  const eTicketNumbers = pickStringArray(nodes, "eTicketNumbers");
  return {
    bookingId: pickString(nodes, "bookingId", "bookingID", "id"),
    status: pickString(nodes, "status"),
    pnr: pickString(nodes, "pnr", "recordLocator"),
    eTicketNumbers,
    ticketingStatus: eTicketNumbers && eTicketNumbers.length > 0 ? "ticketed" : "pending",
  };
}
