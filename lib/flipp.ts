const FLIPP_BASE = "https://backflipp.wishabi.com/flipp";

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
 * Fetch current flyer deals from Flipp for a given search query.
 * Filters to Ontario grocery chains only.
 * Returns items sorted by unit price ascending (cheapest first).
 */
export async function searchFlippDeals(
  query: string,
  postalCode: string
): Promise<FlippItem[]> {
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
      next: { revalidate: 3600 }, // cache server-side for 1 hour
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
      })
      .filter((item) => item.unitPrice !== null) // only items we can compare
      .sort((a, b) => (a.unitPrice ?? 9999) - (b.unitPrice ?? 9999));
  } catch {
    return [];
  }
}
