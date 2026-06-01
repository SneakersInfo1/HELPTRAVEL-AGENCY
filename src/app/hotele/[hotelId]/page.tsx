// /hotele/[hotelId] — hotel detail. Master spec §5.3.
//
// Server-rendered. Photo grid + sticky booking widget + rooms section.
// JSON-LD Hotel + Offer + BreadcrumbList. Polish meta.
//
// Phase 4 carry-overs (intentional): Embla full-screen lightbox, MapLibre
// embed with nearby POIs, reviews block.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { fromMinor } from "@/lib/money";
import { getHotelDetail, getRates, LiteApiError, type LiteApiRoomType } from "@/lib/liteapi";
import { isBookingLive } from "@/lib/config/featureFlags";
import { nightsBetween, pickCheapestRate, rateTotalMinor } from "@/lib/hotels/normalize";
import { sanitizeHotelDescription } from "@/lib/html/sanitize";
import { getSiteUrl } from "@/lib/mvp/site";

// LiteAPI is asked for `language=pl` (see lib/liteapi/hotel.ts), but for
// many hotels they don't actually have a Polish translation on file and
// fall back to English upstream. A Polish site rendering English content
// looks broken to the user (see Vincci Larios Diez, Málaga — 2026-05-28
// report). Heuristic: a long-form description (>= 80 chars of plain text)
// with ZERO Polish-specific characters is essentially never Polish — even
// short Polish paragraphs almost always include one of ą/ć/ę/ł/ń/ó/ś/ź/ż.
// When we detect this, swap the foreign-language description for a clean
// Polish placeholder that still tells the user where to find details.
function descriptionIsLikelyNotPolish(html: string | undefined | null): boolean {
  if (!html) return false;
  const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (text.length < 80) return false; // too short to judge reliably
  return !/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(text);
}

import { TrackView } from "@/components/analytics/track-view";

import { BookingWidget } from "./_components/booking-widget";
import { HotelGallery } from "./_components/hotel-gallery";
import { RoomsSection } from "./_components/rooms-section";
import { SaveHotelButton } from "./_components/save-hotel-button";

// Honest qualitative label for LiteAPI's 0-10 guest rating. A pure mapping
// of the REAL score — no inflation, shown only when a rating exists. Mirrors
// the bands travellers recognise from booking sites.
function ratingLabel(rating: number): string {
  if (rating >= 9) return "Wyjątkowy";
  if (rating >= 8) return "Świetny";
  if (rating >= 7) return "Bardzo dobry";
  if (rating >= 6) return "Dobry";
  return "Przyzwoity";
}

// Polish plural for "opinia": 1 → opinia; 2-4 (except 12-14) → opinie;
// otherwise → opinii.
function pluralizeOpinie(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (n === 1) return "opinia";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "opinie";
  return "opinii";
}

export const revalidate = 21600; // ISR 6h per spec

interface SP {
  checkin?: string;
  checkout?: string;
  adults?: string;
  rooms?: string;
  children?: string;
  destination?: string;
  country?: string;
}

const plusDaysIso = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

async function fetchDetail(hotelId: string) {
  try {
    return await getHotelDetail(hotelId);
  } catch {
    return null;
  }
}

async function fetchRates(args: {
  hotelId: string;
  checkin: string;
  checkout: string;
  adults: number;
  rooms: number;
  children: number[];
}): Promise<LiteApiRoomType[]> {
  try {
    const res = await getRates({
      hotelIds: [args.hotelId],
      checkin: args.checkin,
      checkout: args.checkout,
      currency: "PLN",
      occupancies: Array.from({ length: args.rooms }, () => ({ adults: args.adults, children: args.children })),
    });
    return res.data.find((r) => r.hotelId === args.hotelId)?.roomTypes ?? [];
  } catch (err) {
    if (err instanceof LiteApiError) console.warn("[hotele/detail] rates", err.internalCode, err.message);
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ hotelId: string }>;
}): Promise<Metadata> {
  const { hotelId } = await params;
  const detail = await fetchDetail(hotelId);
  if (!detail) {
    return { title: "Hotel | HelpTravel", robots: { index: false, follow: false } };
  }
  const cityCountry = [detail.city, detail.country].filter(Boolean).join(", ");
  const desc = `Zarezerwuj ${detail.name} w ${detail.city}. Ceny finalne w PLN, bezpłatna anulacja w wybranych hotelach.${
    detail.amenities?.[0] ? ` ${detail.amenities[0]}.` : ""
  }${detail.amenities?.[1] ? ` ${detail.amenities[1]}.` : ""}`;
  return {
    title: `${detail.name} — ${cityCountry} | HelpTravel`,
    description: desc.slice(0, 160),
    alternates: { canonical: `/hotele/${hotelId}` },
    openGraph: {
      title: `${detail.name} — ${cityCountry}`,
      description: desc.slice(0, 160),
      images: detail.main_photo ? [detail.main_photo] : undefined,
      type: "website",
    },
  };
}

export default async function HotelDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ hotelId: string }>;
  searchParams: Promise<SP>;
}) {
  const { hotelId } = await params;
  const sp = await searchParams;
  const detail = await fetchDetail(hotelId);
  if (!detail) notFound();

  const checkin = sp.checkin && /^\d{4}-\d{2}-\d{2}$/.test(sp.checkin) ? sp.checkin : plusDaysIso(14);
  const checkout = sp.checkout && /^\d{4}-\d{2}-\d{2}$/.test(sp.checkout) ? sp.checkout : plusDaysIso(18);
  const adults = sp.adults ? Math.max(1, Math.min(8, Number(sp.adults))) : 2;
  const rooms = sp.rooms ? Math.max(1, Math.min(5, Number(sp.rooms))) : 1;
  const children = sp.children
    ? sp.children.split(",").map((s) => Number(s)).filter((n) => Number.isFinite(n) && n >= 0 && n < 18)
    : [];
  const nights = nightsBetween(checkin, checkout);

  const roomTypes = await fetchRates({ hotelId, checkin, checkout, adults, rooms, children });
  const cheapest = pickCheapestRate(roomTypes);
  const cheapestMinor = cheapest ? rateTotalMinor(cheapest.rate) : null;
  const cheapestTotal = cheapestMinor !== null ? fromMinor(cheapestMinor) : undefined;
  const currency = cheapest?.rate.retailRate?.total?.[0]?.currency ?? "PLN";

  // Build search-query string for child links (rooms CTA).
  const searchQuery = (() => {
    const p = new URLSearchParams();
    p.set("checkin", checkin);
    p.set("checkout", checkout);
    p.set("adults", String(adults));
    p.set("rooms", String(rooms));
    if (children.length) p.set("children", children.join(","));
    return p.toString();
  })();

  // JSON-LD
  const siteUrl = getSiteUrl();
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Strona główna", item: siteUrl },
      { "@type": "ListItem", position: 2, name: "Kierunki", item: `${siteUrl}/kierunki` },
      ...(detail.city
        ? [
            {
              "@type": "ListItem",
              position: 3,
              name: detail.city,
              item: `${siteUrl}/hotele/szukaj?destination=${encodeURIComponent(detail.city)}${
                detail.country ? `&country=${encodeURIComponent(detail.country)}` : ""
              }`,
            },
            { "@type": "ListItem", position: 4, name: detail.name, item: `${siteUrl}/hotele/${hotelId}` },
          ]
        : [{ "@type": "ListItem", position: 3, name: detail.name, item: `${siteUrl}/hotele/${hotelId}` }]),
    ],
  };
  const hotelJsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Hotel",
    name: detail.name,
    image: detail.main_photo,
    starRating: detail.stars ? { "@type": "Rating", ratingValue: detail.stars } : undefined,
    address: {
      "@type": "PostalAddress",
      streetAddress: detail.address,
      addressLocality: detail.city,
      postalCode: detail.zip,
      addressCountry: detail.countryCode ?? detail.country,
    },
    geo:
      detail.latitude != null && detail.longitude != null
        ? { "@type": "GeoCoordinates", latitude: detail.latitude, longitude: detail.longitude }
        : undefined,
    priceRange: cheapestTotal ? `od ${Math.round(cheapestTotal)} PLN` : undefined,
  };
  if (cheapestTotal) {
    hotelJsonLd.offers = {
      "@type": "Offer",
      priceCurrency: currency,
      price: cheapestTotal,
      availability: "https://schema.org/InStock",
      validFrom: checkin,
      url: `${siteUrl}/hotele/${hotelId}?${searchQuery}`,
    };
  }
  // schema.org AggregateRating — surfaces star ratings in Google SERP rich
  // results for hotels. Requires both ratingValue and reviewCount (≥ 1) per
  // Google's structured-data guidelines. If LiteAPI only provided a rating
  // without a count, we omit AggregateRating entirely rather than fake the
  // count — Google penalises bogus review-count claims.
  if (detail.rating != null && detail.reviewCount != null && detail.reviewCount > 0) {
    hotelJsonLd.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: Number(detail.rating.toFixed(1)),
      // LiteAPI's rating scale is 0-10. schema.org allows any bestRating, but
      // declaring it explicitly removes ambiguity for Google.
      bestRating: 10,
      worstRating: 0,
      reviewCount: detail.reviewCount,
    };
  }

  // Photo gallery — surface ALL hotel photos (deduped, capped at 15) for the
  // auto-rotating carousel, with main_photo first as the LCP image.
  const photos = Array.from(
    new Set(
      [
        detail.main_photo,
        ...(detail.hotelImages ?? []).map((p) => p.urlHd ?? p.url),
      ].filter((u): u is string => Boolean(u)),
    ),
  ).slice(0, 15);

  return (
    <main className="min-h-screen bg-neutral-50 pb-24 lg:pb-0">
      <TrackView
        event="hotel_detail_view"
        params={{
          hotel_id: hotelId,
          destination: detail.city ?? undefined,
          has_price: cheapestTotal !== undefined,
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(hotelJsonLd) }}
      />

      {/* Breadcrumb visible */}
      <nav className="border-b border-neutral-200 bg-white">
        <ol className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2 text-xs text-neutral-500">
          <li><Link href="/" className="hover:text-emerald-700">Strona główna</Link></li>
          <li>›</li>
          <li><Link href="/kierunki" className="hover:text-emerald-700">Kierunki</Link></li>
          {detail.city && (
            <>
              <li>›</li>
              <li>
                <Link
                  href={`/hotele/szukaj?destination=${encodeURIComponent(detail.city)}${
                    detail.country ? `&country=${encodeURIComponent(detail.country)}` : ""
                  }`}
                  className="hover:text-emerald-700"
                >
                  {detail.city}
                </Link>
              </li>
            </>
          )}
          <li>›</li>
          <li className="truncate font-medium text-neutral-700">{detail.name}</li>
        </ol>
      </nav>

      {/* Photo gallery — auto-rotating carousel + thumbnail strip */}
      <section className="mx-auto max-w-7xl px-4 pt-4">
        <HotelGallery photos={photos} alt={detail.name} />
      </section>

      <section className="mx-auto max-w-7xl px-4 py-6">
        <header>
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-2xl font-bold text-neutral-900 sm:text-3xl">{detail.name}</h1>
            <SaveHotelButton
              hotelId={hotelId}
              name={detail.name}
              city={detail.city ?? undefined}
              href={`/hotele/${hotelId}?${searchQuery}`}
            />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-neutral-600">
            {detail.stars ? <span className="text-amber-500">{"★".repeat(Math.round(detail.stars))}</span> : null}
            <span>
              {[detail.address, detail.city, detail.country].filter(Boolean).join(", ")}
            </span>
          </div>

          {/* Honest social proof — real LiteAPI rating + qualitative label +
              review count. Shown only when a real rating exists; review count
              only when LiteAPI provides one. No fabricated numbers. */}
          {detail.rating != null && detail.rating > 0 && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2">
              <span className="rounded-md bg-emerald-700 px-2 py-1 text-sm font-bold text-white">
                {detail.rating.toFixed(1)}
              </span>
              <span className="text-sm">
                <span className="font-semibold text-emerald-900">{ratingLabel(detail.rating)}</span>
                {detail.reviewCount != null && detail.reviewCount > 0 && (
                  <span className="text-emerald-800/80">
                    {" "}
                    · {detail.reviewCount.toLocaleString("pl-PL")} {pluralizeOpinie(detail.reviewCount)}
                  </span>
                )}
              </span>
            </div>
          )}

          {/* Honest trust strip — all three hold site-wide; no scarcity, no
              fabricated urgency (those would be dark patterns). */}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600">
            <span className="inline-flex items-center gap-1">
              <span className="text-emerald-600">✓</span> Ceny finalne w PLN
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="text-emerald-600">✓</span> Bezpłatna anulacja w wybranych ofertach
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="text-emerald-600">✓</span> Polskie wsparcie
            </span>
          </div>
        </header>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            {/* Tabs (links to in-page anchors) */}
            <nav className="flex gap-1 overflow-x-auto rounded-xl bg-white p-1 ring-1 ring-neutral-200">
              {[
                { id: "overview", label: "Przegląd" },
                { id: "rooms", label: "Pokoje" },
                { id: "amenities", label: "Udogodnienia" },
                { id: "location", label: "Lokalizacja" },
                { id: "policies", label: "Polityka" },
              ].map((t) => (
                <a
                  key={t.id}
                  href={`#${t.id}`}
                  className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
                >
                  {t.label}
                </a>
              ))}
            </nav>

            {/* Overview */}
            <section id="overview" className="rounded-2xl bg-white p-6 ring-1 ring-neutral-200">
              <h2 className="text-lg font-bold text-neutral-900">Przegląd</h2>
              {(() => {
                const raw = detail.hotelDescription ?? detail.description;
                const sanitized = sanitizeHotelDescription(raw);
                // Show LiteAPI's description ONLY when it actually came back
                // in Polish. English (or other-language) content gets swapped
                // for a clean Polish placeholder — better than dumping foreign
                // copy onto a Polish-speaking user.
                if (sanitized && !descriptionIsLikelyNotPolish(sanitized)) {
                  return (
                    <div
                      className="mt-3 space-y-3 text-sm leading-relaxed text-neutral-700 [&_p]:mt-0 [&_strong]:font-semibold [&_strong]:text-neutral-900 [&_em]:italic [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mt-1"
                      dangerouslySetInnerHTML={{ __html: sanitized }}
                    />
                  );
                }
                // Fallback: synthesize a short Polish overview from the
                // structured data we DO have (stars, city, rating). This is
                // better than "no description" because it still helps the
                // user decide whether to keep reading.
                const summaryBits: string[] = [];
                if (detail.stars && detail.stars > 0) {
                  summaryBits.push(`${Math.round(detail.stars)}-gwiazdkowy hotel`);
                } else {
                  summaryBits.push("Hotel");
                }
                if (detail.city) summaryBits.push(`w mieście ${detail.city}`);
                const opener = summaryBits.join(" ") + ".";
                const ratingLine =
                  detail.rating != null && detail.rating > 0
                    ? `Goście oceniają obiekt na ${detail.rating.toFixed(1)}/10${
                        detail.reviewCount && detail.reviewCount > 0
                          ? ` (${detail.reviewCount.toLocaleString("pl-PL")} ${pluralizeOpinie(detail.reviewCount)})`
                          : ""
                      }.`
                    : null;
                return (
                  <div className="mt-3 space-y-3 text-sm leading-relaxed text-neutral-700">
                    <p>{opener}</p>
                    {ratingLine && <p>{ratingLine}</p>}
                    <p className="text-xs text-neutral-500">
                      Pełny opis hotelu po polsku nie jest dostępny u dostawcy.
                      Szczegóły znajdziesz w sekcjach „Udogodnienia”, „Lokalizacja”
                      i „Polityka hotelu” poniżej.
                    </p>
                  </div>
                );
              })()}
            </section>

            {/* Rooms */}
            <RoomsSection
              hotelId={hotelId}
              roomTypes={roomTypes}
              searchQuery={searchQuery}
              nights={nights}
              currency={currency}
              bookingLive={isBookingLive()}
            />

            {/* Amenities */}
            {detail.amenities && detail.amenities.length > 0 && (
              <section id="amenities" className="rounded-2xl bg-white p-6 ring-1 ring-neutral-200">
                <h2 className="text-lg font-bold text-neutral-900">Udogodnienia</h2>
                <ul className="mt-3 grid grid-cols-1 gap-2 text-sm text-neutral-700 sm:grid-cols-2">
                  {detail.amenities.slice(0, 30).map((a, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-emerald-600">✓</span>
                      <span>{a}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Location */}
            <section id="location" className="rounded-2xl bg-white p-6 ring-1 ring-neutral-200">
              <h2 className="text-lg font-bold text-neutral-900">Lokalizacja</h2>
              <p className="mt-2 text-sm text-neutral-700">
                {[detail.address, detail.city, detail.country].filter(Boolean).join(", ") || detail.city}
              </p>
              {detail.latitude != null && detail.longitude != null && (
                <a
                  href={`https://www.openstreetmap.org/?mlat=${detail.latitude}&mlon=${detail.longitude}#map=15/${detail.latitude}/${detail.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-sm font-medium text-emerald-700 hover:text-emerald-800"
                >
                  Zobacz na mapie →
                </a>
              )}
            </section>

            {/* Policies */}
            <section id="policies" className="rounded-2xl bg-white p-6 ring-1 ring-neutral-200">
              <h2 className="text-lg font-bold text-neutral-900">Polityka hotelu</h2>
              {detail.checkinCheckoutTimes && (
                <p className="mt-2 text-sm text-neutral-700">
                  {detail.checkinCheckoutTimes.checkin && (
                    <>Zameldowanie od {detail.checkinCheckoutTimes.checkin}. </>
                  )}
                  {detail.checkinCheckoutTimes.checkout && (
                    <>Wymeldowanie do {detail.checkinCheckoutTimes.checkout}.</>
                  )}
                </p>
              )}
              {(detail.policies ?? []).slice(0, 6).map((p, i) => (
                <div key={i} className="mt-3">
                  <div className="text-sm font-semibold text-neutral-800">{p.name}</div>
                  <p className="mt-1 text-sm text-neutral-600">{p.description}</p>
                </div>
              ))}
            </section>
          </div>

          {/* Booking widget */}
          <BookingWidget
            hotelId={hotelId}
            initial={{ checkin, checkout, adults, rooms, children }}
            cheapestTotal={cheapestTotal}
            nights={nights}
            currency={currency}
          />
        </div>
      </section>
    </main>
  );
}
