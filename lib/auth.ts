import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";
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

// JWT
export function signToken(payload: SessionPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as SessionPayload;
  } catch {
    return null;
  }
}

// Cookie helpers (server-side, App Router)
export async function setSessionCookie(payload: SessionPayload): Promise<void> {
  const token = signToken(payload);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
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

// For use in API route handlers (reads from Request directly)
export function getSessionFromRequest(request: Request): SessionPayload | null {
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
