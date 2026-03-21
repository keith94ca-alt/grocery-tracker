# User Management & Family Sharing — Phase 2 Plan

## Overview
Add authentication, user accounts, and family/household sharing to the Grocery Price Tracker. Currently a single-user app — this plan outlines the migration to multi-user with shared data.

## Architecture Decisions

| Decision | Rationale |
|---|---|
| Custom JWT auth (not NextAuth) | App is simple, NextAuth v5 is beta, custom gives full control with fewer deps |
| `bcryptjs` (not `bcrypt`) | Pure JS, no native build issues on Alpine Docker |
| `familyId` on every data table | Clean scoping, no joins needed for basic queries |
| JSON blobs for personal prefs | Simple for v1, avoids junction table complexity |
| In-memory rate limiter | Good enough for single-instance Docker deployment |
| Soft delete for families | Prevents accidental data loss |
| httpOnly JWT cookies | PWA-friendly, no localStorage token exposure |

## Auth Strategy
**Custom JWT auth** with httpOnly cookies. No NextAuth.

- `bcryptjs` for password hashing (cost factor 12)
- `jsonwebtoken` for JWT sign/verify
- Cookies: `SameSite=Strict`, `Secure` in production, `httpOnly`
- Session expiry: 7 days
- `middleware.ts` protects all `/api/*` routes except `/api/auth/*`
- `getSession(req)` helper extracts `{ userId, familyId, role }` from JWT

### Bootstrap Flow
- If zero users exist, registration is open (no invite code required)
- First user auto-creates a family and becomes admin
- After that, registration requires a valid invite code

### Rate Limiting
- In-memory rate limiter on `/api/auth/*` endpoints
- IP-based, Map with TTL
- Prevents brute-force on login/register

## Database Schema Changes

```prisma
model User {
  id           String    @id @default(cuid())
  email        String    @unique
  passwordHash String
  name         String
  avatar       String?
  familyId     String?
  role         String    @default("member") // "admin" | "member"
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  family       Family?   @relation(fields: [familyId], references: [id])

  // Personal preferences (JSON blobs)
  targetPrices Json?     // { itemId: targetPrice }
  watchlist    Json?     // [itemId, ...]
}

model Family {
  id              String    @id @default(cuid())
  name            String
  adminId         String    // User who created the family
  inviteCode      String    @unique @default(cuid())
  inviteExpiresAt DateTime? // Invite codes expire after 7 days
  maxMembers      Int       @default(10)
  isActive        Boolean   @default(true) // Soft delete
  createdAt       DateTime  @default(now())

  members         User[]
}
```

### Columns added to existing tables

| Table | New Columns |
|---|---|
| Item | `familyId` (String, required) |
| Store | `familyId` (String, required) |
| PriceEntry | `familyId` (String, required), `userId` (String, optional) |
| ShoppingListItem | `familyId` (String, required), `userId` (String, optional) |
| FlyerNote | `familyId` (String, required) |
| DismissedFlyerMatch | `familyId` (String, required) |

All existing API queries will be scoped by `familyId` from the session.

## Data Sharing Model

### Shared within family (all members see/edit):
- Shopping list items
- Price history (all entries)
- Tracked items
- Stores
- Flyer deal matches

### Personal per user:
- Target prices (each user sets their own, stored on User)
- Watchlist (each user watches different items, stored on User)
- Display preferences (dark mode, etc.)

### Attribution:
- PriceEntry tracks `userId` — shows who logged it
- ShoppingListItem tracks `userId` — shows who added it
- Displayed as initials/avatar, not blocking

## API Routes

### Auth
| Method | Route | Description |
|---|---|---|
| POST | `/api/auth/register` | Create account (bootstrap or invite code) |
| POST | `/api/auth/login` | Login, set JWT cookie |
| POST | `/api/auth/logout` | Clear cookie |
| GET | `/api/auth/me` | Current user profile + family |

### Family Management
| Method | Route | Description |
|---|---|---|
| POST | `/api/family/create` | Create new family |
| POST | `/api/family/join` | Join via invite code |
| POST | `/api/family/invite` | Regenerate invite code (admin) |
| GET | `/api/family` | Family details + members |
| DELETE | `/api/family/members/:id` | Remove member (admin) |
| POST | `/api/family/leave` | Leave family |

## Frontend Pages

| Page | Description |
|---|---|
| `/login` | Email + password login |
| `/register` | Registration with optional invite code |
| `/profile` | Edit name, change password, view family |
| `/family` | Family settings, members, invite code (admin) |

Auth context provider wraps the app — redirects to `/login` if unauthenticated.

## Data Migration Strategy
1. `prisma db push` creates new tables and columns
2. Migration script runs on first boot:
   - Creates seed family ("My Family")
   - Creates seed admin user (from `SEED_EMAIL` / `SEED_PASSWORD` env vars, or prompted)
   - Backfills `familyId` on all existing rows
3. After migration, all existing data belongs to the seed family

## Docker Changes
- New env vars: `JWT_SECRET` (required), `SEED_EMAIL`, `SEED_PASSWORD` (optional, first boot only)
- `docker-entrypoint.sh` already runs `prisma db push` — migration script hooks into this

## Family Management Rules
- Admin can remove members (member's data stays with the family)
- Admin must transfer admin role before leaving
- Invite codes expire after 7 days, admin can regenerate
- Max 10 members per family (configurable)
- Family deletion is soft delete (`isActive = false`)
- No multi-family membership (one family per user)

## Security
- `bcryptjs` cost factor 12
- JWT in httpOnly cookies, 7-day expiry
- CSRF protection via `SameSite=Strict`
- Rate limiting on auth endpoints
- No passwords in logs or responses
- Password minimum: 8 characters
- Invite code expiry enforced server-side

## Not in Scope (Future)
- OAuth providers (Google, GitHub)
- Email verification / password reset emails
- Admin dashboard with usage stats
- Multi-family membership
- Audit log of all changes

## Estimated Effort
~38 tasks across 8 phases, roughly 10-12 hours of coding time.
