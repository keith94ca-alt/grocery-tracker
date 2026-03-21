import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromHeaders } from "@/lib/auth";
import { randomUUID } from "crypto";

export async function POST(request: NextRequest) {
  const session = getSessionFromHeaders(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  if (!session.familyId) {
    return NextResponse.json({ error: "No family found" }, { status: 404 });
  }

  try {
    const family = await prisma.family.update({
      where: { id: session.familyId },
      data: {
        inviteCode: randomUUID(),
        inviteExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return NextResponse.json({
      inviteCode: family.inviteCode,
      inviteExpiresAt: family.inviteExpiresAt,
    });
  } catch (error) {
    console.error("POST /api/family/invite error:", error);
    return NextResponse.json({ error: "Failed to regenerate invite code" }, { status: 500 });
  }
}
