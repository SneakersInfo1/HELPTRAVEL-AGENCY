import { PlannerClient } from "@/components/mvp/planner-client";

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

