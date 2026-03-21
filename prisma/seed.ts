/**
 * Seed / first-boot migration script.
 *
 * Runs on container start via docker-entrypoint.sh.
 * Safe to run multiple times — skips everything if a User already exists.
 *
 * What it does on first boot:
 *  1. Creates the seed family ("My Family")
 *  2. Creates the admin user from env vars SEED_EMAIL / SEED_PASSWORD / SEED_NAME
 *  3. Backfills familyId on all existing rows (Items, Stores, PriceEntries, etc.)
 *
 * Env vars:
 *   SEED_EMAIL     — admin email (required for first boot)
 *   SEED_PASSWORD  — admin password (required for first boot, min 8 chars)
 *   SEED_NAME      — admin display name (default: "Admin")
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const userCount = await prisma.user.count();

  if (userCount > 0) {
    console.log("Seed: users already exist, skipping.");
    return;
  }

  const email = process.env.SEED_EMAIL;
  const password = process.env.SEED_PASSWORD;
  const name = process.env.SEED_NAME || "Admin";

  if (!email || !password) {
    console.log("Seed: SEED_EMAIL and SEED_PASSWORD not set — skipping user creation.");
    console.log("Seed: First user to register via /register will become admin automatically.");
    return;
  }

  if (password.length < 8) {
    console.error("Seed: SEED_PASSWORD must be at least 8 characters. Skipping.");
    return;
  }

  console.log(`Seed: Creating family and admin user (${email})...`);

  // Create family first with placeholder adminId
  const family = await prisma.family.create({
    data: {
      name: `${name}'s Family`,
      adminId: "pending",
      inviteExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  // Create admin user
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

  // Fix adminId
  await prisma.family.update({
    where: { id: family.id },
    data: { adminId: user.id },
  });

  // Backfill familyId on all existing data rows
  const [items, stores, prices, list, flyerNotes, dismissed] = await Promise.all([
    prisma.item.updateMany({ where: { familyId: null }, data: { familyId: family.id } }),
    prisma.store.updateMany({ where: { familyId: null }, data: { familyId: family.id } }),
    prisma.priceEntry.updateMany({ where: { familyId: null }, data: { familyId: family.id } }),
    prisma.shoppingListItem.updateMany({ where: { familyId: null }, data: { familyId: family.id } }),
    prisma.flyerNote.updateMany({ where: { familyId: null }, data: { familyId: family.id } }),
    prisma.dismissedFlyerMatch.updateMany({ where: { familyId: null }, data: { familyId: family.id } }),
  ]);

  console.log(`Seed: ✅ Done.`);
  console.log(`  Family: "${family.name}" (${family.id})`);
  console.log(`  Admin:  ${user.email} (${user.id})`);
  console.log(`  Backfilled: ${items.count} items, ${stores.count} stores, ${prices.count} price entries, ${list.count} list items, ${flyerNotes.count} flyer notes, ${dismissed.count} dismissed matches`);
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
