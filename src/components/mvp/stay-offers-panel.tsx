"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

import { useLanguage } from "@/components/site/language-provider";
import { PartnerLogoMark } from "@/components/site/partner-logo";
import { getAffiliateBrandLabel } from "@/lib/mvp/affiliate-brand";
import { buildAffiliateLinksWithContext } from "@/lib/mvp/affiliate-links";
import { buildCjStayLinks } from "@/lib/mvp/cj-stays";
import { buildRedirectHref } from "@/lib/mvp/providers";
import { countNightsBetweenIsoDates, formatShortDate } from "@/lib/mvp/travel-dates";
import type { NormalizedStayOffer, StaySearchResponse, StaySortMode } from "@/lib/mvp/types";

const INITIAL_VISIBLE_OFFERS = 24;
const VISIBLE_OFFERS_STEP = 24;
const MAX_VISIBLE_OFFERS = 500;

function postJson<T>(url: string, body: unknown): Promise<T> {
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }).then(async (response) => {
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? `Request failed (${response.status}).`);
    }
    return (await response.json()) as T;
  });
}

function formatMoney(value: number, currency: string, locale: "pl" | "en"): string {
  return new Intl.NumberFormat(locale === "en" ? "en-GB" : "pl-PL", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function getDiscountPercent(totalAmount: number, publicAmount?: number | null) {
  if (!publicAmount || publicAmount <= totalAmount) {
    return null;
  }

  const percent = Math.round(((publicAmount - totalAmount) / publicAmount) * 100);
  return percent >= 5 ? percent : null;
}

function buildTopStayReasons(
  offer: NormalizedStayOffer | null,
  locale: "pl" | "en",
): string[] {
  if (!offer) {
    return [];
  }

  const reasons: string[] = [];
  const discount = getDiscountPercent(offer.total_amount, offer.public_amount);

  if (discount) {
    reasons.push(
      locale === "en"
        ? `A real discount signal is visible against the public price (${discount}% lower).`
        : `Widac realny sygnal rabatu wzgledem ceny bazowej (${discount}% mniej).`,
    );
  }

  if (offer.reviewScore && offer.reviewScore >= 8) {
    reasons.push(
      locale === "en"
        ? `Strong review score (${offer.reviewScore.toFixed(1)}/10) makes this a safer first click.`
        : `Mocna ocena (${offer.reviewScore.toFixed(1)}/10) robi z tego bezpieczny pierwszy klik.`,
    );
  } else if (offer.rating && offer.rating >= 4) {
    reasons.push(
      locale === "en"
        ? `Solid rating suggests a dependable standard for this stay window.`
        : `Dobra ocena sugeruje stabilny standard na ten pobyt.`,
    );
  }

  if (offer.address || offer.city) {
    reasons.push(
      locale === "en"
        ? `The offer is already aligned with ${offer.city || "the selected destination"} and your current dates.`
        : `Ta oferta jest już osadzona w ${offer.city || "wybranym kierunku"} i tym samym terminie.`,
    );
  }

  if (reasons.length < 3) {
    reasons.push(
      locale === "en"
        ? "It gives you a strong first reference point before you open the wider partner comparison."
        : "Daje dobry punkt odniesienia, zanim otwórzysz szersze porównańie u partnerów.",
    );
  }

  return reasons.slice(0, 3);
}

function Spinner() {
  return <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-700" />;
}

const copy = {
  pl: {
    requestError: "Nie udalo sie pobrac noclegów.",
    hotelEyebrow: "Hotele",
    compareEyebrow: "Porównaj tez",
    apartmentsEyebrow: "Apartamenty",
    sectionEyebrow: "Pobyt",
    sectionTitle: "Noclegi dla",
    sectionBody: "Najpierw pokazujemy najmocniejsze opcje na ten sam termin, a potem pełne wyniki partnerów.",
    loadingState: "Szukamy dostępnośći",
    offersState: "ofert",
    readyState: "Gotowe",
    dateLabel: "Termin",
    dateRangeLabel: "Zakres dat",
    guestsLabel: "Podróżni",
    guestsShort: "os.",
    roomsLabel: "Pokoje",
    priorityLabel: "Priorytet",
    priorityValue: "Noclegi na start",
    currencyHint: "Linki partnerów ustawiamy pod polski rynek i PLN. Finalna walute zawsze potwierdza partner.",
    promoBadge: "Mocna opcja",
    promoFlash: "Warto sprawdzić",
    promoDiscountPrefix: "do",
    discountCompared: "Cena spadla wzgledem ceny bazowej",
    savingsLabel: "Oszczedzasz",
    topValueLabel: "Najlepszy punkt startu",
    sortCheap: "Najtansze",
    sortQuality: "Najlepszy standard",
    sortValue: "Najlepsza relacja ceny do jakosci",
    quickShortlist: "Szybka shortlist",
    quickShortlistBody: "Trzy opcje, od których najłatwiej zacząć porównańie tego pobytu.",
    shortlistOpen: "Otwórz",
    showMore: "Pokaż więcej",
    partnersTitle: "Sprawdź tez u innych partnerów",
    partnerHotelsBody: "Pełne wyniki hoteli dla tego samego terminu i składu podróży.",
    partnerCompareBody: "Drugie źródło do szybkiego porównania cen i standardu.",
    partnerApartmentsBody: "Apartamenty i domy, jeśli chcesz sprawdzić bardziej elastyczny pobyt.",
    topStayBadge: "Najmocniejsza opcja",
    featuredOfferEyebrow: "Od tego warto zacząć",
    whyTopOffer: "Dlaczego ten pobyt warto sprawdzić najpierw",
    stayPriceLabel: "Cena pobytu",
    ratingLabel: "Ocena",
    noData: "Brak danych",
    ratingStars: "gw.",
    showThisStay: "Zobacz ten pobyt",
    compareAlso: "Sprawdź tez w",
    position: "Pozycja",
    stayLabel: "Pobyt",
    checkStay: "Sprawdź pobyt",
    compareIn: "Porównaj w",
    emptyState: "Nie znaleźliśmy dostępnych noclegów dla tego układu dat. Zmień termin albo otwórz wyniki partnerów.",
    feedFallbackTitle: "Pelniejsze wyniki dla tego pobytu",
    feedFallbackBody:
      "Możesz od razu przejść do pełnych wynikow hoteli i apartamentow dla tych samych dat, nawet jeśli tutaj pokazujemy tylko krotsza shortlist.",
  },
  en: {
    requestError: "Could not load stay offers.",
    hotelEyebrow: "Hotels",
    compareEyebrow: "Also compare",
    apartmentsEyebrow: "Apartments",
    sectionEyebrow: "Stays",
    sectionTitle: "Stays for",
    sectionBody: "We start with the strongest options for the same dates and then open the wider partner comparison.",
    loadingState: "Checking availability",
    offersState: "offers",
    readyState: "Ready",
    dateLabel: "Dates",
    dateRangeLabel: "Date range",
    guestsLabel: "Travelers",
    guestsShort: "trav.",
    roomsLabel: "Rooms",
    priorityLabel: "Priority",
    priorityValue: "Stays first",
    currencyHint: "Partner links are tuned for the Polish market and PLN. The final currency is confirmed by the partner.",
    promoBadge: "Strong option",
    promoFlash: "Worth checking",
    promoDiscountPrefix: "up to",
    discountCompared: "Lower than the public price",
    savingsLabel: "You save",
    topValueLabel: "Best place to start",
    sortCheap: "Lowest price",
    sortQuality: "Best quality",
    sortValue: "Best value",
    quickShortlist: "Quick shortlist",
    quickShortlistBody: "Three options that make it easier to start comparing this stay window.",
    shortlistOpen: "Open",
    showMore: "Show more",
    partnersTitle: "Also check other partners",
    partnerHotelsBody: "Full hotel results for the same dates and traveler setup.",
    partnerCompareBody: "A second source for checking price and standard quickly.",
    partnerApartmentsBody: "Apartments and homes if you want a more flexible stay format.",
    topStayBadge: "Strongest option",
    featuredOfferEyebrow: "A good first click",
    whyTopOffer: "Why this stay is worth checking first",
    stayPriceLabel: "Stay price",
    ratingLabel: "Rating",
    noData: "No data",
    ratingStars: "stars",
    showThisStay: "Open this stay",
    compareAlso: "Also check on",
    position: "Position",
    stayLabel: "Stay",
    checkStay: "Check stay",
    compareIn: "Compare on",
    emptyState: "We could not find available stays for these dates. Change the dates or open partner results.",
    feedFallbackTitle: "More complete results for this stay window",
    feedFallbackBody:
      "You can jump straight into full hotel and apartment results for the same dates, even if this page shows only a shorter shortlist first.",
  },
} as const;

export function StayOffersPanel(props: {
  destinationCity: string;
  destinationCountry: string;
  checkInDate: string;
  checkOutDate: string;
  guests: number;
  rooms: number;
}) {
  const { locale } = useLanguage();
  const text = copy[locale];
  const requestErrorText = text.requestError;
  const [sortBy, setSortBy] = useState<StaySortMode>("value");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<StaySearchResponse | null>(null);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_OFFERS);

  const nights = useMemo(
    () => countNightsBetweenIsoDates(props.checkInDate, props.checkOutDate, 4),
    [props.checkInDate, props.checkOutDate],
  );

  useEffect(() => {
    if (!props.destinationCity) return;

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      const run = async () => {
        setLoading(true);
        setError("");
        try {
          const result = await postJson<StaySearchResponse>("/api/stays/search", {
            city: props.destinationCity,
            country: props.destinationCountry,
            checkInDate: props.checkInDate,
            nights,
            guests: props.guests,
            rooms: props.rooms,
            sortBy,
          });

          if (!cancelled) {
            setData(result);
            setVisibleCount(INITIAL_VISIBLE_OFFERS);
          }
        } catch (err) {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : requestErrorText);
            setData(null);
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      };

      void run();
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [nights, props.checkInDate, props.destinationCity, props.destinationCountry, props.guests, props.rooms, requestErrorText, sortBy]);

  const availableOffers = useMemo(() => data?.offers.slice(0, MAX_VISIBLE_OFFERS) ?? [], [data?.offers]);
  const displayedOffers = useMemo(() => availableOffers.slice(0, visibleCount), [availableOffers, visibleCount]);
  const topOffer = displayedOffers[0] ?? null;
  const remainingOffers = topOffer ? displayedOffers.slice(1) : displayedOffers;
  const quickShortlist = displayedOffers.slice(0, 3);
  const topOfferReasons = useMemo(() => buildTopStayReasons(topOffer, locale), [locale, topOffer]);
  const checkOutDate = props.checkOutDate;

  const partnerLinks = useMemo(
    () =>
      buildCjStayLinks(props.destinationCity, props.destinationCountry, {
        checkIn: props.checkInDate,
        checkOut: checkOutDate,
        adults: props.guests,
        rooms: props.rooms,
      }),
    [checkOutDate, props.checkInDate, props.destinationCity, props.destinationCountry, props.guests, props.rooms],
  );
  const genericAffiliateLinks = useMemo(
    () =>
      buildAffiliateLinksWithContext({
        city: props.destinationCity,
        country: props.destinationCountry,
        checkInDate: props.checkInDate,
        checkOutDate,
        passengers: props.guests,
        rooms: props.rooms,
      }),
    [checkOutDate, props.checkInDate, props.destinationCity, props.destinationCountry, props.guests, props.rooms],
  );

  const partnerButtons = useMemo(
    () =>
      [
            {
              eyebrow: text.hotelEyebrow,
              label: getAffiliateBrandLabel(partnerLinks?.hotels ?? genericAffiliateLinks.stays, "Hotels.com"),
              description: text.partnerHotelsBody,
              href: buildRedirectHref({
                providerKey: "stays",
                targetUrl: partnerLinks?.hotels ?? genericAffiliateLinks.stays,
                city: props.destinationCity,
                country: props.destinationCountry,
                source: "stay_panel_hotels",
              }),
            },
            ...(partnerLinks
              ? [
                  {
              eyebrow: text.compareEyebrow,
              label: getAffiliateBrandLabel(partnerLinks.expedia, "Expedia"),
              description: text.partnerCompareBody,
              href: buildRedirectHref({
                providerKey: "stays",
                targetUrl: partnerLinks.expedia,
                city: props.destinationCity,
                country: props.destinationCountry,
                source: "stay_panel_expedia",
              }),
            },
            {
              eyebrow: text.apartmentsEyebrow,
              label: getAffiliateBrandLabel(partnerLinks.vrbo, "Vrbo"),
              description: text.partnerApartmentsBody,
              href: buildRedirectHref({
                providerKey: "stays",
                targetUrl: partnerLinks.vrbo,
                city: props.destinationCity,
                country: props.destinationCountry,
                source: "stay_panel_vrbo",
              }),
            },
                ]
              : []),
          ],
    [
      genericAffiliateLinks.stays,
      partnerLinks,
      props.destinationCity,
      props.destinationCountry,
      text.apartmentsEyebrow,
      text.compareEyebrow,
      text.hotelEyebrow,
      text.partnerApartmentsBody,
      text.partnerCompareBody,
      text.partnerHotelsBody,
    ],
  );

  return (
    <section className="rounded-[1.9rem] border border-emerald-500/18 bg-[linear-gradient(180deg,rgba(247,252,249,0.98),rgba(235,247,239,0.96))] p-5 shadow-[0_18px_50px_rgba(16,84,48,0.08)]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">{text.sectionEyebrow}</p>
          <h3 className="mt-2 text-3xl font-bold text-emerald-950">
            {text.sectionTitle} {props.destinationCity}
          </h3>
          <p className="mt-2 text-sm leading-6 text-emerald-900/76">
            {text.sectionBody}
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-semibold text-emerald-900 shadow-sm ring-1 ring-emerald-900/8">
          {loading ? <Spinner /> : null}
            {loading ? text.loadingState : data ? `${availableOffers.length} ${text.offersState}` : text.readyState}
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[1.5rem] border border-emerald-900/10 bg-emerald-950 px-4 py-4 text-white shadow-[0_14px_40px_rgba(16,84,48,0.14)]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-amber-300 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-950">
              {text.promoFlash}
            </span>
            <span className="rounded-full bg-white/12 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white">
              {text.promoBadge}
            </span>
          </div>
          <p className="mt-3 text-lg font-bold">{text.topValueLabel}</p>
          <p className="mt-1 text-sm leading-6 text-white/78">
            {text.currencyHint}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-emerald-900/8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">{text.dateRangeLabel}</p>
            <p className="mt-1 text-sm font-semibold text-emerald-950">
              {formatShortDate(props.checkInDate, locale === "en" ? "en-GB" : "pl-PL")} - {formatShortDate(checkOutDate, locale === "en" ? "en-GB" : "pl-PL")}
            </p>
          </div>
          <div className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-emerald-900/8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">{text.priorityLabel}</p>
            <p className="mt-1 text-sm font-semibold text-emerald-950">
              {text.priorityValue} / {nights} {locale === "en" ? "nights" : "nocy"}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <div className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-emerald-900/8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">{text.dateLabel}</p>
          <p className="mt-1 text-sm font-semibold text-emerald-950">
            {formatShortDate(props.checkInDate, locale === "en" ? "en-GB" : "pl-PL")} - {formatShortDate(checkOutDate, locale === "en" ? "en-GB" : "pl-PL")}
          </p>
        </div>
        <div className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-emerald-900/8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">{text.guestsLabel}</p>
          <p className="mt-1 text-sm font-semibold text-emerald-950">{props.guests} {text.guestsShort}</p>
        </div>
        <div className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-emerald-900/8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">{text.roomsLabel}</p>
          <p className="mt-1 text-sm font-semibold text-emerald-950">{props.rooms}</p>
        </div>
        <div className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-emerald-900/8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">{text.priorityLabel}</p>
          <p className="mt-1 text-sm font-semibold text-emerald-950">{text.priorityValue}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {(
          [
            ["cheap", text.sortCheap],
            ["quality", text.sortQuality],
            ["value", text.sortValue],
          ] as Array<[StaySortMode, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSortBy(key)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition duration-200 ${
              sortBy === key ? "bg-emerald-700 text-white" : "bg-white text-emerald-950 ring-1 ring-emerald-900/10 hover:bg-emerald-50"
            }`}
          >
            {label}
          </button>
        ))}
        {displayedOffers.length >= INITIAL_VISIBLE_OFFERS && displayedOffers.length < availableOffers.length ? (
          <button
            type="button"
            onClick={() => setVisibleCount((value) => Math.min(MAX_VISIBLE_OFFERS, value + VISIBLE_OFFERS_STEP))}
            className="rounded-full border border-emerald-900/12 bg-white px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-50"
          >
            {text.showMore}
          </button>
        ) : null}
      </div>

      {partnerButtons.length ? (
        <div className="mt-4 rounded-[1.5rem] border border-emerald-900/10 bg-white/88 p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">{text.partnersTitle}</p>
          <div className="mt-3 grid gap-2 lg:grid-cols-3">
            {partnerButtons.map((partner) => (
              <a
                key={partner.label}
                href={partner.href}
                target="_blank"
                rel="noreferrer"
                className="rounded-[1.2rem] border border-emerald-900/10 bg-emerald-950 px-4 py-3 text-white transition hover:-translate-y-0.5 hover:bg-emerald-900"
              >
                <span className="block text-[11px] uppercase tracking-[0.16em] text-emerald-200">{partner.eyebrow}</span>
                <span className="mt-2 flex items-center gap-2 text-sm font-semibold">
                  <PartnerLogoMark brand={partner.label} size="sm" />
                  <span>{partner.label}</span>
                </span>
                <span className="mt-2 block text-sm leading-6 text-white/72">{partner.description}</span>
              </a>
            ))}
          </div>
        </div>
      ) : null}

      {quickShortlist.length ? (
        <div className="mt-4 rounded-[1.5rem] border border-emerald-900/10 bg-white/88 p-4 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">{text.quickShortlist}</p>
              <p className="mt-2 text-sm leading-6 text-emerald-900/76">{text.quickShortlistBody}</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {quickShortlist.map((offer, index) => {
              const shortlistHref = offer.bookingUrl
                ? buildRedirectHref({
                    providerKey: "stays",
                    targetUrl: offer.bookingUrl,
                    city: props.destinationCity,
                    country: props.destinationCountry,
                    source: index === 0 ? "stay_panel_shortlist_top" : "stay_panel_shortlist_offer",
                  })
                : partnerButtons[0]?.href;

              return (
                <article key={`shortlist-${offer.searchResultId}`} className="rounded-[1.35rem] border border-emerald-900/10 bg-emerald-50/70 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                    {index === 0 ? text.topStayBadge : `${text.position} #${index + 1}`}
                  </p>
                  <h4 className="mt-2 text-lg font-bold text-emerald-950">{offer.name}</h4>
                  <p className="mt-1 text-sm text-emerald-900/72">{offer.address || offer.city}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-emerald-950">
                      {formatMoney(offer.total_amount, offer.currency, locale)}
                    </span>
                    {(offer.reviewScore || offer.rating) ? (
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-emerald-950">
                        {offer.reviewScore ? `${offer.reviewScore.toFixed(1)}/10` : `${offer.rating?.toFixed(1)} ${text.ratingStars}`}
                      </span>
                    ) : null}
                  </div>
                  {shortlistHref ? (
                    <a
                      href={shortlistHref}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 inline-flex items-center rounded-full bg-emerald-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-800"
                    >
                      {text.shortlistOpen}
                    </a>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>
      ) : null}

      {error ? <div className="mt-4 rounded-[1.5rem] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {data?.error ? (
        <div className="mt-4 rounded-[1.5rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {text.feedFallbackBody}
        </div>
      ) : null}

      <div className="mt-5 space-y-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="animate-pulse rounded-[1.5rem] border border-emerald-900/10 bg-white/88 p-4">
              <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
                <div className="h-36 rounded-[1.25rem] bg-emerald-100" />
                <div className="space-y-3">
                  <div className="h-5 w-48 rounded-full bg-emerald-100" />
                  <div className="h-7 w-2/3 rounded-full bg-emerald-100" />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="h-10 rounded-2xl bg-emerald-100" />
                    <div className="h-10 rounded-2xl bg-emerald-100" />
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : displayedOffers.length ? (
          <>
            {topOffer ? (
              <article className="overflow-hidden rounded-[1.75rem] border border-emerald-900/10 bg-white shadow-[0_16px_45px_rgba(16,84,48,0.08)]">
                <div className="grid gap-0 lg:grid-cols-[320px_1fr]">
                  <div className="relative h-72 lg:h-full">
                    <Image
                      src={topOffer.imageUrl ?? "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80"}
                      alt={topOffer.name}
                      fill
                      className="object-cover transition duration-500 hover:scale-105"
                      sizes="(max-width: 1024px) 100vw, 320px"
                    />
                    <div className="absolute left-4 top-4 rounded-full bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-950 shadow-sm">
                      {text.topStayBadge}
                    </div>
                    {getDiscountPercent(topOffer.total_amount, topOffer.public_amount) ? (
                      <div className="absolute right-4 top-4 rounded-full bg-rose-500 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white shadow-sm">
                        -{getDiscountPercent(topOffer.total_amount, topOffer.public_amount)}%
                      </div>
                    ) : null}
                  </div>

                  <div className="p-5 sm:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="max-w-2xl">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">{text.featuredOfferEyebrow}</p>
                        <h4 className="mt-2 text-3xl font-bold text-emerald-950">{topOffer.name}</h4>
                        <p className="mt-2 text-sm text-emerald-900/72">{topOffer.address || topOffer.city}</p>
                      </div>
                      <div className="rounded-[1.4rem] bg-emerald-950 px-4 py-3 text-right text-white">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-200">{text.stayPriceLabel}</p>
                        <p className="mt-1 text-2xl font-bold">{formatMoney(topOffer.total_amount, topOffer.currency, locale)}</p>
                        {topOffer.public_amount && topOffer.public_amount > topOffer.total_amount ? (
                          <p className="mt-1 text-xs text-emerald-100/80">
                            {text.savingsLabel} {formatMoney(topOffer.public_amount - topOffer.total_amount, topOffer.currency, locale)}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    {getDiscountPercent(topOffer.total_amount, topOffer.public_amount) ? (
                      <div className="mt-4 inline-flex rounded-full bg-rose-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-rose-600">
                        {text.promoDiscountPrefix} -{getDiscountPercent(topOffer.total_amount, topOffer.public_amount)}% / {text.discountCompared}
                      </div>
                    ) : null}

                    <div className="mt-4 grid gap-3 sm:grid-cols-4">
                      <div className="rounded-2xl bg-emerald-50/70 px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">{text.dateLabel}</p>
                        <p className="mt-1 text-sm font-semibold text-emerald-950">
                          {formatShortDate(props.checkInDate, locale === "en" ? "en-GB" : "pl-PL")} - {formatShortDate(checkOutDate, locale === "en" ? "en-GB" : "pl-PL")}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-emerald-50/70 px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">{text.ratingLabel}</p>
                        <p className="mt-1 text-sm font-semibold text-emerald-950">
                          {topOffer.reviewScore
                            ? `${topOffer.reviewScore.toFixed(1)}/10`
                            : topOffer.rating
                              ? `${topOffer.rating.toFixed(1)} ${text.ratingStars}`
                              : text.noData}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-emerald-50/70 px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">{text.guestsLabel}</p>
                        <p className="mt-1 text-sm font-semibold text-emerald-950">{props.guests} {text.guestsShort}</p>
                      </div>
                      <div className="rounded-2xl bg-emerald-50/70 px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">{text.roomsLabel}</p>
                        <p className="mt-1 text-sm font-semibold text-emerald-950">{props.rooms}</p>
                      </div>
                    </div>

                    {topOffer.description ? <p className="mt-4 text-sm leading-6 text-emerald-900/80">{topOffer.description}</p> : null}

                    {topOfferReasons.length ? (
                      <div className="mt-4 rounded-[1.35rem] border border-emerald-900/10 bg-emerald-50/70 p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">{text.whyTopOffer}</p>
                        <div className="mt-3 space-y-2 text-sm leading-6 text-emerald-900/82">
                          {topOfferReasons.map((reason) => (
                            <p key={reason}>{reason}</p>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-5 flex flex-wrap gap-2">
                      {topOffer.bookingUrl ? (
                        (() => {
                          const topOfferPartnerLabel = getAffiliateBrandLabel(topOffer.bookingUrl, partnerButtons[0]?.label ?? "Partner");
                          return (
                        <a
                          href={buildRedirectHref({
                            providerKey: "stays",
                            targetUrl: topOffer.bookingUrl,
                            city: props.destinationCity,
                            country: props.destinationCountry,
                            source: "stay_panel_featured_offer",
                          })}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 rounded-full bg-emerald-700 px-5 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-emerald-800"
                        >
                          <PartnerLogoMark brand={topOfferPartnerLabel} size="sm" variant="contrast" />
                          {text.showThisStay}
                        </a>
                          );
                        })()
                      ) : null}
                      {partnerButtons[0] ? (
                        <a
                          href={partnerButtons[0].href}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 rounded-full border border-emerald-900/12 bg-white px-5 py-3 text-sm font-semibold text-emerald-950 transition hover:-translate-y-0.5 hover:bg-emerald-50"
                        >
                          <PartnerLogoMark brand={partnerButtons[0].label} size="sm" />
                          {text.compareAlso} {partnerButtons[0].label}
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>
              </article>
            ) : null}

            {remainingOffers.map((offer, index) => (
              <article key={offer.searchResultId} className="overflow-hidden rounded-[1.5rem] border border-emerald-900/10 bg-white">
                <div className="grid gap-0 lg:grid-cols-[240px_1fr]">
                  <div className="relative h-52 lg:h-full">
                    <Image
                      src={offer.imageUrl ?? "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80"}
                      alt={offer.name}
                      fill
                      className="object-cover transition duration-500 hover:scale-105"
                      sizes="(max-width: 1024px) 100vw, 240px"
                    />
                  </div>

                  <div className="p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">{text.position} #{index + 2}</p>
                        <h4 className="mt-1 text-lg font-bold text-emerald-950">{offer.name}</h4>
                        <p className="mt-1 text-sm text-emerald-900/72">{offer.address || offer.city}</p>
                        {getDiscountPercent(offer.total_amount, offer.public_amount) ? (
                          <span className="mt-3 inline-flex rounded-full bg-rose-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-rose-600">
                            -{getDiscountPercent(offer.total_amount, offer.public_amount)}%
                          </span>
                        ) : null}
                      </div>
                      <div className="rounded-2xl bg-emerald-50 px-3 py-2 text-right">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">{text.stayPriceLabel}</p>
                        <p className="mt-1 text-lg font-bold text-emerald-950">{formatMoney(offer.total_amount, offer.currency, locale)}</p>
                        {offer.public_amount && offer.public_amount > offer.total_amount ? (
                          <p className="mt-1 text-[11px] text-emerald-800/72">
                            {text.savingsLabel} {formatMoney(offer.public_amount - offer.total_amount, offer.currency, locale)}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-4">
                      <div className="rounded-2xl bg-emerald-50/70 px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">{text.dateLabel}</p>
                        <p className="mt-1 text-sm font-semibold text-emerald-950">
                          {formatShortDate(props.checkInDate, locale === "en" ? "en-GB" : "pl-PL")} - {formatShortDate(checkOutDate, locale === "en" ? "en-GB" : "pl-PL")}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-emerald-50/70 px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">{text.ratingLabel}</p>
                        <p className="mt-1 text-sm font-semibold text-emerald-950">
                          {offer.reviewScore ? `${offer.reviewScore.toFixed(1)}/10` : offer.rating ? `${offer.rating.toFixed(1)} ${text.ratingStars}` : text.noData}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-emerald-50/70 px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">{text.guestsLabel}</p>
                        <p className="mt-1 text-sm font-semibold text-emerald-950">{props.guests} {text.guestsShort}</p>
                      </div>
                      <div className="rounded-2xl bg-emerald-50/70 px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">{text.roomsLabel}</p>
                        <p className="mt-1 text-sm font-semibold text-emerald-950">{props.rooms}</p>
                      </div>
                    </div>

                    {offer.description ? <p className="mt-3 text-sm leading-6 text-emerald-900/80">{offer.description}</p> : null}

                    <div className="mt-4 flex flex-wrap gap-2">
                      {offer.bookingUrl ? (
                        (() => {
                          const offerPartnerLabel = getAffiliateBrandLabel(offer.bookingUrl, partnerButtons[0]?.label ?? "Partner");
                          return (
                        <a
                          href={buildRedirectHref({
                            providerKey: "stays",
                            targetUrl: offer.bookingUrl,
                            city: props.destinationCity,
                            country: props.destinationCountry,
                            source: "stay_panel_offer",
                          })}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 rounded-full bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800"
                        >
                          <PartnerLogoMark brand={offerPartnerLabel} size="sm" variant="contrast" />
                          {text.checkStay}
                        </a>
                          );
                        })()
                      ) : null}
                      {partnerButtons[0] ? (
                        <a
                          href={partnerButtons[0].href}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 rounded-full border border-emerald-900/12 bg-white px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-50"
                        >
                          <PartnerLogoMark brand={partnerButtons[0].label} size="sm" />
                          {text.compareIn} {partnerButtons[0].label}
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </>
        ) : partnerButtons.length ? (
          <div className="rounded-[1.75rem] border border-dashed border-emerald-900/12 bg-white/88 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">{text.feedFallbackTitle}</p>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-emerald-900/76">{text.feedFallbackBody}</p>
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              {partnerButtons.map((partner) => (
                <a
                  key={`fallback-${partner.label}`}
                  href={partner.href}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-[1.35rem] border border-emerald-900/10 bg-emerald-950 px-4 py-4 text-white transition hover:-translate-y-0.5 hover:bg-emerald-900"
                >
                  <span className="block text-[11px] uppercase tracking-[0.16em] text-emerald-200">{partner.eyebrow}</span>
                  <span className="mt-2 flex items-center gap-2 text-base font-semibold">
                    <PartnerLogoMark brand={partner.label} size="sm" />
                    <span>{partner.label}</span>
                  </span>
                  <span className="mt-2 block text-sm text-white/72">
                    {formatShortDate(props.checkInDate, locale === "en" ? "en-GB" : "pl-PL")} - {formatShortDate(checkOutDate, locale === "en" ? "en-GB" : "pl-PL")}
                  </span>
                </a>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-[1.5rem] border border-dashed border-emerald-900/12 bg-white/88 px-4 py-6 text-sm text-emerald-900/72">
            {text.emptyState}
          </div>
        )}
      </div>
    </section>
  );
}



