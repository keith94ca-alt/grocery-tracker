# Overnight Coding Plan — Grocery Price Tracker

## Current State (as of 2026-03-18)
- Core features working: price tracking, flyer deals, unit normalization, fuzzy matching
- Shopping list in database (syncs across devices)
- Normal vs sale price tracking
- Target price support
- Confirmation dialogs for all destructive actions
- Desktop sidebar + responsive layout
- No localStorage dependency (all database)
- Merged to main, test instance at ss.keithkas.cc

---

## Priority 1: Fix Remaining Bugs

### Fuzzy Matching Edge Cases
- "Maple Lodge Chicken Breast Roast" still matches "Chicken Breast" — needs a brand name filter or stricter coverage check for known brand prefixes (Maple Lodge, Great Value, etc.)
- "Coca cola" on watchlist isn't matching flyer items — check if Flipp uses "Coca-Cola" with hyphen

### Home Page
- Search redirect — the home page search bar doesn't work well. When you type a search term, it should either stay inline or redirect to a proper search results view
- Recent activity should show the time more prominently

---

## Priority 2: UX Improvements

### Pull-to-Refresh on Mobile
- Add pull-to-refresh gesture on Home, Items, and Flyer pages
- Use the native browser pull-to-refresh or implement custom with touch events

### Swipe Gestures
- Swipe left on shopping list item → delete
- Swipe left on price history entry → delete
- Swipe right on shopping list item → check off

### Loading States
- Add shimmer animation to skeletons (currently static gray blocks)
- Add progress indicator for flyer loading (it's slow)

### Toast Positioning
- Toast should not overlap with the shopping list form on mobile
- Move toast higher or make it dismissible by swiping

---

## Priority 3: New Features

### Price Alerts (Background Job)
- Create a cron job that checks current flyer deals against tracked items' target prices
- When a deal beats the target price, log a notification
- Show notifications badge on home page
- Implement as a server-side check that runs on each flyer page load (no background job needed for MVP)

### Store Trends Page
- Show which stores you shop at most
- Average prices per store
- Which store saves you the most money over time
- Expand on existing /stores page

### Item Comparison
- Select multiple items → compare prices across stores
- Useful for deciding which store to visit
- Could be a "Compare" button that opens a comparison view

### Better Search
- Fuzzy search (handle typos: "chiken" → "chicken")
- Recent searches (stored in database)
- Search suggestions from flyer items (not just tracked items)

### Receipt Scanning (Future)
- Camera capture of receipt
- OCR to extract item names and prices
- Auto-create price entries
- This is a bigger feature — worth its own overnight session

### Export/Import
- CSV export (done ✓)
- Full database backup/restore
- Import from CSV

---

## Priority 4: Desktop Experience

### Data Density
- Desktop could show more data per row (3-4 columns of items on home page)
- Flyer page could show grid view on desktop instead of single column
- History page could show a table view on desktop

### Bulk Operations
- Select multiple items → bulk delete
- Select multiple price entries → bulk edit
- This would help manage large datasets

---

## Priority 5: Code Quality

### Error Handling
- Add proper error boundaries to each page
- Better API error messages
- Retry logic for failed API calls

### Performance
- Virtualize long lists (items, history, flyer)
- Debounce search more effectively
- Prefetch item details on hover

### Testing
- Add basic E2E tests with Playwright
- Test critical flows: add price, search, shopping list, flyer deals

### Code Organization
- Extract common patterns into shared components (autocomplete, date picker)
- Create a shared types file for API responses
- Clean up the items page — it's getting long

---

## Priority 6: Data Quality

### Unit Price Normalization
- Add "per dozen" unit (for eggs, muffins, etc.)
- Handle "bunch" unit for produce
- Improve Flipp unit extraction for edge cases

### Store Matching
- "FreshCo Kitchener" vs "FreshCo Waterloo" — group by chain?
- Add chain field to stores table
- Store aliases (FC → FreshCo, NF → No Frills)

### Flyer Matching Improvements
- Handle brand names in matching (Dempster's, Tia Rosa, etc.)
- Category-specific matching (dairy vs meat keywords)
- Learn from user dismissals — if someone dismisses a match, don't match similar items in future

---

## Quick Wins (easy to implement, high impact)

1. **Remember last store** — Pre-fill store on Add page based on last entry
3. **Copy item name to clipboard** — Long-press on item name
4. **Dark mode** — Add dark mode toggle (most mobile users prefer dark)
5. **Better date display** — "2 days ago" instead of "Mar 15" on recent entries
6. **Empty state CTAs** — Better empty states with actionable suggestions
7. **Flyer page: mark as "not interested"** — Dismiss items you'll never track
8. **Quick add price from home page** — Small "+" button next to recent activity items
9. **Store filter on home page** — Filter items by store
10. **Bulk import from spreadsheet** — Upload CSV of past prices

---

## Suggested Overnight Order

1. Fix bugs (fuzzy matching, search, Coca-Cola)
2. Pull-to-refresh + skeleton shimmer
3. Desktop data density (grid layout on lg)
4. Price alerts (target price comparison on load)
5. Better search with suggestions
6. Store trends improvements
7. Unit normalization improvements (per dozen, bunch)
8. Remember last store pre-fill
9. Dark mode
10. Empty state improvements (helpful CTAs on blank pages)

---

## Notes
- Test everything locally on ss.keithkas.cc before pushing
- Keep the `overnight` branch separate from `main`
- All changes should be backwards-compatible with existing data
- Prioritize mobile experience — that's the primary use case
