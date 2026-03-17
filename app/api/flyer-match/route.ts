import { NextRequest, NextResponse } from "next/server";
import { fetchFlyerBrowse, matchesTrackedItem } from "@/lib/flipp";

const POSTAL_CODE = process.env.FLIPP_POSTAL_CODE || "N2B3J1";

export interface FlyerMatch {
  name: string;
  currentPrice: number;
  merchantName: string;
  unitPrice: number | null;
  unit: string | null;
  postPriceText: string | null;
  imageUrl: string | null;
  pageUrl: string | null;
  saleStory: string | null;
  validFrom: string | null;
  validTo: string | null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name")?.trim();

  if (!name) {
    return NextResponse.json({ error: "'name' query parameter is required" }, { status: 400 });
  }

  try {
    const flyerItems = await fetchFlyerBrowse(POSTAL_CODE);

    const matches = flyerItems.filter((fi) => matchesTrackedItem(fi.name, name));

    if (matches.length === 0) {
      return NextResponse.json([]);
    }

    // Return best deal first (cheapest by current price)
    matches.sort((a, b) => a.currentPrice - b.currentPrice);

    const result: FlyerMatch[] = matches.map((m) => ({
      name: m.name,
      currentPrice: m.currentPrice,
      merchantName: m.merchantName,
      unitPrice: m.unitPrice,
      unit: m.unit,
      postPriceText: m.postPriceText ?? null,
      imageUrl: m.imageUrl,
      pageUrl: m.pageUrl,
      saleStory: m.saleStory,
      validFrom: m.validFrom,
      validTo: m.validTo,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/flyer-match error:", error);
    return NextResponse.json({ error: "Failed to check flyer deals" }, { status: 500 });
  }
}
