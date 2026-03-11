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

/** Broad categories searched when browsing this week's flyers */
const FLYER_CATEGORIES = [
  // Meat & protein
  "beef", "chicken", "pork", "fish", "turkey", "bacon", "ham", "sausage",
  // Dairy & eggs
  "milk", "butter", "cheese", "eggs", "yogurt",
  // Pantry & bakery
  "bread", "pasta", "rice", "cereal",
  // Produce & beverages
  "apples", "bananas", "vegetables", "coffee", "juice",
  // Personal care
  "body wash", "shampoo", "conditioner", "deodorant", "toothpaste",
  // Household & cleaning
  "laundry detergent", "dish soap", "toilet paper", "paper towel", "bleach",
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
  pageUrl: string | null;   // direct link to flyer page
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
 * Parse a per-unit price from Flipp's `price_text` field.
 * Canadian flyers commonly list "$2.99/lb", "$14.44/kg", "$0.99/100g" etc.
 * All weight units are normalised to per kg; volume to per L.
 *
 * e.g. "$2.99/lb"   → { unitPrice: 6.60, unit: "per kg" }
 * e.g. "$14.44/kg"  → { unitPrice: 14.44, unit: "per kg" }
 * e.g. "$0.99/100g" → { unitPrice: 9.90,  unit: "per kg" }
 * e.g. "$2.99"      → null  (no unit info)
 * e.g. "2/$5.00"    → null  (multi-buy, can't determine unit)
 */
function parsePriceText(
  priceText: string | null | undefined
): { unitPrice: number; unit: string } | null {
  if (!priceText) return null;

  // Match patterns like "$2.99/lb", "2.99 / kg", "$0.99/100g", "$1.49/100mL"
  const m = priceText.match(
    /\$?\s*(\d+(?:\.\d+)?)\s*\/\s*(lb|lbs?|kg|100\s*g|g(?!al)|L(?!b)|100\s*mL|mL)/i
  );
  if (!m) return null;

  const price = parseFloat(m[1]);
  const rawUnit = m[2].replace(/\s+/g, "").toLowerCase();

  if (!price || price <= 0) return null;

  switch (rawUnit) {
    case "lb":
    case "lbs":
      return { unitPrice: price / 0.453592, unit: "per kg" };
    case "kg":
      return { unitPrice: price, unit: "per kg" };
    case "100g":
      return { unitPrice: price * 10, unit: "per kg" };
    case "g":
      return { unitPrice: price * 1000, unit: "per kg" };
    case "l":
      return { unitPrice: price, unit: "per L" };
    case "100ml":
      return { unitPrice: price * 10, unit: "per L" };
    case "ml":
      return { unitPrice: price * 1000, unit: "per L" };
    default:
      return null;
  }
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
 * Only strip words that are truly meaningless noise — NOT product descriptors.
 * "whole", "skim", "lean", "boneless" etc. are kept because they DO distinguish products.
 * e.g. "Whole Milk" must NOT match "Skim Milk".
 */
const NOISE_WORDS = new Set([
  "the", "and", "with", "from", "for", "per", "new", "our",
  // Vague brand/marketing filler that never describes the product
  "brand", "store",
]);

/**
 * Extract meaningful keywords from a product name.
 * Only strips: size/unit tokens (454g, 2kg, 500mL, 12pk) and pure noise words.
 * Keeps all product-differentiating descriptors (whole, skim, lean, boneless, etc.)
 *
 * "Whole Milk 4L"                → { whole, milk }
 * "Extra Lean Ground Beef 454 g" → { extra, lean, ground, beef }
 * "Boneless Skinless Chicken Breast 900g" → { boneless, skinless, chicken, breast }
 */
function keyWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      // Strip size/unit tokens: 454g, 2kg, 500mL, 12pk, 1.5lb, etc.
      .replace(/\d+(?:\.\d+)?\s*(?:kg|g|lb|lbs|L|mL|oz|pk|pack|ct|count)s?\b/gi, "")
      // Split on whitespace and punctuation — but NOT on % so "3.2%" stays intact
      .split(/[\s,/&()\-+]+/)
      // Keep words 3+ chars, drop bare numbers, drop noise words
      .filter((w) => w.length > 2 && !/^\d+$/.test(w) && !NOISE_WORDS.has(w))
  );
}

/**
 * Fuzzy word match — handles singular/plural ("drumstick" ↔ "drumsticks").
 * Requires the shorter word to be at least 80% the length of the longer one to
 * avoid spurious substring matches (e.g. "steak" should not match "beefsteak").
 */
function wordMatches(wa: string, wb: string): boolean {
  if (wa === wb) return true;
  const [shorter, longer] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
  return longer.includes(shorter) && shorter.length / longer.length >= 0.8;
}

/**
 * Count keywords from `a` that match any keyword in `b`.
 */
function fuzzyIntersect(a: Set<string>, b: Set<string>): number {
  return [...a].filter((wa) => [...b].some((wb) => wordMatches(wa, wb))).length;
}

/**
 * Returns true if `flippName` is a meaningful match for a tracked item named `trackedName`.
 *
 * Two-stage check:
 *  1. ALL keywords from the tracked name must appear in the Flipp name.
 *     Ensures "Whole Milk" only matches flyer items that contain the word "whole".
 *     Ensures "Ground Beef" only matches items with both "ground" and "beef".
 *
 *  2. Bidirectional Jaccard similarity ≥ 0.35 prevents a short tracked name
 *     like "Chicken" from matching a very different product ("Chicken Burger Nuggets").
 *       "Chicken" vs "Chicken Breast"         → Jaccard 0.50 → ✅ match
 *       "Chicken" vs "Chicken Burger Nuggets" → Jaccard 0.25 → ❌ rejected
 */
export function matchesTrackedItem(flippName: string, trackedName: string): boolean {
  const flippKw = keyWords(flippName);
  const trackedKw = keyWords(trackedName);

  if (trackedKw.size === 0 || flippKw.size === 0) return false;

  // Stage 1 — all tracked keywords must be present in the flipp name
  const allPresent = [...trackedKw].every((tw) =>
    [...flippKw].some((fw) => wordMatches(tw, fw))
  );
  if (!allPresent) return false;

  // Stage 2 — bidirectional Jaccard similarity
  const intersect = fuzzyIntersect(trackedKw, flippKw);
  const union = trackedKw.size + flippKw.size - intersect;
  return union > 0 && intersect / union >= 0.35;
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

    const now = new Date();

    return rawItems
      .filter((item) => {
        const merchant = (item.merchant_name ?? "").toLowerCase();
        if (!TARGET_MERCHANTS.some((m) => merchant.includes(m))) return false;
        // Drop items whose flyer has already expired
        if (item.valid_to && new Date(item.valid_to) < now) return false;
        // Drop percentage-off deals (e.g. "Save up to 25%") — no actual price
        if (!item.current_price || item.current_price <= 0) return false;
        return true;
      })
      .map((item): FlippItem => {
        const currentPrice: number = item.current_price ?? 0;

        // 1st choice: size token in the product name (most reliable)
        //   e.g. "Extra Lean Ground Beef 454 g"
        const size = parseSize(item.name ?? "");

        // 2nd choice: Flipp's price_text field
        //   e.g. "$2.99/lb", "$14.44/kg", "$0.99/100g"
        const fromPriceText = size ? null : parsePriceText(item.price_text);

        const unitPrice = size
          ? currentPrice / size.qty
          : fromPriceText?.unitPrice ?? null;

        const unit = size?.unit ?? fromPriceText?.unit ?? null;

        return {
          id: item.id,
          name: item.name ?? "",
          currentPrice,
          originalPrice: item.original_price ?? null,
          merchantName: item.merchant_name ?? "",
          saleStory: item.sale_story ?? null,
          validFrom: item.valid_from ?? "",
          validTo: item.valid_to ?? "",
          pageUrl: item.page_destination_url ?? null,
          imageUrl: item.clean_image_url ?? null,
          unitPrice,
          unit,
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
