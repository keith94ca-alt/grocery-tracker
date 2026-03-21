import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getFamilyId } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const familyId = getFamilyId(request);

  try {
    const entries = await prisma.priceEntry.findMany({
      where: { familyId },
      orderBy: { date: "desc" },
      include: { item: { select: { name: true, category: true, unit: true } } },
    });

    const header = "Date,Item,Category,Store,Price,Quantity,Unit Price,Unit,Source,Notes";
    const rows = entries.map((e) => {
      const d = new Date(e.date).toLocaleDateString("en-CA");
      const escape = (s: string | null) => (s ? `"${s.replace(/"/g, '""')}"` : "");
      return [
        d,
        escape(e.item.name),
        escape(e.item.category),
        escape(e.store),
        e.price.toFixed(2),
        e.quantity,
        e.unitPrice.toFixed(2),
        escape(e.item.unit),
        escape(e.source),
        escape(e.notes),
      ].join(",");
    });

    const csv = [header, ...rows].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="grocery-prices-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (error) {
    console.error("GET /api/export error:", error);
    return NextResponse.json({ error: "Failed to export data" }, { status: 500 });
  }
}
