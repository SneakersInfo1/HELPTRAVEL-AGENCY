import { NextResponse } from "next/server";

import { getAnalyticsSummary } from "@/lib/mvp/analytics";

export async function GET() {
  const summary = await getAnalyticsSummary();
  return NextResponse.json(summary);
}

