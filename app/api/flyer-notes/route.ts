export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/flyer-notes
 * Save a flyer note — records the flyer deal with a manually specified unit.
 * These entries do NOT appear in purchase history, but are used by the
 * deals API to compute unit prices for comparison.
 *
 * Body: { itemName, flippId, price, unitPrice, unit, store, validFrom, validTo }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { itemName, flippId, price, unitPrice, unit, store, validFrom, validTo } = body;

    if (!itemName || flippId == null || price == null) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Find or create the item
    let item = await prisma.item.findUnique({ where: { name: itemName } });
    if (!item) {
      item = await prisma.item.create({
        data: { name: itemName, unit: unit || "each" },
      });
    }

    // Upsert the flyer note (one per item+flippId+store combo)
    const note = await prisma.flyerNote.upsert({
      where: {
        itemId_flippId_store: {
          itemId: item.id,
          flippId: Number(flippId),
          store: store || "Unknown",
        },
      },
      update: {
        price: Number(price),
        unitPrice: Number(unitPrice),
        unit: unit || "each",
        validFrom: validFrom || "",
        validTo: validTo || "",
      },
      create: {
        itemId: item.id,
        flippId: Number(flippId),
        price: Number(price),
        unitPrice: Number(unitPrice),
        unit: unit || "each",
        store: store || "Unknown",
        validFrom: validFrom || "",
        validTo: validTo || "",
      },
    });

    return NextResponse.json(note);
  } catch (error) {
    console.error("POST /api/flyer-notes error:", error);
    return NextResponse.json({ error: "Failed to save flyer note" }, { status: 500 });
  }
}

/**
 * GET /api/flyer-notes
 * Get all flyer notes, optionally filtered by itemId.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const itemId = searchParams.get("itemId");

  try {
    const notes = await prisma.flyerNote.findMany({
      where: itemId ? { itemId: parseInt(itemId) } : {},
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(notes);
  } catch (error) {
    console.error("GET /api/flyer-notes error:", error);
    return NextResponse.json({ error: "Failed to fetch flyer notes" }, { status: 500 });
  }
}
