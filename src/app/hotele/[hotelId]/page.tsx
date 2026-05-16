// /hotele/[hotelId] — hotel detail. Master spec §5.3.
//
// Server-rendered. Photo grid + sticky booking widget + rooms section.
// JSON-LD Hotel + Offer + BreadcrumbList. Polish meta.
//
// Phase 4 carry-overs (intentional): Embla full-screen lightbox, MapLibre
// embed with nearby POIs, reviews block.

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { fromMinor } from "@/lib/money";
import { getHotelDetail, getRates, LiteApiError, type LiteApiRoomType } from "@/lib/liteapi";
import { nightsBetween, pickCheapestRate, rateTotalMinor } from "@/lib/hotels/normalize";
import { sanitizeHotelDescription } from "@/lib/html/sanitize";
import { getSiteUrl } from "@/lib/mvp/site";

import { BookingWidget } from "./_components/booking-widget";
import { RoomsSection } from "./_components/rooms-section";

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
      { "@type": "ListItem", position: 2, name: "Hotele", item: `${siteUrl}/hotele` },
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

  // Photo gallery (top 6)
  const photos = (detail.hotelImages ?? [])
    .map((p) => p.urlHd ?? p.url)
    .filter((u): u is string => Boolean(u))
    .slice(0, 6);
  if (photos.length === 0 && detail.main_photo) photos.push(detail.main_photo);

  return (
    <main className="min-h-screen bg-neutral-50 pb-24 lg:pb-0">
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
          <li><Link href="/hotele" className="hover:text-emerald-700">Hotele</Link></li>
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

      {/* Photo gallery */}
      <section className="mx-auto max-w-7xl px-4 pt-4">
        {photos.length > 0 ? (
          <div className="grid h-[260px] grid-cols-4 grid-rows-2 gap-2 overflow-hidden rounded-2xl sm:h-[420px]">
            <div className="relative col-span-4 row-span-2 sm:col-span-2">
              <Image
                src={photos[0]}
                alt={detail.name}
                fill
                sizes="(max-width: 640px) 100vw, 50vw"
                className="object-cover"
                priority
                fetchPriority="high"
              />
            </div>
            {photos.slice(1, 5).map((url, i) => (
              <div key={i} className="relative hidden sm:block">
                <Image
                  src={url}
                  alt={`${detail.name} – zdjęcie ${i + 2}`}
                  fill
                  sizes="(max-width: 1024px) 50vw, 25vw"
                  loading="lazy"
                  className="object-cover"
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-64 items-center justify-center rounded-2xl bg-neutral-200 text-neutral-400">
            Brak zdjęć
          </div>
        )}
      </section>

      <section className="mx-auto max-w-7xl px-4 py-6">
        <header>
          <h1 className="text-2xl font-bold text-neutral-900 sm:text-3xl">{detail.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-neutral-600">
            {detail.stars ? <span className="text-amber-500">{"★".repeat(Math.round(detail.stars))}</span> : null}
            <span>
              {[detail.address, detail.city, detail.country].filter(Boolean).join(", ")}
            </span>
            {detail.rating ? (
              <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                Ocena gości: {detail.rating.toFixed(1)}
              </span>
            ) : null}
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
                const sanitized = sanitizeHotelDescription(detail.hotelDescription ?? detail.description);
                if (sanitized) {
                  return (
                    <div
                      className="mt-3 space-y-3 text-sm leading-relaxed text-neutral-700 [&_p]:mt-0 [&_strong]:font-semibold [&_strong]:text-neutral-900 [&_em]:italic [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mt-1"
                      dangerouslySetInnerHTML={{ __html: sanitized }}
                    />
                  );
                }
                return (
                  <p className="mt-3 text-sm text-neutral-500">Opis hotelu nie jest dostępny u dostawcy.</p>
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
