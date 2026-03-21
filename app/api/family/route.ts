import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromHeaders } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const session = getSessionFromHeaders(request);
  if (!session?.familyId) {
    return NextResponse.json({ error: "No family found" }, { status: 404 });
  }

  try {
    const family = await prisma.family.findUnique({
      where: { id: session.familyId },
      include: {
        members: {
          select: { id: true, name: true, email: true, avatar: true, role: true, createdAt: true },
        },
      },
    });

    if (!family || !family.isActive) {
      return NextResponse.json({ error: "Family not found" }, { status: 404 });
    }

    // Only expose invite code to admins
    return NextResponse.json({
      id: family.id,
      name: family.name,
      adminId: family.adminId,
      inviteCode: session.role === "admin" ? family.inviteCode : null,
      inviteExpiresAt: session.role === "admin" ? family.inviteExpiresAt : null,
      maxMembers: family.maxMembers,
      members: family.members,
    });
  } catch (error) {
    console.error("GET /api/family error:", error);
    return NextResponse.json({ error: "Failed to fetch family" }, { status: 500 });
  }
}
