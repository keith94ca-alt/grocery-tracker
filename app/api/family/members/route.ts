import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromHeaders } from "@/lib/auth";

// DELETE /api/family/members?userId=<id>  — remove a member (admin only)
export async function DELETE(request: NextRequest) {
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

  const { searchParams } = new URL(request.url);
  const targetUserId = searchParams.get("userId");

  if (!targetUserId) {
    return NextResponse.json({ error: "userId query param required" }, { status: 400 });
  }
  if (targetUserId === session.userId) {
    return NextResponse.json({ error: "Cannot remove yourself — use leave instead" }, { status: 400 });
  }

  try {
    const target = await prisma.user.findFirst({
      where: { id: targetUserId, familyId: session.familyId },
    });
    if (!target) {
      return NextResponse.json({ error: "Member not found in your family" }, { status: 404 });
    }

    // Remove from family (data stays with the family)
    await prisma.user.update({
      where: { id: targetUserId },
      data: { familyId: null, role: "member" },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/family/members error:", error);
    return NextResponse.json({ error: "Failed to remove member" }, { status: 500 });
  }
}
