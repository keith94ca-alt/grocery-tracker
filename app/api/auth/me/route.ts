import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest, parseTargetPrices, parseWatchlist } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        role: true,
        familyId: true,
        targetPrices: true,
        watchlist: true,
        createdAt: true,
        family: {
          select: {
            id: true,
            name: true,
            adminId: true,
            inviteCode: true,
            inviteExpiresAt: true,
            members: {
              select: { id: true, name: true, avatar: true, role: true },
            },
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      ...user,
      targetPrices: parseTargetPrices(user.targetPrices),
      watchlist: parseWatchlist(user.watchlist),
    });
  } catch (error) {
    console.error("GET /api/auth/me error:", error);
    return NextResponse.json({ error: "Failed to fetch user" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name, targetPrices, watchlist } = body;

    const updateData: Record<string, unknown> = {};
    if (name?.trim()) updateData.name = name.trim();
    if (targetPrices !== undefined) updateData.targetPrices = JSON.stringify(targetPrices);
    if (watchlist !== undefined) updateData.watchlist = JSON.stringify(watchlist);

    const user = await prisma.user.update({
      where: { id: session.userId },
      data: updateData,
      select: { id: true, name: true, email: true, role: true, familyId: true },
    });

    return NextResponse.json(user);
  } catch (error) {
    console.error("PATCH /api/auth/me error:", error);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}
