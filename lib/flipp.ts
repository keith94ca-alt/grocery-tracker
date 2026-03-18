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
  postPriceText: string | null; // raw unit text from Flipp (e.g. "LB", "/kg", "EACH")
}

/**
 * Parse a size/quantity from a product name.
 * e.g. "Extra Lean Ground Beef 454 g"      → { qty: 0.454, unit: "per kg" }
 * e.g. "Chicken Breast 2 kg"               → { qty: 2,     unit: "per kg" }
 * e.g. "Milk 2 L"                          → { qty: 2,     unit: "per L"  }
 * e.g. "Beyond Meat 340 g pkg"             → { qty: 0.340, unit: "per kg" }
 * e.g. "Yogurt 4x95/100 g"                 → { qty: 0.38,  unit: "per kg" } (4×95g=380g)
 * Returns null if no recognizable unit found.
 */
function parseSize(name: string): { qty: number; unit: string } | null {
  // First check for multi-pack patterns: "4x95/100 g", "2x500 g", "6x355 mL"
  const multiPack = name.match(/(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*(?:\/\s*\d+\s*)?(kg|g|L|mL|lb|lbs?)\b/i);
  if (multiPack) {
    const count = parseInt(multiPack[1]);
    const each = parseFloat(multiPack[2]);
    const rawUnit = multiPack[3].toLowerCase();
    const totalG = rawUnit.startsWith("kg") ? count * each * 1000
      : rawUnit === "g" ? count * each
      : rawUnit.startsWith("lb") ? count * each * 453.592
      : rawUnit === "l" ? count * each * 1000  // treat as mL, normalize below
      : rawUnit === "ml" ? count * each
      : 0;
    if (totalG > 0) {
      if (rawUnit === "l" || rawUnit === "ml") {
        const totalMl = rawUnit === "l" ? count * each * 1000 : count * each;
        const qty = totalMl * 0.001; // convert mL to L
        return qty > 0 ? { qty, unit: "per L" } : null;
      }
      const qty = totalG * 0.001; // convert g to kg
      return qty > 0 ? { qty, unit: "per kg" } : null;
    }
  }

  // Standard patterns: "454 g", "2 kg", "1.5 lb", "2 L", "500 mL"
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
 * Parse a per-unit price from Flipp's `post_price_text` field and `current_price`.
 *
 * Flipp's actual format:
 *   - `post_price_text`: "LB", "/lb", "/kg", "/L", "EACH", "EA.", null, etc.
 *   - `current_price`: the numeric price (e.g. 5.99 for $5.99/lb)
 *   - `pre_price_text`: sometimes "2/" for "2/$7" multi-buys, or promo text
 *
 * All weight units normalised to per kg; volume to per L.
 *
 * e.g. current_price=5.99, post_price_text="LB"    → { unitPrice: 13.20, unit: "per kg" }
 * e.g. current_price=14.44, post_price_text="/kg"   → { unitPrice: 14.44, unit: "per kg" }
 * e.g. current_price=2.99, post_price_text="EACH"   → null (per-item, no weight unit)
 * e.g. current_price=2.99, post_price_text=null      → null (no unit info)
 */
function parsePostPriceText(
  postPriceText: string | null | undefined,
  currentPrice: number
): { unitPrice: number; unit: string } | null {
  if (!postPriceText || !currentPrice || currentPrice <= 0) return null;

  const normalized = postPriceText.trim().toLowerCase();

  // Extract unit from the post_price_text
  // Common formats: "LB", "/lb", "/kg", "lb", "kg", "/L", "/l", "/100g", "100g", "/100 mL"
  const unitMatch = normalized.match(
    /\/?\s*(lb|lbs?|kg|100\s*g|g(?!al)|100\s*mL|mL|l(?!b))\b/
  );
  if (!unitMatch) return null;

  const rawUnit = unitMatch[1].replace(/\s+/g, "").toLowerCase();

  switch (rawUnit) {
    case "lb":
    case "lbs":
      return { unitPrice: currentPrice / 0.453592, unit: "per kg" };
    case "kg":
      return { unitPrice: currentPrice, unit: "per kg" };
    case "100g":
      return { unitPrice: currentPrice * 10, unit: "per kg" };
    case "g":
      return { unitPrice: currentPrice * 1000, unit: "per kg" };
    case "l":
      return { unitPrice: currentPrice, unit: "per L" };
    case "100ml":
      return { unitPrice: currentPrice * 10, unit: "per L" };
    case "ml":
      return { unitPrice: currentPrice * 1000, unit: "per L" };
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
      // Split on whitespace and punctuation — but NOT on hyphens (preserve brand names like Coca-Cola)
      // and NOT on % so "3.2%" stays intact
      .split(/[\s,/()&]+/)
      // Keep words 2+ chars (shorter threshold for brand names like "Oxi")
      .filter((w) => w.length > 1 && !/^\d+$/.test(w) && !NOISE_WORDS.has(w))
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
 * Three-stage check:
 *  1. ALL keywords from the tracked name must appear in the Flipp name.
 *  2. Bidirectional Jaccard similarity ≥ 0.35 prevents a short tracked name
 *     like "Chicken" from matching a very different product ("Chicken Burger Nuggets").
 *  3. Tracked keywords must cover ≥ 50% of flyer keywords — prevents "Chicken Breast"
 *     matching "Chicken Breast Roast" or "Chicken Breast Canned" where extra keywords
 *     indicate a different product variant.
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

  // Single-keyword items: word match in Stage 1 is specific enough.
  // Skip Jaccard + coverage checks (compound flyer deals inflate keyword count)
  if (trackedKw.size <= 1) return true;

  // Stage 2 — bidirectional Jaccard similarity (multi-keyword items only)
  // Lower threshold for 2-keyword items (e.g. "Pork Loin") since compound
  // flyer items have many extra words that dilute the score
  const jaccardThreshold = trackedKw.size <= 2 ? 0.25 : 0.35;
  const intersect = fuzzyIntersect(trackedKw, flippKw);
  const union = trackedKw.size + flippKw.size - intersect;
  if (union === 0 || intersect / union < jaccardThreshold) return false;

  // Stage 3 — tracked keywords must cover enough of the flyer keywords.
  // But more importantly, extra flyer keywords indicate a different product
  // variant (e.g. "Chicken Breast Roast" ≠ "Chicken Breast").
  // Use the tighter of two coverage ratios:
  //   a) tracked→flyer (tracked keywords as % of flyer keywords)
  //   b) flyer→tracked (flyer keywords as % of tracked keywords)
  // Both must exceed threshold, so "Chicken Breast" (2) vs
  // "Chicken Breast Roast" (4) fails: 2/4 = 0.50 < 0.55.
  const coverageTrackedToFlyer = intersect / flippKw.size;
  const coverageFlyerToTracked = intersect / trackedKw.size;
  const coverageThreshold = trackedKw.size <= 2 ? 0.30 : 0.55;
  return coverageTrackedToFlyer >= coverageThreshold && coverageFlyerToTracked >= 0.65;
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
        const postPriceText: string | null = item.post_price_text ?? null;

        // 1st choice: size token in the product name (most reliable)
        //   e.g. "Extra Lean Ground Beef 454 g"
        const size = parseSize(item.name ?? "");

        // 2nd choice: Flipp's post_price_text field + current_price
        //   e.g. "LB" → price is per lb, "/kg" → price is per kg
        const fromPostPrice = size ? null : parsePostPriceText(postPriceText, currentPrice);

        const unitPrice = size
          ? currentPrice / size.qty
          : fromPostPrice?.unitPrice ?? null;

        const unit = size?.unit ?? fromPostPrice?.unit ?? null;

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
          postPriceText,
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
