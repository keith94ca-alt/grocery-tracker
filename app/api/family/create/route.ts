import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromHeaders, setSessionCookie } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const session = getSessionFromHeaders(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Family name is required" }, { status: 400 });
    }

    // Create the new family
    const family = await prisma.family.create({
      data: {
        name: name.trim(),
        adminId: session.userId,
        inviteExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    // Update user to new family as admin
    await prisma.user.update({
      where: { id: session.userId },
      data: { familyId: family.id, role: "admin" },
    });

    // Refresh the session cookie with new familyId + role
    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (user) {
      await setSessionCookie({
        userId: user.id,
        familyId: family.id,
        role: "admin",
        name: user.name,
        email: user.email,
      });
    }

    return NextResponse.json({ id: family.id, name: family.name, inviteCode: family.inviteCode });
  } catch (error) {
    console.error("POST /api/family/create error:", error);
    return NextResponse.json({ error: "Failed to create family" }, { status: 500 });
  }
}
