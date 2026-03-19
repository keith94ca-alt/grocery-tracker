import { PrismaClient } from './node_modules/.prisma/client/index.js';
const prisma = new PrismaClient();
async function main() {
  const allItems = await prisma.item.findMany();
  const butterItems = allItems.filter(item => 
    item.name.toLowerCase().includes('salted butter')
  );
  console.log('All items count:', allItems.length);
  console.log('Butter items:', JSON.stringify(butterItems, null, 2));
  // Also let's see items with butter
  const butterLike = allItems.filter(item => 
    item.name.toLowerCase().includes('butter')
  );
  console.log('Butter-like items:', butterLike.map(i => i.name));
}
main().catch(e => { console.error(e); }).finally(() => prisma.$disconnect());