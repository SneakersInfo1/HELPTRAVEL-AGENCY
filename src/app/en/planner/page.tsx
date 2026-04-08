import type { Metadata } from "next";

import { getPlannerMetadata, PlannerPageView } from "@/app/planner/page";

interface EnglishPlannerPageProps {
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

export const metadata: Metadata = getPlannerMetadata("en");

export default async function EnglishPlannerPage({ searchParams }: EnglishPlannerPageProps) {
  return PlannerPageView({ searchParams, locale: "en" });
}
