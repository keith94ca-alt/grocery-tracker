import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getFamilyId } from "@/lib/auth";

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = parseInt(params.id);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const familyId = getFamilyId(request);

  try {
    // IDOR check: verify price entry belongs to this user's family before deleting
    const existing = await prisma.priceEntry.findUnique({ where: { id }, select: { familyId: true } });
    if (!existing || existing.familyId !== familyId) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    await prisma.priceEntry.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/prices/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete entry" }, { status: 500 });
  }
}
