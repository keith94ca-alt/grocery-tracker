import { PrismaClient } from './node_modules/.prisma/client/index.js';
const prisma = new PrismaClient();
async function main() {
  const allItems = await prisma.item.findMany({
    select: {
      id: true,
      name: true,
      unit: true,
      watched: true,
      targetPrice: true,
      _count: {
        select: {
          priceEntries: true
        }
      }
    }
  });
  console.log('All items:');
  allItems.forEach(item => {
    console.log(`${item.id}: ${item.name} (unit: ${item.unit}, watched: ${item.watched}, targetPrice: ${item.targetPrice}, entries: ${item._count.priceEntries})`);
  });
}
main().catch(e => { console.error(e); }).finally(() => prisma.$disconnect());