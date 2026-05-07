// @deprecated Sesja C — /planner has been removed. The unified results page
// is /hotele/szukaj which composes hotels (LiteAPI) + flights (Travelpayouts)
// directly. This endpoint is preserved as 410 Gone for the small number of
// external bookmarks that may still exist.

import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    {
      error: "endpoint_gone",
      message:
        "Endpoint /api/standard został wycofany. Użyj /hotele/szukaj (unified hotels + flights).",
      replacement: "/hotele/szukaj",
    },
    { status: 410 },
  );
}

export async function GET() {
  return NextResponse.json(
    {
      error: "endpoint_gone",
      message:
        "Endpoint /api/standard został wycofany. Użyj /hotele/szukaj (unified hotels + flights).",
      replacement: "/hotele/szukaj",
    },
    { status: 410 },
  );
}
