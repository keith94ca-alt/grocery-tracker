import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromHeaders, setSessionCookie } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const session = getSessionFromHeaders(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!session.familyId) {
    return NextResponse.json({ error: "Not in a family" }, { status: 400 });
  }

  try {
    const family = await prisma.family.findUnique({
      where: { id: session.familyId },
      include: { members: true },
    });

    if (!family) {
      return NextResponse.json({ error: "Family not found" }, { status: 404 });
    }

    // If last member leaving, soft-delete the family so data isn't orphaned with active status
    if (family.members.length === 1) {
      await prisma.family.update({
        where: { id: session.familyId },
        data: { isActive: false },
      });
      await prisma.user.update({
        where: { id: session.userId },
        data: { familyId: null, role: "member" },
      });
      const user = await prisma.user.findUnique({ where: { id: session.userId } });
      if (user) {
        await setSessionCookie({ userId: user.id, familyId: null, role: "member", name: user.name, email: user.email });
      }
      return NextResponse.json({ success: true });
    }

    // Admin must transfer role first if other members exist
    if (session.role === "admin" && family.members.length > 1) {
      const body = await request.json().catch(() => ({}));
      const { transferToUserId } = body;

      if (!transferToUserId) {
        return NextResponse.json(
          { error: "Admin must provide transferToUserId before leaving" },
          { status: 400 }
        );
      }

      const newAdmin = family.members.find(
        (m) => m.id === transferToUserId && m.id !== session.userId
      );
      if (!newAdmin) {
        return NextResponse.json({ error: "Transfer target not found in family" }, { status: 404 });
      }

      await prisma.user.update({
        where: { id: newAdmin.id },
        data: { role: "admin" },
      });
      await prisma.family.update({
        where: { id: session.familyId },
        data: { adminId: newAdmin.id },
      });
    }

    // Remove user from family
    await prisma.user.update({
      where: { id: session.userId },
      data: { familyId: null, role: "member" },
    });

    // Refresh session cookie with no family
    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (user) {
      await setSessionCookie({
        userId: user.id,
        familyId: null,
        role: "member",
        name: user.name,
        email: user.email,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /api/family/leave error:", error);
    return NextResponse.json({ error: "Failed to leave family" }, { status: 500 });
  }
}
