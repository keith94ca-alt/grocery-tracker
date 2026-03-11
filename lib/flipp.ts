const FLIPP_BASE = "https://backflipp.wishabi.com/flipp";

/**
 * Canadian grocery flyers (No Frills, Loblaws, Metro, FreshCo, Walmart, etc.)
 * all release on Thursday and run until Wednesday night.
 * Returns seconds until next Thursday at 6:00 AM Eastern, so the cache
 * refreshes automatically each week right when new flyers go live.
 */
function secondsUntilNextFlyerDay(): number {
  const now = new Date();
  // Compute current time in Eastern (handles EST/EDT automatically)
  const est = new Date(now.toLocaleString("en-US", { timeZone: "America/Toronto" }));
  const THURSDAY = 4; // 0 = Sunday
  const FLYER_HOUR = 6; // 6:00 AM — flyers are live by this time

  const day = est.getDay();
  const hour = est.getHours();
  let daysUntil = (THURSDAY - day + 7) % 7;

  if (daysUntil === 0) {
    if (hour < FLYER_HOUR) {
      // It's Thursday but before 6 AM — wait until later today
      return (FLYER_HOUR - hour) * 3600;
    }
    // It's Thursday after 6 AM — flyers already loaded, wait until next Thursday
    daysUntil = 7;
  }

  const hoursUntil = daysUntil * 24 + (FLYER_HOUR - hour);
  return Math.max(hoursUntil * 3600, 3600); // floor at 1 hour as a safety net
}

// Ontario grocery chains to include (lowercase substring match)
const TARGET_MERCHANTS = [
  "no frills",
  "freshco",
  "fresh co",
  "walmart",
  "loblaws",
  "metro",
  "farm boy",
  "costco",
  "real canadian superstore",
  "rcss",
  "food basics",
  "fortinos",
  "zehrs",
  "sobeys",
  "giant tiger",
  "superstore",
  "your independent grocer",
  "foodland",
  "t&t",
];

/** Broad food categories searched when browsing this week's flyers */
const FLYER_CATEGORIES = [
  "beef", "chicken", "pork", "fish", "turkey", "bacon", "ham", "sausage",
  "milk", "butter", "cheese", "eggs", "yogurt",
  "bread", "pasta", "rice", "cereal",
  "apples", "bananas", "vegetables", "coffee", "juice",
];

export interface FlippItem {
  id: number;
  name: string;
  currentPrice: number;
  originalPrice: number | null;
  merchantName: string;
  saleStory: string | null;
  validFrom: string;
  validTo: string;
  imageUrl: string | null;
  unitPrice: number | null; // normalized price (e.g. per kg)
  unit: string | null;      // canonical unit (e.g. "per kg")
}

/**
 * Parse a size/quantity from a product name.
 * e.g. "Extra Lean Ground Beef 454 g" → { qty: 0.454, unit: "per kg" }
 * e.g. "Chicken Breast 2 kg"          → { qty: 2,     unit: "per kg" }
 * e.g. "Milk 2 L"                     → { qty: 2,     unit: "per L"  }
 * Returns null if no recognizable unit found.
 */
function parseSize(name: string): { qty: number; unit: string } | null {
  const patterns: Array<[RegExp, string, number]> = [
    [/(\d+(?:\.\d+)?)\s*kg/i,      "per kg", 1],
    [/(\d+(?:\.\d+)?)\s*g(?!\w)/i, "per kg", 0.001],
    [/(\d+(?:\.\d+)?)\s*lbs?/i,    "per kg", 0.453592],
    [/(\d+(?:\.\d+)?)\s*L(?!\w)/,  "per L",  1],
    [/(\d+(?:\.\d+)?)\s*mL/i,      "per L",  0.001],
  ];
  for (const [regex, unit, factor] of patterns) {
    const m = name.match(regex);
    if (m) {
      const qty = parseFloat(m[1]) * factor;
      return qty > 0 ? { qty, unit } : null;
    }
  }
  return null;
}

/**
 * Strip size/quantity suffixes to produce a clean tracking name.
 * "Extra Lean Ground Beef 454 g" → "Extra Lean Ground Beef"
 */
export function simplifyFlyerName(name: string): string {
  return name
    .replace(/\s+\d+(?:\.\d+)?\s*(?:kg|g|L|mL|lb|lbs?|oz|pk|pack|ct|count)s?\b\.?/gi, "")
    .replace(/\s+x\s*\d+/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Returns true if all significant words of `trackedName` appear in `flippName`.
 * "Ground Beef" matches "Extra Lean Ground Beef 454g" but NOT "Beef Broth".
 */
export function matchesTrackedItem(flippName: string, trackedName: string): boolean {
  const flippLower = flippName.toLowerCase();
  const words = trackedName.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  return words.length > 0 && words.every((w) => flippLower.includes(w));
}

/** Core Flipp fetch — returns all matching merchant items, with or without a parseable unit price. */
async function fetchFlippRaw(query: string, postalCode: string): Promise<FlippItem[]> {
  try {
    const url =
      `${FLIPP_BASE}/items/search` +
      `?q=${encodeURIComponent(query)}` +
      `&postal_code=${encodeURIComponent(postalCode)}`;

    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
        Accept: "application/json",
      },
      next: { revalidate: secondsUntilNextFlyerDay() },
    });

    if (!res.ok) return [];

    const data = await res.json();
    const rawItems: any[] = data.items ?? [];

    return rawItems
      .filter((item) => {
        const merchant = (item.merchant_name ?? "").toLowerCase();
        return TARGET_MERCHANTS.some((m) => merchant.includes(m));
      })
      .map((item): FlippItem => {
        const size = parseSize(item.name ?? "");
        return {
          id: item.id,
          name: item.name ?? "",
          currentPrice: item.current_price ?? 0,
          originalPrice: item.original_price ?? null,
          merchantName: item.merchant_name ?? "",
          saleStory: item.sale_story ?? null,
          validFrom: item.valid_from ?? "",
          validTo: item.valid_to ?? "",
          imageUrl: item.clean_image_url ?? null,
          unitPrice: size ? item.current_price / size.qty : null,
          unit: size?.unit ?? null,
        };
      });
  } catch {
    return [];
  }
}

/**
 * Search Flipp for a specific item — for home page deal comparisons.
 * Only returns items where a unit price can be computed. Sorted cheapest first.
 */
export async function searchFlippDeals(
  query: string,
  postalCode: string
): Promise<FlippItem[]> {
  const items = await fetchFlippRaw(query, postalCode);
  return items
    .filter((item) => item.unitPrice !== null)
    .sort((a, b) => (a.unitPrice ?? 9999) - (b.unitPrice ?? 9999));
}

/**
 * Fetch a broad browse list of this week's flyer items across common food categories.
 * Includes items even without a parseable unit price (for manual price entry).
 * Deduplicates by Flipp item ID.
 */
export async function fetchFlyerBrowse(postalCode: string): Promise<FlippItem[]> {
  const results = await Promise.all(
    FLYER_CATEGORIES.map((cat) => fetchFlippRaw(cat, postalCode))
  );
  const seen = new Set<number>();
  return results.flat().filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
