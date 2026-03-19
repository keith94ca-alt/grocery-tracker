import { PrismaClient } from './node_modules/.prisma/client/index.js';
const prisma = new PrismaClient();
async function main() {
  const items = await prisma.item.findMany();
  console.log(JSON.stringify(items, null, 2));
}
main().catch(e => { console.error(e); }).finally(() => prisma.$disconnect());