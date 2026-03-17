import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchFlyerBrowse, matchesTrackedItem, FlippItem } from "@/lib/flipp";
import { normalizePrice, sameUnitGroup } from "@/lib/units";

const POSTAL_CODE = process.env.FLIPP_POSTAL_CODE || "N2B3J1";

export interface DealResult {
  itemId: number;
  itemName: string;
  normalUnitPrice: number | null;    // cheapest normal price across all stores
  normalUnit: string | null;         // canonical unit for normal price
  normalStore: string | null;        // store with cheapest normal price
  bestDeal: FlippItem;               // best matching flyer item (raw Flipp data)
  flyerUnitPrice: number | null;     // flyer price normalized to same canonical unit
  flyerUnit: string | null;          // canonical unit for flyer price
  allDeals: FlippItem[];
  savingsPercent: number | null;     // how much cheaper vs your normal price
  isCheaper: boolean;                // true when flyer unit price < normal price
  isOnFlyer: boolean;                // true whenever ANY flyer match found
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const itemIdParam = searchParams.get("itemId");

  try {
    const flyerItems = await fetchFlyerBrowse(POSTAL_CODE);

    const items = await prisma.item.findMany({
      where: itemIdParam
        ? { id: parseInt(itemIdParam) }
        : { OR: [{ priceEntries: { some: {} } }, { watched: true }] },
      include: {
        priceEntries: {
          orderBy: { date: "desc" },
          take: 20,
          select: { id: true, unitPrice: true, unit: true, source: true, store: true, date: true, price: true, priceType: true },
        },
        flyerNotes: true,
      },
    });

    const flyerNoteMap = new Map<string, { unitPrice: number; unit: string }>();
    for (const item of items) {
      for (const note of item.flyerNotes) {
        flyerNoteMap.set(`${item.id}:${note.flippId}:${note.store}`, {
          unitPrice: note.unitPrice,
          unit: note.unit,
        });
      }
    }

    const results: DealResult[] = [];

    for (const item of items) {
      const matches = flyerItems.filter((fi) => matchesTrackedItem(fi.name, item.name));
      if (matches.length === 0) continue;

      // Find all "normal" (non-sale) manual/receipt entries
      const normalEntries = item.priceEntries.filter(
        (e) => (e.source === "manual" || e.source === "receipt") && e.priceType === "normal"
      );

      // If no normal entries exist, fall back to all manual/receipt entries
      // (for backward compatibility with existing data that has no priceType)
      const baselineEntries = normalEntries.length > 0
        ? normalEntries
        : item.priceEntries.filter((e) => e.source === "manual" || e.source === "receipt");

      if (baselineEntries.length === 0) continue;

      // Find the cheapest normal price across all stores
      let cheapestNormal = baselineEntries[0];
      let cheapestNorm = normalizePrice(cheapestNormal.unitPrice, cheapestNormal.unit || item.unit);
      let cheapestStore = cheapestNormal.store;

      for (const entry of baselineEntries) {
        const norm = normalizePrice(entry.unitPrice, entry.unit || item.unit);
        if (sameUnitGroup(norm.unit, cheapestNorm.unit) && norm.price < cheapestNorm.price) {
          cheapestNormal = entry;
          cheapestNorm = norm;
          cheapestStore = entry.store;
        }
      }

      const best = matches.reduce((a, b) => (a.currentPrice < b.currentPrice ? a : b));

      const noteKey = `${item.id}:${best.id}:${best.merchantName}`;
      const flyerNote = flyerNoteMap.get(noteKey);

      const flyerNorm = flyerNote
        ? normalizePrice(flyerNote.unitPrice, flyerNote.unit)
        : (best.unitPrice && best.unit)
        ? normalizePrice(best.unitPrice, best.unit)
        : null;

      let isCheaper = false;
      let savingsPercent: number | null = null;

      if (
        flyerNorm &&
        cheapestNorm &&
        sameUnitGroup(flyerNorm.unit, cheapestNorm.unit)
      ) {
        isCheaper = flyerNorm.price < cheapestNorm.price;
        if (isCheaper) {
          savingsPercent = Math.round((1 - flyerNorm.price / cheapestNorm.price) * 100);
        }
      } else if (
        !flyerNorm &&
        cheapestNorm &&
        (cheapestNorm.unit === "each" || cheapestNorm.unit === "per pack")
      ) {
        isCheaper = best.currentPrice < cheapestNormal.price;
        if (isCheaper) {
          savingsPercent = Math.round((1 - best.currentPrice / cheapestNormal.price) * 100);
        }
      }

      const enrichedDeals = matches.map((m) => {
        const mNoteKey = `${item.id}:${m.id}:${m.merchantName}`;
        const mNote = flyerNoteMap.get(mNoteKey);
        if (mNote) {
          return { ...m, unitPrice: mNote.unitPrice, unit: mNote.unit };
        }
        return m;
      });

      const enrichedBest = (() => {
        const mNote = flyerNoteMap.get(noteKey);
        if (mNote) {
          return { ...best, unitPrice: mNote.unitPrice, unit: mNote.unit };
        }
        return best;
      })();

      results.push({
        itemId: item.id,
        itemName: item.name,
        normalUnitPrice: cheapestNorm?.price ?? null,
        normalUnit: cheapestNorm?.unit ?? null,
        normalStore: cheapestStore ?? null,
        bestDeal: enrichedBest,
        flyerUnitPrice: flyerNorm?.price ?? null,
        flyerUnit: flyerNorm?.unit ?? null,
        allDeals: enrichedDeals,
        savingsPercent,
        isCheaper,
        isOnFlyer: true,
      });
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error("GET /api/flyer-deals error:", error);
    return NextResponse.json({ error: "Failed to fetch flyer deals" }, { status: 500 });
  }
}
