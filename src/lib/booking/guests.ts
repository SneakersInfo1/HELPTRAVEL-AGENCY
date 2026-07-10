// Normalizacja gości → occupancy dla LiteAPI POST /rates/book.
//
// INCYDENT PROD 2026-07-10 (req_id 3BiA_qkKx6A8D9nCPYle6): płatność przeszła,
// book zwrócił 400 „invalid occupancy number" — formularz wysłał TRZECH gości
// z occupancyNumber 1,2,3, a prebook był na JEDEN pokój (jedno occupancy).
// Semantyka LiteAPI (potwierdzona przez ich support): guests[] mapuje się 1:1
// na POKOJE rezerwacji — dokładnie jeden gość główny na occupancy; dodatkowe
// osoby w pokoju NIE są osobnymi wpisami.
//
// Ten helper jest OSTATECZNĄ, serwerową gwarancją tej semantyki: cokolwiek
// przyśle klient (stary formularz, zmanipulowany payload, stara sesja Redis
// sprzed deploya), do LiteAPI wychodzi zawsze dokładnie jeden gość na pokój
// 1..rooms. Brakujący gość pokoju → dane osoby rezerwującej (holder) — hotel
// i tak wymaga tylko gościa głównego. Wywoływany w OBU routach:
// prebook (normalizuje przed zapisem sesji) i book (łata sesje sprzed fixu
// oraz payloady Phase 2 z body).

import type { LiteApiGuest, LiteApiHolder } from "@/lib/liteapi";

const MAX_NAME_LEN = 40; // limit LiteApiGuestSchema — dłuższe imiona ucinamy, nie wywalamy

function clampName(v: string): string {
  return v.trim().slice(0, MAX_NAME_LEN);
}

export interface NormalizedGuests {
  guests: LiteApiGuest[];
  /** true = wejście wymagało korekty (log ostrzegawczy u wołającego). */
  changed: boolean;
}

export function normalizeGuestsForRooms(
  guests: readonly LiteApiGuest[] | undefined,
  holder: LiteApiHolder,
  rooms: number,
): NormalizedGuests {
  const roomCount = Number.isInteger(rooms) && rooms >= 1 ? Math.min(rooms, 9) : 1;
  const input = guests ?? [];

  const normalized: LiteApiGuest[] = [];
  for (let occupancy = 1; occupancy <= roomCount; occupancy++) {
    const provided = input.find(
      (g) =>
        g.occupancyNumber === occupancy &&
        typeof g.firstName === "string" &&
        g.firstName.trim().length > 0 &&
        typeof g.lastName === "string" &&
        g.lastName.trim().length > 0,
    );
    normalized.push(
      provided
        ? {
            occupancyNumber: occupancy,
            firstName: clampName(provided.firstName),
            lastName: clampName(provided.lastName),
            ...(provided.email ? { email: provided.email } : {}),
          }
        : {
            occupancyNumber: occupancy,
            firstName: clampName(holder.firstName),
            lastName: clampName(holder.lastName),
            email: holder.email,
          },
    );
  }

  const changed =
    input.length !== normalized.length ||
    normalized.some((g, i) => {
      const orig = input[i];
      return (
        !orig ||
        orig.occupancyNumber !== g.occupancyNumber ||
        orig.firstName !== g.firstName ||
        orig.lastName !== g.lastName
      );
    });

  return { guests: normalized, changed };
}
