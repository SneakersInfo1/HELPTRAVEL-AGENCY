import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "W tym widoku loty otwieramy bezpośrednio u partnera rezerwacyjnego.",
    },
    {
      status: 410,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
