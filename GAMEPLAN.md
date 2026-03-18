# Grocery Price Tracker — Project Context

## The Idea

A self-hosted web app you can pull up on your phone at St. Jacobs Market (or anywhere) to check: "Is this a good price for ribeye steak?" by comparing against your historical price data.

---

## Data Sources

### The Reality of Flyer Data in Canada

There is **no public API** for Canadian grocery flyer data. Flipp and Reebee (now Flipp-owned) dominate the space, but they only offer B2B partnerships — no developer API. Individual chains (Loblaws, Metro, Sobeys, Walmart) also have no public price APIs.

### What We Can Actually Use

**1. Manual Entry (Primary — Most Reliable)**
Every time you shop, you punch in what you bought, the price, the store, and the date. Over time, this becomes your personal price database.

**2. Flipp Scraping (Secondary — Experimental)**
Open-source scrapers like `flippscrape` on GitHub pull deals from Flipp's platform for No Frills, FreshCo, Walmart, Loblaws, etc. Unofficial, could break, but viable for personal use. Treat as "nice to have" — app works perfectly without it.

**3. Receipt Scanning (Future Enhancement)**
OCR on grocery receipts to auto-populate prices. Tesseract. Phase 2 feature.

### Recommended Approach
Build manual entry first, make it fast and friction-free on mobile. Layer in flyer scraping later as an optional background job.

---

## Tech Stack

- **Framework:** Next.js 14 (App Router) — single codebase for frontend + backend
- **Language:** TypeScript
- **Database:** SQLite via Prisma ORM
- **Styling:** Tailwind CSS 3
- **Deployment:** Docker + Cloudflare Tunnel (no reverse proxy needed)
- **Port:** 7800
- **Domain:** prices.keithkas.cc

---

## Database Schema

```
items
├── id (primary key)
├── name (text) — e.g., "Ribeye Steak"
├── category (text) — e.g., "Meat", "Produce", "Dairy"
├── unit (text) — e.g., "per lb", "per kg", "each", "per 100g"
└── created_at (datetime)

price_entries
├── id (primary key)
├── item_id (foreign key → items)
├── price (decimal) — e.g., 12.99
├── quantity (decimal) — e.g., 1.5 (lbs)
├── unit_price (decimal, computed) — price per standard unit
├── store (text) — e.g., "St. Jacobs Market", "No Frills Waterloo"
├── source (text) — "manual", "flyer", "receipt"
├── date (date) — when it was purchased/advertised
├── notes (text, optional) — e.g., "on sale", "organic"
└── created_at (datetime)

stores
├── id (primary key)
├── name (text)
├── location (text, optional)
└── type (text) — "grocery", "market", "butcher", etc.
```

---

## Key Features by Phase

### Phase 1: MVP — "Is This a Good Price?" ✅ (Done)
- Quick price entry form (item, price, store, date)
- Search & lookup (last known price, average, lowest)
- Price history view
- PWA manifest — installable on phone

### Phase 2: Insights & Polish ✅ (Done)
- Price trend charts (SVG sparkline with date labels)
- Dashboard (recent activity, deals this week, quick actions)
- Category browsing + filter
- "Deal or No Deal" indicator (green/yellow/red)
- Store comparison (cheapest store per item)
- Target price tracking (set goals, compare against deals)
- Normal vs sale price distinction
- CSV export

### Phase 3: Automation ✅ (Done)
- Flyer scraper — Flipp API integration for weekly deals
- Smart flyer matching (two-stage keyword + Jaccard, compound deal support)
- Dismiss bad flyer matches (persists in database)
- Price alerts via target price comparison

### Phase 4: In Progress
- Shopping list (database-backed, syncs across devices) ✅
- Store comparison page (/stores) ✅
- Basket comparison ("where should I shop?") — planned
- Barcode scanning (Open Food Facts API) — planned
- Multi-user / household sharing — planned (see USER_MANAGEMENT.md)

---

## Architecture

```
┌─────────────────────────────────────────────┐
│ Phone / Browser (PWA)                       │
└─────────────────┬───────────────────────────┘
                  │ HTTPS
┌─────────────────┴───────────────────────────┐
│ Cloudflare Edge                             │
│ prices.keithkas.cc → SSL termination        │
└─────────────────┬───────────────────────────┘
                  │ Cloudflare Tunnel (outbound)
┌─────────────────┴───────────────────────────┐
│ Your Server                                 │
│  ┌─────────────────────────────────────────┐│
│  │ Next.js App (Docker Container)          ││
│  │ ├── React UI (mobile-first, Tailwind)   ││
│  │ ├── API Routes (/api/items, /api/prices)││
│  │ ├── Prisma ORM                          ││
│  │ └── PWA Service Worker                  ││
│  └─────────────────┬───────────────────────┘│
│                    │                        │
│  ┌─────────────────┴───────────────────────┐│
│  │ SQLite (prices.db — Docker volume)      ││
│  └─────────────────────────────────────────┘│
└─────────────────────────────────────────────┘
```

---

## Deployment

- Docker Compose wraps the app
- Cloudflare Tunnel handles SSL, subdomain routing, HTTPS at the edge
- No open inbound ports on router, no Let's Encrypt config
- App listens on localhost:7800, tunnel forwards from prices.keithkas.cc
- `cloudflared` managed separately on the server
- Keith redeploys manually via Portainer after push

---

## Current Status (as of 2026-03-16)

Keith has been coding this using AI assistants and is now switching to Clawcode for ongoing development. The app is running and deployed via Docker/Portainer. Active development is focused on improving the flyer scraping feature and item-level flyer deal browsing.

---

## Known Issues & Open Questions

### Watchlist
- **Question:** How are the item unit values relevant here?
- Status: Needs investigation

### Flyer Scraper
- **Issue:** Even when prices are obvious in the image, the system doesn't pick up the price. Example: chicken breasts showing a clear /lb and /kg price in the image, but the JSON response has `unitPrice: null` and `unit: null`.
- **Sample JSON response:**
```json
{
  "flippItem": {
    "id": 997310995,
    "name": "Boneless, Skinless Chicken Breast",
    "currentPrice": 7.99,
    "originalPrice": 8.99,
    "merchantName": "Farm Boy",
    "saleStory": "SAVE $1.00 - $2.00",
    "validFrom": "2026-03-05T05:00:00+00:00",
    "validTo": "2026-03-12T03:59:59+00:00",
    "pageUrl": null,
    "imageUrl": "https://f.wishabi.net/page_items/411633303/1772255853/extra_large.jpg",
    "unitPrice": null,
    "unit": null
  }
}
```
- **Question:** Are there other places in the Flipp API response where unit price/unit data might be available?
- **Question:** Could we extract unit pricing from the flyer image using OCR?

### Items
- **Feature request:** Add function to view all flyer deals for a specific item (e.g., show all yogurt deals across stores)
- Status: Not yet implemented

---

## Keith's Development Style
- Uses AI coding assistants for pair programming
- Conventional commits (`feat:`, `fix:`)
- Mobile-first design priorities
- Prefers practical solutions over perfect ones
