export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getFamilyId } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const familyId = getFamilyId(request);
  try {
    const dismissed = await prisma.dismissedFlyerMatch.findMany({
      where: { familyId },
    });
    return NextResponse.json(dismissed);
  } catch (error) {
    console.error("GET /api/flyer-dismissed error:", error);
    return NextResponse.json({ error: "Failed to fetch dismissed matches" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const familyId = getFamilyId(request);
  try {
    const body = await request.json();
    const { trackedItemId, flippId } = body;

    if (!trackedItemId || !flippId) {
      return NextResponse.json({ error: "trackedItemId and flippId required" }, { status: 400 });
    }

    const match = await prisma.dismissedFlyerMatch.upsert({
      where: {
        trackedItemId_flippId: { trackedItemId, flippId },
      },
      update: {},
      create: { trackedItemId, flippId, familyId },
    });

    return NextResponse.json(match, { status: 201 });
  } catch (error) {
    console.error("POST /api/flyer-dismissed error:", error);
    return NextResponse.json({ error: "Failed to dismiss match" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const familyId = getFamilyId(request);
  // Clear dismissed matches for this family only (for weekly reset)
  try {
    await prisma.dismissedFlyerMatch.deleteMany({ where: { familyId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/flyer-dismissed error:", error);
    return NextResponse.json({ error: "Failed to clear" }, { status: 500 });
  }
}
