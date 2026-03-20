# Overnight Plan

## Priority fixes

1. **`/api/items` — return `targetPrice` in stats response**
   `targetPrice` is mapped in the items page component but never returned by the API. Causes price alerts to silently fail.

2. **Shopping list — `useRefreshOnFocus` should also reload shopping list items**
   Flyer deals refresh on focus but the list items themselves don't. Adding an item from another tab won't show until manual refresh.

3. **Item detail page — normal/flyer green/grey comparison colouring**
   Banner shows both prices but doesn't apply the green/grey logic we added to list/items pages. Make it consistent.

4. **Home page "Deals This Week" cards — show normal price**
   Deal cards show flyer price + savings % but not your normal price. Add it (grey) so you see both at a glance.

5. **Item detail page — replace AllDealsModal with shared FlyerDealsModal**
   `/item/[id]` has its own old modal. Replace with the shared component so images, lightbox, and layout match everywhere.

6. **Flyer page "Best Deals" tab — add normal price to cards**
   Best deals tab shows flyer card but not your normal price. Add with green/grey colouring.

7. **Shopping list — normal prices for untracked items**
   Normal prices fetch via `/api/items` → `/api/normal-prices`. Shopping list items not in tracked items DB get nothing. Try fuzzy name match or fetch by shopping list names directly.

8. **History page — show normalized unit price + priceType tag**
   History shows raw price but not $/kg. Add normalized unit price column and a small "normal"/"sale" tag per entry.

9. **Flyer "On Your List" tab — group by tracked item**
   Currently one card per Flipp item. 4 butter matches = 4 cards. Group under tracked item name, show count, tap to expand.

10. **Flyer categories — add missing search terms**
    Add "cream", "frozen", "snacks", "chips", "pop", "water", "cleaning" to FLYER_CATEGORIES for broader flyer coverage.

## Nice-to-have enhancements

11. **"Best store this week" on shopping list**
    Calculate which single store covers the most list items at cheapest combined price. Show a banner like "🏪 Costco covers 6/8 items — save $X".

12. **Flyer deal expiry badges**
    Items expiring in <2 days get a subtle "ends tomorrow" or "last day" badge on flyer tags and deal cards.

13. **Quick-add to shopping list from flyer deals modal**
    Add a "🛒 Add to list" button on each deal card in the modal. Skip navigating to the flyer page.

14. **Duplicate entry detection on price logging**
    Warn if same item + store + date already exists when logging a price. Prevent accidental doubles.

15. **Category grouping on flyer browse page**
    Flyer page shows items flat. Add collapsible category sections (Meat, Dairy, Pantry, etc.) for faster browsing.
