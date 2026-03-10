import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");

  try {
    const items = await prisma.item.findMany({
      where: query
        ? {
            name: {
              contains: query,
            },
          }
        : undefined,
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
