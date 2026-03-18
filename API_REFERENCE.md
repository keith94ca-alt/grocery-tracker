# API Reference

## Items

### GET /api/items
List all items. Optional: `?stats=true` for price statistics, `?q=term` for autocomplete.

### POST /api/items
Create/upsert an item. Body: `{name, category?, unit?, watched?, targetPrice?}`

### GET /api/items/:id
Item detail with price entries and stats.

### PATCH /api/items/:id
Update item fields. Body: `{name?, category?, unit?, watched?, targetPrice?}`

### DELETE /api/items/:id
Delete item and all price entries (cascade).

## Prices

### GET /api/prices
List price entries. Query: `?itemId=X&limit=N`

### POST /api/prices
Create price entry. Body: `{itemName?, itemId?, category?, unit, price, quantity?, store, date?, source?, priceType?, notes?}`

### DELETE /api/prices/:id
Delete a price entry.

## Search

### GET /api/search?q=term
Full-text search items by name. Returns items with stats.

## Shopping List

### GET /api/shopping-list
List all shopping list items.

### POST /api/shopping-list
Add item. Body: `{name, category?}`

### DELETE /api/shopping-list
Clear all checked untracked items.

### PATCH /api/shopping-list/:id
Update item. Body: `{checked?, priceLogged?, price?, name?, category?}`

### DELETE /api/shopping-list/:id
Remove item.

## Flyer Deals

### GET /api/flyer-deals
All flyer deals matching tracked/watched items.

### GET /api/flyer-deals?itemId=X
Flyer deals for specific item.

### GET /api/flyer-items
Browse all flyer items with tracked matches.

### GET /api/flyer-match?name=term
Match any item name against current flyers.

### GET /api/flyer-dismissed
Get dismissed flyer matches.

### POST /api/flyer-dismissed
Dismiss a match. Body: `{trackedItemId, flippId}`

## Other

### GET /api/stores?q=term
Search stores.

### GET /api/normal-prices?names=a,b,c
Get cheapest normal prices for items.

### GET /api/export
Download all price history as CSV.
