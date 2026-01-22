import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function hasRequiredDelegates(client: PrismaClient) {
  const delegates = client as { accessRequest?: unknown; creatorFanBlock?: unknown };
  return Boolean(delegates.accessRequest && delegates.creatorFanBlock);
}

const existing = globalForPrisma.prisma;
export const prisma = existing && hasRequiredDelegates(existing) ? existing : new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
