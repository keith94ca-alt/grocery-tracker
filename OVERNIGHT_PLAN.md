# Overnight Coding Plan — Grocery Price Tracker

## Current State (as of 2026-03-18)
- Core features working: price tracking, flyer deals, unit normalization, fuzzy matching
- Shopping list in database (syncs across devices)
- Normal vs sale price tracking, target price support, confirmation dialogs
- Store comparison page, price alerts on home page
- Recent searches, dark mode toggle (needs fixing), skeleton shimmer
- Items page shows last recorded price, remember last store on Add page
- Desktop sidebar + responsive layout, no localStorage dependency
- Documentation: API_REFERENCE.md, DEPLOYMENT.md, USER_MANAGEMENT.md
- Merged to main, test instance at ss.keithkas.cc

---

## Priority 1: Dark Mode — CRITICAL FIX

Dark mode is currently broken. Multiple issues:

### Problem: Input Text Invisible
- Input fields in dark mode have dark backgrounds but text color doesn't apply
- User types `.454` in price field — text is not visible
- Select dropdowns have same issue
- Placeholders need proper contrast too

### Problem: Small Text Hard to Read
- Unit price text like `19.8 /kg` on item detail page is too dim
- Gray-500/600 text becomes too low contrast in dark mode
- Small prices, dates, and store names are hard to see

### Problem: Inconsistent Color Coverage
- Some elements switch to dark, others stay white
- Flyer page accent colors (orange) don't adjust well
- Stores page color-coded cards look off
- Compare page results look wrong in dark mode

### Solution Approach
**Go through every page component and verify:**
1. **Background colors**: All white → dark gray (not pitch black)
2. **Text colors**: All dark text → light, all gray-500 → readable light gray
3. **Input fields**: Background + text + placeholder + border all need dark variants
4. **Accent colors**: Muted variants for brand, orange, blue, pink, etc.
5. **Borders**: Visible but not harsh (gray-700 or gray-600)
6. **Scrollbars, focus rings, placeholder text**: All need dark variants

### Dark Mode Color Palette (use these)
- Page bg: `#111827` (gray-900)
- Card bg: `#1f2937` (gray-800)
- Input bg: `#374151` (gray-700)
- Primary text: `#f9fafb` (white-ish)
- Secondary text: `#d1d5db` (gray-300)
- Muted text: `#9ca3af` (gray-400) — NOT gray-500, too dim
- Borders: `#4b5563` (gray-600)
- Focus ring: `#4ade80` (green-400)

### Pages to Audit
- [ ] Home page (deals, search, recent activity, price alerts)
- [ ] Add page (all inputs, dropdowns, date picker)
- [ ] Items page (search bar, item rows, edit modal)
- [ ] Item detail page (price chart, history table, edit modal)
- [ ] Shopping list (add form, inline editing, checkmarks)
- [ ] Flyer page (deal cards, store badges, dismiss button)
- [ ] Stores page (store cards, categories, best deals)
- [ ] Compare page (selection pills, results cards)
- [ ] History page (filter bar, entry rows)
- [ ] ConfirmDialog component (overlay, buttons)
- [ ] Toast notifications
- [ ] Mobile bottom nav icons

---

## Priority 2: Fix Remaining Bugs

### Fuzzy Matching Edge Cases
- "Maple Lodge Chicken Breast Roast" still matches "Chicken Breast" — needs brand name filter
- "Coca-Cola" hyphen matching — commit `d0fbb96` may have fixed this, verify

### Home Page
- Search redirect — home page search should work better (inline or redirect)
- Recent activity time display — show more prominent timestamps

---

## Priority 3: UX Improvements

### Pull-to-Refresh on Mobile
- Add pull-to-refresh gesture on Home, Items, and Flyer pages
- Use custom touch events (not browser default which conflicts with PWA)

### Loading States
- Skeleton shimmer animation is set up but only used on some pages
- Add progress indicator for flyer loading (it can be slow)

---

## Priority 4: New Features

### Store Trends Page
- Show which stores you shop at most
- Average prices per store, which store saves you the most
- Expand existing /stores page

### Better Search
- Fuzzy search (handle typos: "chiken" → "chicken")
- Search suggestions from flyer items too

### Export/Import
- CSV export (done ✓)
- Full database backup/restore
- Import from CSV

---

## Priority 5: Desktop Experience

### Data Density
- Flyer page grid view on desktop (not single column)
- History page table view on desktop
- Items page already has 2-column grid (done ✓)

### Bulk Operations
- Select multiple items → bulk delete
- Select multiple price entries → bulk edit

---

## Priority 6: Code Quality

### Error Handling
- Better API error messages
- Retry logic for failed API calls

### Performance
- Virtualize long lists
- Debounce search

### Code Organization
- Extract shared components (autocomplete, date picker)
- Shared types file for API responses

---

## Documentation Tasks

### Completed
- [x] API Reference (API_REFERENCE.md)
- [x] Deployment Guide (DEPLOYMENT.md)
- [x] User Management Plan (USER_MANAGEMENT.md)
- [x] Updated GAMEPLAN.md

### Pending
- [ ] Update MEMORY.md with recent sessions
- [ ] Update GAMEPLAN.md "What's New" section

---

## User Management (Phase 2)
- See USER_MANAGEMENT.md for full architecture
- NextAuth.js with email/password, Family model with admin role
- Estimated 2-3 sessions of work

---

## Notes
- Test on ss.keithkas.cc before pushing
- Keep `overnight` branch separate
- Mobile-first — that's the primary use case
- No keyboard shortcuts (per user preference)
- No localStorage for persistent data
