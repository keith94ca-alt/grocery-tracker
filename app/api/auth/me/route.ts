import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest, parseTargetPrices, parseWatchlist } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
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
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name, targetPrices, watchlist } = body;

    const updateData: Record<string, unknown> = {};
    if (name?.trim()) updateData.name = name.trim();

    if (targetPrices !== undefined) {
      if (typeof targetPrices !== "object" || Array.isArray(targetPrices) || targetPrices === null) {
        return NextResponse.json({ error: "targetPrices must be a plain object" }, { status: 400 });
      }
      for (const [k, v] of Object.entries(targetPrices)) {
        if (typeof v !== "number" || isNaN(v as number) || (v as number) < 0) {
          return NextResponse.json({ error: `targetPrices.${k} must be a non-negative number` }, { status: 400 });
        }
      }
      if (Object.keys(targetPrices).length > 500) {
        return NextResponse.json({ error: "targetPrices too large" }, { status: 400 });
      }
      updateData.targetPrices = JSON.stringify(targetPrices);
    }

    if (watchlist !== undefined) {
      if (!Array.isArray(watchlist)) {
        return NextResponse.json({ error: "watchlist must be an array" }, { status: 400 });
      }
      if (watchlist.some((v) => typeof v !== "number" || !Number.isInteger(v) || v < 0)) {
        return NextResponse.json({ error: "watchlist must contain non-negative integers only" }, { status: 400 });
      }
      if (watchlist.length > 500) {
        return NextResponse.json({ error: "watchlist too large" }, { status: 400 });
      }
      updateData.watchlist = JSON.stringify(watchlist);
    }

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
