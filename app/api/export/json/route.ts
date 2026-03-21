import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const items = await prisma.item.findMany({
      include: {
        priceEntries: {
          orderBy: { date: "desc" },
        },
        flyerNotes: true,
      },
    });

    const stores = await prisma.store.findMany();
    const shoppingList = await prisma.shoppingListItem.findMany();
    const dismissed = await prisma.flyerDismissed.findMany();

    const data = {
      version: 1,
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
