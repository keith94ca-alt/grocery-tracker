import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromHeaders, setSessionCookie } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";

export async function POST(request: NextRequest) {
  const rateCheck = checkRateLimit(request);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rateCheck.retryAfterMs / 1000)) } }
    );
  }

  const session = getSessionFromHeaders(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { inviteCode } = body;

    if (!inviteCode?.trim()) {
      return NextResponse.json({ error: "Invite code is required" }, { status: 400 });
    }

    const family = await prisma.family.findUnique({
      where: { inviteCode: inviteCode.trim() },
      include: { members: true },
    });

    if (!family || !family.isActive) {
      return NextResponse.json({ error: "Invalid or expired invite code" }, { status: 403 });
    }
    if (family.inviteExpiresAt && family.inviteExpiresAt < new Date()) {
      return NextResponse.json({ error: "Invite code has expired" }, { status: 403 });
    }
    if (family.members.length >= family.maxMembers) {
      return NextResponse.json({ error: "Family is full" }, { status: 403 });
    }
    if (family.members.some((m) => m.id === session.userId)) {
      return NextResponse.json({ error: "You are already in this family" }, { status: 409 });
    }

    await prisma.user.update({
      where: { id: session.userId },
      data: { familyId: family.id, role: "member" },
    });

    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (user) {
      await setSessionCookie({
        userId: user.id,
        familyId: family.id,
        role: "member",
        name: user.name,
        email: user.email,
      });
    }

    return NextResponse.json({ familyId: family.id, name: family.name });
  } catch (error) {
    console.error("POST /api/family/join error:", error);
    return NextResponse.json({ error: "Failed to join family" }, { status: 500 });
  }
}
