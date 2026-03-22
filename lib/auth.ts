import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("JWT_SECRET environment variable is required in production. Set it in Portainer.");
    }
    return new TextEncoder().encode("dev-secret-change-in-production");
  }
  return new TextEncoder().encode(secret);
}

const COOKIE_NAME = "gt_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export interface SessionPayload {
  userId: string;
  familyId: string | null;
  role: string;
  name: string;
  email: string;
}

// Password hashing
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// JWT (jose — Edge + Node compatible)
export async function signToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .setIssuedAt()
    .sign(getJwtSecret());
}

export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

// Cookie helpers (server-side, App Router)
export async function setSessionCookie(payload: SessionPayload): Promise<void> {
  const token = await signToken(payload);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getSessionFromCookies(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

// For use in API route handlers and middleware (reads from Request directly)
export async function getSessionFromRequest(request: Request): Promise<SessionPayload | null> {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;

  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (!match) return null;

  return verifyToken(decodeURIComponent(match[1]));
}

// Read session from middleware-injected headers (preferred in route handlers)
export function getSessionFromHeaders(request: Request): SessionPayload | null {
  const userId = request.headers.get("x-user-id");
  const familyId = request.headers.get("x-family-id") || null;
  const role = request.headers.get("x-user-role");

  if (!userId || !role) return null;

  // We don't have name/email in headers — return minimal payload
  return { userId, familyId, role, name: "", email: "" };
}

// Convenience helpers for route handlers (read from middleware-injected headers)
export function getFamilyId(request: Request): string | null {
  const id = request.headers.get("x-family-id");
  return id && id.length > 0 ? id : null;
}

export function getUserId(request: Request): string | null {
  return request.headers.get("x-user-id") || null;
}

// Personal prefs helpers
export function parseWatchlist(raw: string | null): number[] {
  try {
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function parseTargetPrices(raw: string | null): Record<string, number> {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
