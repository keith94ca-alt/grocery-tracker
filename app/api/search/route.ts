import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();

  if (!query) {
    return NextResponse.json({ error: "Search query 'q' is required" }, { status: 400 });
  }

  try {
    const items = await prisma.item.findMany({
      where: {
        name: { contains: query },
      },
      take: 10,
      include: {
        priceEntries: {
          orderBy: { date: "desc" },
          take: 1,
          select: { unitPrice: true, store: true, date: true },
        },
        _count: { select: { priceEntries: true } },
      },
      orderBy: { name: "asc" },
    });

    if (items.length === 0) {
      return NextResponse.json([]);
    }

    // Batch fetch all prices for matched items (avoids N+1 queries)
    const itemIds = items.map((i) => i.id);
    const allPrices = await prisma.priceEntry.findMany({
      where: { itemId: { in: itemIds } },
      select: { itemId: true, unitPrice: true },
    });

    // Group prices by itemId
    const pricesByItem = new Map<number, number[]>();
    for (const p of allPrices) {
      const arr = pricesByItem.get(p.itemId) || [];
      arr.push(p.unitPrice);
      pricesByItem.set(p.itemId, arr);
    }

    // Compute stats
    const results = items.map((item) => {
      const prices = pricesByItem.get(item.id) || [];
      const stats =
        prices.length > 0
          ? {
              avg: prices.reduce((a, b) => a + b, 0) / prices.length,
              min: Math.min(...prices),
              max: Math.max(...prices),
              count: prices.length,
            }
          : null;
      return { ...item, stats };
    });

    return NextResponse.json(results);
  } catch (error) {
    console.error("GET /api/search error:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
