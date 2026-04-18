import { NextResponse } from "next/server";

export const runtime = "edge";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    if (process.env.NODE_ENV === "production") {
      console.log("[web-vitals]", JSON.stringify(payload));
    }
  } catch {
    // ignore malformed payloads
  }
  return NextResponse.json({ ok: true });
}
