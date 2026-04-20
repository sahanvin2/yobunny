const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const result = await prisma.$queryRawUnsafe('SELECT (SELECT COUNT(*) FROM "Video") as total');
  console.log(result);
}
main().catch(console.error).finally(() => prisma.$disconnect());
