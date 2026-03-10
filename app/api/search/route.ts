import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();

  if (!query) {
    return NextResponse.json([]);
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

    // Compute stats inline for search results
    const results = await Promise.all(
      items.map(async (item) => {
        const allPrices = await prisma.priceEntry.findMany({
          where: { itemId: item.id },
          select: { unitPrice: true },
        });
        const prices = allPrices.map((e) => e.unitPrice);
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
      })
    );

    return NextResponse.json(results);
  } catch (error) {
    console.error("GET /api/search error:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
