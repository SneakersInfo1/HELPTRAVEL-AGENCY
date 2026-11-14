import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { MonthTemplate } from "@/components/editorial/month-template";
import { EDITOR_IN_CHIEF, personSchema } from "@/lib/mvp/authors";
import { findCommercialCityByDestinationId } from "@/lib/mvp/commercial-cities";
import { getComparisonsForDestination } from "@/lib/mvp/comparisons";
import { getAllDestinationProfiles } from "@/lib/mvp/destinations";
import { isPolishMonthSlug, polishMonthLabels, polishMonthSlugs, type PolishMonthSlug } from "@/lib/mvp/months";
import { getDestinationGuideBySlug } from "@/lib/mvp/publisher-content";
import { getSiteUrl } from "@/lib/mvp/site";
import { addDaysToIsoDate } from "@/lib/mvp/travel-dates";
import { destinationDisplayName } from "@/lib/seo/destination-facts";
import { buildMonthPageModel } from "@/lib/seo/month-page-model";
import { socialMeta } from "@/lib/seo/social-meta";

export const revalidate = 86400;

interface PageProps {
  params: Promise<{ slug: string; miesiac: string }>;
}

// Układ: components/editorial/month-template.tsx. Liczby wyłącznie z modelu
// (lib/seo/month-page-model.ts, czyli z bramki faktów). CTA do produktu idą
// przez SeoCtaLink z typTresci="month_page" (w szablonie).

export async function generateStaticParams() {
  const destinations = getAllDestinationProfiles();
  return destinations.flatMap((destination) => polishMonthSlugs.map((miesiac) => ({ slug: destination.slug, miesiac })));
}

// Data zameldowania w wybranym miesiącu: dziesiąty dzień bieżącego roku,
// jeśli zostały co najmniej trzy dni, w przeciwnym razie następnego roku.
function monthCheckinIso(monthIndex: number): string {
  const now = new Date();
  const tenthThisYear = Date.UTC(now.getUTCFullYear(), monthIndex, 10);
  const useNextYear = tenthThisYear < now.getTime() + 3 * 24 * 60 * 60 * 1000;
  const year = useNextYear ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-10`;
}

function modelFor(slug: string, month: PolishMonthSlug) {
  const guide = getDestinationGuideBySlug(slug);
  if (!guide) return null;
  const model = buildMonthPageModel({
    profile: guide.destination,
    overview: guide.overview,
    month,
    baseUrl: getSiteUrl(),
    author: personSchema(EDITOR_IN_CHIEF),
  });
  return { guide, model };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, miesiac } = await params;
  if (!isPolishMonthSlug(miesiac)) return { title: "Kierunek" };
  const found = modelFor(slug, miesiac);
  if (!found) return { title: "Kierunek" };
  const { model } = found;
  const path = `/kierunki/${slug}/${miesiac}`;

  return {
    title: model.text.title,
    description: model.text.description,
    robots: model.indexable ? undefined : { index: false, follow: true },
    alternates: { canonical: path },
    ...socialMeta({ title: model.text.ogTitle, description: model.text.description, path, type: "article", ownImage: true }),
    other: {
      "article:section": `Kierunki - ${polishMonthLabels[miesiac]}`,
      "article:tag": `${model.facts.name}, ${model.facts.countryName}, hotele${model.weather ? ", pogoda" : ""}`,
    },
  };
}

export default async function MonthlyDestinationPage({ params }: PageProps) {
  const { slug, miesiac } = await params;
  if (!isPolishMonthSlug(miesiac)) notFound();
  const found = modelFor(slug, miesiac);
  if (!found) notFound();
  const { guide, model } = found;

  // Klucze wyszukiwarki pozostają po angielsku: oczekuje ona nazw z profilu.
  const checkin = monthCheckinIso(model.monthIndex);
  const hotelHref = `/hotele/szukaj?${new URLSearchParams({
    destination: guide.destination.city,
    country: guide.destination.country,
    checkin,
    checkout: addDaysToIsoDate(checkin, 4),
    adults: "2",
    rooms: "1",
  }).toString()}`;

  const commercialCity = findCommercialCityByDestinationId(model.slug);
  const comparisonLinks = getComparisonsForDestination(slug).flatMap((pair) => {
    const a = getDestinationGuideBySlug(pair.a);
    const b = getDestinationGuideBySlug(pair.b);
    if (!a || !b) return [];
    const nameA = pair.labelA ?? destinationDisplayName(a.destination);
    const nameB = pair.labelB ?? destinationDisplayName(b.destination);
    return [{ href: `/porownanie/${pair.slug}`, label: `${nameA} czy ${nameB}` }];
  });

  return (
    <MonthTemplate
      model={model}
      overview={guide.overview}
      hotelHref={hotelHref}
      cityHotels={
        commercialCity
          ? { href: `/hotele/w/${commercialCity.slug}`, label: `Hotele ${commercialCity.preposition} ${commercialCity.cityLocative}` }
          : null
      }
      comparisonLinks={comparisonLinks.slice(0, 6)}
    />
  );
}
