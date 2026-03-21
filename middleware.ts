import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";

// Paths that don't require authentication
const PUBLIC_API_PATHS = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/logout",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Login/register pages are public (client-side auth guard handles page-level redirects)
  // Only enforce auth at the API layer via this middleware
  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Allow public auth endpoints
  if (PUBLIC_API_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Strip any client-supplied spoofed session headers, then inject validated values
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete("x-user-id");
  requestHeaders.delete("x-family-id");
  requestHeaders.delete("x-user-role");
  requestHeaders.set("x-user-id", session.userId);
  requestHeaders.set("x-family-id", session.familyId ?? "");
  requestHeaders.set("x-user-role", session.role);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: "/api/:path*",
};
