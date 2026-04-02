import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActivityOffersPanel } from "@/components/mvp/activity-offers-panel";
import { DestinationAttractionsPanel } from "@/components/mvp/destination-attractions-panel";
import { FlightOffersPanel } from "@/components/mvp/flight-offers-panel";
import { StayOffersPanel } from "@/components/mvp/stay-offers-panel";
import { TransferOffersPanel } from "@/components/mvp/transfer-offers-panel";
import { TravelPackagePanel } from "@/components/mvp/travel-package-panel";
import { getAffiliateBrandLabel } from "@/lib/mvp/affiliate-brand";
import { getDestinationMedia } from "@/lib/mvp/commercial-assets";
import { getDestinationStory } from "@/lib/mvp/destination-content";
import { resolveDestinationMedia } from "@/lib/mvp/pexels-media";
import { buildRedirectHref } from "@/lib/mvp/providers";
import { getTrip } from "@/lib/mvp/service";

export const metadata: Metadata = {
  title: "Plan podrozy",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

interface TripDetailsPageProps {
  params: Promise<{ id: string }>;
}

export default async function TripDetailsPage({ params }: TripDetailsPageProps) {
  const resolved = await params;
  const trip = await getTrip(resolved.id);
  if (!trip) notFound();

  const fallbackDestination = {
    id: trip.destinationSlug,
    slug: trip.destinationSlug,
    city: trip.city,
    country: trip.country,
    visaForPL: true,
    avgTempByMonth: [],
    costIndex: 1,
    beachScore: 0.5,
    cityScore: 0.5,
    sightseeingScore: 0.5,
    nightlifeScore: 0.5,
    natureScore: 0.5,
    safetyScore: 0.5,
    accessScore: 0.5,
    typicalFlightHoursFromPL: 0,
    affiliateLinks: trip.affiliateLinks,
  };

  const media = await resolveDestinationMedia(fallbackDestination);
  const destinationWithMedia = { ...fallbackDestination, media };
  const story = getDestinationStory(destinationWithMedia);
  const resolvedMedia = getDestinationMedia(destinationWithMedia);

  const buildTripRedirectHref = (providerKey: "flights" | "stays" | "attractions" | "cars", targetUrl: string) =>
    buildRedirectHref({
      providerKey,
      targetUrl,
      itineraryResultId: trip.itineraryResultId,
      destinationSlug: trip.destinationSlug,
      requestId: trip.requestId,
      city: trip.city,
      country: trip.country,
      source: "trip",
    });

  const flightLink = buildTripRedirectHref("flights", trip.affiliateLinks.flights);
  const stayLink = buildTripRedirectHref("stays", trip.affiliateLinks.stays);
  const attractionLink = buildTripRedirectHref("attractions", trip.affiliateLinks.attractions);
  const carLink = buildTripRedirectHref("cars", trip.affiliateLinks.cars);
  const flightPartner = getAffiliateBrandLabel(trip.affiliateLinks.flights, "Partner lotniczy");
  const stayPartner = getAffiliateBrandLabel(trip.affiliateLinks.stays, "Partner hotelowy");
  const attractionPartner = getAffiliateBrandLabel(trip.affiliateLinks.attractions, "Partner atrakcji");
  const carPartner = getAffiliateBrandLabel(trip.affiliateLinks.cars, "Partner aut");

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <section className="animate-fade-in-up overflow-hidden rounded-[2rem] border border-emerald-900/10 bg-white shadow-[0_20px_60px_rgba(16,84,48,0.08)]">
        <div className="relative h-72 sm:h-96">
          <Image src={resolvedMedia.heroImage} alt={story.name} fill priority className="object-cover" sizes="100vw" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,16,10,0.06)_0%,rgba(6,16,10,0.7)_100%)]" />
          <div className="absolute inset-x-0 bottom-0 p-5 text-white sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">Plan szczegolowy</p>
            <h1 className="mt-2 text-4xl font-bold">
              {trip.city}, {trip.country}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-white/84">{trip.summary}</p>
          </div>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6">
          <div className="rounded-2xl bg-emerald-50/75 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Wynik</p>
            <p className="mt-1 text-2xl font-bold text-emerald-950">{trip.score.toFixed(0)}</p>
          </div>
          <div className="rounded-2xl bg-emerald-50/75 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Klimat miejsca</p>
            <p className="mt-1 text-sm font-semibold text-emerald-950">{story.vibe}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3 animate-fade-in-up">
        {media.gallery.map((image, index) => (
          <div key={`${image}-${index}`} className="relative h-36 overflow-hidden rounded-[1.5rem] border border-emerald-900/10">
            <Image
              src={image}
              alt={`${story.name} ${index + 1}`}
              fill
              className="object-cover transition duration-500 hover:scale-105"
              sizes="(max-width: 640px) 100vw, 33vw"
            />
          </div>
        ))}
      </section>

      <div className="grid gap-5">
        <TravelPackagePanel
          destinationCity={trip.city}
          destinationCountry={trip.country}
          destinationImage={resolvedMedia.heroImage}
          defaultOriginCity="Warszawa"
          defaultPassengers={2}
        />
        <FlightOffersPanel destinationCity={trip.city} destinationCountry={trip.country} defaultOriginCity="Warszawa" passengers={2} />
        <StayOffersPanel destinationCity={trip.city} destinationCountry={trip.country} defaultPassengers={2} />
      </div>

      <DestinationAttractionsPanel city={trip.city} country={trip.country} />
      <ActivityOffersPanel destinationCity={trip.city} destinationCountry={trip.country} defaultTravelers={2} />
      <TransferOffersPanel destinationCity={trip.city} destinationCountry={trip.country} defaultPassengers={2} />

      <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr] animate-fade-in-up">
        <article className="rounded-[2rem] border border-emerald-900/10 bg-white p-5 shadow-[0_16px_45px_rgba(16,84,48,0.06)]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Co zobaczyc</p>
          <h2 className="mt-2 text-2xl font-bold text-emerald-950">Lokalne atrakcje i plan dnia</h2>
          <div className="mt-4 grid gap-3">
            {trip.plan.map((day) => (
              <article key={day.day} className="rounded-2xl bg-emerald-50/70 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Dzien {day.day}</p>
                <h3 className="mt-1 text-sm font-bold text-emerald-950">{day.title}</h3>
                <p className="mt-2 text-sm leading-6 text-emerald-900/82">{day.description}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="grid gap-4">
          <div className="rounded-[2rem] border border-emerald-900/10 bg-white p-5 shadow-[0_16px_45px_rgba(16,84,48,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Dlaczego warto</p>
            <ul className="mt-3 space-y-2 text-sm leading-7 text-emerald-900/82">
              {story.highlights.map((highlight) => (
                <li key={highlight}>• {highlight}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-[2rem] border border-emerald-900/10 bg-white p-5 shadow-[0_16px_45px_rgba(16,84,48,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Dzielnice i jedzenie</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {story.districts.map((district) => (
                <span key={district} className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-900">
                  {district}
                </span>
              ))}
            </div>
            <ul className="mt-4 space-y-2 text-sm leading-7 text-emerald-900/82">
              {story.foodSpots.map((spot) => (
                <li key={spot}>• {spot}</li>
              ))}
            </ul>
          </div>
        </article>
      </section>

      <section className="animate-fade-in-up rounded-[2rem] border border-emerald-900/10 bg-white p-5 shadow-[0_16px_45px_rgba(16,84,48,0.06)]">
        <h2 className="text-xl font-bold text-emerald-950">Przejdz do partnerow</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href={flightLink} target="_blank" rel="noreferrer" className="rounded-full bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800">
            Loty w {flightPartner}
          </a>
          <a href={stayLink} target="_blank" rel="noreferrer" className="rounded-full border border-emerald-900/12 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-950 hover:bg-emerald-50">
            Noclegi w {stayPartner}
          </a>
          <a href={attractionLink} target="_blank" rel="noreferrer" className="rounded-full border border-emerald-900/12 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-950 hover:bg-emerald-50">
            Atrakcje w {attractionPartner}
          </a>
          <a href={carLink} target="_blank" rel="noreferrer" className="rounded-full border border-emerald-900/12 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-950 hover:bg-emerald-50">
            Auta w {carPartner}
          </a>
          <Link href="/planner" className="rounded-full border border-emerald-900/12 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-950 hover:bg-emerald-50">
            Wroc do planera
          </Link>
        </div>
      </section>
    </main>
  );
}
