# User Management & Family Sharing — Phase 2 Plan

## Overview
Add authentication, user accounts, and family/household sharing to the Grocery Price Tracker. Currently a single-user app — this plan outlines the migration to multi-user with shared data.

## Architecture Decision
**Auth library:** NextAuth.js (Auth.js) with email/password provider
- Battle-tested for Next.js 14 App Router
- Handles sessions, JWT, CSRF protection automatically
- Self-hosted friendly — no external service dependency
- Easy to add OAuth providers later (Google, GitHub) if desired

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

  // User-specific preferences
  targetPrices Json?     // { itemId: targetPrice }
  watchlist    Json?     // [itemId, ...]
}

model Family {
  id        String   @id @default(cuid())
  name      String
  adminId   String   // FK to User who created the family
  inviteCode String  @unique @default(cuid()) // For joining
  createdAt DateTime @default(now())

  members   User[]
}
```

## Data Sharing Model

### Shared within family (all members see/edit):
- Shopping list items
- Price history (all entries)
- Tracked items
- Stores
- Flyer deal matches

### Personal per user:
- Target prices (each user sets their own)
- Watchlist (each user watches different items)
- Display preferences (dark mode, etc.)

## Implementation Steps

### Step 1: Add auth tables to schema
- Create User and Family models
- Add migration for new tables
- Keep existing data (assign to default family)

### Step 2: Install and configure NextAuth.js
- `npm install next-auth @auth/core`
- Configure email/password provider
- Add `/api/auth/[...nextauth]/route.ts`
- Set up session management

### Step 3: Auth middleware
- Protect all API routes (except auth endpoints)
- Extract user + family from session
- Scope all Prisma queries by familyId

### Step 4: Family management
- Create family (first user becomes admin)
- Generate invite code for family
- Join existing family via invite code
- Admin can remove members
- Admin can delete family (transfers data)

### Step 5: Frontend auth flow
- Login page
- Registration page (name, email, password)
- Profile page (edit name, view family, leave family)
- Family management page (admin only)

### Step 6: Migrate existing data
- Create default "Family 1"
- Assign all existing items to that family
- First registered user becomes admin of Family 1

### Step 7: Personal preferences
- Move watchlist from Item.watched to User.watchlist (per-user)
- Move targetPrice from Item.targetPrice to User.targetPrices (per-user)
- Each user sees their own target prices and watchlist

## Coding Guidelines (Preparing for Auth)
When writing new code, keep these in mind:
1. **API routes should accept optional user/family context** — don't hardcode queries to single-user
2. **Database queries should be scoping-ready** — structure WHERE clauses to easily add `familyId`
3. **Frontend should assume auth exists** — build profile/settings UI shells
4. **Don't assume single user** — when building features, think "how would this work with 2+ users?"
5. **Personal vs shared data** — clearly separate what's per-user vs per-family

## Security Considerations
- Password hashing with bcrypt (cost factor 12)
- Session tokens with expiry (7 days default)
- CSRF protection via NextAuth.js
- Rate limiting on auth endpoints
- No passwords in logs or responses
- Invite codes expire after 7 days (optional)

## Rollout Plan
1. Build auth system on `overnight` branch first
2. Test with multiple user accounts locally
3. Merge to main when stable
4. Update Docker entrypoint to run migrations
5. Document how users create their first account

## Open Questions
- Should price entries track WHICH user logged them?
- Should shopping list items show who added them?
- Should admin be able to remove members' entries?
- How to handle family deletion (cascade or transfer)?

## Estimated Effort
- Schema + auth setup: ~2 hours
- API route protection: ~2 hours
- Family CRUD: ~1.5 hours
- Frontend auth flow: ~2 hours
- Personal preferences migration: ~1 hour
- Testing + debugging: ~2 hours
- **Total: ~10-12 hours (2-3 overnight sessions)**
