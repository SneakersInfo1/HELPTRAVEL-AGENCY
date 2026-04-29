"use client";

import { useEffect, useMemo, useState } from "react";

import { useLanguage } from "@/components/site/language-provider";
import type { FlightSearchResponse, NormalizedFlightOffer } from "@/lib/mvp/types";

const INITIAL_VISIBLE = 5;
const STEP = 5;
const MAX_VISIBLE = 30;

// Mapa IATA → czytelna nazwa lotniska
const AIRPORT_NAMES: Record<string, string> = {
  WMI: "Warszawa Modlin",
  WAW: "Warszawa Chopin",
  KRK: "Kraków",
  GDN: "Gdańsk",
  WRO: "Wrocław",
  POZ: "Poznań",
  KTW: "Katowice",
  RZE: "Rzeszów",
  LUZ: "Lublin",
  LCJ: "Łódź",
  SZZ: "Szczecin",
  BZG: "Bydgoszcz",
  LHR: "Londyn Heathrow",
  LGW: "Londyn Gatwick",
  STN: "Londyn Stansted",
  CDG: "Paryż CDG",
  ORY: "Paryż Orly",
  BCN: "Barcelona",
  MAD: "Madryt",
  FCO: "Rzym Fiumicino",
  CIA: "Rzym Ciampino",
  MXP: "Mediolan Malpensa",
  BGY: "Mediolan Bergamo",
  ATH: "Ateny",
  MLA: "Malta",
  TIA: "Tirana",
  IST: "Stambuł",
  SAW: "Stambuł Sabiha",
  AYT: "Antalya",
  LCA: "Larnaka",
  AMS: "Amsterdam",
  BER: "Berlin",
  VIE: "Wiedeń",
  PRG: "Praga",
  BUD: "Budapeszt",
  LIS: "Lizbona",
  OPO: "Porto",
  DUB: "Dublin",
  CPH: "Kopenhaga",
  ARN: "Sztokholm",
  OSL: "Oslo",
  HEL: "Helsinki",
  RAK: "Marrakesz",
  AGA: "Agadir",
  FNC: "Funchal",
  LPA: "Las Palmas",
  TFS: "Teneryfa",
  AGP: "Malaga",
  VLC: "Walencja",
  PMI: "Palma de Mallorca",
  IBZ: "Ibiza",
  BVA: "Paryż Beauvais",
  EIN: "Eindhoven",
  CRL: "Bruksela Charleroi",
  BRU: "Bruksela",
  DUS: "Düsseldorf",
  MUC: "Monachium",
  FRA: "Frankfurt",
  HAM: "Hamburg",
  SOF: "Sofia",
  OTP: "Bukareszt",
  SKG: "Saloniki",
  HER: "Heraklion",
  CFU: "Korfu",
  RHO: "Rodos",
  CHQ: "Chania",
  ZTH: "Zakynthos",
  KGS: "Kos",
  JMK: "Mykonos",
  JTR: "Santorini",
  SPU: "Split",
  DBV: "Dubrownik",
  ZAG: "Zagrzeb",
  LJU: "Lublana",
  RIX: "Ryga",
  VNO: "Wilno",
  TLL: "Tallinn",
  DXB: "Dubaj",
  BKK: "Bangkok",
  HKT: "Phuket",
  SIN: "Singapur",
  NRT: "Tokio Narita",
  HND: "Tokio Haneda",
  KEF: "Reykjavik",
  NAP: "Neapol",
  VCE: "Wenecja",
  BLQ: "Bolonia",
  PSA: "Piza",
  GRO: "Girona",
  REU: "Reus",
  SVQ: "Sewilla",
  BIO: "Bilbao",
  ALC: "Alicante",
};

function formatAirport(code: string): string {
  const name = AIRPORT_NAMES[code.toUpperCase()];
  return name ? `${name} (${code.toUpperCase()})` : code.toUpperCase();
}

const copy = {
  pl: {
    eyebrow: "Loty",
    title: "Konkretne oferty lotów",
    body: "Ceny orientacyjne z cache Travelpayouts (za 1 osobę). Finalna cena potwierdzana po kliknięciu u partnera.",
    bookNow: "Sprawdź lot",
    perPerson: "/ os.",
    cheapest: "Najtańsza",
    priceFromLabel: "od",
    roundTripCta: "↔ Szukaj lotów w obie strony",
    showMore: "Pokaż więcej lotów",
    empty: "Nie znaleźliśmy lotów dla tej trasy i daty. Zmień dzień wylotu.",
    requestError: "Nie udało się pobrać ofert lotów.",
    deal: "🔥 OKAZJA",
    stops: (n: number) => (n === 0 ? "bezpośrednio" : n === 1 ? "1 przesiadka" : `${n} przesiadki`),
    duration: "Czas",
  },
  en: {
    eyebrow: "Flights",
    title: "Concrete flight offers",
    body: "Indicative prices cached by Travelpayouts (per person). Final price confirmed at partner after click.",
    bookNow: "Check flight",
    perPerson: "/ pers.",
    cheapest: "Cheapest",
    priceFromLabel: "from",
    roundTripCta: "↔ Search round-trip flights",
    showMore: "Show more flights",
    empty: "We couldn't find flights for this route and date. Try a different day.",
    requestError: "Could not load flight offers.",
    deal: "🔥 DEAL",
    stops: (n: number) => (n === 0 ? "non-stop" : n === 1 ? "1 stop" : `${n} stops`),
    duration: "Duration",
  },
} as const;

function postJson<T>(url: string, body: unknown): Promise<T> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(async (response) => {
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? `Request failed (${response.status}).`);
    }
    return (await response.json()) as T;
  });
}

function formatPrice(value: number, currency: string, locale: "pl" | "en"): string {
  return new Intl.NumberFormat(locale === "en" ? "en-GB" : "pl-PL", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatTime(value: string, locale: "pl" | "en"): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "pl-PL", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function aviasalesRoundTripUrl(
  originIata: string,
  destIata: string,
  departureDate: string,
  returnDate: string,
  passengers: number,
): string | null {
  if (!departureDate || !returnDate) return null;
  const marker = process.env.NEXT_PUBLIC_TRAVELPAYOUTS_MARKER ?? "";
  const fmt = (d: string) => {
    const date = new Date(d);
    if (Number.isNaN(date.getTime())) return null;
    const dd = String(date.getUTCDate()).padStart(2, "0");
    const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
    return `${dd}${mm}`;
  };
  const dep = fmt(departureDate);
  const ret = fmt(returnDate);
  if (!dep || !ret) return null;
  const pax = Math.max(1, passengers);
  const base = `https://www.aviasales.com/search/${originIata.toUpperCase()}${dep}${destIata.toUpperCase()}${ret}${pax}1`;
  return marker ? `${base}?marker=${marker}` : base;
}

type Copy = (typeof copy)[keyof typeof copy];

function FlightCard({ offer, locale, t, isCheapest, isDeal, roundTripUrl }: {
  offer: NormalizedFlightOffer;
  locale: "pl" | "en";
  t: Copy;
  isCheapest: boolean;
  isDeal: boolean;
  roundTripUrl: string | null;
}) {
  return (
    <article className={`relative flex items-center gap-4 rounded-2xl border bg-white p-4 shadow-[0_4px_16px_rgba(16,84,48,0.05)] transition hover:border-emerald-500/40 hover:shadow-[0_8px_24px_rgba(16,84,48,0.1)] ${
      isCheapest ? "border-emerald-500/60 ring-1 ring-emerald-300" : "border-emerald-900/10"
    }`}>
      {isCheapest ? (
        <span className="absolute -top-2 left-4 z-10 rounded-full bg-gradient-to-r from-orange-500 to-red-500 px-2 py-1 text-[10px] font-bold tracking-wide text-white shadow">
          {t.deal}
        </span>
      ) : isDeal ? (
        <span className="absolute -top-2 left-4 z-10 rounded-full bg-gradient-to-r from-orange-500 to-red-500 px-2 py-1 text-[10px] font-bold tracking-wide text-white shadow">
          {t.deal}
        </span>
      ) : null}

      <div className="hidden w-16 shrink-0 sm:block">
        <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">{offer.airline}</p>
      </div>

      <div className="flex flex-1 items-center gap-4">
        <div className="text-center">
          <p className="text-base font-bold text-emerald-950">{formatTime(offer.departure_time, locale)}</p>
          <p className="text-[11px] text-emerald-900/56" title={formatAirport(offer.origin)}>
            {formatAirport(offer.origin)}
          </p>
        </div>

        <div className="flex flex-1 flex-col items-center">
          <p className="text-[11px] text-emerald-900/56">{offer.total_duration || "—"}</p>
          <div className="my-1 flex w-full items-center gap-2">
            <span className="h-px flex-1 bg-emerald-200" />
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
              {t.stops(offer.number_of_stops)}
            </span>
            <span className="h-px flex-1 bg-emerald-200" />
          </div>
          <p className="text-[10px] text-emerald-900/56 sm:hidden">{offer.airline}</p>
        </div>

        <div className="text-center">
          <p className="text-base font-bold text-emerald-950">{formatTime(offer.arrival_time, locale)}</p>
          <p className="text-[11px] text-emerald-900/56" title={formatAirport(offer.destination)}>
            {formatAirport(offer.destination)}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-2">
        <div className="text-right">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">{t.priceFromLabel}</p>
          <p className="whitespace-nowrap text-xl font-bold text-emerald-950">
            {formatPrice(offer.total_amount, offer.currency, locale)}
          </p>
          <p className="text-[10px] text-emerald-900/56">{t.perPerson}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          {offer.bookingUrl ? (
            <a
              href={offer.bookingUrl}
              target="_blank"
              rel="noreferrer"
              className="whitespace-nowrap rounded-full bg-emerald-700 px-5 py-2 text-sm font-bold text-white transition hover:bg-emerald-800"
            >
              {t.bookNow}
            </a>
          ) : null}
          {roundTripUrl ? (
            <a
              href={roundTripUrl}
              target="_blank"
              rel="noreferrer"
              className="whitespace-nowrap rounded-full border border-emerald-700 px-5 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-50"
            >
              {t.roundTripCta}
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function FlightOffersPanel(props: {
  destinationCity: string;
  destinationCountry: string;
  originCity: string;
  departureDate: string;
  returnDate: string;
  passengers: number;
}) {
  const { locale } = useLanguage();
  const t = copy[locale];
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<FlightSearchResponse | null>(null);
  const [visible, setVisible] = useState(INITIAL_VISIBLE);

  useEffect(() => {
    if (!props.destinationCity || !props.originCity || !props.departureDate) return;
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        setError("");
        try {
          const result = await postJson<FlightSearchResponse>("/api/flights/search", {
            origin: props.originCity,
            destination: props.destinationCity,
            departureDate: props.departureDate,
            passengers: props.passengers,
            cabinClass: "economy",
            sortBy: "cheap",
          });
          if (!cancelled) {
            setData(result);
            setVisible(INITIAL_VISIBLE);
          }
        } catch (err) {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : t.requestError);
            setData(null);
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [
    props.departureDate,
    props.destinationCity,
    props.originCity,
    props.passengers,
    t.requestError,
  ]);

  const allOffers = useMemo(() => data?.offers ?? [], [data?.offers]);

  // Oblicz średnią cenę do wykrywania okazji (>20% taniej od średniej)
  const avgPrice = useMemo(() => {
    if (allOffers.length === 0) return 0;
    return allOffers.reduce((sum, o) => sum + o.total_amount, 0) / allOffers.length;
  }, [allOffers]);

  const shown = allOffers.slice(0, Math.min(visible, MAX_VISIBLE));
  const canShowMore = visible < Math.min(allOffers.length, MAX_VISIBLE);

  return (
    <section id="planner-flights" className="rounded-[1.5rem] border border-emerald-900/10 bg-white p-5 shadow-[0_12px_32px_rgba(16,84,48,0.06)]">
      <header className="mb-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">{t.eyebrow}</p>
        <h2 className="mt-1 text-xl font-bold text-emerald-950">{t.title}</h2>
        <p className="mt-1 text-sm text-emerald-900/72">{t.body}</p>
      </header>

      {loading && shown.length === 0 ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, idx) => (
            <div key={idx} className="h-24 animate-pulse rounded-2xl bg-emerald-50" />
          ))}
        </div>
      ) : shown.length > 0 ? (
        <>
          <div className="flex flex-col gap-3">
            {shown.map((offer, idx) => (
              <FlightCard
                key={offer.offerId}
                offer={offer}
                locale={locale}
                t={t}
                isCheapest={idx === 0 && shown.length > 1}
                isDeal={avgPrice > 0 && offer.total_amount < avgPrice * 0.8}
                roundTripUrl={aviasalesRoundTripUrl(
                  offer.origin,
                  offer.destination,
                  props.departureDate,
                  props.returnDate,
                  props.passengers,
                )}
              />
            ))}
          </div>
          {canShowMore ? (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => setVisible((v) => Math.min(MAX_VISIBLE, v + STEP))}
                className="rounded-full border border-emerald-900/12 bg-white px-5 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-50"
              >
                {t.showMore}
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <div className="rounded-2xl bg-emerald-50/60 p-5 text-sm text-emerald-900/76">
          {error || data?.error || t.empty}
        </div>
      )}
    </section>
  );
}
