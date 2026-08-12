"use client";

import dynamic from "next/dynamic";
import { ChevronLeft, List, Map as MapIcon, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { POOL_MAX_TOTAL, POOL_PAGE_SIZE, type MetaOffer } from "@/lib/hotels/meta-pool";
import type { PriceQuery, SlimRate } from "@/lib/hotels/price-batcher";
import {
  ensurePrice,
  getPrice,
  getVersion,
  retryFailedPrices,
  subscribe,
  type PipelineState,
  type PriceEntry,
} from "@/lib/hotels/price-store";

import { ResultCard } from "./result-card";
import { PriceView } from "./card-price";
import { HotelPagination } from "./hotel-pagination";
import { QuickFilters } from "./quick-filters";
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
    // Szkielet o TAKIEJ SAMEJ geometrii co gotowa mapa — bez skoku układu
    // w chwili podmiany (brief V3 §9 i §10).
    <div className="h-full w-full animate-pulse rounded-2xl bg-neutral-100 motion-reduce:animate-none" />
  ),
});

/**
 * Wstępne pobranie paczki mapy, gdy przeglądarka nie ma nic do roboty.
 *
 * Mapa MUSI zostać poza pierwszym pakietem (brief §29) — ale to nie znaczy,
 * że gość ma czekać na pobranie 944 kB dopiero po kliknięciu. Zmierzone:
 * sam import zajmował ~880 ms z 3 s całego oczekiwania.
 *
 * Wywołujemy to w bezczynności ORAZ przy najechaniu na przełącznik, więc
 * w praktyce paczka jest już w pamięci, zanim klik nastąpi. `import()`
 * dedupe'uje się sam, więc wielokrotne wywołanie nic nie kosztuje.
 */
let mapaZaladowana = false;
function preloadMapa(): void {
  if (mapaZaladowana) return;
  mapaZaladowana = true;
  void import("./hotel-map");
}

/**
 * Czy wolno pobierać paczkę mapy „na zapas".
 *
 * Nie wolno na łączu, które gość oszczędza albo które i tak ledwo ciągnie
 * wyniki: 944 kB pobrane na wszelki wypadek konkuruje wtedy ze zdjęciami
 * hoteli, czyli z tym, po co gość przyszedł. Brief: „czy preload nie szkodzi
 * mobile". Przy braku API (Safari) zakładamy, że wolno — to stan sprzed zmiany.
 */
function wolnoPobieracNaZapas(): boolean {
  const c = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;
  if (!c) return true;
  if (c.saveData) return false;
  return c.effectiveType !== "slow-2g" && c.effectiveType !== "2g";
}
import { facilityGroupsFor } from "@/lib/hotels/facility-filters";
import { publishFilterOptions, resetFilterOptions } from "@/lib/hotels/filter-options-store";
import { setViewMode, syncViewModeToSearch, useViewMode } from "@/lib/hotels/view-mode-store";
import { useMediaQuery } from "@/lib/ui/use-media-query";
import {
  applyFiltersAndSort,
  applyMetadataFilters,
  rateDependentFiltersActive,
  type FilterableOffer,
} from "./filters-logic";

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

/**
 * Dociągnięte strony puli, PRZECHOWANE POZA KOMPONENTEM (per karta przeglądarki).
 *
 * ZMIERZONE, nie przewidziane (forensyka 2026-08-11, Rodos): jedna sesja
 * z dziesięcioma wejściami w hotel i powrotami wysłała **41 zapytań do
 * `/api/hotels/meta`** przy zaledwie 18 paczkach stawek. Przyczyna: stan
 * dociągania siedział w `useState`, a każdy powrót „Wstecz" montuje listę od
 * nowa — więc cała pula kierunku pobierała się jeszcze raz, od strony zerowej.
 *
 * To nie było tylko marnotrawstwo. Metadane i stawki dzielą JEDEN klucz
 * limitera, więc te powtórki zjadały budżet, z którego mają korzystać ceny —
 * i przy kliencie za wspólnym adresem (CGNAT operatora komórkowego) właśnie
 * one przewracały skan cen w 429.
 *
 * Ceny leżą w takim samym module (`price-store`) i dokładnie dlatego powrót
 * z hotelu nigdy ich nie pobierał ponownie. Pula musi mieć to samo.
 */
const pamiecPuli = new Map<string, PoolExpansion>();

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
  // Tryb widoku żyje w store, nie w `useState` — sidebar filtrów renderuje
  // się w INNEJ gałęzi drzewa (siatka strony) i też musi go znać, żeby zniknąć
  // w widoku mapy. Szczegóły: `lib/hotels/view-mode-store.ts`.
  const viewMode = useViewMode();

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
    // Tryb widoku NIE jest tu kasowany — to store poza Reactem, a mutowanie go
    // w ciele renderu budziło subskrybentów `useSyncExternalStore`, w tym
    // RODZICA (`ResultsLayout`). Robi to teraz efekt niżej.
  }

  // N2 — tryb widoku dopasowany do wyszukiwania: W EFEKCIE, nie w renderze.
  //
  // Pamięć „które wyszukiwanie już zsynchronizowaliśmy" siedzi w tym samym
  // module co sam tryb (`view-mode-store`), a nie w oknie komponentu. Dzięki
  // temu powrót z hotelu na TEN SAM listing zachowuje mapę, a zmiana dat,
  // gości albo kierunku ją kasuje. Wcześniej pilnował tego `useRef`, który
  // przy każdym montowaniu startował pusty — więc zwykłe „Wstecz" wyglądało
  // jak nowe wyszukiwanie i wyrzucało gościa z mapy na listę.
  useEffect(() => {
    syncViewModeToSearch(ctxSig);
  }, [ctxSig]);

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
        : pamiecPuli.get(sourceSig) ?? {
            sig: sourceSig,
            hotels: [],
            nextOffset: poolNextOffset ?? POOL_PAGE_SIZE,
            done: false,
          };
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
        const next: PoolExpansion = { sig: sourceSig, hotels: [...st.hotels, ...got], nextOffset, done };
        pamiecPuli.set(sourceSig, next);
        setExpansion(next);
      } catch {
        // Awaria dociągania NIE psuje wyników — zostajemy przy tym, co mamy
        // (co najmniej serwerowe 300). Abort (unmount/zmiana kierunku) ciszej.
        if (!controller.signal.aborted) {
          const next: PoolExpansion = { sig: sourceSig, hotels: st.hotels, nextOffset: st.nextOffset, done: true };
          pamiecPuli.set(sourceSig, next);
          setExpansion(next);
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
  /** Stan dociągania dla BIEŻĄCEGO kierunku — ze stanu albo z pamięci karty. */
  const stanPuli: PoolExpansion | null =
    expansion.sig === sourceSig ? expansion : pamiecPuli.get(sourceSig) ?? null;

  const fullPool = useMemo(() => {
    const extraHotels = stanPuli?.hotels ?? [];
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
  }, [pool, stanPuli]);

  // N3 — zmiana kierunku CZYŚCI opcje filtrów.
  //
  // `resetFilterOptions()` istniało od początku, ale nie było wołane z żadnego
  // miejsca w repo — czyli było martwe. Opcje poprzedniego kierunku wisiały
  // w module do chwili, aż lista opublikuje nowe, więc gość przechodzący
  // Heraklion → Antalya widział przez ten czas sieci hotelowe i udogodnienia
  // z Heraklionu. Reset MUSI iść przed publikacją i być kluczowany na
  // kierunku, nie na puli (pula rośnie w trakcie dociągania stron).
  useEffect(() => {
    resetFilterOptions();
  }, [sourceSig]);

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

    const filterParams = {
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
    };
    const passed = applyFiltersAndSort(filterable, filterParams);

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

    // ── Punkty mapy: NIE czekamy na ceny ──────────────────────────────────
    //
    // Wcześniej mapa dostawała wyłącznie hotele z pobraną ceną. Na dużym
    // kierunku (Heraklion, ~500 obiektów) skan trwa kilkanaście sekund, więc
    // gość, który przełączył się na mapę, patrzył przez ten czas na prawie
    // pustą planszę — a potem na planszę, która sama się przekadrowuje. Stąd
    // zgłoszenie „mapa ładuje się 5 sekund" i „dla części kierunków nie działa".
    //
    // Teraz hotele bez ceny też stają na mapie (znacznik neutralny, cena
    // dochodzi w miejscu). Warunek uczciwości: przepuszczamy tylko te, o
    // których na pewno wiemy, że przechodzą aktywne filtry — a filtry ceny,
    // wyżywienia i anulacji wymagają taryfy, więc przy nich czekamy na cenę.
    const czekajaceNaMapie: Row[] =
      rateDependentFiltersActive(filterParams)
        ? []
        : applyMetadataFilters(
            rows
              .filter((r) => r.entry !== null && !isPriced(r.entry))
              .map((r) => ({ ...r.offer, _row: r })),
            filterParams,
          ).map((o) => o._row);

    return {
      displayed,
      // Pełna, przefiltrowana lista (bez cięcia na strony) — źródło podglądu
      // wybranego hotelu i listy obok mapy.
      allRows: orderedRows,
      /** Wszystko, co ma prawo stanąć na mapie: wycenione + jeszcze skanowane. */
      mapRows: [...orderedRows, ...czekajaceNaMapie],
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
      view.mapRows
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
    [view.mapRows, ctx.currency],
  );

  // Skan „gotowy" dopiero gdy: wszystkie znane hotele wycenione ORAZ nie ma
  // już stron puli do dociągnięcia (inaczej licznik zamarłby na 300/300 tuż
  // przed dosypaniem kolejnej strony).
  const expansionPending = Boolean(poolSource && poolHasMore) && !(stanPuli?.done ?? false);
  const scanComplete = view.scanning === 0 && !expansionPending;

  // ── Jawny stan całego lejka cen (§20 briefu) ─────────────────────────────
  //
  // „Skan skończony" NIE ZNACZY „udało się". Ten sam warunek był prawdziwy
  // przy komplecie cen i przy zerze cen po awarii wszystkich paczek — a lista
  // wyglądała wtedy na kompletną. Rozróżnienie steruje komunikatem i akcją.
  const pipelineState: PipelineState = !scanComplete
    ? "loading"
    : view.failed === 0
      ? "success"
      : view.availableCount === 0
        ? "failed"
        : "partial";

  // ── Samoczynna ponowka nieudanych cen (§21 briefu) ───────────────────────
  //
  // „Odśwież stronę" nie jest naprawą, tylko przerzuceniem awarii na gościa —
  // i kosztuje go przewinięcie, filtry oraz WSZYSTKIE już pobrane ceny.
  // System ma spróbować sam.
  //
  // JEDEN przebieg, po zakończeniu skanu, raz na wyszukiwanie. Nie odpytujemy
  // w pętli: batcher ma już własne ponowki z odczekaniem, więc ta warstwa
  // łapie wyłącznie awarię, która przetrwała cały skan (typowo wyczerpany
  // budżet limitera — okno przesuwne zwalnia się w kilka sekund).
  const autoPonowkaRef = useRef<{ sig: string; timer: ReturnType<typeof setTimeout> | null }>({
    sig: "",
    timer: null,
  });
  // Budzik kasujemy TYLKO przy odmontowaniu, nie przy każdym przebiegu efektu.
  // Efekt zależy m.in. od `view.failed`, a samo zaplanowanie ponowki tę liczbę
  // zmienia — sprzątanie w każdym przebiegu kasowałoby własny budzik, zanim
  // zdąży wystrzelić, i automatyczna ponowka nie odpaliłaby NIGDY.
  useEffect(() => {
    // Obiekt w refie jest MUTOWANY, nigdy podmieniany — dzięki temu ta
    // referencja pozostaje tym samym obiektem do końca życia komponentu
    // i sprzątanie widzi realny budzik, a nie kopię sprzed jego ustawienia.
    const st = autoPonowkaRef.current;
    return () => {
      if (st.timer !== null) clearTimeout(st.timer);
      st.timer = null;
    };
  }, []);
  const hotelIdsSig = poolIdSig;
  useEffect(() => {
    if (!scanComplete || view.failed === 0) return;
    const st = autoPonowkaRef.current;
    if (st.sig === ctxSig) return; // jedna ponowka na wyszukiwanie
    st.sig = ctxSig;
    st.timer = setTimeout(() => {
      st.timer = null;
      retryFailedPrices(hotelIdsSig ? hotelIdsSig.split(",") : [], ctx);
    }, 2500);
    // ctx jest stabilne w granicach ctxSig; hotelIdsSig niesie listę hoteli.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanComplete, view.failed, ctxSig, hotelIdsSig]);

  /** Ręczna ponowka — bez przeładowania strony, tylko nieudany podzbiór. */
  const ponowNieudane = () => {
    retryFailedPrices(fullPool.map((o) => o.hotelId), ctx);
  };

  // Paczkę mapy pobieramy w bezczynności, PO wyrenderowaniu wyników.
  //
  // „Po wyrenderowaniu" było wcześniej życzeniem, nie warunkiem: efekt startował
  // przy montowaniu listy, więc `requestIdleCallback` potrafił trafić w moment,
  // gdy kart jeszcze nie było na ekranie. Test E2E §29 wyłapał to wprost —
  // `maplibre-gl` (944 kB) leciał PRZED pierwszą kartą wyniku, czyli dokładnie
  // na ścieżce krytycznej, z której miał zniknąć.
  //
  // Teraz warunek jest jawny: pobieramy dopiero, gdy na ekranie stoi choć jedna
  // karta, i tylko na łączu, które na to stać.
  useEffect(() => {
    // Warunkiem jest KONIEC SKANU CEN, nie sam render kart.
    //
    // `view.displayed.length > 0` było prawdziwe już przy pierwszym renderze:
    // lista dopełnia stronę kartami bez ceny, żeby ekran nie był pusty. Timer
    // startował więc praktycznie przy montowaniu i w wolniejszym przebiegu
    // wyprzedzał pierwsze karty — test §29 łapał to jako pobranie paczki mapy
    // na ścieżce krytycznej. Koniec skanu to sygnał JEDNOZNACZNY: wyniki są
    // kompletne, sieć jest wolna, nikt na nic nie czeka.
    if (!scanComplete || !wolnoPobieracNaZapas()) return;
    // Dwa warunki, oba konieczne: karty MUSZĄ być na ekranie ORAZ musi minąć
    // chwila spokoju. Sam `requestIdleCallback` nie wystarczał — przeglądarka
    // uznaje się za bezczynną już MIĘDZY malowaniem pierwszych kart a dojściem
    // ich zdjęć, więc 944 kB paczki mapy wchodziło dokładnie tam, gdzie nie
    // powinno. Test E2E §29 łapał to powtarzalnie.
    //
    // 2 s to konserwatywny zapas: gość, który w ogóle sięgnie po mapę, robi to
    // wyraźnie później, a najechanie i dotknięcie przełącznika i tak ściągają
    // paczkę natychmiast (`onPointerEnter` / `onFocus`), więc klik pozostaje
    // bezzwłoczny.
    const t = window.setTimeout(() => {
      const idle = (window as unknown as {
        requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      }).requestIdleCallback;
      if (typeof idle === "function") idle(preloadMapa, { timeout: 4000 });
      else preloadMapa();
    }, 2000);
    return () => window.clearTimeout(t);
  }, [scanComplete]);

  // ── Czy mapa MA PRAWO istnieć ────────────────────────────────────────────
  //
  // Liczone z CAŁEJ PULI KIERUNKU, nie z aktualnie widocznych punktów — i to
  // jest naprawa, nie kosmetyka.
  //
  // Wcześniej stało tu `mapPoints.length > 0`, czyli wartość zależna od cen,
  // filtrów i ograniczenia do obszaru. Gdy któreś z nich chwilowo dawało zero
  // punktów (świeżo wybrany obszar na mapie, filtr wykluczający wszystko,
  // moment po zmianie filtrów, zanim dojdą ceny), `mapAvailable` przewracało
  // się na `false` — a wtedy blok mapy renderował `null`, blok listy też
  // (`viewMode === "map"`), i gość zostawał z PUSTYM PANELEM bez mapy, bez
  // listy i bez przełącznika. To jest zgłoszone „mapa czasem zostaje pusta":
  // nie awaria MapLibre, tylko warunek renderu.
  //
  // Pula kierunku nie znika przy zmianie filtrów, więc ten warunek się nie
  // chwieje. Sytuację „w tym kadrze nie ma nic" obsługuje komunikat WEWNĄTRZ
  // mapy, gdzie stoi też przycisk powrotu do całego kierunku.
  const mapAvailable = useMemo(
    () =>
      fullPool.some(
        (o) => typeof o.latitude === "number" && typeof o.longitude === "number",
      ),
    [fullPool],
  );
  /** Jedyny warunek renderu mapy — i jednocześnie dopełnienie warunku listy. */
  const pokazMape = viewMode === "map" && mapAvailable;
  // Szukamy w `mapRows`, nie w `allRows`: znacznik może wskazywać hotel, którego
  // cena jeszcze nie doszła — a klik w niego musi otworzyć podgląd tak samo.
  const selectedRow = selectedId
    ? view.mapRows.find((r) => r.offer.hotelId === selectedId) ?? null
    : null;

  // Wejście w tryb mapy dosuwa widok do góry podziału.
  //
  // ŚWIADOMY GEST, NIE EFEKT. Wcześniej robił to `useEffect` zależny od
  // `viewMode`, więc odpalał się także wtedy, gdy tryb mapy został ODTWORZONY
  // — na przykład po „Wstecz" z karty hotelu. Gość, który nic nie kliknął,
  // dostawał wtedy samoczynne, płynne przewinięcie strony. Teraz przewijamy
  // wyłącznie w obsłudze kliknięcia w „Mapa" i skokowo (`auto`), bo płynne
  // przewijanie nakładało się na montowanie mapy i zostawiało ją w połowie
  // kadru.
  const kotwicaMapy = useRef<HTMLDivElement | null>(null);
  const dosunDoMapy = () => {
    if (!isDesktop) return;
    const el = kotwicaMapy.current;
    if (!el) return;
    const gora = el.getBoundingClientRect().top + window.scrollY;
    // `- 8` daje oddech, żeby mapa nie dotykała paska wyszukiwania.
    const cel = Math.max(
      0,
      gora -
        (parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--ht-header-h")) || 84) -
        8,
    );
    if (Math.abs(window.scrollY - cel) > 4) window.scrollTo({ top: cel, behavior: "auto" });
  };

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

  // Podgląd wybranego obiektu jest ZAWSZE wariantem kompaktowym — także na
  // desktopie. Pełna karta w nakładce nad mapą (~750 px) rozkładała nazwę
  // hotelu po jednym słowie na linię i wystawała poza dolną krawędź mapy:
  // kolumna informacji miała po odjęciu zdjęcia i szyny cenowej ~180 px.
  // Podgląd ma odpowiedzieć na „co to za obiekt i ile kosztuje", a nie
  // powtarzać całą kartę wyniku.
  const selectedCard = selectedRow ? (
    <ResultCard
      offer={isPriced(selectedRow.entry) ? { ...selectedRow.offer, cheapestRate: selectedRow.entry } : selectedRow.offer}
      searchQuery={childParams}
      nights={nights}
      compact
      priceSlot={
        isPriced(selectedRow.entry) ? undefined : (
          <PriceView entry={selectedRow.entry as "loading" | "error" | null | undefined} />
        )
      }
    />
  ) : null;

  return (
    <div className="space-y-4" ref={kotwicaMapy}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ResultsSubtitle
          pipelineState={pipelineState}
          onRetry={ponowNieudane}
          availableCount={view.availableCount}
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
            className="inline-flex shrink-0 rounded-full border border-neutral-200 bg-white p-1 shadow-sm"
          >
            {([
              { mode: "list", label: "Lista", Icon: List },
              { mode: "map", label: "Mapa", Icon: MapIcon },
            ] as const).map(({ mode, label, Icon }) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  setViewMode(mode);
                  if (mode === "map") dosunDoMapy();
                }}
                // Najechanie i dotknięcie ściągają paczkę mapy, zanim padnie
                // klik — razem z pobraniem w bezczynności daje to praktycznie
                // natychmiastowe otwarcie.
                onPointerEnter={preloadMapa}
                onFocus={preloadMapa}
                aria-pressed={viewMode === mode}
                // min-h-11 = 44 px — minimalny cel dotyku (WCAG 2.2 AA).
                className={`inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold transition ${
                  viewMode === mode
                    ? "bg-emerald-700 text-white shadow-sm"
                    : "text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900"
                }`}
              >
                <Icon aria-hidden className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Szybkie filtry — WIDOCZNE TYLKO NA MAPIE (brief V3 §6).
          W trybie mapy nie ma sidebaru, więc najczęstsze filtry muszą być
          w zasięgu ręki. W trybie listy byłyby zdublowaniem panelu obok.
          Na telefonie pasek renderuje się WEWNĄTRZ pełnoekranowej mapy (niżej),
          bo tam ten fragment drzewa jest zasłonięty. */}
      {pokazMape && isDesktop && <QuickFilters />}

      {/* ── WIDOK MAPY ────────────────────────────────────────────────────
          Desktop: podział 55/45, mapa przyklejona do okna i wysoka na cały
          ekran pomniejszony o paski (brief §13B). Telefon: mapa na pełny
          ekran, a wybrany hotel wjeżdża kartą od dołu (brief §13D). */}
      {pokazMape ? (
        // JEDNA instancja mapy. Wariantów NIE przełączamy klasami `lg:hidden`,
        // bo Tailwind renderuje wtedy oba drzewa — a to znaczyłoby dwie mapy
        // MapLibre naraz, dwa canvasy i dwa komplety pobranych kafelków,
        // z czego jeden niewidoczny. Zdarzyło się to w tej sesji.
        !isDesktop ? (
          /* Telefon — mapa na pełny ekran (brief §13D).
             KARTA WYBRANEGO OBIEKTU JEST NAKŁADKĄ, nie sąsiadem w kolumnie.
             Jako sąsiad odbierała mapie wysokość w chwili wyboru, więc mapa
             przeliczała projekcję i cały obraz — razem z dopiero co dotkniętym
             znacznikiem — przeskakiwał. Zmierzone na 768 px: znacznik uciekał
             o 263 px w górę zaraz po dotknięciu. To jest zgłoszone „przycisk
             przeskakuje, trudno otworzyć hotel". */
          <div className="fixed inset-0 z-50 flex flex-col bg-white">
            <div className="flex items-center justify-between gap-2 border-b border-neutral-200 bg-white px-3 py-2">
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className="inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-emerald-800"
              >
                <ChevronLeft aria-hidden className="h-4 w-4" />
                Wróć do listy
              </button>
              <span className="text-xs font-medium text-neutral-600">
                {view.total} {obiektySlowo(view.total)}
              </span>
            </div>
            {/* Szybkie filtry także na telefonie — w trybie mapy nie ma panelu
                bocznego, a przewijany rząd chipów mieści się w jednym wierszu. */}
            <div className="-mx-0 overflow-x-auto border-b border-neutral-200 bg-white px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <QuickFilters compact />
            </div>
            <div className="relative isolate min-h-0 flex-1">
              {mapNode}
              {selectedCard && (
                <div className="absolute inset-x-2 bottom-2 z-40 animate-in fade-in slide-in-from-bottom-2 duration-200 motion-reduce:animate-none">
                  <div className="overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-emerald-900/10">
                    {selectedCard}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    aria-label="Zamknij podgląd obiektu"
                    className="absolute -top-3 right-1 flex h-11 w-11 items-center justify-center rounded-full bg-neutral-900/85 text-white shadow-lg transition hover:bg-neutral-900"
                  >
                    <X aria-hidden className="h-5 w-5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Desktop — podział 55/45, mapa przyklejona do okna (brief §13B) */
          <div className="grid grid-cols-[55fr_45fr] items-start gap-4">
            <div
              className="space-y-4 overflow-y-auto overscroll-contain pr-1"
              // Wysokość liczona ze ZMIERZONEGO nagłówka (patrz
              // HeaderOffsetProbe), a nie z wpisanych ręcznie 11rem — inaczej
              // kolumna albo wystawała poza ekran, albo zostawiała pod sobą
              // martwy pas.
              //
              // 9 rem = zmierzona treść między dołem nagłówka a górą podziału
              // (tytuł z licznikiem, przełącznik Lista/Mapa, pasek szybkich
              // filtrów) plus oddech u dołu. Po ustawieniu widoku przez
              // `kotwicaMapy` góra podziału stoi na 220 px od krawędzi okna
              // — ta sama wartość przy 100% i przy 125% zoomu, bo składają się
              // na nią wyłącznie stałe w pikselach CSS.
              style={{ maxHeight: "calc(100vh - var(--ht-header-h, 84px) - 9rem)" }}
            >
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
            <div
              // BEZ `sticky`. BEZ `fixed`. BEZ `top`. Decyzja produktowa
              // właściciela (2026-08-11): na listingu nic nie goni przewijania.
              //
              // Usunięcie jest bezpieczne, bo przyklejenie i tak NIE MIAŁO
              // ZAKRESU RUCHU: obie kolumny podziału mają tę samą wysokość,
              // więc wiersz siatki jest dokładnie tak wysoki jak mapa i nie ma
              // jej dokąd jechać. To WYSOKOŚĆ, nie przyklejenie, decyduje
              // o tym, czy mapa mieści się w oknie.
              //
              // Dlatego obie kolumny dostają wysokość liczoną z `100vh`
              // pomniejszonego o ZMIERZONY nagłówek i o 9 rem treści nad
              // podziałem. Wcześniejsze 8,5 rem dawało dolną krawędź 2 px POD
              // krawędzią okna przy 1080 px — przy 80% zoomu (okno 1350 px CSS)
              // te 2 px ginęły w zapasie i wszystko wyglądało dobrze, a przy
              // 100% mapa wystawała i trzeba było ją doscrollować.
              style={{
                height: "calc(100vh - var(--ht-header-h, 84px) - 9rem)",
              }}
            >
              <div className="relative isolate h-full">
                {mapNode}
                {/* Podgląd wybranego obiektu NA mapie (brief §13C).
                    Konieczny, bo kliknięty znacznik często wskazuje hotel,
                    którego karty nie ma w widocznym fragmencie listy — bez
                    tego klik w znacznik nie dawał żadnej odpowiedzi. */}
                {selectedCard && (
                  <div className="absolute inset-x-3 bottom-3 z-40 animate-in fade-in slide-in-from-bottom-2 duration-200 motion-reduce:animate-none">
                    <div className="rounded-2xl bg-white shadow-2xl ring-1 ring-emerald-900/10">
                      {selectedCard}
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedId(null)}
                      aria-label="Zamknij podgląd obiektu"
                      className="absolute -top-4 right-1 flex h-11 w-11 items-center justify-center rounded-full bg-neutral-900/85 text-white shadow-lg transition hover:bg-neutral-900"
                    >
                      <X aria-hidden className="h-5 w-5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      ) : null}

      {/* DOPEŁNIENIE, NIE DRUGI WARUNEK. Lista renderuje się dokładnie wtedy,
          gdy nie renderuje się mapa — dzięki temu nie istnieje stan, w którym
          nie ma ANI mapy, ANI listy. Wcześniej oba bloki miały niezależne
          warunki (`viewMode === "map" && mapAvailable` vs `viewMode === "map"`)
          i przy `mapAvailable === false` w trybie mapy oba dawały `null`. */}
      {pokazMape ? null : (<>
      {/* With loading-row padding above, displayed.length is 0 only AFTER
          the scan completes AND nothing matched (either no available hotels
          at all, or filters wiped everything). */}
      {view.displayed.length === 0 ? (
        pipelineState === "failed" ? (
          // Awaria pobierania cen ≠ brak miejsc. Uczciwy komunikat + akcja,
          // zamiast fałszywego „nic nie ma" (audyt mobilny 2026-07-03).
          //
          // Przycisk ponawia SAM PODZBIÓR, bez przeładowania strony: gość
          // zachowuje przewinięcie, filtry i te ceny, które już doszły.
          <div className="rounded-2xl border border-neutral-200 bg-white p-6 text-center">
            <p className="text-sm font-semibold text-neutral-900">
              Nie udało się sprawdzić dostępności hoteli
            </p>
            <p className="mt-1 text-sm text-neutral-600">
              To zwykle chwilowy problem z połączeniem — hotele nadal mogą być wolne.
            </p>
            <button
              type="button"
              onClick={ponowNieudane}
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
  pipelineState,
  onRetry,
  availableCount,
  nights,
  adults,
  page,
  totalPages,
  filteredCount,
}: {
  pipelineState: PipelineState;
  onRetry: () => void;
  availableCount: number;
  nights: number;
  adults: number;
  page: number;
  totalPages: number;
  filteredCount: number;
}) {
  const scanComplete = pipelineState !== "loading";
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
          „300 obiektów bez sprawdzonej ceny" brzmiało jak raport z serwerowni.
          Nie ma tu też „odśwież stronę": przeładowanie kasuje przewinięcie,
          filtry i wszystkie pobrane ceny, żeby powtórzyć kilka nieudanych
          zapytań. Ponawiamy sam nieudany podzbiór, w miejscu. */}
      {pipelineState === "partial" && (
        <>
          <span aria-hidden>·</span>
          <span className="text-amber-700">Nie udało się sprawdzić cen części obiektów.</span>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex min-h-6 items-center rounded-full px-2 py-0.5 text-sm font-semibold text-emerald-800 underline underline-offset-2 transition hover:bg-emerald-50"
          >
            Spróbuj ponownie
          </button>
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
