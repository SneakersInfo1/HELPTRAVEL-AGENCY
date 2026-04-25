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

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname === "/en" || pathname.startsWith("/en/")) {
    const nextUrl = request.nextUrl.clone();
    nextUrl.pathname = stripEnPrefix(pathname);
    nextUrl.search = search;
    return NextResponse.redirect(nextUrl, 308);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/en", "/en/:path*"],
};
