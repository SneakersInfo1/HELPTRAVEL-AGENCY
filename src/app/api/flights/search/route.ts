import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "Feed lotow z Duffel zostal usuniety. W tej chwili loty obslugujemy przez partnera outbound, a shortlisty ofert wrocą po podpieciu nowego API lotniczego.",
    },
    {
      status: 410,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
