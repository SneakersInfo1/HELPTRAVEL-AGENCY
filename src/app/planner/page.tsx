import type { Metadata } from "next";

import { PlannerClient } from "@/components/mvp/planner-client";

export const metadata: Metadata = {
  title: "Planer wyjazdu",
  description:
    "Wyszukaj kierunek po potrzebie albo wpisz konkretne miasto. Planer porzadkuje scenariusz i prowadzi do realnych wynikow.",
  alternates: {
    canonical: "/planner",
  },
};

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
    style?: string;
  }>;
}

export default async function PlannerPage({ searchParams }: PlannerPageProps) {
  const params = await searchParams;
  const mode = params.mode === "standard" ? "standard" : "discovery";
  const query = params.q ?? "";
  const origin = params.origin ?? "";
  const destination = params.destination ?? "";
  const travelers = Number(params.travelers ?? 2);
  const budget = Number(params.budget ?? 2500);
  const days = Number(params.days ?? 4);
  const nights = Number(params.nights ?? params.days ?? 4);
  const startDate = params.startDate ?? "";
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
      initialNights={Number.isFinite(nights) ? nights : 4}
      initialStyle={style}
      autoRunStandardSearch={mode === "standard" && Boolean(destination || query)}
    />
  );
}
