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
            count: normalizedPrices.length,
          }
        : null;

    return NextResponse.json({ ...item, stats });
  } catch (error) {
    console.error("GET /api/items/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch item" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = parseInt(params.id);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { name, category, unit, watched, targetPrice } = body as {
      name?: string;
      category?: string;
      unit?: string;
      watched?: boolean;
      targetPrice?: number | null;
    };

    // Build partial update — only include fields that were provided
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name.trim();
    if (category !== undefined) data.category = category;
    if (unit !== undefined) data.unit = unit;
    if (watched !== undefined) data.watched = watched;
    if (targetPrice !== undefined) data.targetPrice = targetPrice || null;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const item = await prisma.item.update({ where: { id }, data });
    return NextResponse.json(item);
  } catch (error: unknown) {
    // Prisma unique constraint violation (P2002) = name already taken
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      return NextResponse.json({ error: "An item with that name already exists" }, { status: 409 });
    }
    console.error("PATCH /api/items/[id] error:", error);
    return NextResponse.json({ error: "Failed to update item" }, { status: 500 });
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
