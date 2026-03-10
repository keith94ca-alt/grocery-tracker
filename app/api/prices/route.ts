import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const itemId = searchParams.get("itemId");
  const limit = parseInt(searchParams.get("limit") || "50");

  try {
    const entries = await prisma.priceEntry.findMany({
      where: itemId ? { itemId: parseInt(itemId) } : undefined,
      orderBy: { date: "desc" },
      take: Math.min(limit, 200),
      include: { item: { select: { name: true, unit: true } } },
    });

    return NextResponse.json(entries);
  } catch (error) {
    console.error("GET /api/prices error:", error);
    return NextResponse.json({ error: "Failed to fetch prices" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { itemName, category, unit, price, quantity, store, date, notes } = body;

    if (!itemName?.trim()) {
      return NextResponse.json({ error: "Item name is required" }, { status: 400 });
    }
    if (!price || isNaN(parseFloat(price)) || parseFloat(price) <= 0) {
      return NextResponse.json({ error: "Valid price is required" }, { status: 400 });
    }
    if (!store?.trim()) {
      return NextResponse.json({ error: "Store is required" }, { status: 400 });
    }

    const parsedPrice = parseFloat(price);
    const parsedQty = parseFloat(quantity) || 1;
    const unitPrice = parsedPrice / parsedQty;
    const entryDate = date ? new Date(date) : new Date();

    // Upsert item
    const item = await prisma.item.upsert({
      where: { name: itemName.trim() },
      update: {},
      create: {
        name: itemName.trim(),
        category: category || "Other",
        unit: unit || "each",
      },
    });

    // Upsert store
    await prisma.store.upsert({
      where: { name: store.trim() },
      update: {},
      create: { name: store.trim(), type: "grocery" },
    });

    const entry = await prisma.priceEntry.create({
      data: {
        itemId: item.id,
        price: parsedPrice,
        quantity: parsedQty,
        unitPrice,
        unit: unit || "each",
        store: store.trim(),
        source: "manual",
        date: entryDate,
        notes: notes?.trim() || null,
      },
      include: { item: { select: { name: true, unit: true } } },
    });

    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    console.error("POST /api/prices error:", error);
    return NextResponse.json({ error: "Failed to create price entry" }, { status: 500 });
  }
}
