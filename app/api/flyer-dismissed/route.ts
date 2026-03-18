import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const dismissed = await prisma.dismissedFlyerMatch.findMany();
    return NextResponse.json(dismissed);
  } catch (error) {
    console.error("GET /api/flyer-dismissed error:", error);
    return NextResponse.json({ error: "Failed to fetch dismissed matches" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
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
      create: { trackedItemId, flippId },
    });

    return NextResponse.json(match, { status: 201 });
  } catch (error) {
    console.error("POST /api/flyer-dismissed error:", error);
    return NextResponse.json({ error: "Failed to dismiss match" }, { status: 500 });
  }
}

export async function DELETE() {
  // Clear all dismissed matches (for weekly reset)
  try {
    await prisma.dismissedFlyerMatch.deleteMany({});
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/flyer-dismissed error:", error);
    return NextResponse.json({ error: "Failed to clear" }, { status: 500 });
  }
}
