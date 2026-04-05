import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { lookupByUPC, mapOFFCategoryToApp } from "@/lib/openfoodfacts";

/**
 * POST /api/scan
 *
 * Takes a UPC code and resolves it to product data.
 * Checks our DB first, then falls back to Open Food Facts.
 *
 * Body: { upc: string }
 * Response: { found: true, source: "database"|"openfoodfacts", item: {...} }
 *        or { found: false } or { found: false, error: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const upc: string = body?.upc;

    if (!upc || !/^\d{12,13}$/.test(upc)) {
      return NextResponse.json(
        { found: false, error: "Invalid UPC. Must be 12–13 digits." },
        { status: 400 }
      );
    }

    // 1. Check our database first
    const existing = await prisma.item.findUnique({
      where: { upc },
    });

    if (existing) {
      return NextResponse.json({
        found: true,
        source: "database",
        item: {
          id: existing.id,
          name: existing.name,
          brand: existing.brand,
          category: existing.category,
          imageUrl: existing.imageUrl,
          code: existing.upc,
        },
      });
    }

    // 2. Query Open Food Facts
    const offProduct = await lookupByUPC(upc);

    if (!offProduct) {
      return NextResponse.json({
        found: false,
      });
    }

    // Map OFF categories to our app categories
    const category = mapOFFCategoryToApp(offProduct.categories);

    return NextResponse.json({
      found: true,
      source: "openfoodfacts",
      item: {
        name: offProduct.name,
        brand: offProduct.brand,
        category,
        imageUrl: offProduct.imageUrl,
        code: offProduct.code,
        unitQuantity: offProduct.unitQuantity,
      },
    });
  } catch (error) {
    console.error("POST /api/scan error:", error);
    return NextResponse.json(
      { found: false, error: "Failed to lookup UPC" },
      { status: 500 }
    );
  }
}
