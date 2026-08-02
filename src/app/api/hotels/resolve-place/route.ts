// GET /api/hotels/resolve-place?placeId=…&name=…
//
// Zamienia Google Place ID obiektu noclegowego (z podpowiedzi `/data/places`)
// na `hotelId` LiteAPI, czyli na adres strony hotelu w tym serwisie.
//
// PO CO OSOBNY ENDPOINT
// Publiczne LiteAPI nie wyszukuje hoteli po nazwie — zweryfikowane kluczem
// produkcyjnym 2026-08-02:
//   /v3.0/hotels/search-by-name         → 404 (istnieje tylko w white-labelu)
//   /v3.0/data/hotels?hotelName=Chopin  → 400 „you must search by either
//                                          country code, latitude and longitude,
//                                          placeId, lastUpdatedAt, IATA code,
//                                          or hotelIds"
// Za to `/data/hotels?placeId=…` odpowiada listą hoteli przy tym miejscu,
// z trafionym obiektem na czele. To jest ta jedna brakująca szpula.
//
// DLACZEGO DOPIERO PRZY WYBORZE, A NIE W PODPOWIEDZIACH
// Rozwiązywanie każdej podpowiedzi kosztowałoby jedno wywołanie LiteAPI na
// pozycję listy przy każdym naciśnięciu klawisza. Tutaj jest dokładnie jedno
// wywołanie na jedno kliknięcie użytkownika.
//
// KONTRAKT ODPOWIEDZI: `{ hotelId: string | null }`. `null` NIE jest błędem —
// to sygnał „nie mam pewności", po którym formularz szuka w mieście obiektu.

import { NextRequest, NextResponse } from "next/server";

import { fetchHotelsByPlaceId } from "@/lib/liteapi/search";
import { pickMatchingHotel } from "@/lib/hotels/match-hotel-name";
import { enforceRateLimit } from "@/lib/rate-limit";

/** Ile kandydatów sprawdzamy. Trafiony obiekt bywa pierwszy, ale to obserwacja,
 *  nie kontrakt dostawcy — pięć daje zapas bez powiększania odpowiedzi. */
const CANDIDATES = 5;

export async function GET(request: NextRequest) {
  // Ten sam limiter co podpowiedzi: to jedna ścieżka użytkownika (pisanie →
  // wybór), więc dzieli jeden budżet zapytań do dostawcy.
  const limited = await enforceRateLimit(request, "destination-suggest");
  if (limited) return limited;

  const placeId = request.nextUrl.searchParams.get("placeId")?.trim() ?? "";
  const name = request.nextUrl.searchParams.get("name")?.trim() ?? "";
  if (!placeId || !name) {
    return NextResponse.json({ hotelId: null, reason: "missing_params" }, { status: 400 });
  }

  try {
    const list = await fetchHotelsByPlaceId({ placeId, limit: CANDIDATES });
    const hotels = (list.data ?? []).map((h) => ({ id: h.id, name: h.name }));
    // Bramka nazwy — bez niej „Burj Al Arab" (Google zwraca PLAŻĘ o tej nazwie)
    // otwierałoby stronę zupełnie innego hotelu. Patrz lib/hotels/match-hotel-name.
    const match = pickMatchingHotel(name, hotels);

    return NextResponse.json(
      { hotelId: match?.id ?? null, hotelName: match?.name ?? null },
      {
        headers: {
          // Ten sam obiekt rozwiązuje się zawsze tak samo, a metadane LiteAPI
          // i tak są cache'owane na dobę — powtórny wybór tego samego hotelu
          // nie ma powodu kosztować drugiego wywołania.
          "Cache-Control": "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800",
        },
      },
    );
  } catch (err) {
    // Degradacja, nie błąd: formularz ma ścieżkę awaryjną (szukanie w mieście),
    // więc padnięty dostawca nie może zablokować wysłania formularza.
    console.warn("[resolve-place] miss:", err instanceof Error ? err.message : err);
    return NextResponse.json({ hotelId: null, reason: "provider_error" });
  }
}
