import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

function stripEnPrefix(pathname: string) {
  if (pathname === "/en") {
    return "/";
  }

  if (pathname.startsWith("/en/")) {
    return pathname.slice(3) || "/";
  }

  return pathname;
}

// Sesja C: /planner is a dead route (replaced by /hotele/szukaj which now
// composes hotels + flights from real LiteAPI + Travelpayouts data).
// Old /planner URLs are bookmarkable — issue 308 with query params preserved.
function isPlannerPath(pathname: string): boolean {
  return (
    pathname === "/planner" ||
    pathname.startsWith("/planner/") ||
    pathname === "/en/planner" ||
    pathname.startsWith("/en/planner/")
  );
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isPlannerPath(pathname)) {
    const nextUrl = request.nextUrl.clone();
    nextUrl.pathname = "/hotele/szukaj";
    nextUrl.search = search;
    return NextResponse.redirect(nextUrl, 308);
  }

  if (pathname === "/en" || pathname.startsWith("/en/")) {
    const nextUrl = request.nextUrl.clone();
    nextUrl.pathname = stripEnPrefix(pathname);
    nextUrl.search = search;
    return NextResponse.redirect(nextUrl, 308);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/en", "/en/:path*", "/planner", "/planner/:path*"],
};
