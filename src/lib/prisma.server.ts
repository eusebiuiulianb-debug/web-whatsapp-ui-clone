import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function hasLatestModels(client: PrismaClient) {
  const anyClient = client as any;
  return Boolean(anyClient?.analyticsEvent?.create) && Boolean(anyClient?.campaignLink?.create);
}

const prismaClient =
  globalForPrisma.prisma && hasLatestModels(globalForPrisma.prisma)
    ? (globalForPrisma.prisma as PrismaClient)
    : new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prismaClient;
}

export default prismaClient;
