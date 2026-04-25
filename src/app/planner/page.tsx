import type { Metadata } from "next";

import { PlannerClient } from "@/components/mvp/planner-client";
import { type SiteLocale } from "@/lib/mvp/locale";
import { countNightsBetweenIsoDates } from "@/lib/mvp/travel-dates";

export function getPlannerMetadata(locale: SiteLocale): Metadata {
  const isEnglish = locale === "en";

  return {
    title: isEnglish
      ? "Trip planner - choose a destination, dates and the next steps"
      : "Planner wyjazdu - wybierz kierunek, termin i kolejne kroki",
    description: isEnglish
      ? "Enter a destination or describe the trip you want. Then move into stays, flights and the next travel steps."
      : "Wpisz kierunek albo opisz, jakiego wyjazdu szukasz. Potem przejdź do noclegów, lotów i dalszych kroków.",
    alternates: {
      canonical: "/planner",
    },
    robots: isEnglish
      ? {
          index: false,
          follow: true,
        }
      : undefined,
    openGraph: {
      title: isEnglish
        ? "Trip planner - choose a destination and keep planning"
        : "Planner wyjazdu - wybierz kierunek i planuj dalej",
      description: isEnglish
        ? "Set city, dates and travelers, then move into stays, flights and useful extras."
        : "Ustaw miasto, termin i liczbę osób, a potem przejdź do noclegów, lotów i dodatków.",
      url: locale === "en" ? "/en/planner" : "/planner",
      type: "website",
    },
  };
}

export const metadata: Metadata = getPlannerMetadata("pl");

interface PlannerPageProps {
  searchParams: Promise<{
    mode?: string;
    q?: string;
    origin?: string;
    destination?: string;
    travelers?: string;
    budget?: string;
    days?: string;
    nights?: string;
    startDate?: string;
    endDate?: string;
    style?: string;
  }>;
}

export async function PlannerPageView({ searchParams, locale }: PlannerPageProps & { locale: SiteLocale }) {
  const params = await searchParams;
  const mode = params.mode === "standard" ? "standard" : "discovery";
  const query = params.q ?? "";
  const origin = params.origin ?? "";
  const destination = params.destination ?? "";
  const travelers = Number(params.travelers ?? 2);
  const budget = Number(params.budget ?? 2500);
  const days = Number(params.days ?? 4);
  const startDate = params.startDate ?? "";
  const derivedNightsFromRange = startDate && params.endDate ? countNightsBetweenIsoDates(startDate, params.endDate, 4) : Number.NaN;
  const nights = Number.isFinite(derivedNightsFromRange)
    ? derivedNightsFromRange
    : Number(params.nights ?? params.days ?? 4);
  const endDate = params.endDate ?? "";
  const style = params.style ?? "city break";

  return (
    <PlannerClient
      initialMode={mode}
      initialQuery={query}
      initialOriginCity={origin}
      initialDestinationHint={destination}
      initialTravelers={Number.isFinite(travelers) ? travelers : 2}
      initialBudget={Number.isFinite(budget) ? budget : 2500}
      initialStandardDays={Number.isFinite(days) ? days : 4}
      initialStartDate={startDate || undefined}
      initialEndDate={endDate || undefined}
      initialNights={Number.isFinite(nights) ? nights : 4}
      initialStyle={style}
      autoRunStandardSearch={mode === "standard" && Boolean(destination || query)}
      locale={locale}
    />
  );
}

export default async function PlannerPage({ searchParams }: PlannerPageProps) {
  return PlannerPageView({ searchParams, locale: "pl" });
}

