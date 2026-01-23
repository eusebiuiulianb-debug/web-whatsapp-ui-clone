const { PrismaClient } = require("@prisma/client");

async function main() {
  const prisma = new PrismaClient();
  const result = {
    fan: Boolean(prisma.fan),
    message: Boolean(prisma.message),
    creator: Boolean(prisma.creator),
    popClip: Boolean(prisma.popClip),
  };
  console.log(result);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[prisma] Smoke failed:", err);
  process.exit(1);
});
