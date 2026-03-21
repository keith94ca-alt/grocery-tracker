export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchFlyerBrowse, matchesTrackedItem, FlippItem } from "@/lib/flipp";
import { normalizePrice, sameUnitGroup } from "@/lib/units";
import { getFamilyId } from "@/lib/auth";

const POSTAL_CODE = process.env.FLIPP_POSTAL_CODE || "N2B3J1";

export interface DealResult {
  itemId: number;
  itemName: string;
  normalUnitPrice: number | null;
  normalUnit: string | null;
  normalStore: string | null;
  bestDeal: FlippItem;
  flyerUnitPrice: number | null;
  flyerUnit: string | null;
  allDeals: FlippItem[];
  savingsPercent: number | null;
  isCheaper: boolean;
  isOnFlyer: boolean;
}

export async function GET(request: NextRequest) {
  const familyId = getFamilyId(request);
  const { searchParams } = new URL(request.url);
  const itemIdParam = searchParams.get("itemId");

  try {
    const flyerItems = await fetchFlyerBrowse(POSTAL_CODE);

    const items = await prisma.item.findMany({
      where: {
        familyId,
        ...(itemIdParam
          ? { id: parseInt(itemIdParam) }
          : { OR: [{ priceEntries: { some: {} } }, { watched: true }] }),
      },
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

      const normalEntries = item.priceEntries.filter(
        (e) => (e.source === "manual" || e.source === "receipt") && e.priceType === "normal"
      );
      const baselineEntries = normalEntries.length > 0
        ? normalEntries
        : item.priceEntries.filter((e) => e.source === "manual" || e.source === "receipt");

      const best = matches.reduce((a, b) => (a.currentPrice < b.currentPrice ? a : b));

      let cheapestNorm: { price: number; unit: string } | null = null;
      let cheapestStore: string | null = null;
      let isCheaper = false;
      let savingsPercent: number | null = null;

      const noteKey = `${item.id}:${best.id}:${best.merchantName}`;
      const flyerNote = flyerNoteMap.get(noteKey);
      const flyerNorm = flyerNote
        ? normalizePrice(flyerNote.unitPrice, flyerNote.unit)
        : (best.unitPrice && best.unit)
        ? normalizePrice(best.unitPrice, best.unit)
        : null;

      if (baselineEntries.length > 0) {
        cheapestNorm = normalizePrice(baselineEntries[0].unitPrice, baselineEntries[0].unit || item.unit);
        cheapestStore = baselineEntries[0].store;

        for (const entry of baselineEntries) {
          const norm = normalizePrice(entry.unitPrice, entry.unit || item.unit);
          if (sameUnitGroup(norm.unit, cheapestNorm.unit) && norm.price < cheapestNorm.price) {
            cheapestNorm = norm;
            cheapestStore = entry.store;
          }
        }

        if (flyerNorm && cheapestNorm && sameUnitGroup(flyerNorm.unit, cheapestNorm.unit)) {
          isCheaper = flyerNorm.price < cheapestNorm.price;
          if (isCheaper) {
            savingsPercent = Math.round((1 - flyerNorm.price / cheapestNorm.price) * 100);
          }
        } else if (!flyerNorm && cheapestNorm && (cheapestNorm.unit === "each" || cheapestNorm.unit === "per pack")) {
          isCheaper = best.currentPrice < cheapestNorm.price;
          if (isCheaper) {
            savingsPercent = Math.round((1 - best.currentPrice / cheapestNorm.price) * 100);
          }
        }
      } else {
        isCheaper = true;
      }

      const enrichedDeals = matches.map((m) => {
        const mNoteKey = `${item.id}:${m.id}:${m.merchantName}`;
        const mNote = flyerNoteMap.get(mNoteKey);
        return mNote ? { ...m, unitPrice: mNote.unitPrice, unit: mNote.unit } : m;
      });

      const enrichedBest = (() => {
        const mNote = flyerNoteMap.get(noteKey);
        return mNote ? { ...best, unitPrice: mNote.unitPrice, unit: mNote.unit } : best;
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
