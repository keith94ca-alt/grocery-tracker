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

      // Use most recent non-flyer entry as the comparison baseline so we're
      // comparing "flyer deal" vs "what you normally pay", not flyer vs flyer.
      const latestNonFlyer = item.priceEntries.find((e) => e.source !== "flyer")
        ?? item.priceEntries[0];
      const latestNorm = latestNonFlyer
        ? normalizePrice(latestNonFlyer.unitPrice, latestNonFlyer.unit || item.unit)
        : null;

      // If the user recently manually logged a flyer price, prefer showing that
      // store's deal rather than the auto-detected cheapest.
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const recentFlyerEntry = item.priceEntries.find(
        (e) => e.source === "flyer" && new Date(e.date) >= oneWeekAgo
      ) ?? null;

      // Prefer items with a parseable unit price; fall back to cheapest raw price
      const withUnit = matches.filter((fi) => fi.unitPrice !== null);

      let best: FlippItem;
      if (recentFlyerEntry) {
        // Try to find a Flipp match from the same store the user tracked
        const storeMatch = matches.find((m) => {
          const a = m.merchantName.toLowerCase();
          const b = recentFlyerEntry.store.toLowerCase();
          return a.includes(b) || b.includes(a) || a.split(" ")[0] === b.split(" ")[0];
        });
        if (storeMatch) {
          best = storeMatch;
        } else {
          // No live Flipp listing for that store — synthesize one from the manual entry
          best = {
            id: -(recentFlyerEntry.id),
            name: item.name,
            currentPrice: recentFlyerEntry.price,
            originalPrice: null,
            merchantName: recentFlyerEntry.store,
            saleStory: "Manually tracked flyer price",
            validFrom: recentFlyerEntry.date,
            validTo: new Date(new Date(recentFlyerEntry.date).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            imageUrl: null,
            unitPrice: recentFlyerEntry.unitPrice,
            unit: recentFlyerEntry.unit,
          };
        }
      } else {
        best = withUnit.length > 0
          ? withUnit.reduce((a, b) => (a.unitPrice! < b.unitPrice! ? a : b))
          : matches.reduce((a, b) => (a.currentPrice < b.currentPrice ? a : b));
      }
      // If the Flipp item has no unit price (e.g. variable-weight items showing
      // a sale story instead), fall back to the manually-entered unit price.
      const flyerNorm = (best.unitPrice && best.unit)
        ? normalizePrice(best.unitPrice, best.unit)
        : recentFlyerEntry
        ? normalizePrice(recentFlyerEntry.unitPrice, recentFlyerEntry.unit || item.unit)
        : null;

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
