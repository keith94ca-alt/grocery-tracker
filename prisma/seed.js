/**
 * First-boot seed script (plain JS — runs via node in docker-entrypoint.sh)
 * Safe to run multiple times — skips if users already exist.
 */

"use strict";

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const userCount = await prisma.user.count();
  if (userCount > 0) {
    console.log("Seed: users exist, skipping.");
    return;
  }

  const email = process.env.SEED_EMAIL;
  const password = process.env.SEED_PASSWORD;
  const name = process.env.SEED_NAME || "Admin";

  if (!email || !password) {
    console.log("Seed: SEED_EMAIL/SEED_PASSWORD not set. First user to register becomes admin.");
    return;
  }

  if (password.length < 8) {
    console.error("Seed: SEED_PASSWORD must be at least 8 characters. Skipping.");
    return;
  }

  console.log("Seed: Creating family and admin user (" + email + ")...");

  const family = await prisma.family.create({
    data: {
      name: name.trim() + "'s Family",
      adminId: "pending",
      inviteExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: {
      email: email.trim().toLowerCase(),
      passwordHash,
      name: name.trim(),
      familyId: family.id,
      role: "admin",
    },
  });

  await prisma.family.update({
    where: { id: family.id },
    data: { adminId: user.id },
  });

  const results = await Promise.all([
    prisma.item.updateMany({ where: { familyId: null }, data: { familyId: family.id } }),
    prisma.store.updateMany({ where: { familyId: null }, data: { familyId: family.id } }),
    prisma.priceEntry.updateMany({ where: { familyId: null }, data: { familyId: family.id } }),
    prisma.shoppingListItem.updateMany({ where: { familyId: null }, data: { familyId: family.id } }),
    prisma.flyerNote.updateMany({ where: { familyId: null }, data: { familyId: family.id } }),
    prisma.dismissedFlyerMatch.updateMany({ where: { familyId: null }, data: { familyId: family.id } }),
  ]);

  console.log("Seed: Done. Family: " + family.id + ", User: " + user.email);
  console.log("Seed: Backfilled items=" + results[0].count + " stores=" + results[1].count + " prices=" + results[2].count);
}

main()
  .catch((e) => { console.error("Seed error:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
