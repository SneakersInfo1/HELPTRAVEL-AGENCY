import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActivityOffersPanel } from "@/components/mvp/activity-offers-panel";
import { DestinationAttractionsPanel } from "@/components/mvp/destination-attractions-panel";
import { FlightOffersPanel } from "@/components/mvp/flight-offers-panel";
import { StayOffersPanel } from "@/components/mvp/stay-offers-panel";
import { TransferOffersPanel } from "@/components/mvp/transfer-offers-panel";
import { getAffiliateBrandLabel } from "@/lib/mvp/affiliate-brand";
import { buildAffiliateLinksWithContext } from "@/lib/mvp/affiliate-links";
import { getDestinationMedia } from "@/lib/mvp/commercial-assets";
import { getDestinationStory } from "@/lib/mvp/destination-content";
import { resolveDestinationMedia } from "@/lib/mvp/pexels-media";
import { buildRedirectHref } from "@/lib/mvp/providers";
import { defaultTravelStartDate, formatShortDate, normalizeTravelEndDate } from "@/lib/mvp/travel-dates";
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
  const snapshot = trip.snapshot;
  const tripOriginCity = snapshot?.originCity || "Warszawa";
  const tripTravelers = snapshot?.travelers ?? 2;
  const tripRooms = snapshot?.rooms ?? 1;
  const tripStartDate = snapshot?.travelStartDate || defaultTravelStartDate();
  const tripNights = snapshot?.travelNights ?? 4;
  const tripCheckOutDate = normalizeTravelEndDate(tripStartDate, snapshot?.travelEndDate, tripNights);
  const plannerParams = new URLSearchParams({
    mode: snapshot?.mode ?? trip.mode,
    q: snapshot?.mode === "discovery" ? snapshot.query : snapshot?.destinationHint || trip.city,
    origin: tripOriginCity,
    destination: snapshot?.destinationHint || trip.city,
    startDate: tripStartDate,
    endDate: tripCheckOutDate,
    nights: String(tripNights),
    travelers: String(tripTravelers),
    budget: String(snapshot?.budget ?? trip.estimatedBudgetMax),
    days: String(snapshot?.travelNights ?? tripNights),
  });
  const plannerHref = `/planner?${plannerParams.toString()}`;
  const destinationGuideHref = `/kierunki/${trip.destinationSlug}`;
  const decisionBrief = snapshot?.mode === "discovery" ? snapshot.query : snapshot?.destinationHint || trip.city;
  const contextualAffiliateLinks = buildAffiliateLinksWithContext({
    city: trip.city,
    country: trip.country,
    originCity: tripOriginCity,
    departureDate: tripStartDate,
    checkInDate: tripStartDate,
    checkOutDate: tripCheckOutDate,
    passengers: tripTravelers,
    rooms: tripRooms,
  });

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

  const flightLink = buildTripRedirectHref("flights", contextualAffiliateLinks.flights);
  const stayLink = buildTripRedirectHref("stays", contextualAffiliateLinks.stays);
  const attractionLink = buildTripRedirectHref("attractions", contextualAffiliateLinks.attractions);
  const carLink = buildTripRedirectHref("cars", contextualAffiliateLinks.cars);
  const flightPartner = getAffiliateBrandLabel(contextualAffiliateLinks.flights, "Partner lotniczy");
  const stayPartner = getAffiliateBrandLabel(contextualAffiliateLinks.stays, "Partner hotelowy");
  const attractionPartner = getAffiliateBrandLabel(contextualAffiliateLinks.attractions, "Partner atrakcji");
  const carPartner = getAffiliateBrandLabel(contextualAffiliateLinks.cars, "Partner aut");

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
        <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4 sm:p-6">
          <div className="rounded-2xl bg-emerald-50/75 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Wynik</p>
            <p className="mt-1 text-2xl font-bold text-emerald-950">{trip.score.toFixed(0)}</p>
          </div>
          <div className="rounded-2xl bg-emerald-50/75 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Klimat miejsca</p>
            <p className="mt-1 text-sm font-semibold text-emerald-950">{story.vibe}</p>
          </div>
          <div className="rounded-2xl bg-emerald-50/75 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Termin</p>
            <p className="mt-1 text-sm font-semibold text-emerald-950">
              {formatShortDate(tripStartDate, "pl-PL")} - {formatShortDate(tripCheckOutDate, "pl-PL")}
            </p>
          </div>
          <div className="rounded-2xl bg-emerald-50/75 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Sklad podrozy</p>
            <p className="mt-1 text-sm font-semibold text-emerald-950">
              {tripOriginCity} / {tripTravelers} os. / {tripRooms} {tripRooms === 1 ? "pokoj" : tripRooms < 5 ? "pokoje" : "pokoi"}
            </p>
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
        <StayOffersPanel
          destinationCity={trip.city}
          destinationCountry={trip.country}
          checkInDate={tripStartDate}
          checkOutDate={tripCheckOutDate}
          guests={tripTravelers}
          rooms={tripRooms}
        />
        <FlightOffersPanel
          destinationCity={trip.city}
          destinationCountry={trip.country}
          originCity={tripOriginCity}
          departureDate={tripStartDate}
          returnDate={tripCheckOutDate}
          passengers={tripTravelers}
          partnerUrl={contextualAffiliateLinks.flights}
        />
      </div>

      <DestinationAttractionsPanel city={trip.city} country={trip.country} />
      <ActivityOffersPanel
        destinationCity={trip.city}
        destinationCountry={trip.country}
        fromDate={tripStartDate}
        toDate={tripCheckOutDate}
        travelers={tripTravelers}
      />
      <TransferOffersPanel
        destinationCity={trip.city}
        destinationCountry={trip.country}
        outboundDate={tripStartDate}
        adults={tripTravelers}
      />

      <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] animate-fade-in-up">
        <article className="rounded-[2rem] border border-emerald-900/10 bg-white p-5 shadow-[0_16px_45px_rgba(16,84,48,0.06)]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Jak zapadl wybor</p>
          <h2 className="mt-2 text-2xl font-bold text-emerald-950">Ten zapisany plan trzyma realny kontekst decyzji.</h2>
          <p className="mt-3 text-sm leading-7 text-emerald-900/78">
            {snapshot?.mode === "discovery"
              ? `Brief startowy: ${decisionBrief}`
              : `Wybrany kierunek startowy: ${decisionBrief}.`}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-950">
              {formatShortDate(tripStartDate, "pl-PL")} - {formatShortDate(tripCheckOutDate, "pl-PL")}
            </span>
            <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-950">
              {tripOriginCity} / {tripTravelers} os. / {tripRooms} {tripRooms === 1 ? "pokoj" : tripRooms < 5 ? "pokoje" : "pokoi"}
            </span>
            <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-950">
              Budzet do ok. {trip.estimatedBudgetMax} PLN
            </span>
          </div>
          <div className="mt-5 space-y-3">
            {trip.reasons.length > 0 ? (
              trip.reasons.map((reason) => (
                <div key={reason} className="rounded-2xl bg-emerald-50/70 px-4 py-3 text-sm leading-6 text-emerald-900/82">
                  {reason}
                </div>
              ))
            ) : (
              <div className="rounded-2xl bg-emerald-50/70 px-4 py-3 text-sm leading-6 text-emerald-900/82">
                To miasto wygralo glownie przez ogolne dopasowanie do terminu, budzetu i logistyki wyjazdu.
              </div>
            )}
          </div>
        </article>

        <article className="rounded-[2rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-5 shadow-[0_16px_45px_rgba(16,84,48,0.06)]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Co dalej</p>
          <h2 className="mt-2 text-2xl font-bold text-emerald-950">Mozesz wrocic do decyzji albo od razu przejsc dalej do rezerwacji.</h2>
          <p className="mt-3 text-sm leading-7 text-emerald-900/78">
            Ranking nie jest przypadkowy. HelpTravel laczy klimat, budzet, latwosc dojazdu i sens dlugosci wyjazdu,
            a dopiero potem prowadzi do partnerow z zachowaniem tego samego kontekstu podrozy.
          </p>
          <div className="mt-4 rounded-2xl bg-white px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Na co uwazac</p>
            <div className="mt-2 space-y-2 text-sm leading-6 text-emerald-900/78">
              {trip.tradeoffs.length > 0 ? (
                trip.tradeoffs.map((tradeoff) => <p key={tradeoff}>{tradeoff}</p>)
              ) : (
                <p>Najwieksze ryzyko na tym etapie to juz nie wybor kierunku, tylko ustawienie dobrego terminu i partnera pod ten sam plan.</p>
              )}
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href={plannerHref} className="rounded-full bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-800">
              Edytuj ten plan
            </Link>
            <Link href={destinationGuideHref} className="rounded-full border border-emerald-900/12 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-50">
              Otworz przewodnik kierunku
            </Link>
          </div>
        </article>
      </section>

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
          <Link href={plannerHref} className="rounded-full border border-emerald-900/12 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-950 hover:bg-emerald-50">
            Wroc do planera
          </Link>
        </div>
      </section>
    </main>
  );
}
