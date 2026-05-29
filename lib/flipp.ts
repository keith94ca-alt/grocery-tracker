const FLIPP_BASE = "https://backflipp.wishabi.com/flipp";

/**
 * Canadian grocery flyers (No Frills, Loblaws, Metro, FreshCo, Walmart, etc.)
 * all release on Thursday and run until Wednesday night. We refresh our flyer
 * snapshot once per week, right after new flyers go live (see fetchFlyerBrowse).
 */

// ----- Flipp fetch tunables -----
// Flipp throttles request bursts, so we cap concurrency instead of firing all
// ~40 category searches at once. The old Promise.all approach caused partial
// datasets (e.g. only 6 No Frills items instead of ~18) because throttled
// requests were silently swallowed as empty results.
const FETCH_CONCURRENCY = 4;
const FETCH_RETRIES = 2; // retries per category after the first attempt
const RETRY_BASE_MS = 400; // exponential backoff base
// If more than this fraction of categories fail, treat the whole refresh as
// untrustworthy and keep the previous week's snapshot rather than caching a
// partial result for a week.
const MAX_FAILED_CATEGORY_RATIO = 0.2;

class FlippFetchError extends Error {}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Run `fn` over `items` with at most `limit` concurrent executions. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx]);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
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
  // Additional dairy & fridge
  "cream", "cream cheese", "sour cream",
  // Frozen & snacks
  "frozen meals", "chips",
  // Beverages
  "pop", "sparkling water",
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
  "the", "and", "or", "with", "from", "for", "per", "new", "our",
  // Vague brand/marketing filler that never describes the product
  "brand", "store",
  // Common brand name parts that don't help distinguish products
  "gay", "lea",
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
 * The core challenge: tracked items may be MORE specific ("Extra Lean Ground Beef")
 * or LESS specific ("Bread") than flyer items. We need to handle both directions.
 *
 * Three-stage check:
 *  1. At least one direction must have full keyword containment:
 *     - tracked ⊆ flyer (tracked keywords all in flyer) — e.g. "Ground Beef" in "Extra Lean Ground Beef"
 *     - flyer ⊆ tracked (flyer keywords all in tracked) — e.g. "Ground Beef" in "Ground Beef Boneless"
 *     This prevents both false positives and false negatives.
 *  2. Bidirectional Jaccard similarity ≥ threshold ensures the products are related,
 *     preventing "Chicken" from matching "Chicken Burger Patties Frozen".
 *  3. For multi-keyword tracked items where tracked ⊆ flyer, check that flyer doesn't
 *     have too many EXTRA keywords (brand names, different product variants).
 *     "Chicken Breast" (2) should NOT match "Maple Lodge Chicken Breast Roast" (5)
 *     because 3 extra keywords indicate a different product.
 */
export function matchesTrackedItem(flippName: string, trackedName: string): boolean {
  const flippKw = keyWords(flippName);
  const trackedKw = keyWords(trackedName);

  if (trackedKw.size === 0 || flippKw.size === 0) return false;

  // Stage 1 — at least one direction must have full keyword containment
  // tracked ⊆ flyer: all tracked keywords appear in flyer (flyer is MORE specific)
  //   e.g. "Ground Beef" ⊆ "Extra Lean Ground Beef 500g"
  // flyer ⊆ tracked: all flyer keywords appear in tracked (tracked is MORE specific)
  //   e.g. "Ground Beef" ⊆ "Extra Lean Ground Beef"
  const trackedInFlyer = [...trackedKw].every((tw) =>
    [...flippKw].some((fw) => wordMatches(tw, fw))
  );
  const flyerInTracked = [...flippKw].every((fw) =>
    [...trackedKw].some((tw) => wordMatches(fw, tw))
  );

  if (!trackedInFlyer && !flyerInTracked) return false;

  // Single-keyword tracked items (e.g. "Bread", "Milk"): containment check is enough.
  // Don't apply extra filters — user asked for a category, any product in it is relevant.
  if (trackedKw.size <= 1) return true;

  // Stage 2 — bidirectional Jaccard similarity
  // Higher threshold for multi-keyword items to prevent loosely related matches
  const intersect = fuzzyIntersect(trackedKw, flippKw);
  const union = trackedKw.size + flippKw.size - intersect;
  const jaccardThreshold = trackedKw.size <= 2 ? 0.25 : 0.35;
  if (union === 0 || intersect / union < jaccardThreshold) return false;

  // Stage 3 — for tracked ⊆ flyer cases, prevent matching when flyer has too many
  // extra keywords that indicate a different product or brand.
  // "Chicken Breast" (2) vs "Maple Lodge Chicken Breast Roast" (5):
  //   trackedInFlyer=true, flyerInTracked=false, coverageTrackedToFlyer=2/5=0.40 < 0.55 → NO MATCH ✓
  // "Chicken Breast" (2) vs "Chicken Breast Boneless" (4):
  //   trackedInFlyer=true, flyerInTracked=false, coverageTrackedToFlyer=2/4=0.50 < 0.55 → NO MATCH ✗
  //   BUT this should match! Boneless is a descriptor, not a different product.
  //
  // Better heuristic: check if the extra flyer keywords are product descriptors
  // (boneless, skinless, organic, fresh, etc.) or brand names / product types.
  // We can't easily distinguish, so use a simpler rule:
  // If tracked keywords cover ≥ 50% of flyer keywords → match
  // If tracked keywords cover 30-50% of flyer keywords → only match if the extra
  //   flyer keywords are likely descriptors (contain common food adjectives)
  // For small tracked items (1-2 keywords like "Plain Yogurt", "Butter"), the user is
  // intentionally tracking a broad category. Skip the extra-keyword check — brand names
  // and dietary descriptors (halal, probiotic, etc.) in the flyer name are fine.
  if (trackedKw.size >= 3) {
    const coverageTrackedToFlyer = intersect / flippKw.size;
    // If all tracked keywords appear in the flyer name, it's a valid match — the flyer
    // just has extra words (brand name, roast type, etc.). Only block when coverage is
    // very low (< 0.40), which indicates the flyer item is truly a different product.
    // Previously this threshold was 0.55 which blocked "Whole Bean Coffee" matching
    // "NABOB Roast & Ground or Whole Bean Coffee" (3/6 = 0.50).
    if (trackedInFlyer && !flyerInTracked && coverageTrackedToFlyer < 0.40) {
      // Check if the extra flyer keywords look like product descriptors, not brands/variants
      const extraFlyerKw = [...flippKw].filter(
        (fw) => ![...trackedKw].some((tw) => wordMatches(tw, fw))
      );
      const descriptors = new Set([
        "boneless", "skinless", "organic", "free", "range", "natural", "fresh",
        "lean", "extra", "whole", "low", "fat", "reduced", "sodium", "salt",
        "large", "jumbo", "thin", "thick", "premium", "grade", "fancy", "pure",
        "wild", "farm", "grass", "fed", "prime", "choice", "select", "strip",
        "halal", "kosher", "probiotic", "lactose", "unsalted", "salted",
        "plain", "original", "classic", "traditional", "homestyle",
      ]);
      const allDescriptors = extraFlyerKw.every((kw) => descriptors.has(kw));
      if (!allDescriptors) return false;
    }
  }

  return true;
}

/** Map raw Flipp API items to FlippItem[], applying merchant/price/expiry filters. */
function mapRawItems(rawItems: any[]): FlippItem[] {
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
}

/**
 * Fetch one category from Flipp, with retry/backoff on transient failures.
 * Throws FlippFetchError if no successful response after retries — callers MUST
 * distinguish this from a genuinely empty result, so a throttled request never
 * silently becomes "0 items" (the root cause of partial flyer datasets).
 */
async function fetchCategory(query: string, postalCode: string): Promise<FlippItem[]> {
  const url =
    `${FLIPP_BASE}/items/search` +
    `?q=${encodeURIComponent(query)}` +
    `&postal_code=${encodeURIComponent(postalCode)}`;

  let lastError: unknown = null;
  for (let attempt = 0; attempt <= FETCH_RETRIES; attempt++) {
    if (attempt > 0) await sleep(RETRY_BASE_MS * 2 ** (attempt - 1));
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
          Accept: "application/json",
        },
        // We manage our own weekly cache (see fetchFlyerBrowse) — don't let Next's
        // data cache serve stale flyers or mask partial fetches.
        cache: "no-store",
      });

      if (!res.ok) {
        lastError = new Error(`Flipp responded ${res.status}`);
        // 429 / 5xx are worth retrying; other 4xx won't improve, so stop early.
        if (res.status === 429 || res.status >= 500) continue;
        break;
      }

      const data = await res.json();
      return mapRawItems(data.items ?? []);
    } catch (err) {
      lastError = err;
    }
  }

  throw new FlippFetchError(`Flipp fetch failed for "${query}": ${String(lastError)}`);
}

/**
 * Search Flipp for a specific item — for home page deal comparisons.
 * Only returns items where a unit price can be computed. Sorted cheapest first.
 */
export async function searchFlippDeals(
  query: string,
  postalCode: string
): Promise<FlippItem[]> {
  let items: FlippItem[];
  try {
    items = await fetchCategory(query, postalCode);
  } catch {
    return [];
  }
  return items
    .filter((item) => item.unitPrice !== null)
    .sort((a, b) => (a.unitPrice ?? 9999) - (b.unitPrice ?? 9999));
}

// ----- Weekly flyer snapshot cache -----
// Flyers change once a week (Thursday ~6 AM ET). We fetch all categories once,
// keep the result in memory, and serve it until the next flyer day. This replaces
// Next.js's per-fetch SWR cache, which (a) served last week's data for the first
// request after the weekly boundary and (b) had no protection against a partial
// fetch poisoning the cache for a full week.

interface FlyerSnapshot {
  items: FlippItem[];
  fetchedAt: Date;
}

let snapshot: FlyerSnapshot | null = null;
let refreshInFlight: Promise<FlippItem[]> | null = null;

/** Convert a real Date to a Date whose fields read as Eastern wall-clock time. */
function toEastern(d: Date): Date {
  return new Date(d.toLocaleString("en-US", { timeZone: "America/Toronto" }));
}

/** Most recent Thursday 6:00 AM Eastern — when this week's flyers went live. */
function mostRecentFlyerRefresh(): Date {
  const est = toEastern(new Date());
  const THURSDAY = 4;
  const FLYER_HOUR = 6;
  let daysBack = (est.getDay() - THURSDAY + 7) % 7;
  // Thursday before 6 AM still belongs to last week's flyers.
  if (daysBack === 0 && est.getHours() < FLYER_HOUR) daysBack = 7;
  const ref = new Date(est);
  ref.setDate(est.getDate() - daysBack);
  ref.setHours(FLYER_HOUR, 0, 0, 0);
  return ref;
}

function snapshotIsFresh(): boolean {
  if (!snapshot) return false;
  return toEastern(snapshot.fetchedAt).getTime() >= mostRecentFlyerRefresh().getTime();
}

/** Fetch every category (throttled), guarding against partial-fetch poisoning. */
async function refreshSnapshot(postalCode: string): Promise<FlippItem[]> {
  const settled = await mapWithConcurrency(
    FLYER_CATEGORIES,
    FETCH_CONCURRENCY,
    async (
      cat
    ): Promise<{ ok: true; items: FlippItem[] } | { ok: false; cat: string }> => {
      try {
        return { ok: true, items: await fetchCategory(cat, postalCode) };
      } catch (err) {
        console.warn(`[flipp] category "${cat}" failed:`, String(err));
        return { ok: false, cat };
      }
    }
  );

  const failed = settled.filter(
    (s): s is { ok: false; cat: string } => !s.ok
  );

  const seen = new Set<number>();
  const items: FlippItem[] = [];
  for (const s of settled) {
    if (!s.ok) continue;
    for (const item of s.items) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        items.push(item);
      }
    }
  }

  const failedRatio = failed.length / FLYER_CATEGORIES.length;
  const healthy = failedRatio <= MAX_FAILED_CATEGORY_RATIO && items.length > 0;

  if (!healthy) {
    // Don't let a throttled/partial fetch overwrite good data.
    if (snapshot) {
      console.warn(
        `[flipp] refresh rejected — ${failed.length}/${FLYER_CATEGORIES.length} categories failed, ` +
          `${items.length} items. Keeping snapshot from ${snapshot.fetchedAt.toISOString()}.`
      );
      return snapshot.items;
    }
    // Cold start with no good fallback: serve what we got but DON'T cache it, so
    // the next request retries instead of being stuck with partial data all week.
    console.warn(
      `[flipp] cold-start refresh unhealthy — ${failed.length} failed, ${items.length} items. Not caching.`
    );
    return items;
  }

  if (failed.length > 0) {
    console.warn(
      `[flipp] refresh accepted with ${failed.length} failed categor${
        failed.length === 1 ? "y" : "ies"
      }: ${failed.map((f) => f.cat).join(", ")}`
    );
  }

  snapshot = { items, fetchedAt: new Date() };
  return items;
}

/**
 * Fetch this week's flyer items across common food categories.
 * Served from an in-memory weekly snapshot; refreshes once per flyer week.
 * Concurrent callers share a single in-flight refresh (no request stampede).
 * Includes items even without a parseable unit price (for manual entry).
 */
export async function fetchFlyerBrowse(postalCode: string): Promise<FlippItem[]> {
  if (snapshotIsFresh()) return snapshot!.items;

  if (!refreshInFlight) {
    refreshInFlight = refreshSnapshot(postalCode).finally(() => {
      refreshInFlight = null;
    });
  }

  try {
    return await refreshInFlight;
  } catch {
    // Total failure — fall back to stale data if we have any.
    return snapshot?.items ?? [];
  }
}
