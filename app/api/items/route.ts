import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePrice, getCanonicalUnit } from "@/lib/units";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  const withStats = searchParams.get("stats") === "true";

  try {
    if (withStats) {
      // Home page: items with at least one entry OR that are watched (watchlist)
      const items = await prisma.item.findMany({
        where: { OR: [{ priceEntries: { some: {} } }, { watched: true }] },
        orderBy: { name: "asc" },
        include: {
          priceEntries: {
            orderBy: { date: "desc" },
            select: { unitPrice: true, unit: true, store: true, date: true },
          },
          _count: { select: { priceEntries: true } },
        },
      });

      const results = items
        .map((item) => {
          const normalized = item.priceEntries.map((e) =>
            normalizePrice(e.unitPrice, e.unit || item.unit)
          );
          const canonicalUnit = normalized[0]?.unit ?? getCanonicalUnit(item.unit);
          const prices = normalized.map((n) => n.price);
          const latest = item.priceEntries[0];

          const stats =
            prices.length > 0
              ? {
                  avg: prices.reduce((a, b) => a + b, 0) / prices.length,
                  min: Math.min(...prices),
                  latest: normalized[0]?.price ?? null,
                  latestStore: latest?.store ?? null,
                  latestDate: latest?.date ?? null,
                  canonicalUnit,
                  count: prices.length,
                }
              : null;

          return { id: item.id, name: item.name, category: item.category, unit: item.unit, watched: item.watched, stats };
        })
        // Sort by most recently updated first
        .sort((a, b) => {
          const da = a.stats?.latestDate ? new Date(a.stats.latestDate).getTime() : 0;
          const db = b.stats?.latestDate ? new Date(b.stats.latestDate).getTime() : 0;
          return db - da;
        });

      return NextResponse.json(results);
    }

    // Default: search / autocomplete usage
    const items = await prisma.item.findMany({
      where: query ? { name: { contains: query } } : undefined,
      orderBy: { name: "asc" },
      include: {
        _count: { select: { priceEntries: true } },
      },
    });

    return NextResponse.json(items);
  } catch (error) {
    console.error("GET /api/items error:", error);
    return NextResponse.json({ error: "Failed to fetch items" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, category, unit } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Item name is required" }, { status: 400 });
    }

    const item = await prisma.item.upsert({
      where: { name: name.trim() },
      update: { category: category || "Other", unit: unit || "each" },
      create: {
        name: name.trim(),
        category: category || "Other",
        unit: unit || "each",
      },
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error("POST /api/items error:", error);
    return NextResponse.json({ error: "Failed to create item" }, { status: 500 });
  }
}
