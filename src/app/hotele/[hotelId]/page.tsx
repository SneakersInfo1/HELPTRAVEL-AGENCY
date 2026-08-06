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
import { getHotelDetail, getRates, isHotelNotFoundError, LiteApiError, type LiteApiRoomType } from "@/lib/liteapi";
import { isBookingLive, showReviews } from "@/lib/config/featureFlags";
import { getHotelReviews, selectReviews, type DisplayReview } from "@/lib/liteapi/reviews";
import { taxNoticeText } from "@/lib/hotels/domain/format";
import { mapTaxes, taxNoticeFrom } from "@/lib/hotels/domain/price";
import { reviewCategories, reviewHighlights, sentimentUpdatedAt } from "@/lib/hotels/domain/review";
import { indexRoomsById } from "@/lib/hotels/domain/room";
import { nightsBetween, pickCheapestRate, rateTotalMinor } from "@/lib/hotels/normalize";
import { ratingLabel } from "@/lib/hotels/rating";
import { sanitizeHotelDescription } from "@/lib/html/sanitize";
import { normalizeFacilities, groupFacilities, coerceImportantInfo } from "@/lib/liteapi/facilities";
import { sanitizeFacilities } from "@/lib/liteapi/sanitize-facilities";
import { stripCovidFacilities } from "@/lib/liteapi/covid-facilities";
import { hotelDistanceLabels } from "@/lib/geo/distance-label";
import { localizeCountry } from "@/lib/mvp/i18n-geo";
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

import { AmenitiesSection } from "./_components/amenities-section";
import { BookingWidget } from "./_components/booking-widget";
import { HotelGallery } from "./_components/hotel-gallery";
import { HotelReviews } from "./_components/hotel-reviews";
import { RoomsSection } from "./_components/rooms-section";
import { SaveHotelButton } from "./_components/save-hotel-button";

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

// Metadane są DODATKIEM — gdy detal się nie pobierze (z jakiegokolwiek powodu),
// po cichu degradujemy do noindex zamiast wywalać generację metadanych.
async function fetchDetailForMeta(hotelId: string) {
  try {
    return await getHotelDetail(hotelId);
  } catch {
    return null;
  }
}

// Strona hotelu: rozróżniamy PRAWDZIWIE nieistniejący hotel od błędu
// PRZEJŚCIOWEGO. Wcześniej `catch { return null } → notFound()` zamieniał KAŻDY
// błąd (timeout/5xx/sieć/limit/walidacja) w 404 — a przy `revalidate=21600`
// (ISR 6h) taki przejściowy 404 potrafił zostać ZAPISANY w cache → hotel
// „martwy" przez 6h dla wszystkich (zgłoszenie: „czasami po kliknięciu jest
// 404"). Dodatkowo catch był NIEMY → zero śladu w logach.
// Teraz:
//   • prawdziwie nieistniejący hotel (404 LUB 400/4002) → null → notFound()
//     (poprawne, cacheowalne — nie odpytujemy w kółko znanego-brakującego hotelu),
//   • cokolwiek innego (przejściowe: timeout/5xx/sieć/limit/walidacja) → rzucamy
//     → error boundary: 500 z „spróbuj ponownie", NIE zapisuje 404 w cache.
async function fetchDetailForPage(hotelId: string) {
  try {
    return await getHotelDetail(hotelId);
  } catch (err) {
    if (isHotelNotFoundError(err)) return null;
    console.error("[hotele/detail] fetchDetail nieudane (traktuję jako przejściowe)", {
      hotelId,
      code: err instanceof LiteApiError ? err.internalCode : "NON_LITEAPI",
      status: err instanceof LiteApiError ? err.status : undefined,
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
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
      // Każda taryfa dostaje `mappedRoomId` → pozwala pokazać zdjęcia, metraż
      // i łóżka JEJ pokoju (rooms[] z /data/hotel) zamiast karty bez zdjęcia.
      // Włączone tylko tutaj — lista wyników go nie potrzebuje i nie chcemy
      // ruszać jej cache (patrz komentarz przy GetRatesInput.roomMapping).
      roomMapping: true,
    });
    return res.data.find((r) => r.hotelId === args.hotelId)?.roomTypes ?? [];
  } catch (err) {
    if (err instanceof LiteApiError) console.warn("[hotele/detail] rates", err.internalCode, err.message);
    return [];
  }
}

// Opinie to DODATEK do strony — gdy LiteAPI zawiedzie (sieć/4xx/5xx/walidacja),
// NIGDY nie wywalamy całej strony hotelu, tylko nie pokazujemy sekcji.
async function fetchReviews(hotelId: string): Promise<DisplayReview[]> {
  if (!showReviews()) return [];
  try {
    return selectReviews(await getHotelReviews(hotelId));
  } catch (err) {
    if (err instanceof LiteApiError) console.warn("[hotele/detail] reviews", err.internalCode, err.message);
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ hotelId: string }>;
}): Promise<Metadata> {
  const { hotelId } = await params;
  const detail = await fetchDetailForMeta(hotelId);
  if (!detail) {
    // Bez sufiksu „| HelpTravel" — dokłada go szablon `title.template`
    // z głównego layoutu. Wpisany tutaj dawał „… | HelpTravel | HelpTravel"
    // (zmierzone w przeglądarce 2026-08-02) — ta sama pomyłka, którą naprawiono
    // wcześniej na stronach /wyjazdy.
    return { title: "Hotel", robots: { index: false, follow: false } };
  }
  const cityCountry = [detail.city, localizeCountry(detail.country)].filter(Boolean).join(", ");
  const desc = `Zarezerwuj ${detail.name} w ${detail.city}. Ceny finalne w PLN, bezpłatna anulacja w wybranych hotelach.${
    detail.amenities?.[0] ? ` ${detail.amenities[0]}.` : ""
  }${detail.amenities?.[1] ? ` ${detail.amenities[1]}.` : ""}`;
  return {
    title: `${detail.name} — ${cityCountry}`,
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
  const detail = await fetchDetailForPage(hotelId);
  if (!detail) notFound();

  const checkin = sp.checkin && /^\d{4}-\d{2}-\d{2}$/.test(sp.checkin) ? sp.checkin : plusDaysIso(14);
  const checkout = sp.checkout && /^\d{4}-\d{2}-\d{2}$/.test(sp.checkout) ? sp.checkout : plusDaysIso(18);
  // Cap 15 = 9 adults + 6 children from the guests popover (zadanie 1).
  const adults = sp.adults ? Math.max(1, Math.min(15, Number(sp.adults))) : 2;
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
  // Zdanie o podatkach dla najtańszej taryfy — liczone TU, bo tylko tutaj mamy
  // surową taryfę z `taxesAndFees`. `null` = brak rozbicia → widget milczy.
  const cheapestTaxText = cheapest ? taxNoticeText(taxNoticeFrom(mapTaxes(cheapest.rate))) : null;

  // Profile pokoi (zdjęcia, metraż, łóżka) z /data/hotel, zaindeksowane po id.
  // Taryfa trafia w swój pokój przez `mappedRoomId` — dlatego zapytanie
  // o stawki na tej stronie ustawia `roomMapping: true`. Serializujemy do
  // zwykłego obiektu, bo Map nie przechodzi przez granicę RSC → client.
  const roomsById = Object.fromEntries(indexRoomsById(detail));

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

  // Współrzędne hotelu — LiteAPI podaje je raz top-level, raz w `location`.
  // Bierzemy pierwsze sensowne (używane przez mapę, JSON-LD geo i odległości).
  const lat = detail.latitude ?? detail.location?.latitude ?? null;
  const lng = detail.longitude ?? detail.location?.longitude ?? null;

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
      lat != null && lng != null
        ? { "@type": "GeoCoordinates", latitude: lat, longitude: lng }
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

  // Merge every REAL facility source LiteAPI returned (`amenities` is often the
  // sparsest of the three), de-dupe, FAZA 2: usuń sprzeczności „X / No X" oraz
  // prawie-duplikaty, FAZA 3: wytnij boilerplate COVID, a na końcu zlokalizuj
  // do polskiego i pogrupuj.
  const facilityGroups = groupFacilities(
    stripCovidFacilities(
      sanitizeFacilities(normalizeFacilities(detail.amenities, detail.hotelFacilities, detail.facilities)),
    ),
  );
  const facilityCount = facilityGroups.reduce((sum, g) => sum + g.items.length, 0);
  const importantInfo = coerceImportantInfo(detail.hotelImportantInformation);
  const checkinTime = detail.checkinCheckoutTimes?.checkin ?? detail.checkinCheckoutTimes?.checkinStart;
  const checkoutTime = detail.checkinCheckoutTimes?.checkout;

  // At-a-glance facts — every value is real structured data; tiles with no
  // backing data are simply omitted (never faked).
  const keyFacts: { label: string; value: string }[] = [];
  if (checkinTime) keyFacts.push({ label: "Zameldowanie", value: `od ${checkinTime}` });
  if (checkoutTime) keyFacts.push({ label: "Wymeldowanie", value: `do ${checkoutTime}` });
  if (detail.stars && detail.stars > 0) keyFacts.push({ label: "Standard", value: `${Math.round(detail.stars)}★` });
  if (detail.rating && detail.rating > 0) keyFacts.push({ label: "Ocena gości", value: `${detail.rating.toFixed(1)}/10` });
  if (facilityCount > 0) keyFacts.push({ label: "Udogodnienia", value: String(facilityCount) });
  if (photos.length > 0) keyFacts.push({ label: "Zdjęcia", value: String(photos.length) });

  // FAZA 7 — odległość od centrum / plaży (liczona z realnych współrzędnych
  // hotelu i punktu odniesienia miasta; guardraile w distance-label.ts; pusty
  // obiekt = po prostu nie pokazujemy).
  const distances = hotelDistanceLabels(
    { lat, lng },
    detail.city,
    detail.countryCode ?? detail.country,
  );

  // FAZA 9 — prawdziwe opinie gości (za flagą SHOW_REVIEWS; cache 24h).
  // selectReviews zwraca [] gdy brak czytelnych opinii → sekcja się nie pokaże.
  // Fetch zabezpieczony (fetchReviews) — błąd LiteAPI nie wywala strony.
  const reviews = await fetchReviews(hotelId);

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
              {[detail.address, detail.city, localizeCountry(detail.country)].filter(Boolean).join(", ")}
            </span>
          </div>

          {/* Odległości (FAZA 7) — dyskretnie, ikona + tekst, jak na Booking. */}
          {(distances.center || distances.beach) && (
            <p className="mt-1.5 inline-flex items-center gap-1.5 text-sm font-medium text-neutral-700">
              <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-emerald-600">
                <path
                  fillRule="evenodd"
                  d="M10 2a5 5 0 0 0-5 5c0 3.36 3.69 7.39 4.65 8.39a.48.48 0 0 0 .7 0C11.31 14.39 15 10.36 15 7a5 5 0 0 0-5-5zm0 6.8A1.8 1.8 0 1 1 10 5.2a1.8 1.8 0 0 1 0 3.6z"
                  clipRule="evenodd"
                />
              </svg>
              {[distances.center, distances.beach].filter(Boolean).join(" · ")}
            </p>
          )}

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
                ...(reviews.length > 0 ? [{ id: "reviews", label: "Opinie" }] : []),
                ...(facilityCount > 0 ? [{ id: "amenities", label: "Udogodnienia" }] : []),
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
              {keyFacts.length > 0 && (
                <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {keyFacts.map((f) => (
                    <div key={f.label} className="rounded-xl bg-neutral-50 px-3 py-2 ring-1 ring-neutral-100">
                      <dt className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">{f.label}</dt>
                      <dd className="mt-0.5 text-sm font-semibold text-neutral-900">{f.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
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
              roomsById={roomsById}
              searchQuery={searchQuery}
              nights={nights}
              currency={currency}
              bookingLive={isBookingLive()}
            />

            {/* Opinie gości (FAZA 9) — renderuje się tylko gdy są czytelne. */}
            <HotelReviews
              reviews={reviews}
              categories={reviewCategories(detail)}
              highlights={reviewHighlights(detail)}
              sentimentUpdated={sentimentUpdatedAt(detail)}
              overallScore={detail.rating ?? null}
              reviewCount={detail.reviewCount ?? null}
            />

            {/* Amenities — merged from amenities + hotelFacilities + facilities,
                localised to Polish and grouped. Shows ALL real facilities
                (previously capped at 30 and sourced only from the sparse
                `amenities` field). */}
            {/* Udogodnienia — deduplikacja POJĘCIOWA (facilityId 47 „WiFi dostępne"
                i 107 „Darmowe WiFi" to jedno pojęcie) + ikony SVG zamiast emoji.
                Szczegóły w _components/amenities-section.tsx. */}
            <AmenitiesSection sources={[detail.amenities, detail.hotelFacilities, detail.facilities]} />

            {/* Location */}
            <section id="location" className="rounded-2xl bg-white p-6 ring-1 ring-neutral-200">
              <h2 className="text-lg font-bold text-neutral-900">Lokalizacja</h2>
              <p className="mt-2 text-sm text-neutral-700">
                {[detail.address, detail.city, localizeCountry(detail.country)].filter(Boolean).join(", ") || detail.city}
              </p>
              {lat != null && lng != null && (
                <a
                  href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=15/${lat}/${lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-sm font-medium text-emerald-700 hover:text-emerald-800"
                >
                  Zobacz na mapie →
                </a>
              )}
            </section>

            {/* Policies — check-in/out window, all property policies (no longer
                capped at 6) and LiteAPI's free-text important information. */}
            <section id="policies" className="rounded-2xl bg-white p-6 ring-1 ring-neutral-200">
              <h2 className="text-lg font-bold text-neutral-900">Polityka hotelu</h2>
              {(checkinTime || checkoutTime) && (
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {checkinTime && (
                    <div className="rounded-xl bg-neutral-50 px-3 py-2 ring-1 ring-neutral-100">
                      <div className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Zameldowanie</div>
                      <div className="mt-0.5 text-sm font-semibold text-neutral-900">
                        od {checkinTime}
                        {detail.checkinCheckoutTimes?.checkinEnd ? ` do ${detail.checkinCheckoutTimes.checkinEnd}` : ""}
                      </div>
                    </div>
                  )}
                  {checkoutTime && (
                    <div className="rounded-xl bg-neutral-50 px-3 py-2 ring-1 ring-neutral-100">
                      <div className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Wymeldowanie</div>
                      <div className="mt-0.5 text-sm font-semibold text-neutral-900">do {checkoutTime}</div>
                    </div>
                  )}
                </div>
              )}
              {(detail.policies ?? []).map((p, i) => (
                <div key={i} className="mt-3">
                  <div className="text-sm font-semibold text-neutral-800">{p.name}</div>
                  <p className="mt-1 text-sm text-neutral-600">{p.description}</p>
                </div>
              ))}
              {importantInfo && (
                <div className="mt-4 rounded-xl bg-amber-50 p-4 ring-1 ring-amber-100">
                  <div className="text-sm font-semibold text-amber-900">Dobrze wiedzieć</div>
                  <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-amber-900/80">{importantInfo}</p>
                </div>
              )}
              {!checkinTime && !checkoutTime && (detail.policies ?? []).length === 0 && !importantInfo && (
                <p className="mt-2 text-sm text-neutral-500">
                  Szczegółowe zasady pobytu potwierdzisz na etapie rezerwacji.
                </p>
              )}
            </section>
          </div>

          {/* Booking widget */}
          <BookingWidget
            hotelId={hotelId}
            initial={{ checkin, checkout, adults, rooms, children }}
            cheapestTotal={cheapestTotal}
            nights={nights}
            currency={currency}
            taxText={cheapestTaxText}
          />
        </div>
      </section>
    </main>
  );
}
