// @deprecated Sesja C — /planner has been removed. Discovery mode is folded
// into /hotele/szukaj. Endpoint kept as 410 Gone for stale bookmarks.

import { NextResponse } from "next/server";

export const runtime = "nodejs";

const GONE_PAYLOAD = {
  error: "endpoint_gone",
  message:
    "Endpoint /api/discovery został wycofany. Użyj /hotele/szukaj (unified hotels + flights).",
  replacement: "/hotele/szukaj",
};

export async function POST() {
  return NextResponse.json(GONE_PAYLOAD, { status: 410 });
}

export async function GET() {
  return NextResponse.json(GONE_PAYLOAD, { status: 410 });
}
