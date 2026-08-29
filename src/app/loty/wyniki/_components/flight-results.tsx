"use client";

// Lista ofert lotów. Pobiera oferty z /api/flights/rates (fan-out po lotniskach
// wylotu), filtruje i sortuje po stronie klienta, renderuje karty stronami po 20.
// Klik „Wybierz" → zapis kontekstu (sessionStorage) → /loty/dodatki, gdzie
// dzieje się verify i wybór taryfy.
//
// ZMIANY Flights V2 (2026-08-29):
//   • szerokość z `lib/flights/layout.ts` zamiast `max-w-6xl` (audyt: karta
//     oferty miała 463 px na monitorze 1920 px, 59,4 % ekranu było białe),
//   • karta wyjęta do `components/flights/flight-offer-card.tsx`,
//   • kolory z tokenów systemu (`ink`, `line`, `brand`, `accent`), nie z surowej
//     palety Tailwinda — sekcja lotów była jedynym miejscem w serwisie, które
//     malowało `neutral-*`, i dlatego wyglądała jak inny produkt,
//   • pasek filtrów/sortowania na mobile jest STICKY: po przewinięciu do
//     trzeciej oferty kontrolki znikały z ekranu i nie było jak zawęzić listy,
//   • licznik aktywnych filtrów przy przycisku „Filtry".

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal, Tag, X } from "lucide-react";

import { track } from "@/lib/analytics/track";
import { type DisplayOffer } from "@/lib/flights/display";
import { averagePerTraveller, formatFlightPrice } from "@/lib/flights/money";
import { saveFlightFlow } from "@/lib/flights/flow-storage";
import { originHeaderLabel } from "@/lib/flights/airports";
import { FLIGHT_CONTROLS_STICKY_TOP, FLIGHT_RESULTS_GRID, FLIGHT_SHELL_WIDE } from "@/lib/flights/layout";
import {
  EMPTY_FILTERS,
  SORT_OPTIONS,
  applyFilters,
  computeFacets,
  countActiveFilters,
  sortOffers,
  type FlightFilters,
  type SortKey,
} from "@/lib/flights/filters";
import { computeOfferBadges } from "@/lib/flights/badges";
import { FlightOfferCard } from "@/components/flights/flight-offer-card";
import { FlightFiltersPanel } from "@/components/flights/flight-filters";
import { FlightResultsSkeleton, FlightFiltersSkeleton } from "./flight-results-skeleton";

interface Props {
  /** Kody wylotu: 1 lotnisko, kod metra (LON) albo lista (WAW,WMI,RDO) z grupy. */
  origins: string[];
  /** Etykieta nagłówka, np. „Warszawa — wszystkie lotniska". */
  originLabel?: string;
  destination: string;
  /** Nazwa miasta celu (z URL `destLabel`); fallback do kodu IATA. */
  destLabel?: string;
  depart: string;
  ret?: string;
  adults: number;
  childrenCount: number;
  infants: number;
  /** Recovery po wygaśnięciu oferty — omiń cache ofert (świeże wyniki). */
  fresh?: boolean;
}

type Leg = { origin: string; destination: string; date: string; direction: "OUTBOUND" | "INBOUND" };

// Ile ofert renderujemy na start i dosypujemy na klik „Pokaż więcej".
const PAGE_SIZE = 20;

export function FlightResults(props: Props) {
  const { origins, originLabel, destination, destLabel, depart, ret, adults, childrenCount, infants, fresh } = props;
  const router = useRouter();
  const [offers, setOffers] = useState<DisplayOffer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("best");
  const [filters, setFilters] = useState<FlightFilters>(EMPTY_FILTERS);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);
  const filtersButtonRef = useRef<HTMLButtonElement>(null);
  // Paginacja „Pokaż więcej": 150 kart naraz to ~7000 nodów DOM i strona wysoka
  // na dziesiątki tysięcy pikseli. Sort/filtry działają na PEŁNEJ puli; tniemy
  // wyłącznie render. Zmiana sortu/filtrów wraca do pierwszej strony.
  const [shownCount, setShownCount] = useState(PAGE_SIZE);
  const [allSettled, setAllSettled] = useState(false);
  const fetchedRef = useRef(false);

  const travellers = adults + childrenCount + infants;
  const originsKey = origins.join(",");
  const headerLabel = originHeaderLabel(origins, originLabel);

  // Pobranie ofert (raz). Fan-out po lotniskach (metro=1 kod) RÓWNOLEGLE, ale
  // wyniki POKAZUJEMY W MIARĘ NAPŁYWU (nie czekamy aż wszystkie odpowiedzą):
  // najszybsze lotnisko pojawia się pierwsze. Scalanie + dedup po offerId.
  //
  // Wyścig „stare wyszukiwanie nadpisuje nowe" jest wykluczony wyżej: strona
  // nadaje temu komponentowi `key` złożony z parametrów, więc zmiana kierunku
  // czy dat to REMOUNT ze świeżym stanem, a nie kolejny fetch w tej instancji.
  // `alive` domyka drugi przypadek — odpowiedź, która wróciła po odmontowaniu.
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    let alive = true;
    const seen = new Set<string>();
    const merged: DisplayOffer[] = [];
    let anyOk = false;
    let firstMessage: string | undefined;

    void Promise.all(
      origins.map(async (o) => {
        const legs: Leg[] = [{ origin: o, destination, date: depart, direction: "OUTBOUND" }];
        if (ret) legs.push({ origin: destination, destination: o, date: ret, direction: "INBOUND" });
        try {
          const res = await fetch(`/api/flights/rates${fresh ? "?fresh=1" : ""}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ legs, adults, children: childrenCount, infants, cabinClass: "ECONOMY" }),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) {
            if (!firstMessage) firstMessage = json.message as string | undefined;
            return;
          }
          anyOk = true;
          const got = (json.offers ?? []) as DisplayOffer[];
          for (const off of got) {
            if (seen.has(off.offerId)) continue;
            seen.add(off.offerId);
            merged.push(off);
          }
          // Progresywny render TYLKO gdy faktycznie coś dosypaliśmy. Bez tego
          // lotnisko z 0 ofert (pusta odpowiedź wraca szybciej) wywołałoby
          // setOffers([]) → mignięcie „Brak lotów" zanim dojdą oferty z lotniska,
          // które je ma. Stan pusty/błąd domyka .finally().
          if (alive && merged.length > 0) setOffers([...merged]);
        } catch {
          /* to lotnisko padło — inne mogą się udać */
        }
      }),
    ).finally(() => {
      if (!alive) return;
      setAllSettled(true);
      if (!anyOk) {
        setError(firstMessage || "Nie udało się pobrać ofert. Spróbuj ponownie.");
        setOffers([]);
      } else {
        setOffers([...merged]);
        track("flight_results_view", { origin: originsKey, destination, results_count: merged.length });
      }
    });

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originsKey, destination, depart, ret, adults, childrenCount, infants]);

  // Faceting z PEŁNEJ puli (liczniki nie zmieniają się przy filtrowaniu);
  // widoczna lista = filtry + sort, po stronie klienta.
  const facets = useMemo(() => (offers ? computeFacets(offers) : null), [offers]);
  const visible = useMemo(
    () => (offers ? sortOffers(applyFilters(offers, filters), sort) : []),
    [offers, filters, sort],
  );
  // Powrót na pierwszą „stronę" przy zmianie kontrolek — inny sort/filtr
  // to nowy ranking, doklejone wcześniej oferty przestają mieć sens.
  useEffect(() => {
    setShownCount(PAGE_SIZE);
  }, [filters, sort]);

  // Arkusz filtrów: Escape zamyka, fokus wchodzi do środka i WRACA na przycisk,
  // z którego wyszedł, a tło nie przewija się pod spodem. Bez tego arkusz jest
  // pułapką dla klawiatury i czytnika ekranu — otwierasz go i nie ma wyjścia
  // inaczej niż myszą w tło.
  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    filtersButtonRef.current?.focus();
  }, []);
  useEffect(() => {
    if (!drawerOpen) return;
    drawerCloseRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDrawer();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [drawerOpen, closeDrawer]);
  const rendered = visible.slice(0, shownCount);
  const remaining = visible.length - rendered.length;
  const activeFilters = countActiveFilters(filters);

  // Najtańsza oferta z PEŁNEJ puli — sygnał „od X zł". ŚREDNIA na podróżnego,
  // nie „cena za osobę": taryfa dziecięca i niemowlę na kolanach kosztują
  // mniej niż bilet dorosłego, więc suma/liczba osób jest średnią i tylko tak
  // wolno ją podpisać. Stabilne mimo filtra/sortu (liczone z `offers`).
  const cheapestAvg = useMemo(() => {
    if (!offers || offers.length === 0) return null;
    let min = Infinity;
    for (const o of offers) if (typeof o.total === "number" && o.total < min) min = o.total;
    return min === Infinity ? null : averagePerTraveller(min, travellers);
  }, [offers, travellers]);

  const badges = useMemo(
    () => (offers ? computeOfferBadges(offers) : { cheapestId: null, fastestId: null, bestId: null }),
    [offers],
  );

  function selectOffer(offer: DisplayOffer) {
    track("flight_select", {
      offer_id: offer.offerId,
      price: offer.total ?? undefined,
      currency: offer.currency,
      carrier: offer.legs[0]?.carriers[0],
    });
    // REALNE lotnisko wylotu (grupa „wszystkie lotniska" miesza lotniska).
    const actualOrigin = offer.legs[0]?.originCode || origins[0];
    const base = offer.fares[0]; // taryfa bazowa (najtańsza) = aktualnie pokazana
    saveFlightFlow({
      origin: actualOrigin, destination, depart, ret, adults, children: childrenCount, infants,
      offerId: offer.offerId, offer,
      // `selectedTotal`, nie `verifiedTotal`: NIC tu jeszcze nie zostało
      // zweryfikowane u dostawcy. Verify dzieje się na /loty/dodatki, na
      // finalnie wybranej taryfie, i dopiero on ustawia `verified: true`.
      selectedTotal: offer.total, selectedCurrency: offer.currency,
      verifiedAt: Date.now(), verified: false,
      fare: base ? { name: base.fareName, hasCarryOnBag: base.hasCarryOnBag, hasCheckedBag: base.hasCheckedBag } : undefined,
    });
    router.push("/loty/dodatki");
  }

  // `h-11` = 44 px, nie `h-10`. Zmierzone testem e2e: przycisk „Filtry"
  // i lista sortowania miały po 40 px, czyli poniżej progu celu dotykowego
  // obowiązującego w tym repo. Na pasku, który na telefonie jest przyklejony
  // i używany jedną ręką w biegu, to nie jest zaokrąglenie w dół.
  const controlCls =
    "inline-flex h-11 items-center gap-1.5 rounded-md border border-line bg-surface-raised px-3 font-semibold text-ink transition hover:border-brand/40 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100";

  return (
    <main className={`${FLIGHT_SHELL_WIDE} min-h-[60vh] py-6 sm:py-8`}>
      {/* Nagłówek jest CELOWO mniejszy na telefonie niż na desktopie.
          Pomiar po pierwszej wersji redesignu (390 px): tytuł `text-2xl`
          zawijał się na dwie linie, a razem z podtytułem, plakietką ceny
          i linią zaufania spychał PIERWSZĄ OFERTĘ poniżej 840 px — czyli
          użytkownik mobilny otwierał listę wyników i nie widział na niej
          ani jednego wyniku. Na telefonie prowadzi oferta, nie tytuł. */}
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-ink sm:text-2xl lg:text-3xl">
            Loty {headerLabel} → {destLabel || destination}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            {ret ? "W obie strony" : "W jedną stronę"} · {travellers}{" "}
            {travellers === 1 ? "podróżny" : "podróżnych"}
            {offers
              ? visible.length === offers.length
                ? ` · ${offers.length} ${offers.length === 1 ? "oferta" : "ofert"}`
                : ` · ${visible.length} z ${offers.length} ofert`
              : ""}
          </p>
          {cheapestAvg !== null && (
            <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-sm bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand-strong">
              <Tag aria-hidden className="h-3.5 w-3.5" strokeWidth={2} />
              Najtańszy od {formatFlightPrice(cheapestAvg, "PLN")} śr./os.
            </p>
          )}
        </div>

      </header>

      {/* Sygnały zaufania — jedną linią pod nagłówkiem. Wcześniej stały po
          prawej stronie tego samego wiersza co tytuł i na szerokim ekranie
          wisiały w powietrzu, oderwane od czegokolwiek. */}
      {/* Na telefonie linia zaufania schodzi POD listę (renderowana niżej):
          trzy obietnice zajmowały dwie linie ekranu, na którym nie było jeszcze
          widać ani jednej oferty. */}
      {offers && offers.length > 0 && (
        <p className="mt-3 hidden text-xs text-ink-muted lg:block">
          Ceny finalne w PLN, wł. podatków i opłat · Bezpieczna płatność · Polskie wsparcie
        </p>
      )}

      {/* Pasek kontrolek. Na mobile STICKY pod paskiem wyszukiwania — po
          przewinięciu do trzeciej oferty filtry i sort znikały z ekranu
          i jedynym sposobem na zawężenie listy był powrót na samą górę. */}
      {offers && offers.length > 0 && (
        <div
          className={`sticky ${FLIGHT_CONTROLS_STICKY_TOP} z-10 -mx-4 mt-4 flex items-center gap-2 border-b border-line bg-surface/95 px-4 py-2 backdrop-blur-sm sm:-mx-6 sm:px-6 lg:static lg:z-auto lg:mx-0 lg:mt-5 lg:justify-end lg:border-0 lg:bg-transparent lg:px-0 lg:py-0 lg:backdrop-blur-none`}
        >
          <button
            ref={filtersButtonRef}
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={drawerOpen}
            className={`${controlCls} lg:hidden`}
          >
            <SlidersHorizontal aria-hidden className="h-4 w-4" strokeWidth={2} />
            <span className="text-sm">Filtry</span>
            {activeFilters > 0 && (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1 text-xs font-bold text-white">
                {activeFilters}
              </span>
            )}
          </button>
          <label className="flex items-center gap-2 text-xs font-medium text-ink-muted">
            <span className="hidden sm:inline">Sortuj</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              aria-label="Sortowanie ofert"
              className="h-11 rounded-md border border-line bg-surface-raised px-2.5 text-sm font-semibold text-ink focus:border-brand focus:outline-none"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className={`mt-5 ${FLIGHT_RESULTS_GRID}`}>
        {/* Sidebar filtrów (desktop) */}
        <aside className="hidden lg:block">
          {offers === null && <FlightFiltersSkeleton />}
          {facets && offers && offers.length > 0 && (
            <div className="sticky top-28 rounded-lg border border-line bg-surface-raised p-4">
              <FlightFiltersPanel facets={facets} filters={filters} onChange={setFilters} onClear={() => setFilters(EMPTY_FILTERS)} />
            </div>
          )}
        </aside>

        {/* Kolumna wyników */}
        <div>
          {offers === null && (
            <FlightResultsSkeleton originLabel={headerLabel} destination={destLabel || destination} />
          )}

          {/* Brak ofert z serwera / błąd */}
          {offers !== null && offers.length === 0 && (
            <div className="rounded-lg border border-line bg-surface-raised p-8 text-center">
              <p className="text-base font-semibold text-ink">{error ?? "Brak lotów dla wybranych dat"}</p>
              <p className="mt-1 text-sm text-ink-muted">
                Spróbuj zmienić daty albo lotnisko wylotu. Część tras lata tylko w wybrane dni tygodnia.
              </p>
              {/* Całkowita awaria (nie „pusta trasa") jest naprawialna — daj akcję,
                  zamiast zostawiać użytkownika w ślepym zaułku. */}
              {error && (
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="mt-4 inline-flex h-11 items-center rounded-md bg-brand px-5 font-semibold text-white transition hover:opacity-90 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
                >
                  <span className="text-sm">Spróbuj ponownie</span>
                </button>
              )}
            </div>
          )}

          {/* Są oferty, ale filtry wycięły wszystko */}
          {offers !== null && offers.length > 0 && visible.length === 0 && (
            <div className="rounded-lg border border-line bg-surface-raised p-8 text-center">
              <p className="text-base font-semibold text-ink">Brak lotów spełniających filtry</p>
              <button
                type="button"
                onClick={() => setFilters(EMPTY_FILTERS)}
                className="mt-3 inline-flex h-11 items-center rounded-md bg-brand px-5 font-semibold text-white transition hover:opacity-90 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
              >
                <span className="text-sm">Wyczyść filtry</span>
              </button>
            </div>
          )}

          {/* Progresja: są już oferty, ale nie wszystkie lotniska odpowiedziały. */}
          {offers !== null && offers.length > 0 && !allSettled && origins.length > 1 && (
            <p className="mb-3 inline-flex items-center gap-2 text-xs text-ink-muted">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-brand" aria-hidden />
              Szukam w pozostałych lotniskach…
            </p>
          )}

          {rendered.length > 0 && (
            <div className="space-y-3">
              {rendered.map((offer) => (
                <FlightOfferCard
                  key={offer.offerId}
                  offer={offer}
                  travellers={travellers}
                  cheapestId={badges.cheapestId}
                  fastestId={badges.fastestId}
                  bestId={badges.bestId}
                  onSelect={() => selectOffer(offer)}
                />
              ))}
            </div>
          )}

          {offers && offers.length > 0 && (
            <p className="mt-4 text-xs text-ink-muted lg:hidden">
              Ceny finalne w PLN, wł. podatków i opłat · Bezpieczna płatność · Polskie wsparcie
            </p>
          )}

          {remaining > 0 && (
            <button
              type="button"
              onClick={() => setShownCount((c) => c + PAGE_SIZE)}
              className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-md border border-line bg-surface-raised font-semibold text-ink transition hover:border-brand/40 active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              <span className="text-sm">Pokaż więcej ofert ({remaining})</span>
            </button>
          )}
        </div>
      </div>

      {/* Drawer filtrów (mobile) */}
      {drawerOpen && facets && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Filtry lotów">
          <div className="absolute inset-0 bg-ink/40" onClick={closeDrawer} aria-hidden />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-lg bg-surface-raised pb-[env(safe-area-inset-bottom)]">
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <h2 className="text-sm font-bold text-ink">Filtry</h2>
              <button
                ref={drawerCloseRef}
                type="button"
                onClick={closeDrawer}
                aria-label="Zamknij filtry"
                className="grid h-11 w-11 place-items-center rounded-full text-ink-muted transition hover:bg-surface-sunken active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100"
              >
                <X aria-hidden className="h-5 w-5" strokeWidth={2} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <FlightFiltersPanel
                facets={facets}
                filters={filters}
                onChange={setFilters}
                onClear={() => setFilters(EMPTY_FILTERS)}
                hideHeading
              />
            </div>
            <div className="border-t border-line px-5 py-3">
              <button
                type="button"
                onClick={closeDrawer}
                className="inline-flex h-12 w-full items-center justify-center rounded-md bg-brand font-bold text-white transition hover:opacity-90 active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100"
              >
                <span className="text-sm">Pokaż {visible.length} {visible.length === 1 ? "ofertę" : "ofert"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
