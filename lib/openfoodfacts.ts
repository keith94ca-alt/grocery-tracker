/**
 * Open Food Facts API client.
 *
 * Free, open product database at https://world.openfoodfacts.org/
 * No API key required, no rate limit, 3M+ products.
 */

const OFF_BASE = "https://world.openfoodfacts.org";

export interface OFFProduct {
  code: string;
  name: string;
  brand: string | null;
  categories: string[];
  imageUrl: string | null;
  unitQuantity: string | null;
}

/**
 * Look up a product by its UPC/EAN code.
 * Returns null if the product is not found.
 */
export async function lookupByUPC(upc: string): Promise<OFFProduct | null> {
  // Try cache first (for offline)
  const cached = getOfflineCache(upc);
  if (cached) return cached;

  try {
    const url = `${OFF_BASE}/api/v2/product/${encodeURIComponent(upc)}.json`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": "GroceryTracker/1.0 (https://prices.keithkas.cc)",
      },
    });

    if (!res.ok) return null;

    const data = await res.json();
    if (data.status !== 1 || !data.product) return null;

    const p = data.product;

    // Extract brand: brands field is a comma-separated string
    let brand: string | null = null;
    if (p.brands) {
      brand = p.brands.split(",")[0].trim() || null;
    }

    // Extract categories: categories_tags is an array like ["en:beverages", "en:dairy"]
    let categories: string[] = [];
    if (p.categories_tags) {
      categories = p.categories_tags
        .filter((c: string) => typeof c === "string")
        .map((c: string) => c.replace(/^en:/, ""));
    }

    // Extract image: pick the best available
    let imageUrl: string | null = null;
    if (p.image_front_url) imageUrl = p.image_front_url;
    else if (p.image_url) imageUrl = p.image_url;
    else if (p.image_small_url) imageUrl = p.image_small_url;

    const product: OFFProduct = {
      code: String(p.code || upc),
      name: (p.product_name || "").trim() || null as any,
      brand,
      categories,
      imageUrl,
      unitQuantity: p.quantity ?? null,
    };

    // Cache result for offline use
    setOfflineCache(upc, product);
    return product;
  } catch {
    return cached; // Fallback to cached version on network error
  }
}

// ── Offline cache helpers ─────────────────────────────────────────────────────

const CACHE_KEY = "grocery-off-cache";
const CACHE_MAX = 500;

function getOfflineCache(upc: string): OFFProduct | null {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(CACHE_KEY) : null;
    if (!raw) return null;
    const cache: Record<string, { product: OFFProduct; ts: number }> = JSON.parse(raw);
    const entry = cache[upc];
    if (!entry) return null;
    // 90-day expiry
    if (Date.now() - entry.ts > 90 * 24 * 60 * 60 * 1000) {
      delete cache[upc];
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch {}
      return null;
    }
    return entry.product;
  } catch {
    return null;
  }
}

function setOfflineCache(upc: string, product: OFFProduct): void {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const cache: Record<string, { product: OFFProduct; ts: number }> = raw ? JSON.parse(raw) : {};
    cache[upc] = { product, ts: Date.now() };
    // Evict oldest if over limit
    const keys = Object.keys(cache);
    if (keys.length > CACHE_MAX) {
      keys.sort((a, b) => (cache[a].ts ?? 0) - (cache[b].ts ?? 0));
      for (const k of keys.slice(0, keys.length - CACHE_MAX)) delete cache[k];
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

/**
 * Search products by name query.
 * Returns up to `limit` results (default 10).
 */
export async function searchByName(
  query: string,
  limit = 10
): Promise<OFFProduct[]> {
  try {
    const url =
      `${OFF_BASE}/cgi/search.pl` +
      `?search_terms=${encodeURIComponent(query)}` +
      `&search_simple=1` +
      `&json=1` +
      `&page_size=${limit}` +
      `&fields=code,product_name,brands,categories_tags,image_front_url,image_url,image_small_url,quantity`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": "GroceryTracker/1.0 (https://prices.keithkas.cc)",
      },
    });

    if (!res.ok) return [];

    const data = await res.json();
    if (!data.products || !Array.isArray(data.products)) return [];

    return data.products
      .filter(
        (p: any) =>
          p.product_name &&
          p.product_name.trim() !== ""
      )
      .map((p: any) => ({
        code: String(p.code || ""),
        name: (p.product_name || "").trim(),
        brand: p.brands ? p.brands.split(",")[0].trim() || null : null,
        categories: (p.categories_tags || [])
          .filter((c: string) => typeof c === "string")
          .map((c: string) => c.replace(/^en:/, "")),
        imageUrl: p.image_front_url || p.image_url || p.image_small_url || null,
        unitQuantity: p.quantity ?? null,
      }))
      .slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Map Open Food Facts category tags to our app categories.
 */
export function mapOFFCategoryToApp(catTags: string[]): string {
  const joined = catTags.join(",").toLowerCase();

  if (/meat|beef|chicken|pork|fish|turkey|bacon|ham|sausage|lamb/.test(joined)) return "Meat";
  if (/dairy|milk|cheese|yogurt|butter|cream/.test(joined)) return "Dairy";
  if (/cereal|grain|rice|pasta|flour|oat|bread/.test(joined)) return "Pantry";
  if (/beverage|juice|coffee|tea|soda|water|pop/.test(joined)) return "Beverages";
  if (/snack|chip|cracker|candy|chocolate/.test(joined)) return "Snacks";
  if (/freezer|frozen|ice-cream/.test(joined)) return "Frozen";
  if (/bakery|bread/.test(joined)) return "Bakery";
  if (/fruit|vegetable|salad|produce/.test(joined)) return "Produce";
  if (/seafood|shrimp|salmon|tuna/.test(joined)) return "Seafood";
  if (/egg/.test(joined)) return "Dairy";
  if (/deli|charcuterie/.test(joined)) return "Deli";
  if (/household|cleaning|laundry|dish/.test(joined)) return "Household";
  if (/soap|shampoo|toothpaste|deodorant|personal/.test(joined)) return "Personal Care";

  return "Other";
}
