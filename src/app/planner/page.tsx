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
  }>;
}

export default async function PlannerPage({ searchParams }: PlannerPageProps) {
  const params = await searchParams;
  const mode = params.mode === "standard" ? "standard" : "discovery";
  const query = params.q ?? "";

  return <PlannerClient initialMode={mode} initialQuery={query} />;
}
