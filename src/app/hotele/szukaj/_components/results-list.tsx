"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { POOL_MAX_TOTAL, POOL_PAGE_SIZE, type MetaOffer } from "@/lib/hotels/meta-pool";
import type { PriceQuery, SlimRate } from "@/lib/hotels/price-batcher";
import { ensurePrice, getPrice, getVersion, subscribe, type PriceEntry } from "@/lib/hotels/price-store";

import { ResultCard } from "./result-card";
import { PriceView } from "./card-price";
import { HotelPagination } from "./hotel-pagination";
import { HotelMap } from "./hotel-map";
import { facilityGroupsFor } from "@/lib/hotels/facility-filters";
import { publishFilterOptions } from "@/lib/hotels/filter-options-store";
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
  /**
   * Google Place ID kierunku dla widgetu mapy LiteAPI.
   * `null` = nie udało się go rozwiązać → przełącznika mapy NIE pokazujemy.
   * Widget centruje się wyłącznie po `placeId`, więc bez niego mapa
   * pokazałaby przypadkowe miejsce.
   */
  mapPlaceId?: string | null;
  /** Domena white-labelu LiteAPI. Brak = mapa wyłączona. */
  mapDomain?: string | null;
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
    mapPlaceId,
    mapDomain,
  } = props;

  // Widok listy vs mapy. Stan lokalny, nie URL: przełączenie widoku nie jest
  // nowym wyszukiwaniem i nie powinno zaśmiecać historii przeglądarki ani
  // linku, którym gość się dzieli. Filtry i strona zostają nietknięte.
  // UWAGA: `view` jest już zajęte przez memo z wynikami — stąd `viewMode`.
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const mapAvailable = Boolean(mapPlaceId && mapDomain);

  // Stable identity for the price context so the effect doesn't refire on
  // every render.
  const ctxSig = `${ctx.checkin}|${ctx.checkout}|${ctx.adults}|${ctx.children.join(".")}|${ctx.rooms}|${ctx.currency}`;

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
  ]);

  // Skan „gotowy" dopiero gdy: wszystkie znane hotele wycenione ORAZ nie ma
  // już stron puli do dociągnięcia (inaczej licznik zamarłby na 300/300 tuż
  // przed dosypaniem kolejnej strony).
  const expansionPending =
    Boolean(poolSource && poolHasMore) && !(expansion.sig === sourceSig && expansion.done);
  const scanComplete = view.scanning === 0 && !expansionPending;
  const totalChecked = fullPool.length - view.scanning;

  return (
    <div className="space-y-4">
      <ResultsSubtitle
        scanComplete={scanComplete}
        availableCount={view.availableCount}
        totalChecked={totalChecked}
        totalPool={fullPool.length}
        unavailableCount={view.unavailable}
        failedCount={view.failed}
        nights={nights}
        adults={ctx.adults}
        page={view.safePage}
        totalPages={view.totalPages}
        filteredCount={view.total}
      />

      {/* Przełącznik Lista / Mapa. Pokazujemy go TYLKO gdy mapa naprawdę
          zadziała (jest placeId kierunku i domena white-labelu) — martwy
          przycisk jest gorszy niż jego brak. */}
      {mapAvailable && (
        <div
          role="group"
          aria-label="Widok wyników"
          className="inline-flex rounded-full border border-neutral-300 bg-white p-0.5"
        >
          {(["list", "map"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              aria-pressed={viewMode === mode}
              // min-h-11 = 44 px — minimalny cel dotyku (WCAG 2.2 AA).
              // Wcześniejsze h-9 (36 px) było poniżej progu; zmierzone na 375 px.
              className={`min-h-11 rounded-full px-5 text-sm font-medium transition ${
                viewMode === mode ? "bg-emerald-700 text-white" : "text-neutral-700 hover:text-neutral-900"
              }`}
            >
              {mode === "list" ? "Lista" : "Mapa"}
            </button>
          ))}
        </div>
      )}

      {viewMode === "map" && mapAvailable && (
        <HotelMap
          placeId={mapPlaceId!}
          domain={mapDomain!}
          checkin={ctx.checkin}
          checkout={ctx.checkout}
          searchQuery={baseQuery}
        />
      )}

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
            offer={offer}
            searchQuery={childParams}
            nights={nights}
            imagePriority={index < 6}
            priceSlot={<PriceView entry={entry} nights={nights} />}
          />
        ))
      )}

      <HotelPagination page={view.safePage} totalPages={view.totalPages} baseQuery={baseQuery} />
      </>
      )}
    </div>
  );
}

// Subtitle for the results list — replaces the old server-rendered count.
// Renders three states:
//   1. Scanning: "Sprawdzam dostępność w X obiektach… (Y/Z)"
//   2. Scan complete + filters narrowed it: "12 z 511 dostępnych · …"
//   3. Scan complete + no filters: "511 dostępnych obiektów · …"
function ResultsSubtitle({
  scanComplete,
  availableCount,
  totalChecked,
  totalPool,
  unavailableCount,
  failedCount,
  nights,
  adults,
  page,
  totalPages,
  filteredCount,
}: {
  scanComplete: boolean;
  availableCount: number;
  totalChecked: number;
  totalPool: number;
  unavailableCount: number;
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

  let countLine: React.ReactNode;
  if (!scanComplete) {
    countLine = (
      <>
        <span
          className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500"
          aria-hidden
        />
        Sprawdzam dostępność… {totalChecked}/{totalPool}
        {availableCount > 0 ? (
          <>
            {" "}· dotąd <strong className="font-semibold text-emerald-700">{availableCount}</strong>{" "}
            dostępnych
          </>
        ) : null}
      </>
    );
  } else if (filteredOut > 0) {
    countLine = (
      <>
        <strong className="font-semibold text-neutral-800">{filteredCount}</strong> z{" "}
        {availableCount} dostępnych po filtrach{" "}
        {unavailableCount > 0 ? `· ${unavailableCount} bez miejsc` : ""}
      </>
    );
  } else {
    countLine = (
      <>
        <strong className="font-semibold text-neutral-800">{availableCount}</strong>{" "}
        {availableCount === 1 ? "dostępny obiekt" : "dostępnych obiektów"}
        {unavailableCount > 0 ? ` · ${unavailableCount} bez miejsc` : ""}
      </>
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
      {scanComplete && failedCount > 0 && (
        <>
          <span aria-hidden>·</span>
          <span className="text-amber-700">
            {failedCount} obiektów bez sprawdzonej ceny — odśwież stronę
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
