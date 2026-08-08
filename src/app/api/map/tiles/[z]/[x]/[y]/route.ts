// Proxy kafelków mapy (Geoapify).
//
// DLACZEGO PROXY, A NIE KLUCZ W PRZEGLĄDARCE:
// repozytorium jest PUBLICZNE, a `GEOAPIFY_API_KEY` istnieje dziś wyłącznie
// po stronie serwera. Przeniesienie go do `NEXT_PUBLIC_*` oznaczałoby wydanie
// klucza wprost do bundla i do historii gita. Proxy trzyma go na serwerze,
// a przy okazji daje nam własne nagłówki cache — kafelki są niezmienne, więc
// idą z `immutable` i po pierwszym gościu lecą z brzegowego cache Vercela.
//
// Wybrany styl: `osm-bright-smooth` — jasny, o niskim kontraście, żeby zielone
// znaczniki cenowe HelpTravel były na nim czytelne. Styl ciemny i „positron"
// sprawdzone: pierwszy zjada znaczniki, drugi jest tak wyprany, że gubi się
// orientacja w mieście.
//
// Licencja: dane OpenStreetMap + Geoapify. Atrybucja jest OBOWIĄZKOWA i jest
// renderowana na mapie (patrz `hotel-map.tsx`) — nie wolno jej usunąć.

import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Kafelki się nie zmieniają — trzymamy je długo i pozwalamy odświeżać w tle. */
const CACHE = "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400, immutable";

const STYLE = "osm-bright-smooth";
const MAX_ZOOM = 20;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ z: string; x: string; y: string }> },
) {
  const { z, x, y } = await params;

  // Walidacja: bez niej ścieżka staje się otwartym proxy na cudzy serwer.
  const zNum = Number(z);
  const xNum = Number(x);
  // `y` niesie rozszerzenie (`403.png`) i opcjonalny sufiks gęstości
  // (`403@2x.png`) — Next nie ma osobnego segmentu na żadne z nich.
  //
  // PO CO `@2x` (2026-08-08). Kafelek 256 px na pełnoekranowej mapie 1920×900
  // to ~35 żądań; kafelek 512 px to ~9. Przy zmierzonych 0,39–0,69 s na
  // kafelek przez to proxy różnica jest widoczna gołym okiem: mapa przestaje
  // mieć BIAŁE DZIURY w miejscach, gdzie kafelki jeszcze nie doszły (zrzut
  // właściciela: prostokąt bez mapy w prawym górnym rogu). Przy okazji rysunek
  // jest ostry na ekranach o wysokiej gęstości pikseli.
  const yRaw = String(y).replace(/\.png$/i, "");
  const retina = /@2x$/i.test(yRaw);
  const yNum = Number(yRaw.replace(/@2x$/i, ""));
  const limit = 2 ** Math.max(0, zNum);
  const valid =
    Number.isInteger(zNum) &&
    zNum >= 0 &&
    zNum <= MAX_ZOOM &&
    Number.isInteger(xNum) &&
    xNum >= 0 &&
    xNum < limit &&
    Number.isInteger(yNum) &&
    yNum >= 0 &&
    yNum < limit;
  if (!valid) return new NextResponse("Bad tile", { status: 400 });

  const key = process.env.GEOAPIFY_API_KEY;
  // Brak klucza NIE może wywalić strony — mapa po prostu nie wystartuje,
  // a lista działa dalej. Ta sama zasada co w warstwie cache'u stawek.
  if (!key) return new NextResponse("Map disabled", { status: 503 });

  try {
    const upstream = await fetch(
      `https://maps.geoapify.com/v1/tile/${STYLE}/${zNum}/${xNum}/${yNum}${retina ? "@2x" : ""}.png?apiKey=${encodeURIComponent(key)}`,
      { cache: "force-cache" },
    );
    if (!upstream.ok) return new NextResponse("Tile unavailable", { status: 502 });

    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "image/png",
        "Cache-Control": CACHE,
      },
    });
  } catch {
    return new NextResponse("Tile unavailable", { status: 502 });
  }
}
