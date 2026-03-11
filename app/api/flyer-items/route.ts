import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchFlyerBrowse, matchesTrackedItem, FlippItem } from "@/lib/flipp";

const POSTAL_CODE = process.env.FLIPP_POSTAL_CODE || "N2B3J1";

export interface TrackedMatch {
  id: number;
  name: string;
  unit: string;
  category: string;
}

export interface FlyerBrowseItem {
  flippItem: FlippItem;
  trackedMatch: TrackedMatch | null;
}

export async function GET() {
  try {
    const [flippItems, trackedItems] = await Promise.all([
      fetchFlyerBrowse(POSTAL_CODE),
      prisma.item.findMany({
        select: { id: true, name: true, unit: true, category: true },
        orderBy: { name: "asc" },
      }),
    ]);

    const result: FlyerBrowseItem[] = flippItems.map((flippItem) => {
      const match =
        trackedItems.find((t) => matchesTrackedItem(flippItem.name, t.name)) ?? null;
      return { flippItem, trackedMatch: match };
    });

    // Sort: items without a tracked match first (new finds), then matched
    result.sort((a, b) => {
      if (!a.trackedMatch && b.trackedMatch) return -1;
      if (a.trackedMatch && !b.trackedMatch) return 1;
      return a.flippItem.merchantName.localeCompare(b.flippItem.merchantName);
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/flyer-items error:", error);
    return NextResponse.json({ error: "Failed to fetch flyer items" }, { status: 500 });
  }
}
