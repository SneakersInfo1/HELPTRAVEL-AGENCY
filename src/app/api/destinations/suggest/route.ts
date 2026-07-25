// Sesja C2 — server-side fuzzy autocomplete.
//
// Backed by Fuse.js indexed against `data/destinations.index.json` (built
// nightly by `scripts/build-destinations-seed.ts`). Response time at pilot
// scale is <5 ms; at full scale (~2k entries) still <50 ms.
//
// Query contract:
//   GET /api/destinations/suggest?q=lis&limit=8
// Response shape kept BACKWARD COMPATIBLE with the existing
// DestinationSuggestion clients — `city`/`country`/`region`/`label`/
// `queryValue`/`source` plus the new `id`, `iata`, `popularity` extras.

import { NextRequest, NextResponse } from "next/server";

import { matchRegions } from "@/lib/hotels/regions";
import { CONFIDENT_SCORE, suggestDestinations } from "@/lib/mvp/destination-suggest-fuse";
import { suggestPlaces } from "@/lib/liteapi/places-suggest";
import { countryNameEn, countryNamePl, resolveCountryCode } from "@/lib/mvp/countries";
import type { DestinationSuggestion } from "@/lib/mvp/types";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = Math.min(20, Math.max(1, Number(limitParam) || 8));

  // Zadanie 2 — wyspy/regiony NAD miastami. matchRegions() dopasowuje po
  // polskiej nazwie, aliasach (mallorca→Majorka) i archipelagu
  // (kanary→Teneryfa…), bez diakrytyków. Miasta dopełniają limit.
  const regionHits = matchRegions(q, 4);
  const regionItems: DestinationSuggestion[] = regionHits.map((r) => ({
    id: `region-${r.id}`,
    kind: "region" as const,
    regionId: r.id,
    city: r.nameEn,
    country: r.countryPl,
    region: "wyspa",
    label: `${r.namePl} — wyspa, ${r.countryPl}`,
    queryValue: `${r.namePl}, ${r.countryPl}`,
    source: "curated" as const,
    airportCode: r.airports[0],
    cityPl: r.namePl,
    countryPl: r.countryPl,
    popularity: r.popularity,
  }));

  const hits = suggestDestinations(q, Math.max(1, limit - regionItems.length));

  // Adapt to DestinationSuggestion so existing client code (mini-planner-form,
  // premium-home-hero) keeps working without changes.
  const cityItems: DestinationSuggestion[] = hits.map((h) => ({
    id: h.id,
    city: h.cityEn,
    country: h.countryPl, // already Polish here so UI doesn't need to re-localize
    region: undefined,
    label: `${h.label}, ${h.countryPl}`,
    queryValue: `${h.cityEn}, ${h.countryPl}`,
    source: "curated" as const,
    destinationSlug: h.id,
    airportCode: h.iata ?? undefined,
    cityPl: h.label,
    countryPl: h.countryPl,
    popularity: h.popularity,
    // Obecne tylko przy pustym q (redakcyjna lista popularnych) — UI używa ich
    // do nagłówków grup i podpowiedzi „Heraklion · Kreta".
    group: h.group,
    hint: h.hint,
    // Potrzebne tylko po stronie serwera, do decyzji „czy dopytać LiteAPI".
    score: h.score,
  }));

  // Indeks miast miewa wpis o tej samej nazwie co wyspa ("Teneryfa") —
  // duplikat pod pozycją wyspy tylko myli, więc go chowamy.
  const regionNames = new Set(
    regionHits.flatMap((r) => [r.namePl.toLowerCase(), r.nameEn.toLowerCase()]),
  );
  const dedupedCities = cityItems.filter(
    (c) =>
      !regionNames.has((c.cityPl ?? "").toLowerCase()) &&
      !regionNames.has(c.city.toLowerCase()),
  );
  // ── Globalny dobór, gdy indeks lokalny nie zna odpowiedzi ────────────────
  // Seed pokrywa 796 kierunków w 37 krajach (sama Europa + basen Morza
  // Śródziemnego), a LiteAPI ma ~3 mln hoteli na całym świecie — dla samej
  // Hiszpanii zna 8999 miast wobec 32 w seedzie. Dopóki podpowiedzi jechały
  // wyłącznie z pliku, użytkownik nie miał jak dojść do reszty oferty:
  // „Tajlandia" nie zwracała nic sensownego, „Bangkok" dawał bułgarskie Bansko.
  //
  // Dopytujemy LiteAPI TYLKO wtedy, gdy lokalnie nie ma pewnego trafienia —
  // ktoś, kto wpisuje „Barcelona", dostaje odpowiedź z pliku w ~0 ms i nie
  // płaci za sieć. Zapytanie idzie dopiero, gdy najlepszy wynik jest niepewny
  // albo nie ma go wcale.
  const hasConfidentLocal =
    regionItems.length > 0 ||
    dedupedCities.some((c) => typeof c.popularity === "number" && (c.score ?? 1) <= CONFIDENT_SCORE);

  let globalItems: DestinationSuggestion[] = [];
  if (q.trim().length >= 3 && !hasConfidentLocal) {
    const places = await suggestPlaces(q, limit);
    const localNames = new Set(
      [...regionItems, ...dedupedCities].map((c) => (c.cityPl ?? c.city).toLowerCase()),
    );
    globalItems = places
      .filter((p) => !localNames.has(p.name.toLowerCase()))
      .map((p): DestinationSuggestion => {
        // `formattedAddress` niesie kraj („Thailand" dla Bangkoku), a nowy
        // resolwer ISO umie go zamienić na kod — bez tego LiteAPI odrzuciłoby
        // wyszukanie. Kraj sam w sobie (kind="country") nie ma kraju nadrzędnego.
        const countryCode = p.countryLabel ? resolveCountryCode(p.countryLabel) : null;
        const countryPl = countryCode ? countryNamePl(countryCode) : null;
        const countryEn = countryCode ? countryNameEn(countryCode) : p.countryLabel;
        return {
          id: `place-${p.placeId}`,
          city: p.name,
          country: countryEn || p.countryLabel,
          label: countryPl ? `${p.name}, ${countryPl}` : p.name,
          queryValue: countryPl ? `${p.name}, ${countryPl}` : p.name,
          source: "catalog",
          cityPl: p.name,
          countryPl: countryPl ?? p.countryLabel,
          hint: p.kind === "country" ? "cały kraj" : p.kind === "region" ? "region" : undefined,
        };
      });
  }

  // Kolejność zależy od tego, czy lokalny indeks BYŁ pewny.
  //
  // Gdy nie był, wyniki globalne idą PRZED lokalnymi. Bez tego słabe trafienia
  // z pliku wypychały poprawne: „Bangkok" pokazywał najpierw bułgarskie Bansko
  // (dopasowanie 0,367), a „Warna" w ogóle nie dochodziła do listy, bo Larnaka,
  // Warzazat i Warszawa wypełniały limit przed przycięciem. Użytkownik, który
  // wpisał nazwę spoza Europy, ma zobaczyć to, o co pytał — a nie najbliżej
  // brzmiące europejskie miasto.
  const items = hasConfidentLocal
    ? [...regionItems, ...dedupedCities, ...globalItems].slice(0, limit)
    : [...regionItems, ...globalItems, ...dedupedCities].slice(0, limit);

  return NextResponse.json(
    { items },
    {
      headers: {
        // Cache for 1 hour at the edge — the seed only changes on rebuild.
        "Cache-Control": "public, max-age=60, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  );
}
