import { NextResponse } from "next/server";

import { createId } from "./db";

export const SESSION_COOKIE_NAME = "ht_session_id";

export function resolveSessionId(current: string | undefined | null): {
  sessionId: string;
  isNew: boolean;
} {
  if (current && current.length > 8) {
    return { sessionId: current, isNew: false };
  }

  return {
    sessionId: createId("sess"),
    isNew: true,
  };
}

export function attachSessionCookie(response: NextResponse, sessionId: string): void {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: sessionId,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });
}

