import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const prismaClient =
  globalForPrisma.prisma && typeof (globalForPrisma.prisma as PrismaClient).contentItem?.findMany === "function"
    ? (globalForPrisma.prisma as PrismaClient)
    : new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prismaClient;
}

export default prismaClient;
