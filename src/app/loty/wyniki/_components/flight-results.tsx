"use client";

// Lista ofert lotów (Faza 3.1). Pobiera oferty z /api/flights/rates, sortuje
// (cena/czas), renderuje karty (przewoźnik, godziny, czas, przesiadki, cena
// total za wszystkich pasażerów). Klik „Wybierz" → /api/flights/verify:
//   • priceChanged → modal „cena się zmieniła" (Akceptuję / Wróć)
//   • OFFER_UNAVAILABLE → toast + powrót do listy (oferta znika)
//   • OK → zapis kontekstu (sessionStorage) → /loty/pasazerowie

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { track } from "@/lib/analytics/track";
import {
  fmtDuration,
  fmtMoneyPln,
  fmtTime,
  stopsLabel,
  type DisplayLeg,
  type DisplayOffer,
} from "@/lib/flights/display";
import { saveFlightFlow } from "@/lib/flights/flow-storage";
import { originHeaderLabel } from "@/lib/flights/airports";
import {
  EMPTY_FILTERS,
  SORT_OPTIONS,
  applyFilters,
  computeFacets,
  hasActiveFilters,
  sortOffers,
  type FlightFilters,
  type SortKey,
} from "@/lib/flights/filters";
import { computeOfferBadges, isDirectOffer } from "@/lib/flights/badges";
import { AirlineLogo } from "@/components/flights/airline-logo";
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
  // Paginacja „Pokaż więcej" (audyt mobilny 2026-07-03): 150 kart naraz to
  // ~7000 nodów DOM i strona wysoka na ~60 000 px — na telefonie wolny
  // scroll i pamięć. Sort/filtry dalej działają na PEŁNEJ puli; tniemy
  // wyłącznie render. Zmiana sortu/filtrów wraca do pierwszej strony.
  const [shownCount, setShownCount] = useState(PAGE_SIZE);
  const [allSettled, setAllSettled] = useState(false);
  const fetchedRef = useRef(false);

  const passengers = adults + childrenCount + infants;
  const originsKey = origins.join(",");
  const headerLabel = originHeaderLabel(origins, originLabel);

  // Pobranie ofert (raz). Fan-out po lotniskach (metro=1 kod) RÓWNOLEGLE, ale
  // wyniki POKAZUJEMY W MIARĘ NAPŁYWU (nie czekamy aż wszystkie odpowiedzą):
  // najszybsze lotnisko pojawia się pierwsze. Scalanie + dedup po offerId.
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
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
          // lotnisko z 0 ofert (np. WMI/RDO w grupie Warszawa — pusta odpowiedź
          // wraca szybciej) wywołałoby setOffers([]) → mignięcie „Brak lotów"
          // zanim dojdą oferty z lotniska, które je ma. Stan pusty/błąd domyka
          // .finally(), więc do tego czasu trzymamy szkielet (offers === null).
          if (merged.length > 0) setOffers([...merged]);
        } catch {
          /* to lotnisko padło — inne mogą się udać */
        }
      }),
    ).finally(() => {
      setAllSettled(true);
      if (!anyOk) {
        setError(firstMessage || "Nie udało się pobrać ofert. Spróbuj ponownie.");
        setOffers([]);
      } else {
        setOffers([...merged]);
        track("flight_results_view", { origin: originsKey, destination, results_count: merged.length });
      }
    });
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
  const rendered = visible.slice(0, shownCount);
  const remaining = visible.length - rendered.length;
  // Odznaki „Najtańszy/Najszybszy" z PEŁNEJ puli (stabilne mimo filtra/sortu).
  const badges = useMemo(
    () => (offers ? computeOfferBadges(offers) : { cheapestId: null, fastestId: null }),
    [offers],
  );

  function selectOffer(offer: DisplayOffer) {
    track("flight_select", { offer_id: offer.offerId, price: offer.total ?? undefined, currency: offer.currency, carrier: offer.legs[0]?.carriers[0] });
    // REALNE lotnisko wylotu (grupa „wszystkie lotniska" miesza lotniska).
    const actualOrigin = offer.legs[0]?.originCode || origins[0];
    const base = offer.fares[0]; // taryfa bazowa (najtańsza) = aktualnie pokazana
    saveFlightFlow({
      origin: actualOrigin, destination, depart, ret, adults, children: childrenCount, infants,
      offerId: offer.offerId, offer,
      verifiedTotal: offer.total, verifiedCurrency: offer.currency, verifiedAt: Date.now(),
      fare: base ? { name: base.fareName, hasCarryOnBag: base.hasCarryOnBag, hasCheckedBag: base.hasCheckedBag } : undefined,
    });
    // Krok „Bagaż / taryfa" (Faza D). Weryfikacja oferty dzieje się TAM, na
    // finalnie wybranej taryfie (priceChanged/OFFER_UNAVAILABLE obsłużone tam).
    router.push("/loty/dodatki");
  }

  return (
    <main className="mx-auto min-h-[60vh] max-w-6xl px-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-neutral-900 sm:text-2xl">
            Loty {headerLabel} → {destLabel || destination}
          </h1>
          <p className="mt-0.5 text-sm text-neutral-500">
            {ret ? "W obie strony" : "W jedną stronę"} · {passengers} {passengers === 1 ? "pasażer" : "pasażerów"}
            {offers
              ? visible.length === offers.length
                ? ` · ${offers.length} ${offers.length === 1 ? "oferta" : "ofert"}`
                : ` · ${visible.length} z ${offers.length} ofert`
              : ""}
          </p>
        </div>
        {offers && offers.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 lg:hidden"
            >
              Filtry{hasActiveFilters(filters) ? " •" : ""}
            </button>
            <label className="flex items-center gap-1.5 text-xs font-medium text-neutral-500">
              <span className="hidden sm:inline">Sortuj</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                aria-label="Sortowanie"
                className="rounded-lg border border-neutral-300 bg-white px-2.5 py-2 text-xs font-semibold text-neutral-700 focus:border-emerald-500 focus:outline-none"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </select>
            </label>
          </div>
        )}
      </header>

      {/* Sygnały zaufania — jak na checkoutcie hoteli. Bez ukrytych opłat +
          bezpieczna płatność + polskie wsparcie podnoszą pewność kliknięcia. */}
      {offers && offers.length > 0 && (
        <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-neutral-500">
          {["Ceny finalne w PLN, bez ukrytych opłat", "Bezpieczna płatność", "Polskie wsparcie"].map((t) => (
            <li key={t} className="inline-flex items-center gap-1">
              <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-emerald-600">
                <path d="M8.05 13.6 4.4 9.95l1.4-1.4 2.25 2.25 6.15-6.15 1.4 1.4z" />
              </svg>
              {t}
            </li>
          ))}
        </ul>
      )}

      {/* grid-cols-1 na mobile: bez tego implicytna kolumna gridu skaluje się do
          max-content, a `nowrap` w banerze ładowania rozpychał ją poza ekran
          (poziomy scroll „przy wyszukiwaniu"). minmax(0,1fr) wymusza zawijanie. */}
      <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
        {/* Sidebar filtrów (desktop) */}
        <aside className="hidden lg:block">
          {offers === null && <FlightFiltersSkeleton />}
          {facets && offers && offers.length > 0 && (
            <div className="sticky top-6 rounded-2xl border border-neutral-200 bg-white p-4">
              <FlightFiltersPanel facets={facets} filters={filters} onChange={setFilters} onClear={() => setFilters(EMPTY_FILTERS)} />
            </div>
          )}
        </aside>

        {/* Kolumna wyników */}
        <div>
          {/* Loading — banner aktywnego wyszukiwania + szkielety kart oferty */}
          {offers === null && (
            <FlightResultsSkeleton originLabel={headerLabel} destination={destLabel || destination} />
          )}

          {/* Brak ofert z serwera / błąd */}
          {offers !== null && offers.length === 0 && (
            <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center">
              <p className="text-base font-semibold text-neutral-900">{error ?? "Brak lotów dla wybranych dat"}</p>
              <p className="mt-1 text-sm text-neutral-600">
                Spróbuj zmienić daty albo lotnisko wylotu. Część tras lata tylko w wybrane dni tygodnia.
              </p>
              {/* Całkowita awaria (nie „pusta trasa") jest naprawialna — daj akcję,
                  zamiast zostawiać użytkownika w ślepym zaułku. */}
              {error && (
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="mt-4 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  Spróbuj ponownie
                </button>
              )}
            </div>
          )}

          {/* Są oferty, ale filtry wycięły wszystko */}
          {offers !== null && offers.length > 0 && visible.length === 0 && (
            <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center">
              <p className="text-base font-semibold text-neutral-900">Brak lotów spełniających filtry</p>
              <button
                type="button"
                onClick={() => setFilters(EMPTY_FILTERS)}
                className="mt-3 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Wyczyść filtry
              </button>
            </div>
          )}

          {/* Progresja: są już oferty, ale nie wszystkie lotniska odpowiedziały
              (dotyczy tylko grup „wszystkie lotniska"). */}
          {offers !== null && offers.length > 0 && !allSettled && origins.length > 1 && (
            <p className="mb-3 inline-flex items-center gap-2 text-xs text-neutral-500">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" aria-hidden />
              Szukam w pozostałych lotniskach…
            </p>
          )}

          {/* Lista */}
          {rendered.length > 0 && (
            <div className="space-y-3">
              {rendered.map((offer) => (
                <OfferCard
                  key={offer.offerId}
                  offer={offer}
                  passengers={passengers}
                  cheapestId={badges.cheapestId}
                  fastestId={badges.fastestId}
                  onSelect={() => selectOffer(offer)}
                />
              ))}
            </div>
          )}

          {remaining > 0 && (
            <button
              type="button"
              onClick={() => setShownCount((c) => c + PAGE_SIZE)}
              className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-xl border border-neutral-300 bg-white text-sm font-semibold text-neutral-700 transition hover:border-emerald-400 hover:text-emerald-700"
            >
              Pokaż więcej ofert ({remaining})
            </button>
          )}
        </div>
      </div>

      {/* Drawer filtrów (mobile) */}
      {drawerOpen && facets && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white p-5">
            <div className="mb-1 flex justify-end">
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Zamknij filtry"
                className="grid h-8 w-8 place-items-center rounded-full text-neutral-500 hover:bg-neutral-100"
              >
                ×
              </button>
            </div>
            <FlightFiltersPanel facets={facets} filters={filters} onChange={setFilters} onClear={() => setFilters(EMPTY_FILTERS)} />
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="mt-4 w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-700"
            >
              Pokaż wyniki ({visible.length})
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function LegRow({ leg }: { leg: DisplayLeg }) {
  return (
    <div className="flex items-center gap-3">
      <AirlineLogo logoUrl={leg.carrierLogo} code={leg.carrierCode} name={leg.carriers[0]} size={24} />
      <div className="flex flex-1 items-center gap-3">
        <div className="text-right">
          <div className="text-base font-bold tabular-nums text-neutral-900">{fmtTime(leg.departureTime)}</div>
          <div className="text-[11px] text-neutral-500">{leg.originCode}</div>
        </div>
        <div className="flex-1 text-center">
          <div className="text-[11px] text-neutral-500">{fmtDuration(leg.durationMinutes)}</div>
          <div className="relative my-1 h-px bg-neutral-200">
            <span className="absolute -top-1 right-0 text-[8px] text-neutral-400">▶</span>
          </div>
          <div className="text-[11px] font-medium text-neutral-600">{stopsLabel(leg.stops)}</div>
        </div>
        <div>
          <div className="text-base font-bold tabular-nums text-neutral-900">{fmtTime(leg.arrivalTime)}</div>
          <div className="text-[11px] text-neutral-500">{leg.destinationCode}</div>
        </div>
      </div>
    </div>
  );
}

function OfferCard({
  offer,
  passengers,
  cheapestId,
  fastestId,
  onSelect,
}: {
  offer: DisplayOffer;
  passengers: number;
  cheapestId: string | null;
  fastestId: string | null;
  onSelect: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const carrierNames = [...new Set(offer.legs.flatMap((l) => l.carriers))].join(", ");
  const mainCode = offer.legs[0]?.carrierCode;
  const multiFare = offer.fares.length > 1;
  // Cena GŁÓWNA = za jedną osobę (jak „za noc" w hotelach); suma za wszystkich
  // mniej wyróżniona. Przy 1 pasażerze per-osobę == suma, więc sumy nie dublujemy.
  const perPerson = offer.total !== null && passengers > 0 ? Math.round(offer.total / passengers) : offer.total;
  // Odznaki prowadzące decyzję.
  const isCheapest = offer.offerId === cheapestId;
  const isFastest = offer.offerId === fastestId;
  const direct = isDirectOffer(offer);
  return (
    <article className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      {(isCheapest || isFastest || direct) && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {isCheapest && (
            <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white">Najtańszy</span>
          )}
          {isFastest && (
            <span className="rounded-full bg-sky-600 px-2 py-0.5 text-[11px] font-bold text-white">Najszybszy</span>
          )}
          {direct && (
            <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
              Bezpośredni
            </span>
          )}
        </div>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          {offer.legs.map((leg) => (
            <LegRow key={leg.direction} leg={leg} />
          ))}
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-500">
            <span className="font-medium text-neutral-700">{carrierNames}</span>
            {mainCode && <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-neutral-600">{mainCode}</span>}
            {offer.hasCarryOnBag && <span className="rounded bg-neutral-100 px-1.5 py-0.5">bagaż podręczny</span>}
            {offer.hasCheckedBag && <span className="rounded bg-neutral-100 px-1.5 py-0.5">bagaż rejestrowany</span>}
          </div>
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            aria-expanded={showDetails}
            className="text-[11px] font-semibold text-emerald-700 hover:underline"
          >
            {showDetails ? "Ukryj szczegóły lotu" : "Szczegóły lotu"}
          </button>
          {showDetails && (
            <div className="space-y-3 rounded-xl bg-neutral-50 p-3">
              {offer.legs.map((leg) => (
                <div key={leg.direction}>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                    {leg.direction === "OUTBOUND" ? "Wylot" : "Powrót"} · {leg.originCode} → {leg.destinationCode} · {fmtDuration(leg.durationMinutes)} · {stopsLabel(leg.stops)}
                  </p>
                  <ul className="mt-1.5 space-y-1.5">
                    {leg.segments.map((s, i) => (
                      <li key={i} className="flex items-center gap-2 text-[11px] text-neutral-600">
                        <AirlineLogo logoUrl={s.carrierLogo} code={s.carrierCode} name={s.carrierName} size={18} />
                        <span className="font-medium text-neutral-800">{s.carrierName}</span>
                        {(s.carrierCode || s.flightNumber) && (
                          <span className="font-mono text-neutral-400">{[s.carrierCode, s.flightNumber].filter(Boolean).join(" ")}</span>
                        )}
                        <span className="ml-auto whitespace-nowrap tabular-nums">
                          {fmtTime(s.departureTime)} {s.originCode} → {fmtTime(s.arrivalTime)} {s.destinationCode}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2 border-t border-neutral-100 pt-3 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
          <div className="text-right">
            <div className="text-xl font-bold text-emerald-700">
              {fmtMoneyPln(perPerson, offer.currency)}
              <span className="text-xs font-medium text-neutral-400"> / os.</span>
            </div>
            <div className="text-[11px] text-neutral-500">
              {passengers > 1 ? `${fmtMoneyPln(offer.total, offer.currency)} za ${passengers} pasażerów · ` : ""}wł. opłat
            </div>
            {multiFare && <div className="text-[10px] font-medium text-emerald-600">{offer.fares.length} taryf z bagażem →</div>}
          </div>
          <button
            type="button"
            onClick={onSelect}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            Wybierz
          </button>
          <span className="text-[10px] text-neutral-400">Bez opłat za rezerwację</span>
        </div>
      </div>
    </article>
  );
}
