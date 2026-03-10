import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { searchFlippDeals, FlippItem } from "@/lib/flipp";
import { normalizePrice } from "@/lib/units";

const POSTAL_CODE = process.env.FLIPP_POSTAL_CODE || "N2B3J1";

export interface DealResult {
  itemId: number;
  itemName: string;
  latestUnitPrice: number | null; // normalized canonical unit price (e.g. per kg)
  latestUnit: string | null;
  bestDeal: FlippItem;            // cheapest matching flyer item
  allDeals: FlippItem[];
  savingsPercent: number | null;  // positive = you save vs latest tracked price
  isCheaper: boolean;             // true when flyer unit price < latest tracked price
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const itemIdParam = searchParams.get("itemId");

  try {
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

    // Fetch Flipp deals for all items in parallel
    const results = await Promise.all(
      items.map(async (item): Promise<DealResult | null> => {
        const deals = await searchFlippDeals(item.name, POSTAL_CODE);
        if (deals.length === 0) return null;

        const latest = item.priceEntries[0];
        const latestNorm = latest
          ? normalizePrice(latest.unitPrice, latest.unit || item.unit)
          : null;

        const best = deals[0]; // already sorted cheapest first

        const savingsPercent =
          latestNorm?.price && best.unitPrice
            ? Math.round((1 - best.unitPrice / latestNorm.price) * 100)
            : null;

        const isCheaper =
          latestNorm != null &&
          best.unitPrice != null &&
          best.unitPrice < latestNorm.price;

        return {
          itemId: item.id,
          itemName: item.name,
          latestUnitPrice: latestNorm?.price ?? null,
          latestUnit: latestNorm?.unit ?? null,
          bestDeal: best,
          allDeals: deals,
          savingsPercent,
          isCheaper,
        };
      })
    );

    return NextResponse.json(results.filter(Boolean));
  } catch (error) {
    console.error("GET /api/flyer-deals error:", error);
    return NextResponse.json({ error: "Failed to fetch flyer deals" }, { status: 500 });
  }
}
