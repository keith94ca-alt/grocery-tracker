export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getFamilyId } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const familyId = getFamilyId(request);

  try {
    const [items, stores, shoppingList, dismissed] = await Promise.all([
      prisma.item.findMany({
        where: { familyId },
        include: {
          priceEntries: { orderBy: { date: "desc" } },
          flyerNotes: true,
        },
      }),
      prisma.store.findMany({ where: { familyId } }),
      prisma.shoppingListItem.findMany({ where: { familyId } }),
      prisma.dismissedFlyerMatch.findMany({ where: { familyId } }),
    ]);

    const data = {
      version: 2,
      exportedAt: new Date().toISOString(),
      items,
      stores,
      shoppingList,
      dismissed,
    };

    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="grocery-tracker-backup-${new Date().toISOString().split("T")[0]}.json"`,
      },
    });
  } catch (error) {
    console.error("GET /api/export/json error:", error);
    return NextResponse.json({ error: "Failed to export data" }, { status: 500 });
  }
}
