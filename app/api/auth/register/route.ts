import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, setSessionCookie } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";

export async function POST(request: NextRequest) {
  const rateCheck = checkRateLimit(request);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rateCheck.retryAfterMs / 1000)) },
      }
    );
  }

  try {
    const body = await request.json();
    const { email, password, name, inviteCode } = body;

    // Validation
    if (!email?.trim() || !password || !name?.trim()) {
      return NextResponse.json({ error: "Email, password, and name are required" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    // Bootstrap check first (cheap count query)
    const userCount = await prisma.user.count();
    const isFirstUser = userCount === 0;

    // Check if email already exists
    const existing = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (existing) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }

    let familyId: string | null = null;
    let role = "member";

    if (isFirstUser) {
      // First user: auto-create a family and become admin
      const family = await prisma.family.create({
        data: {
          name: `${name.trim()}'s Family`,
          adminId: "pending", // will update after user creation
          inviteExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
      familyId = family.id;
      role = "admin";

      const passwordHash = await hashPassword(password);
      const user = await prisma.user.create({
        data: {
          email: email.trim().toLowerCase(),
          passwordHash,
          name: name.trim(),
          familyId,
          role,
        },
      });

      // Update family adminId now that we have the user id
      await prisma.family.update({
        where: { id: familyId },
        data: { adminId: user.id },
      });

      // Backfill all existing data to this family
      await Promise.all([
        prisma.item.updateMany({ where: { familyId: null }, data: { familyId } }),
        prisma.store.updateMany({ where: { familyId: null }, data: { familyId } }),
        prisma.priceEntry.updateMany({ where: { familyId: null }, data: { familyId } }),
        prisma.shoppingListItem.updateMany({ where: { familyId: null }, data: { familyId } }),
        prisma.flyerNote.updateMany({ where: { familyId: null }, data: { familyId } }),
        prisma.dismissedFlyerMatch.updateMany({ where: { familyId: null }, data: { familyId } }),
      ]);

      await setSessionCookie({ userId: user.id, familyId, role, name: user.name, email: user.email });
      return NextResponse.json({
        id: user.id,
        name: user.name,
        email: user.email,
        familyId,
        role,
      });
    }

    // Non-first user: require invite code
    if (!inviteCode?.trim()) {
      return NextResponse.json({ error: "Invite code is required to register" }, { status: 403 });
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

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email: email.trim().toLowerCase(),
        passwordHash,
        name: name.trim(),
        familyId: family.id,
        role: "member",
      },
    });

    await setSessionCookie({ userId: user.id, familyId: family.id, role: "member", name: user.name, email: user.email });
    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      familyId: family.id,
      role: "member",
    });
  } catch (error) {
    console.error("POST /api/auth/register error:", error);
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
