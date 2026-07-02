// /wyjazdy/[typ] — mood / scenario landing pages behind the homepage chips
// (Plaża, City break, Góry, Kultura, Budżet, Słońce zimą). Data-driven from the
// curated destination scores; SEO-rich and statically generated for the known
// moods only.

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { MoodLanding } from "@/components/publisher/mood-landing";
import { TRAVEL_MOODS, getMoodBySlug } from "@/lib/mvp/travel-moods";
import { getSiteUrl } from "@/lib/mvp/site";

// 1 h (było 24 h): karty pokazują ceny ze snapshotu crona (30 min) — doba
// trzymałaby nieświeże ceny na widoku mimo świeżych danych w Redis.
export const revalidate = 3600;
export const dynamicParams = false;

interface PageProps {
  params: Promise<{ typ: string }>;
}

export function generateStaticParams() {
  return TRAVEL_MOODS.map((m) => ({ typ: m.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { typ } = await params;
  const mood = getMoodBySlug(typ);
  if (!mood) return { title: "Pomysły na wyjazd | HelpTravel" };
  return {
    title: mood.metaTitle,
    description: mood.metaDescription,
    alternates: { canonical: `/wyjazdy/${mood.slug}` },
    openGraph: {
      title: mood.metaTitle,
      description: mood.metaDescription,
      url: `${getSiteUrl()}/wyjazdy/${mood.slug}`,
      type: "website",
    },
  };
}

export default async function MoodPage({ params }: PageProps) {
  const { typ } = await params;
  const mood = getMoodBySlug(typ);
  if (!mood) notFound();
  return <MoodLanding slug={typ} />;
}
