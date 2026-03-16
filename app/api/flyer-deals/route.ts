import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchFlyerBrowse, matchesTrackedItem, FlippItem } from "@/lib/flipp";
import { normalizePrice, sameUnitGroup } from "@/lib/units";

const POSTAL_CODE = process.env.FLIPP_POSTAL_CODE || "N2B3J1";

export interface DealResult {
  itemId: number;
  itemName: string;
  latestUnitPrice: number | null;    // your last tracked price, normalized to canonical unit
  latestUnit: string | null;         // canonical unit for tracked price (e.g. "per kg")
  bestDeal: FlippItem;               // best matching flyer item (raw Flipp data)
  flyerUnitPrice: number | null;     // flyer price normalized to same canonical unit
  flyerUnit: string | null;          // canonical unit for flyer price
  allDeals: FlippItem[];
  savingsPercent: number | null;     // how much cheaper vs your last tracked price
  isCheaper: boolean;                // true when flyer unit price < latest tracked price
  isOnFlyer: boolean;                // true whenever ANY flyer match found
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
        : { OR: [{ priceEntries: { some: {} } }, { watched: true }] },
      include: {
        priceEntries: {
          orderBy: { date: "desc" },
          take: 10,
          select: { id: true, unitPrice: true, unit: true, source: true, store: true, date: true, price: true },
        },
      },
    });

    const results: DealResult[] = [];

    for (const item of items) {
      // Use the same matching logic as the Flyer page
      const matches = flyerItems.filter((fi) => matchesTrackedItem(fi.name, item.name));
      if (matches.length === 0) continue;

      // Use most recent manual/receipt entry as the comparison baseline.
      // Flyer entries don't count — they're just what the flyer says, not what you paid.
      const latestNonFlyer = item.priceEntries.find(
        (e) => e.source === "manual" || e.source === "receipt"
      );
      if (!latestNonFlyer) continue; // No manual baseline yet — can't confirm a deal
      const latestNorm = normalizePrice(latestNonFlyer.unitPrice, latestNonFlyer.unit || item.unit);

      // Pick the cheapest deal by current price — unit price is only used
      // for comparison, not for selecting which deal to highlight
      const best = matches.reduce((a, b) => (a.currentPrice < b.currentPrice ? a : b));
      const withUnit = matches.filter((fi) => fi.unitPrice !== null);

      const flyerNorm = (best.unitPrice && best.unit)

      let isCheaper = false;
      let savingsPercent: number | null = null;

      if (
        flyerNorm &&
        latestNorm &&
        sameUnitGroup(flyerNorm.unit, latestNorm.unit)
      ) {
        isCheaper = flyerNorm.price < latestNorm.price;
        if (isCheaper) {
          savingsPercent = Math.round((1 - flyerNorm.price / latestNorm.price) * 100);
        }
      }

      results.push({
        itemId: item.id,
        itemName: item.name,
        latestUnitPrice: latestNorm?.price ?? null,
        latestUnit: latestNorm?.unit ?? null,
        bestDeal: best,
        flyerUnitPrice: flyerNorm?.price ?? null,
        flyerUnit: flyerNorm?.unit ?? null,
        allDeals: matches,
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
