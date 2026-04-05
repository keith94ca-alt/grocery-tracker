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

    return {
      code: String(p.code || upc),
      name: (p.product_name || "").trim() || null as any,
      brand,
      categories,
      imageUrl,
      unitQuantity: p.quantity ?? null,
    };
  } catch {
    return null;
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
