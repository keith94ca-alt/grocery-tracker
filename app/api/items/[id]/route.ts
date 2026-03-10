import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePrice, getCanonicalUnit } from "@/lib/units";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = parseInt(params.id);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  try {
    const item = await prisma.item.findUnique({
      where: { id },
      include: {
        priceEntries: {
          orderBy: { date: "desc" },
          take: 50,
        },
      },
    });

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // Normalize all prices to canonical unit (e.g. per kg) for fair comparison
    const normalized = item.priceEntries.map((e) =>
      normalizePrice(e.unitPrice, e.unit || item.unit)
    );

    const canonicalUnit = normalized[0]?.unit ?? getCanonicalUnit(item.unit);
    const normalizedPrices = normalized.map((n) => n.price);

    const stats =
      normalizedPrices.length > 0
        ? {
            avg: normalizedPrices.reduce((a, b) => a + b, 0) / normalizedPrices.length,
            min: Math.min(...normalizedPrices),
            max: Math.max(...normalizedPrices),
            latest: normalized[0]?.price ?? null,
            latestDate: item.priceEntries[0]?.date ?? null,
            latestStore: item.priceEntries[0]?.store ?? null,
            canonicalUnit,
          }
        : null;

    return NextResponse.json({ ...item, stats });
  } catch (error) {
    console.error("GET /api/items/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch item" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = parseInt(params.id);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  try {
    await prisma.item.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/items/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete item" }, { status: 500 });
  }
}
