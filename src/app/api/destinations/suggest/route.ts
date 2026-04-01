import { NextRequest, NextResponse } from "next/server";

import { getDestinationSuggestions } from "@/lib/mvp/destination-suggestions";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") ?? "";
  const items = await getDestinationSuggestions(query);

  return NextResponse.json(
    { items },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
