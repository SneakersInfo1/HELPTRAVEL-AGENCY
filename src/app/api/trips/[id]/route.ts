import { NextRequest, NextResponse } from "next/server";

import { getTrip } from "@/lib/mvp/service";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_: NextRequest, { params }: Params) {
  const resolvedParams = await params;
  const trip = await getTrip(resolvedParams.id);
  if (!trip) {
    return NextResponse.json({ error: "Trip not found" }, { status: 404 });
  }
  return NextResponse.json({ trip });
}

