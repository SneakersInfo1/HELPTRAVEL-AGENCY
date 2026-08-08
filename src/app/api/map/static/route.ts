// Statyczny podgląd mapy (Geoapify Static Maps) — kafel nad filtrami.
//
// Osobna trasa od `/api/map/tiles`, bo to inny produkt Geoapify i inne
// parametry. Powód istnienia ten sam: `GEOAPIFY_API_KEY` zostaje na serwerze,
// bo repozytorium jest publiczne.
//
// Dlaczego obraz, a nie mała instancja MapLibre: podgląd stoi na KAŻDYM
// wyszukiwaniu, także u gościa, który mapy nigdy nie otworzy. Silnik mapy waży
// ~944 kB; ten obraz waży kilkadziesiąt kilobajtów i nie wykonuje ani jednej
// linijki JavaScriptu (brief V3 §4: „mini mapa nie może opóźniać załadowania
// pierwszych hoteli").

import { NextResponse } from "next/server";

import { buildStaticMapUrl } from "@/lib/hotels/static-map-url";

export const runtime = "nodejs";

/** Podgląd jest funkcją (lat, lng, zoom, rozmiar) — można go trzymać długo. */
const CACHE = "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400";

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const lat = Number(sp.get("lat"));
  const lng = Number(sp.get("lng"));
  const w = Math.min(800, Math.max(120, Number(sp.get("w")) || 600));
  const h = Math.min(800, Math.max(80, Number(sp.get("h")) || 320));
  const zoom = Math.min(18, Math.max(1, Number(sp.get("zoom")) || 11));

  // Walidacja jak przy kafelkach — bez niej trasa staje się otwartym proxy.
  const ok =
    Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  if (!ok) return new NextResponse("Bad center", { status: 400 });

  const key = process.env.GEOAPIFY_API_KEY;
  // Brak klucza nie może wywalić strony — podgląd po prostu się nie pokaże.
  if (!key) return new NextResponse("Map disabled", { status: 503 });

  const upstream = new URL(buildStaticMapUrl({ lat, lng, w, h, zoom }));
  upstream.searchParams.set("apiKey", key);

  try {
    const res = await fetch(upstream, { cache: "force-cache" });
    if (!res.ok) return new NextResponse("Preview unavailable", { status: 502 });
    return new NextResponse(res.body, {
      status: 200,
      headers: {
        "Content-Type": res.headers.get("content-type") ?? "image/png",
        "Cache-Control": CACHE,
      },
    });
  } catch {
    return new NextResponse("Preview unavailable", { status: 502 });
  }
}
