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
import { enforceRateLimit } from "@/lib/rate-limit";
import type { DestinationSuggestion } from "@/lib/mvp/types";

export async function GET(request: NextRequest) {
  // Limit PRZED jakąkolwiek pracą: odkąd endpoint potrafi dopytać LiteAPI
  // /data/places, seria unikalnych zapytań omija 24-godzinny cache (każdy tekst
  // to inny URL) i generuje realny koszt u dostawcy. Znalezione w review.
  // Brak Upstash w env → `enforceRateLimit` zwraca null i endpoint działa
  // normalnie (ta sama zasada „degrade, nie wywalaj" co reszta Redisa).
  const limited = await enforceRateLimit(request, "destination-suggest");
  if (limited) return limited;

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
  // Brak `score` (np. wpis wyspy/regionu) traktujemy jako NIEpewny — stąd `?? 1`.
  const hasConfidentLocal =
    regionItems.length > 0 || dedupedCities.some((c) => (c.score ?? 1) <= CONFIDENT_SCORE);

  let globalItems: DestinationSuggestion[] = [];
  if (q.trim().length >= 3 && !hasConfidentLocal) {
    const places = await suggestPlaces(q, limit);
    const localNames = new Set(
      [...regionItems, ...dedupedCities].map((c) => (c.cityPl ?? c.city).toLowerCase()),
    );
    globalItems = places
      .filter((p) => !localNames.has(p.name.toLowerCase()))
      .map((p): DestinationSuggestion => {
        // ── HOTEL (2026-08-02) ────────────────────────────────────────────
        // Publiczne LiteAPI nie ma wyszukiwania hoteli po nazwie (sonda:
        // /hotels/search-by-name → 404, /data/hotels?hotelName= → 400 „szukaj
        // po countryCode, lat/lng, placeId…"). Ale `/data/places` zwraca
        // obiekty noclegowe z `placeId`, a `/data/hotels?placeId=…` oddaje
        // dokładnie ten hotel jako pierwszy wynik — zweryfikowane na żywo dla
        // Chopin Boutique, Bristolu, Larios Málaga i Courtyard Marriott.
        //
        // Adres z Google jest listą po przecinkach („Smolna, Warszawa,
        // Poland"), więc kraj bierzemy z OSTATNIEGO segmentu, a miasto
        // z przedostatniego. `resolveCountryCode` na całym ciągu zwraca null.
        if (p.kind === "hotel") {
          const czesci = p.countryLabel.split(",").map((s) => s.trim()).filter(Boolean);
          const krajRaw = czesci.at(-1) ?? "";
          const miastoRaw = czesci.length >= 2 ? czesci.at(-2)! : "";
          const kod = resolveCountryCode(krajRaw);
          return {
            id: `hotel-${p.placeId}`,
            kind: "hotel",
            placeId: p.placeId,
            // `city`/`country` to ŚCIEŻKA AWARYJNA: gdyby rozwiązanie placeId
            // na hotelId się nie udało, formularz szuka w mieście obiektu
            // zamiast zostawić użytkownika bez wyniku.
            city: miastoRaw || p.name,
            // `countryNameEn/Pl` zwracają null dla kodu spoza tablicy —
            // wtedy zostaje surowy segment adresu. Pusty `country` wywala
            // wyszukiwanie awaryjne (/hotele/szukaj wymaga obu pól).
            country: (kod ? countryNameEn(kod) : null) ?? krajRaw,
            label: p.name,
            queryValue: p.name,
            source: "catalog",
            cityPl: p.name,
            countryPl: (kod ? countryNamePl(kod) : null) ?? krajRaw,
            secondary: czesci.join(", "),
          };
        }
        // `formattedAddress` niesie kraj („Thailand" dla Bangkoku), a nowy
        // resolwer ISO umie go zamienić na kod — bez tego LiteAPI odrzuciłoby
        // wyszukanie.
        //
        // Dla POZYCJI BĘDĄCEJ KRAJEM `formattedAddress` jest PUSTY (potwierdzone
        // sondą: „Tajlandia" → formattedAddress: ""), więc kraj trzeba wziąć
        // z własnej nazwy miejsca. Bez tego wybór „Tajlandia — cały kraj" zapisywał
        // `country=""`, a /hotele/szukaj wymaga jednocześnie `destination`
        // i `country` (page.tsx: `sp.destination && sp.country`) — wyszukiwanie
        // po prostu nie ruszało. Znalezione w review, potwierdzone w kodzie.
        const countryCode =
          resolveCountryCode(p.countryLabel || "") ??
          (p.kind === "country" ? resolveCountryCode(p.name) : null);
        const countryPl = countryCode ? countryNamePl(countryCode) : null;
        const countryEn = countryCode ? countryNameEn(countryCode) : p.countryLabel;
        return {
          id: `place-${p.placeId}`,
          city: p.name,
          // Kraj MUSI być niepusty — patrz wyżej. Gdy nawet nazwa miejsca się
          // nie rozwiązuje, zostaje surowa etykieta; pusty string nigdy.
          country: countryEn || p.countryLabel || p.name,
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
  const ordered = hasConfidentLocal
    ? [...regionItems, ...dedupedCities, ...globalItems]
    : [...regionItems, ...globalItems, ...dedupedCities];

  // `score` to wewnętrzna miara rankingu — służy WYŁĄCZNIE decyzji „czy dopytać
  // LiteAPI" i nie ma po co jechać do przeglądarki. Zdejmujemy je z odpowiedzi,
  // żeby publiczny kontrakt API nie obrósł polem, którego nikt nie konsumuje.
  // Ostatni dedupe — na tym, co użytkownik REALNIE widzi (miasto + kraj).
  // Wcześniejsze przebiegi dedupe'ują osobno: indeks lokalny po nazwie+kraju
  // z seeda, a `toPlaceSuggestions` po nazwie + surowym `formattedAddress`.
  // Żaden nie łapie przypadku, gdy Google zwraca ten sam kierunek z RÓŻNYM
  // adresem („Thailand" vs „Phuket, Thailand") albo gdy to samo miasto przyjdzie
  // raz z pliku i raz z LiteAPI. Efekt był widoczny: „Phuket" i „Barselona"
  // pojawiały się na liście dwa razy pod rząd.
  const seenFinal = new Set<string>();
  const items: DestinationSuggestion[] = [];
  for (const item of ordered) {
    const key = `${(item.cityPl ?? item.city).toLowerCase()}|${(item.countryPl ?? item.country).toLowerCase()}`;
    if (seenFinal.has(key)) continue;
    seenFinal.add(key);
    // `score` to wewnętrzna miara rankingu — służy WYŁĄCZNIE decyzji „czy
    // dopytać LiteAPI" i nie ma po co jechać do przeglądarki.
    const copy = { ...item };
    delete copy.score;
    items.push(copy);
    if (items.length === limit) break;
  }

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
