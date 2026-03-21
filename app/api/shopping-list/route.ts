export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const items = await prisma.shoppingListItem.findMany({
      orderBy: [
        { checked: "asc" },
        { category: "asc" },
        { sortOrder: "asc" },
        { createdAt: "desc" },
      ],
      include: { item: { select: { name: true, category: true } } },
    });
    return NextResponse.json(items);
  } catch (error) {
    console.error("GET /api/shopping-list error:", error);
    return NextResponse.json({ error: "Failed to fetch shopping list" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, category } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Item name is required" }, { status: 400 });
    }

    // Check if already exists and unchecked
    const existing = await prisma.shoppingListItem.findFirst({
      where: { name: { equals: name.trim() }, checked: false },
    });
    if (existing) {
      return NextResponse.json(existing, { status: 200 });
    }

    // Try to find matching item
    const matchingItem = await prisma.item.findFirst({
      where: { name: { equals: name.trim() } },
    });

    const item = await prisma.shoppingListItem.create({
      data: {
        name: name.trim(),
        category: category || "Other",
        itemId: matchingItem?.id,
      },
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error("POST /api/shopping-list error:", error);
    return NextResponse.json({ error: "Failed to add item" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    // Clear all checked items that haven't had prices logged
    await prisma.shoppingListItem.deleteMany({
      where: { checked: true, priceLogged: false },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/shopping-list error:", error);
    return NextResponse.json({ error: "Failed to clear list" }, { status: 500 });
  }
}
