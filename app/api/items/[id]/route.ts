import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

    // Compute price stats
    const prices = item.priceEntries.map((e) => e.unitPrice);
    const stats =
      prices.length > 0
        ? {
            avg: prices.reduce((a, b) => a + b, 0) / prices.length,
            min: Math.min(...prices),
            max: Math.max(...prices),
            latest: item.priceEntries[0]?.unitPrice ?? null,
            latestDate: item.priceEntries[0]?.date ?? null,
            latestStore: item.priceEntries[0]?.store ?? null,
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
