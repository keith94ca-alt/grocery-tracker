import { PrismaClient } from './node_modules/.prisma/client/index.js';
const prisma = new PrismaClient();
async function main() {
  // Check flyer notes for butter
  const flyerNotes = await prisma.flyerNote.findMany({
    where: {
      item: {
        name: {
          contains: 'butter',
          mode: 'insensitive'
        }
      }
    },
    include: {
      item: true
    }
  });
  console.log('Flyer notes for butter:');
  console.log(JSON.stringify(flyerNotes, null, 2));
  
  // Also get all flyer notes to see what's there
  const allFlyerNotes = await prisma.flyerNote.findMany({
    include: {
      item: true
    }
  });
  console.log(`Total flyer notes: ${allFlyerNotes.length}`);
  const butterFlyer = allFlyerNotes.filter(note => 
    note.item.name.toLowerCase().includes('butter')
  );
  console.log(`Butter flyer notes: ${butterFlyer.length}`);
  butterFlyer.forEach(note => {
    console.log(`- ${note.item.name}: ${note.price} at ${note.store} (Flipp ID: ${note.flippId})`);
  });
}
main().catch(e => { console.error(e); }).finally(() => prisma.$disconnect());