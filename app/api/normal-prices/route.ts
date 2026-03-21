export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePrice, sameUnitGroup } from "@/lib/units";

export interface NormalPrice {
  itemName: string;
  price: number;
  unit: string;
  store: string;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const namesParam = searchParams.get("names");
    const names = namesParam ? namesParam.split(",").map((n) => n.trim()).filter(Boolean) : [];

    if (names.length === 0) {
      return NextResponse.json([]);
    }

    // Fetch all items with those names, including their normal/receipt price entries
    const items = await prisma.item.findMany({
      where: { name: { in: names } },
      include: {
        priceEntries: {
          where: {
            source: { in: ["manual", "receipt"] },
            priceType: "normal",
          },
          select: { unitPrice: true, unit: true, store: true },
        },
      },
    });

    const results: NormalPrice[] = items.map((item) => {
      if (item.priceEntries.length === 0) {
        return { itemName: item.name, price: 0, unit: item.unit, store: "" };
      }

      // Find cheapest normal price across all stores
      let cheapest = item.priceEntries[0];
      let cheapestNorm = normalizePrice(cheapest.unitPrice, cheapest.unit);

      for (const entry of item.priceEntries) {
        const norm = normalizePrice(entry.unitPrice, entry.unit);
        if (sameUnitGroup(norm.unit, cheapestNorm.unit) && norm.price < cheapestNorm.price) {
          cheapest = entry;
          cheapestNorm = norm;
        }
      }

      return {
        itemName: item.name,
        price: cheapestNorm.price,
        unit: cheapestNorm.unit,
        store: cheapest.store,
      };
    });

    return NextResponse.json(results.filter((r) => r.price > 0));
  } catch (error) {
    console.error("GET /api/normal-prices error:", error);
    return NextResponse.json({ error: "Failed to fetch normal prices" }, { status: 500 });
  }
}
