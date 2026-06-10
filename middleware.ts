import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Basic auth for the whole app (pages + API).
// Enabled when BASIC_AUTH_USER and BASIC_AUTH_PASS are set in the environment;
// if they are missing the middleware is a no-op so existing deploys keep working
// until credentials are configured.
export function middleware(request: NextRequest) {
  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASS;

  if (!user || !pass) {
    return NextResponse.next();
  }

  const header = request.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    try {
      const [givenUser, givenPass] = atob(header.slice(6)).split(":");
      if (safeEqual(givenUser ?? "", user) && safeEqual(givenPass ?? "", pass)) {
        return NextResponse.next();
      }
    } catch {
      // fall through to 401
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Grocery Tracker"' },
  });
}

// Constant-time string comparison to avoid leaking credential length/content via timing.
function safeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  let diff = bufA.length ^ bufB.length;
  const len = Math.max(bufA.length, bufB.length);
  for (let i = 0; i < len; i++) {
    diff |= (bufA[i] ?? 0) ^ (bufB[i] ?? 0);
  }
  return diff === 0;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
