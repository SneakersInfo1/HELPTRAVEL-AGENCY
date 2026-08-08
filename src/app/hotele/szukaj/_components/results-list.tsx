"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { POOL_MAX_TOTAL, POOL_PAGE_SIZE, type MetaOffer } from "@/lib/hotels/meta-pool";
import type { PriceQuery, SlimRate } from "@/lib/hotels/price-batcher";
import { ensurePrice, getPrice, getVersion, subscribe, type PriceEntry } from "@/lib/hotels/price-store";

import { ResultCard } from "./result-card";
import { PriceView } from "./card-price";
import { HotelPagination } from "./hotel-pagination";
import type { MapBounds, MapPoint } from "./hotel-map";

// Mapa wchodzi LENIWIE i to jest wymóg, nie optymalizacja kosmetyczna
// (brief §29). Statyczny `import { HotelMap }` wciągał `hotel-map.tsx` do
// paczki wyników, a bundler — widząc w środku `import("maplibre-gl")` —
// dokładał do widoku LISTY także chunk samego silnika mapy. Zmierzone testem
// E2E: `0rrh_maplibre-gl_dist_*.js` (~944 kB nieskompresowane) leciał na
// każdym wyszukiwaniu, również do gościa, który mapy nigdy nie otworzy.
//
// `ssr: false`, bo MapLibre dotyka `window` przy pierwszym renderze i nie ma
// czego prerenderować — mapa i tak powstaje dopiero w przeglądarce.
const HotelMap = dynamic(() => import("./hotel-map").then((m) => m.HotelMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center rounded-2xl bg-neutral-100">
      <span className="text-sm text-neutral-500">Wczytuję mapę…</span>
    </div>
  ),
});
import { facilityGroupsFor } from "@/lib/hotels/facility-filters";
import { publishFilterOptions } from "@/lib/hotels/filter-options-store";
import { useMediaQuery } from "@/lib/ui/use-media-query";
import { applyFiltersAndSort, type FilterableOffer } from "./filters-logic";

export type { MetaOffer } from "@/lib/hotels/meta-pool";

type PriceCtx = Omit<PriceQuery, "hotelId">;

/** Opis źródła puli — parametry dla /api/hotels/meta (kolejne strony). */
interface PoolSource {
  city?: string;
  country?: string;
  lat?: number;
  lng?: number;
  regionId?: string;
}

/** Stan dociągania puli: strony metadanych POZA serwerową pierwszą stroną.
 *  `sig` wiąże stan z kierunkiem (zmiana kierunku = świeży start bez
 *  setState-w-efekcie); `nextOffset` liczy SUROWE rekordy LiteAPI (przed
 *  filtrem wyspy), bo offset paginacji działa na surowej liście. */
interface PoolExpansion {
  sig: string;
  hotels: MetaOffer[];
  nextOffset: number;
  done: boolean;
}

interface ResultsListProps {
  // FIRST page of the destination pool (server-rendered, ~300). The client
  // expands it in the background via /api/hotels/meta until it covers ALL
  // hotels for the destination (cap POOL_MAX_TOTAL), then owns
  // sort/filter/paginate GLOBALLY across the full pool.
  pool: MetaOffer[];
  poolSource?: PoolSource;
  /** Offset pierwszej niedociągniętej strony (== rozmiar strony serwera). */
  poolNextOffset?: number;
  /** Czy serwerowa strona była pełna (są kolejne strony do dociągnięcia). */
  poolHasMore?: boolean;
  ctx: PriceCtx;
  nights: number;
  childParams: string;
  baseQuery: string;
  pageFromUrl: number;
  pageSize: number;
  // URL-driven filters & sort (already parsed in page.tsx).
  sort?: string;
  minPrice?: number;
  maxPrice?: number;
  minStars?: number;
  minRating?: number;
  cancel?: string;
  q?: string;
  propertyType?: string[];
  board?: string[];
  /** Klucze z FACILITY_FILTERS — mapowane na grupy facilityId. */
  facilities?: string[];
  /** Nazwy sieci hotelowych (dokładnie jak u dostawcy). */
  chains?: string[];
}

interface PricedFilterable extends FilterableOffer {
  // Tag so we can map back to the original MetaOffer + PriceEntry after
  // applyFiltersAndSort returns (the helper is generic and preserves
  // unknown keys on the input objects).
  _hotelId: string;
}

// Type guard: an entry that has resolved to a real SlimRate (not null, not
// "loading", not still undefined). Hotels in this state are confirmed
// AVAILABLE in the requested date range.
function isPriced(entry: PriceEntry | undefined): entry is SlimRate {
  return entry !== undefined && entry !== null && entry !== "loading" && entry !== "error";
}

// Client-owned results list. It owns the FULL hotel pool for the destination
// (handed down from the server page) and computes the displayed slice from:
//   1. Per-hotel rate availability (drops null = no rate for the dates)
//   2. URL-driven filters (price range, board, refundable, …)
//   3. URL-driven sort (price asc/desc, rating, recommended)
//   4. URL-driven pagination cursor (?strona=N)
//
// Why client-side: with up to 1000 hotels per destination and rates streaming
// in over ~5-8 s, doing this server-side would either block the first paint
// for that whole window OR show stale metadata-order results. Owning it on
// the client lets us:
//   • Paint immediately (initial slice from metadata order, no prices yet).
//   • Stream prices in via the existing price-store + batcher.
//   • Re-sort / re-paginate live as availability lands — so "price ascending"
//     converges on a GLOBAL price ladder (cheapest in the destination first),
//     not just the cheapest among the current 20 cards.
//   • Hide hotels that come back with `entry === null` — confirmed sold-out
//     for the chosen dates.
export function ResultsList(props: ResultsListProps) {
  // Re-render whenever any price lands.
  useSyncExternalStore(subscribe, getVersion, () => 0);

  // Stable display order (anti-jump). Holds the hotel-id order currently on
  // screen so cards keep their position as prices stream in; only a user
  // control change (captured by controlSig) triggers a fresh re-sort. See the
  // detailed note inside the `view` memo below.
  const displayOrderRef = useRef<string[]>([]);
  const controlSigRef = useRef<string | null>(null);

  const {
    pool,
    poolSource,
    poolNextOffset,
    poolHasMore,
    ctx,
    nights,
    childParams,
    baseQuery,
    pageFromUrl,
    pageSize,
    sort,
    minPrice,
    maxPrice,
    minStars,
    minRating,
    cancel,
    q,
    propertyType,
    board,
    facilities,
    chains,
  } = props;

  // Widok listy vs mapy. Stan lokalny, nie URL: przełączenie widoku nie jest
  // nowym wyszukiwaniem i nie powinno zaśmiecać historii przeglądarki ani
  // linku, którym gość się dzieli. Filtry i strona zostają nietknięte.
  // UWAGA: `view` jest już zajęte przez memo z wynikami — stąd `viewMode`.
  const [viewMode, setViewMode] = useState<"list" | "map">("list");

  // Stan wspólny listy i mapy (brief §13C). `selected` = klik w znacznik,
  // `hovered` = najechanie na kartę albo na znacznik. Trzymamy je tutaj, a nie
  // w mapie, bo obie strony muszą je czytać.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [areaBounds, setAreaBounds] = useState<MapBounds | null>(null);
  // `lg` w Tailwindzie. Wybór wariantu mapy MUSI iść przez realny breakpoint,
  // nie przez klasy widoczności — patrz komentarz przy renderze mapy niżej.
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  // Zmiana wyszukiwania kasuje ograniczenie do obszaru — inaczej gość wraca
  // z nowymi datami i widzi „0 wyników", bo mapa pamięta poprzedni kadr.
  const areaSigRef = useRef<string>("");

  // Stable identity for the price context so the effect doesn't refire on
  // every render.
  const ctxSig = `${ctx.checkin}|${ctx.checkout}|${ctx.adults}|${ctx.children.join(".")}|${ctx.rooms}|${ctx.currency}`;

  // Nowe wyszukiwanie kasuje ograniczenie do obszaru. Aktualizacja W TRAKCIE
  // RENDERU, nie w efekcie: React przerywa ten render i liczy go ponownie ze
  // świeżym stanem, więc nie ma migotnięcia ani dodatkowego przebiegu — a
  // `react-hooks/set-state-in-effect` (włączony w tym repo) nie ma tu nic
  // do zgłoszenia.
  if (areaSigRef.current !== ctxSig) {
    areaSigRef.current = ctxSig;
    if (areaBounds !== null) setAreaBounds(null);
    if (selectedId !== null) setSelectedId(null);
  }

  // ── Dociąganie PEŁNEJ puli kierunku (2026-07-11) ──────────────────────────
  // Serwer wysyła pierwszą stronę (300); tu w tle dociągamy kolejne strony
  // metadanych z /api/hotels/meta, aż lista obejmie wszystkie hotele kierunku
  // (sufit POOL_MAX_TOTAL). Sygnatura = tożsamość KIERUNKU (nie dat), więc
  // zmiana samych dat nie wyrzuca już pobranych metadanych. Efekt pobiera
  // JEDNĄ stronę na przebieg i podbija stan → kolejny przebieg bierze
  // następną stronę (sekwencyjnie, bez lawiny równoległych fetchy).
  const sourceSig = poolSource
    ? [poolSource.regionId ?? "", poolSource.city ?? "", poolSource.country ?? "", poolSource.lat ?? "", poolSource.lng ?? ""].join("|")
    : "";
  const [expansion, setExpansion] = useState<PoolExpansion>({ sig: "", hotels: [], nextOffset: 0, done: false });

  useEffect(() => {
    if (!poolSource || !poolHasMore || !sourceSig) return;
    const st: PoolExpansion =
      expansion.sig === sourceSig
        ? expansion
        : { sig: sourceSig, hotels: [], nextOffset: poolNextOffset ?? POOL_PAGE_SIZE, done: false };
    if (st.done || st.nextOffset >= POOL_MAX_TOTAL) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const qs = new URLSearchParams();
        if (poolSource.regionId) {
          qs.set("region", poolSource.regionId);
        } else {
          qs.set("city", poolSource.city ?? "");
          qs.set("country", poolSource.country ?? "");
          if (typeof poolSource.lat === "number") qs.set("lat", String(poolSource.lat));
          if (typeof poolSource.lng === "number") qs.set("lng", String(poolSource.lng));
        }
        qs.set("offset", String(st.nextOffset));
        const res = await fetch(`/api/hotels/meta?${qs.toString()}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { hotels?: MetaOffer[]; count?: number };
        const got = json.hotels ?? [];
        const rawCount = json.count ?? got.length;
        const nextOffset = st.nextOffset + rawCount;
        // Krótsza strona = koniec listy; sufit chroni budżet skanu stawek.
        const done = rawCount < POOL_PAGE_SIZE || nextOffset >= POOL_MAX_TOTAL;
        setExpansion({ sig: sourceSig, hotels: [...st.hotels, ...got], nextOffset, done });
      } catch {
        // Awaria dociągania NIE psuje wyników — zostajemy przy tym, co mamy
        // (co najmniej serwerowe 300). Abort (unmount/zmiana kierunku) ciszej.
        if (!controller.signal.aborted) {
          setExpansion({ sig: sourceSig, hotels: st.hotels, nextOffset: st.nextOffset, done: true });
        }
      }
    })();
    return () => controller.abort();
    // poolSource świadomie poza deps (nowa tożsamość obiektu co render RSC);
    // wszystkie jego pola niesie sourceSig.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceSig, poolHasMore, poolNextOffset, expansion]);

  // Pula łączna: serwerowa strona + dociągnięte, dedupe po hotelId (łańcuch
  // fallbacków w /api/hotels/meta może na styku stron zwrócić duplikaty).
  const fullPool = useMemo(() => {
    const extraHotels = expansion.sig === sourceSig ? expansion.hotels : [];
    if (extraHotels.length === 0) return pool;
    const seen = new Set(pool.map((o) => o.hotelId));
    const merged = [...pool];
    for (const h of extraHotels) {
      if (!seen.has(h.hotelId)) {
        seen.add(h.hotelId);
        merged.push(h);
      }
    }
    return merged;
  }, [pool, expansion, sourceSig]);

  // Panel filtrów renderuje się PRZED tą sekcją (siatka strony), więc nie zna
  // puli. Publikujemy więc opcje, które pula faktycznie obsługuje — dzięki
  // temu „Basen" pojawia się tylko tam, gdzie jakiś hotel go ma (brief §9).
  useEffect(() => {
    publishFilterOptions(fullPool);
  }, [fullPool]);

  // Stable identity for the pool — id list is the natural key, much cheaper
  // than deep-comparing records on every render.
  const poolIdSig = fullPool.map((o) => o.hotelId).join(",");

  useEffect(() => {
    // Priority queue: enqueue the hotels CURRENTLY VISIBLE first so the
    // batcher's first flush (within WINDOW_MS = 60ms) ships their prices
    // back ahead of the off-screen pool. ensurePrice is a no-op for ids
    // already in flight, so calling it twice for the same hotel is safe.
    //
    // Why this matters: a Barcelona-sized scan moves ~20 batches over
    // ~1.5s. Without prioritisation, hotels on metadata-page 1 (indices
    // 0-49) always go in batch #1 regardless of which page the user is
    // actually looking at — landing on ?strona=5 meant waiting for
    // batches 5-6 before seeing the page's prices. With this ordering,
    // the visible page's 20 prices arrive in the FIRST batch every time.
    const currentPageStart = Math.max(0, (pageFromUrl - 1) * pageSize);
    const currentPageEnd = currentPageStart + pageSize;
    for (let i = currentPageStart; i < Math.min(fullPool.length, currentPageEnd); i++) {
      ensurePrice({ hotelId: fullPool[i].hotelId, ...ctx });
    }
    // Everything off the current page, in metadata order. Skipping the
    // current-page slice avoids re-calling ensurePrice (cheap dedup but
    // still preserves the FIFO order we just set up). Dociągnięte strony puli
    // wpadają tu naturalnie: poolIdSig rośnie → efekt refire → nowe hotele do
    // kolejki (ensurePrice dedupe'uje te już w locie).
    for (let i = 0; i < fullPool.length; i++) {
      if (i >= currentPageStart && i < currentPageEnd) continue;
      ensurePrice({ hotelId: fullPool[i].hotelId, ...ctx });
    }
    // ctxSig + the hotel id list capture every meaningful change.
    // pageFromUrl/pageSize intentionally omitted: ensurePrice is idempotent
    // (dedup by store key), so re-firing on page nav would only re-order
    // an already-mostly-resolved queue without helping the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctxSig, poolIdSig]);

  // Wyrażenia wyciągnięte z tablicy zależności do zmiennych: ESLint nie potrafi
  // statycznie sprawdzić wywołań i operatorów wewnątrz tablicy, więc zgłaszał
  // trzy ostrzeżenia. Wartości liczą się identycznie jak wcześniej — przy każdym
  // renderze — więc zachowanie się nie zmienia, a zależności są weryfikowalne.
  const propertyTypeSig = propertyType?.join(",") ?? "";
  const facilitiesSig = facilities?.join(",") ?? "";
  const chainsSig = chains?.join("|") ?? "";
  const boardSig = board?.join(",") ?? "";
  const wersjaCen = getVersion();

  const view = useMemo(() => {
    type Row = { offer: MetaOffer; entry: PriceEntry | undefined };
    const rows: Row[] = fullPool.map((o) => ({
      offer: o,
      entry: getPrice({ hotelId: o.hotelId, ...ctx }),
    }));

    let scanning = 0;
    let unavailable = 0;
    let failed = 0;
    const priced: Row[] = [];
    for (const r of rows) {
      // „Szukaj w tym obszarze" (brief §13E). Ograniczenie działa LOKALNIE:
      // pula kierunku jest już w pamięci przeglądarki razem ze współrzędnymi,
      // więc przeliczenie kadru nie kosztuje ani jednego zapytania do
      // dostawcy. Obiekty bez współrzędnych wypadają — nie umiemy powiedzieć,
      // czy są w kadrze, a zgadywanie byłoby gorsze niż pominięcie.
      if (areaBounds) {
        const { latitude: la, longitude: lo } = r.offer;
        if (
          typeof la !== "number" ||
          typeof lo !== "number" ||
          la < areaBounds.south ||
          la > areaBounds.north ||
          lo < areaBounds.west ||
          lo > areaBounds.east
        ) {
          continue;
        }
      }
      if (r.entry === null) {
        unavailable++;
      } else if (r.entry === "error") {
        // Pobranie ceny padło (batch po ponowce) — hotel NIE jest „bez miejsc",
        // po prostu nie wiemy. Liczony osobno, karta zostaje widoczna.
        failed++;
      } else if (!isPriced(r.entry)) {
        scanning++;
      } else {
        priced.push(r);
      }
    }

    // Build the FilterableOffer view over PRICED rows only — unavailable
    // hotels are already excluded above, and "still loading" rows can't be
    // sorted by price yet (we'd misorder them). They reappear at the bottom
    // of the visible list as a "Sprawdzam jeszcze X obiektów" note (the
    // header below), and the page re-sorts as they land.
    const filterable: PricedFilterable[] = priced.map((r) => {
      const rate = r.entry as SlimRate;
      return {
        _hotelId: r.offer.hotelId,
        name: r.offer.name,
        city: r.offer.city,
        stars: r.offer.stars,
        rating: r.offer.rating,
        // Pola z `/data/hotels` używane przez filtry marki, udogodnień i typu.
        chain: r.offer.chain,
        facilityIds: r.offer.facilityIds,
        hotelTypeId: r.offer.hotelTypeId,
        cheapestRate: {
          totalAmount: rate.totalAmount,
          refundableTag: rate.refundableTag,
          cancellationDeadline: rate.cancellationDeadline,
          boardName: rate.boardName,
        },
      };
    });

    const passed = applyFiltersAndSort(filterable, {
      minPrice,
      maxPrice,
      minStars,
      minRating,
      cancel,
      sort,
      q,
      propertyType,
      board,
      chains,
      facilityGroups: facilities?.length ? facilityGroupsFor(facilities) : undefined,
    });

    const byId = new Map(priced.map((r) => [r.offer.hotelId, r]));
    const filteredRows = passed
      .map((p) => byId.get(p._hotelId))
      .filter((r): r is Row => r !== undefined);

    // ── Stable display order (anti-jump) ──────────────────────────────────
    // `filteredRows` is the freshly filtered+sorted list, recomputed on every
    // price tick. Rendering it directly made cards leap to new positions while
    // the user was reading them — "a hotel caught my eye, then it jumped to
    // another" (user report 2026-06). Instead we keep an ACCUMULATED order:
    // once a hotel has a slot it stays put as more prices arrive; newly-priced
    // hotels are appended at the end. A genuine re-sort happens only when the
    // user changes a control (sort / filters / dates / occupancy) — captured
    // by `controlSig`, which is exactly when a reorder is expected. Pagination
    // is intentionally NOT part of the signature: paging just re-slices the
    // already-stable order.
    const controlSig = [
      sort ?? "",
      minPrice ?? "",
      maxPrice ?? "",
      minStars ?? "",
      minRating ?? "",
      cancel ?? "",
      q ?? "",
      propertyType?.join(".") ?? "",
      board?.join(".") ?? "",
      ctxSig,
    ].join("|");

    const sortedIds = filteredRows.map((r) => r.offer.hotelId);
    let orderedIds: string[];
    if (controlSigRef.current !== controlSig) {
      // User changed something (or first run) → honour the fresh sort.
      controlSigRef.current = controlSig;
      orderedIds = sortedIds;
    } else {
      // Same controls, more prices landed → preserve existing positions and
      // append the newcomers. Drop ids that are no longer eligible (filtered
      // out or confirmed unavailable).
      const sortedSet = new Set(sortedIds);
      const kept = displayOrderRef.current.filter((id) => sortedSet.has(id));
      const keptSet = new Set(kept);
      const appended = sortedIds.filter((id) => !keptSet.has(id));
      orderedIds = [...kept, ...appended];
    }
    displayOrderRef.current = orderedIds;

    const orderedRows = orderedIds
      .map((id) => byId.get(id))
      .filter((r): r is Row => r !== undefined);

    const total = orderedRows.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(Math.max(1, pageFromUrl), totalPages);
    const sliceStart = (safePage - 1) * pageSize;
    const slicedPriced = orderedRows.slice(sliceStart, sliceStart + pageSize);

    // Pad with loading rows so the page never paints empty during the scan.
    // Without this, initial SSR (store empty → every row "scanning") would
    // render zero cards and just the subtitle — a regression vs. the
    // previous "show 20 metadata-order cards instantly" behavior. We only
    // pad while scanning > 0 (i.e., something is still in flight) AND
    // there's room left in the current page slot. Loading rows render with
    // a skeleton PriceView; once their rate lands they re-sort into place.
    // Rozszerzenie o failed > 0: hotele z padniętym fetchem cen zostają na
    // liście (karta z metadanymi + stanem „nie udało się pobrać ceny"), bo
    // NIE są potwierdzonym brakiem miejsc — ukrycie ich przy awarii batcha
    // wyświetlało fałszywe „Brak dostępnych hoteli w tym terminie".
    const displayed: Row[] = [...slicedPriced];
    if (displayed.length < pageSize && (scanning > 0 || failed > 0)) {
      const filledIds = new Set(displayed.map((r) => r.offer.hotelId));
      for (const r of rows) {
        if (displayed.length >= pageSize) break;
        if (r.entry === null) continue; // confirmed unavailable — never show
        if (isPriced(r.entry)) continue; // already part of the priced slice
        if (filledIds.has(r.offer.hotelId)) continue;
        displayed.push(r);
        filledIds.add(r.offer.hotelId);
      }
    }

    return {
      displayed,
      // Pełna, przefiltrowana lista (bez cięcia na strony) — źródło punktów
      // mapy i podglądu wybranego hotelu.
      allRows: orderedRows,
      total,
      totalPages,
      safePage,
      scanning,
      unavailable,
      failed,
      availableCount: priced.length,
    };
    // ctxSig + poolIdSig stand in for `pool` and `ctx`; getVersion()
    // recomputes ordering as prices stream in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    poolIdSig,
    ctxSig,
    pageFromUrl,
    pageSize,
    sort,
    minPrice,
    maxPrice,
    minStars,
    minRating,
    cancel,
    q,
    propertyTypeSig,
    facilitiesSig,
    chainsSig,
    boardSig,
    wersjaCen,
    areaBounds,
  ]);

  // Punkty dla mapy — WSZYSTKIE przefiltrowane wyniki, nie tylko bieżąca
  // strona. Mapa pokazująca 20 z 386 hoteli byłaby myląca: gość widziałby
  // dziurę w miejscu, gdzie oferty są.
  const mapPoints = useMemo<MapPoint[]>(
    () =>
      view.allRows
        .filter((r) => typeof r.offer.latitude === "number" && typeof r.offer.longitude === "number")
        .map((r) => {
          const rate = isPriced(r.entry) ? r.entry : null;
          return {
            hotelId: r.offer.hotelId,
            name: r.offer.name,
            lat: r.offer.latitude!,
            lng: r.offer.longitude!,
            totalAmount: rate ? rate.totalAmount : null,
            currency: rate ? rate.currency : ctx.currency,
          };
        }),
    [view.allRows, ctx.currency],
  );

  // Skan „gotowy" dopiero gdy: wszystkie znane hotele wycenione ORAZ nie ma
  // już stron puli do dociągnięcia (inaczej licznik zamarłby na 300/300 tuż
  // przed dosypaniem kolejnej strony).
  const expansionPending =
    Boolean(poolSource && poolHasMore) && !(expansion.sig === sourceSig && expansion.done);
  const scanComplete = view.scanning === 0 && !expansionPending;

  // Mapa ma sens dopiero, gdy jest co na niej postawić.
  const mapAvailable = mapPoints.length > 0;
  const selectedRow = selectedId
    ? view.allRows.find((r) => r.offer.hotelId === selectedId) ?? null
    : null;

  const mapNode = (
    <HotelMap
      points={mapPoints}
      selectedId={selectedId}
      hoveredId={hoveredId}
      onSelect={setSelectedId}
      onHoverMarker={setHoveredId}
      onSearchArea={setAreaBounds}
      areaActive={areaBounds !== null}
      className="h-full w-full"
    />
  );

  const selectedCard = selectedRow ? (
    <ResultCard
      offer={isPriced(selectedRow.entry) ? { ...selectedRow.offer, cheapestRate: selectedRow.entry } : selectedRow.offer}
      searchQuery={childParams}
      nights={nights}
      priceSlot={
        isPriced(selectedRow.entry) ? undefined : (
          <PriceView entry={selectedRow.entry as "loading" | "error" | null | undefined} />
        )
      }
    />
  ) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ResultsSubtitle
          scanComplete={scanComplete}
          availableCount={view.availableCount}
          failedCount={view.failed}
          nights={nights}
          adults={ctx.adults}
          page={view.safePage}
          totalPages={view.totalPages}
          filteredCount={view.total}
        />

        {/* Przełącznik Lista / Mapa — tylko gdy mapa naprawdę coś pokaże.
            Martwy przycisk jest gorszy niż jego brak. */}
        {mapAvailable && (
          <div
            role="group"
            aria-label="Widok wyników"
            className="inline-flex shrink-0 rounded-full border border-neutral-300 bg-white p-0.5"
          >
            {(["list", "map"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                aria-pressed={viewMode === mode}
                // min-h-11 = 44 px — minimalny cel dotyku (WCAG 2.2 AA).
                className={`min-h-11 rounded-full px-5 text-sm font-medium transition ${
                  viewMode === mode ? "bg-emerald-700 text-white" : "text-neutral-700 hover:text-neutral-900"
                }`}
              >
                {mode === "list" ? "Lista" : "Mapa"}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── WIDOK MAPY ────────────────────────────────────────────────────
          Desktop: podział 55/45, mapa przyklejona do okna i wysoka na cały
          ekran pomniejszony o paski (brief §13B). Telefon: mapa na pełny
          ekran, a wybrany hotel wjeżdża kartą od dołu (brief §13D). */}
      {viewMode === "map" && mapAvailable ? (
        // JEDNA instancja mapy. Wariantów NIE przełączamy klasami `lg:hidden`,
        // bo Tailwind renderuje wtedy oba drzewa — a to znaczyłoby dwie mapy
        // MapLibre naraz, dwa canvasy i dwa komplety pobranych kafelków,
        // z czego jeden niewidoczny. Zdarzyło się to w tej sesji.
        !isDesktop ? (
          /* Telefon — mapa na pełny ekran (brief §13D) */
          <div className="fixed inset-0 z-40 flex flex-col bg-white">
              <div className="flex items-center justify-between gap-2 border-b border-neutral-200 px-4 py-2">
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  className="inline-flex h-11 items-center rounded-full px-3 text-sm font-semibold text-emerald-800"
                >
                  ← Wróć do listy
                </button>
                <span className="text-xs text-neutral-500">
                  {view.total} {obiektySlowo(view.total)}
                </span>
              </div>
            <div className="relative min-h-0 flex-1">{mapNode}</div>
            {selectedCard && (
              <div className="border-t border-neutral-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                {selectedCard}
              </div>
            )}
          </div>
        ) : (
          /* Desktop — podział 55/45, mapa przyklejona do okna (brief §13B) */
          <div className="grid grid-cols-[55fr_45fr] items-start gap-4">
            <div className="max-h-[calc(100vh-11rem)] space-y-4 overflow-y-auto pr-1">
              {view.allRows.slice(0, 60).map(({ offer, entry }) => (
                <div
                  key={offer.hotelId}
                  onMouseEnter={() => setHoveredId(offer.hotelId)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={`rounded-2xl transition ${
                    selectedId === offer.hotelId ? "ring-2 ring-emerald-600 ring-offset-2" : ""
                  }`}
                >
                  <ResultCard
                    offer={isPriced(entry) ? { ...offer, cheapestRate: entry } : offer}
                    searchQuery={childParams}
                    nights={nights}
                    priceSlot={
                      isPriced(entry) ? undefined : (
                        <PriceView entry={entry as "loading" | "error" | null | undefined} />
                      )
                    }
                  />
                </div>
              ))}
              {view.allRows.length > 60 && (
                <p className="px-1 pb-2 text-xs text-neutral-500">
                  Widok mapy pokazuje 60 pierwszych wyników z {view.total}. Zawęź obszar albo
                  filtry, żeby zobaczyć resztę.
                </p>
              )}
            </div>
            <div className="sticky top-[9rem] h-[calc(100vh-11rem)]">
              <div className="relative h-full">
                {mapNode}
                {/* Podgląd wybranego obiektu NA mapie (brief §13C).
                    Konieczny, bo kliknięty znacznik często wskazuje hotel,
                    którego karty nie ma w widocznym fragmencie listy — bez
                    tego klik w znacznik nie dawał żadnej odpowiedzi. */}
                {selectedCard && (
                  <div className="absolute inset-x-3 bottom-3 z-10 animate-in fade-in slide-in-from-bottom-2 duration-200 motion-reduce:animate-none">
                    <div className="rounded-2xl bg-white shadow-2xl ring-1 ring-emerald-900/10">
                      {selectedCard}
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedId(null)}
                      aria-label="Zamknij podgląd obiektu"
                      className="absolute -top-3 right-1 flex h-9 w-9 items-center justify-center rounded-full bg-neutral-900/80 text-white shadow-lg transition hover:bg-neutral-900"
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      ) : null}

      {viewMode === "map" ? null : (<>
      {/* With loading-row padding above, displayed.length is 0 only AFTER
          the scan completes AND nothing matched (either no available hotels
          at all, or filters wiped everything). */}
      {view.displayed.length === 0 ? (
        view.availableCount === 0 && view.failed > 0 ? (
          // Awaria pobierania cen ≠ brak miejsc. Uczciwy komunikat + akcja,
          // zamiast fałszywego „nic nie ma" (audyt mobilny 2026-07-03).
          <div className="rounded-2xl border border-neutral-200 bg-white p-6 text-center">
            <p className="text-sm font-semibold text-neutral-900">
              Nie udało się sprawdzić dostępności hoteli
            </p>
            <p className="mt-1 text-sm text-neutral-600">
              To zwykle chwilowy problem z połączeniem — hotele nadal mogą być wolne.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 inline-flex h-11 items-center justify-center rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              Spróbuj ponownie
            </button>
          </div>
        ) : (
          <p className="rounded-2xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600">
            {view.availableCount === 0
              ? "Brak dostępnych hoteli w tym terminie. Spróbuj zmienić daty lub liczbę gości."
              : "Filtry wykluczyły wszystkie dostępne hotele. Zmień lub wyczyść filtry."}
          </p>
        )
      ) : (
        view.displayed.map(({ offer, entry }, index) => (
          <ResultCard
            key={offer.hotelId}
            offer={
              // Gdy cena już dojechała, WKŁADAMY ją do karty zamiast do
              // osobnego slotu. Dzięki temu chipy „śniadanie" i „bezpłatna
              // anulacja" stoją przy nazwie hotelu (tam ich szuka wzrok),
              // a szyna cenowa po prawej zostaje samą ceną. Wcześniej cała
              // ta treść siedziała w slocie i karta miała pusty środek.
              isPriced(entry) ? { ...offer, cheapestRate: entry } : offer
            }
            searchQuery={childParams}
            nights={nights}
            imagePriority={index < 6}
            priceSlot={
              isPriced(entry) ? undefined : <PriceView entry={entry as "loading" | "error" | null | undefined} />
            }
          />
        ))
      )}

      <HotelPagination page={view.safePage} totalPages={view.totalPages} baseQuery={baseQuery} />
      </>
      )}
    </div>
  );
}

/** „1 obiekt", „3 obiekty", „5 obiektów" — polska odmiana (12–14 to wyjątek). */
function obiektySlowo(n: number): string {
  if (n === 1) return "obiekt";
  const last = n % 10;
  const twoLast = n % 100;
  if (last >= 2 && last <= 4 && !(twoLast >= 12 && twoLast <= 14)) return "obiekty";
  return "obiektów";
}

// Podtytuł listy wyników — patrz komentarz przy `countLine` niżej.
function ResultsSubtitle({
  scanComplete,
  availableCount,
  failedCount,
  nights,
  adults,
  page,
  totalPages,
  filteredCount,
}: {
  scanComplete: boolean;
  availableCount: number;
  failedCount: number;
  nights: number;
  adults: number;
  page: number;
  totalPages: number;
  filteredCount: number;
}) {
  const filteredOut = availableCount - filteredCount;

  const nightsLabel =
    nights === 1 ? "noc" : nights >= 2 && nights <= 4 ? "noce" : "nocy";
  const adultsLabel = adults === 1 ? "dorosły" : "dorosłych";

  // ── Trzy stany podtytułu (brief §5 i §6) ────────────────────────────────
  //
  // 1. TRWA SKAN — „Szukamy najlepszych ofert…" i ANI JEDNEJ liczby.
  //    Wcześniej stało tu „Sprawdzam dostępność… 1500/2099". Postęp techniczny
  //    zamienia gościa w obserwatora backendu: zamiast oglądać hotele, patrzy,
  //    jak wolno rośnie licznik. Liczba dostępnych też znikła — skakała
  //    0 → 53 → 172 → 386, a każda z tych wartości była nieprawdziwa
  //    w chwili wyświetlenia.
  //
  // 2. PO SKANIE — jedna, ostateczna liczba, wchodząca miękkim fade-in.
  //
  // 3. PO SKANIE + FILTRY — ile z ilu przeszło.
  //
  // „X bez miejsc" usunięte całkowicie. Backend nadal to liczy (`unavailable`
  // steruje ukrywaniem kart), ale gość nie ma z tej liczby żadnego pożytku,
  // a „1714 bez miejsc" czyta się jak ostrzeżenie o pustym magazynie.
  let countLine: React.ReactNode;
  if (!scanComplete) {
    countLine = (
      <>
        <span
          className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500 motion-reduce:animate-none"
          aria-hidden
        />
        Szukamy najlepszych ofert…
      </>
    );
  } else if (filteredOut > 0) {
    countLine = (
      <span className="animate-in fade-in duration-500 motion-reduce:animate-none">
        <strong className="font-semibold text-neutral-800">{filteredCount}</strong> z{" "}
        {availableCount} {availableCount === 1 ? "obiektu" : "obiektów"} po filtrach
      </span>
    );
  } else {
    countLine = (
      <span className="animate-in fade-in duration-500 motion-reduce:animate-none">
        <strong className="font-semibold text-neutral-800">{availableCount}</strong>{" "}
        {obiektySlowo(availableCount)}
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-500">
      <span className="inline-flex items-center gap-1.5">{countLine}</span>
      <span aria-hidden>·</span>
      <span>
        {nights} {nightsLabel}
      </span>
      <span aria-hidden>·</span>
      <span>
        {adults} {adultsLabel}
      </span>
      {/* Awaria pobierania cen zostaje zgłoszona — to uczciwe — ale bez liczby.
          „300 obiektów bez sprawdzonej ceny" brzmiało jak raport z serwerowni;
          gościa interesuje tylko to, że warto odświeżyć. */}
      {scanComplete && failedCount > 0 && (
        <>
          <span aria-hidden>·</span>
          <span className="text-amber-700">
            części cen nie udało się sprawdzić — odśwież stronę
          </span>
        </>
      )}
      {totalPages > 1 && (
        <>
          <span aria-hidden>·</span>
          <span>
            Strona {page} z {totalPages}
          </span>
        </>
      )}
    </div>
  );
}
