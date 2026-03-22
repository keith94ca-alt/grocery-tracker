# Security Fixes — 2026-03-22

## Background
Security audit run against ss.keithkas.cc. All fixes applied to `grocery-users` branch.

---

## Fix 1 — JWT_SECRET missing in production (Critical → Fixed)
**File:** `docker-compose.yml`, `docker-compose-test.yml`  
**Issue:** `JWT_SECRET` env var not set. In production, `auth.ts` threw an error causing login to return 500.  
**Fix:** Added `JWT_SECRET` to both compose files.  
**Note:** ⚠️ Rotate the key in the compose files — it was briefly exposed in chat. Generate a new one with `openssl rand -base64 32`.

---

## Fix 2 — JWT using `jsonwebtoken` (incompatible with Edge runtime) (Critical → Fixed)
**File:** `lib/auth.ts`  
**Issue:** `jsonwebtoken` uses Node.js crypto APIs which are not available in Next.js Edge runtime (where `middleware.ts` runs). `verifyToken` always returned null in middleware, making `/api/auth/me` return 401 for every authenticated user.  
**Fix:** Replaced `jsonwebtoken` with `jose` (Web Crypto API, Edge + Node compatible). Also made `getSessionFromRequest` async to support `await jwtVerify`.

---

## Fix 3 — JWT payload contained PII (Low → Fixed)
**File:** `lib/auth.ts`  
**Issue:** JWT token stored `name` and `email` in the payload. Since JWTs are base64-encoded (not encrypted), anyone who reads the cookie can decode the user's name and email without making any API call.  
**Fix:** Stripped `name` and `email` from JWT claims. Token now only contains `userId`, `familyId`, `role`, `iat`, `exp`.

---

## Fix 4 — IDOR on `/api/items/[id]` (High → Fixed)
**File:** `app/api/items/[id]/route.ts`  
**Issue:** GET, PATCH, DELETE on items looked up by numeric ID only, with no check that the item belongs to the requesting user's family. Any authenticated user could read, modify, or delete any item by guessing the ID.  
**Fix:** Added `familyId` ownership check on all three methods. Returns 404 (not 403) to avoid leaking existence of other families' data.

---

## Fix 5 — IDOR on `/api/prices/[id]` (High → Fixed)
**File:** `app/api/prices/[id]/route.ts`  
**Issue:** DELETE on price entries had no family ownership check.  
**Fix:** Added `familyId` check before delete.

---

## Fix 6 — IDOR on `/api/shopping-list/[id]` (High → Fixed)
**File:** `app/api/shopping-list/[id]/route.ts`  
**Issue:** PATCH and DELETE on shopping list items had no family ownership check.  
**Fix:** Added `familyId` check on both methods.

---

## Fix 7 — Unauthenticated `/api/flyer-dismissed` endpoint (Medium → Fixed)
**File:** `app/api/flyer-dismissed/route.ts`  
**Issue:** GET, POST, and DELETE had no auth or family scoping. Any unauthenticated user could read or clear dismissed flyer matches for all families.  
**Fix:** Added `getFamilyId` scoping on all three methods. Data is now filtered and written per family.

---

## Fix 8 — Unauthenticated `/api/flyer-notes` endpoint (Medium → Fixed)
**File:** `app/api/flyer-notes/route.ts`  
**Issue:** GET and POST had no family scoping. Any authenticated user could read or write flyer notes for any family.  
**Fix:** Added `getFamilyId` scoping on both methods. Items and notes are now created and queried within the correct family.

---

## Fix 9 — `sameSite: strict` cookie (Low → Fixed)
**File:** `lib/auth.ts`  
**Issue:** `SameSite=Strict` caused the cookie to be dropped on cross-origin redirects (e.g. after OAuth or external links redirecting back to the app). Combined with the Edge runtime JWT issue, this made auth completely broken.  
**Fix:** Changed to `SameSite=Lax` which is the correct default for session cookies.

---

## What Was Tested and Passed
- SQL injection — not possible (Prisma parameterized queries)
- Header spoofing (`x-user-id`, `x-user-role`) — stripped by middleware
- Brute force — rate limiter blocks at attempt 7 (429)
- Unauthenticated API access — all protected routes return 401
- Password hash exposure — never returned in any API response
- Negative prices — validated and rejected
- Oversized imports — blocked at Cloudflare edge
- Register without invite — correctly blocked
- Path traversal — not applicable (Prisma never uses user input in file paths)
- Mass assignment on role via `/api/auth/me` PATCH — `role` field is not in the allowed update set

---

## Remaining Known Limitations
- **Rate limiter is in-memory** — resets on container restart/redeploy. Acceptable for single-instance personal app. A Redis-backed limiter would be needed at scale.
- **No CSRF tokens** — `SameSite=Lax` provides reasonable protection for a JSON API. Low risk.
