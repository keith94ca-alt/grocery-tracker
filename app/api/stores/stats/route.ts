import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePrice } from "@/lib/units";

export interface StoreStat {
  name: string;
  totalEntries: number;
  uniqueItems: number;
  avgUnitPrice: number;
  categories: string[];
  cheapestItems: { name: string; unitPrice: number; unit: string }[];
  recentVisit: string;
}

export async function GET() {
  try {
    const entries = await prisma.priceEntry.findMany({
      where: { source: { in: ["manual", "receipt"] } },
      include: { item: { select: { name: true, unit: true, category: true } } },
      orderBy: { date: "desc" },
    });

    const storeMap = new Map<
      string,
      {
        entries: typeof entries;
        items: Set<string>;
        categories: Set<string>;
        prices: number[];
      }
    >();

    for (const entry of entries) {
      const store = entry.store;
      if (!storeMap.has(store)) {
        storeMap.set(store, { entries: [], items: new Set(), categories: new Set(), prices: [] });
      }
      const s = storeMap.get(store)!;
      s.entries.push(entry);
      s.items.add(entry.item.name);
      s.categories.add(entry.item.category);
      s.prices.push(entry.unitPrice);
    }

    const results: StoreStat[] = Array.from(storeMap.entries())
      .map(([name, data]) => {
        const cheapestByItem = new Map<string, { price: number; unit: string }>();
        for (const entry of data.entries) {
          const existing = cheapestByItem.get(entry.item.name);
          if (!existing || entry.unitPrice < existing.price) {
            cheapestByItem.set(entry.item.name, { price: entry.unitPrice, unit: entry.item.unit });
          }
        }

        const cheapestItems = Array.from(cheapestByItem.entries())
          .map(([name, d]) => ({ name, unitPrice: d.price, unit: d.unit }))
          .sort((a, b) => a.unitPrice - b.unitPrice)
          .slice(0, 5);

        return {
          name,
          totalEntries: data.entries.length,
          uniqueItems: data.items.size,
          avgUnitPrice: data.prices.reduce((a, b) => a + b, 0) / data.prices.length,
          categories: Array.from(data.categories).sort(),
          cheapestItems,
          recentVisit: data.entries[0].date,
        };
      })
      .sort((a, b) => b.totalEntries - a.totalEntries);

    return NextResponse.json(results);
  } catch (error) {
    console.error("GET /api/stores/stats error:", error);
    return NextResponse.json({ error: "Failed to fetch store stats" }, { status: 500 });
  }
}
