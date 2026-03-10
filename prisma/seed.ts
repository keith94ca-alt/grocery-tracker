import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Seed some common stores
  const stores = [
    { name: "No Frills", location: "Waterloo", type: "grocery" },
    { name: "FreshCo", location: "Kitchener", type: "grocery" },
    { name: "Walmart", location: "Waterloo", type: "grocery" },
    { name: "Loblaws", location: "Waterloo", type: "grocery" },
    { name: "Metro", location: "Waterloo", type: "grocery" },
    { name: "St. Jacobs Market", location: "St. Jacobs", type: "market" },
    { name: "Costco", location: "Kitchener", type: "warehouse" },
    { name: "Farm Boy", location: "Waterloo", type: "grocery" },
  ];

  for (const store of stores) {
    await prisma.store.upsert({
      where: { name: store.name },
      update: {},
      create: store,
    });
  }

  console.log("Seeded stores successfully");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
