import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchFlyerBrowse, matchesTrackedItem, FlippItem } from "@/lib/flipp";
import { normalizePrice } from "@/lib/units";

const POSTAL_CODE = process.env.FLIPP_POSTAL_CODE || "N2B3J1";

export interface DealResult {
  itemId: number;
  itemName: string;
  latestUnitPrice: number | null; // normalized canonical unit price (e.g. per kg)
  latestUnit: string | null;
  bestDeal: FlippItem;            // best matching flyer item
  allDeals: FlippItem[];
  savingsPercent: number | null;  // positive = you save vs latest tracked price
  isCheaper: boolean;             // true when flyer unit price < latest tracked price (unit prices available)
  isOnFlyer: boolean;             // true whenever ANY flyer match is found (even without unit prices)
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const itemIdParam = searchParams.get("itemId");

  try {
    // Fetch all flyer items once (cached weekly — same call as the Flyer page)
    const flyerItems = await fetchFlyerBrowse(POSTAL_CODE);

    const items = await prisma.item.findMany({
      where: itemIdParam
        ? { id: parseInt(itemIdParam) }
        : { priceEntries: { some: {} } },
      include: {
        priceEntries: {
          orderBy: { date: "desc" },
          take: 1,
          select: { unitPrice: true, unit: true },
        },
      },
    });

    const results: DealResult[] = [];

    for (const item of items) {
      // Use the same matching logic as the Flyer page
      const matches = flyerItems.filter((fi) => matchesTrackedItem(fi.name, item.name));
      if (matches.length === 0) continue;

      // Prefer items with a parseable unit price; fall back to cheapest raw price
      const withUnit = matches.filter((fi) => fi.unitPrice !== null);
      const best =
        withUnit.length > 0
          ? withUnit.reduce((a, b) => (a.unitPrice! < b.unitPrice! ? a : b))
          : matches.reduce((a, b) => (a.currentPrice < b.currentPrice ? a : b));

      // Compare against latest tracked price (when both have compatible units)
      const latest = item.priceEntries[0];
      const latestNorm = latest
        ? normalizePrice(latest.unitPrice, latest.unit || item.unit)
        : null;

      let isCheaper = false;
      let savingsPercent: number | null = null;

      if (best.unitPrice && latestNorm?.price && best.unit === latestNorm.unit) {
        isCheaper = best.unitPrice < latestNorm.price;
        if (isCheaper) {
          savingsPercent = Math.round((1 - best.unitPrice / latestNorm.price) * 100);
        }
      }

      results.push({
        itemId: item.id,
        itemName: item.name,
        latestUnitPrice: latestNorm?.price ?? null,
        latestUnit: latestNorm?.unit ?? null,
        bestDeal: best,
        allDeals: withUnit.length > 0 ? withUnit : matches,
        savingsPercent,
        isCheaper,
        isOnFlyer: true,
      });
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error("GET /api/flyer-deals error:", error);
    return NextResponse.json({ error: "Failed to fetch flyer deals" }, { status: 500 });
  }
}
