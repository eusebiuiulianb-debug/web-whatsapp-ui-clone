import path from "path";
import { PrismaClient } from "@prisma/client";

function normalizeDatabaseUrl(raw?: string | null): string {
  const defaultUrl = "file:./dev.db";
  let value = raw && raw.trim().length > 0 ? raw.trim() : defaultUrl;
  if (value.startsWith("prisma://") || value.startsWith("prisma+postgres://")) {
    return value;
  }
  if (!value.startsWith("file:")) {
    value = defaultUrl;
  }

  const filePath = value.replace(/^file:/, "");
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  return `file:${absolutePath}`;
}

const resolvedDatabaseUrl = normalizeDatabaseUrl(process.env.DATABASE_URL);
process.env.DATABASE_URL = resolvedDatabaseUrl;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const hasLoggedPrismaUrl = globalThis as unknown as { __prismaUrlLogged?: boolean };

function hasLatestModels(client: PrismaClient) {
  const anyClient = client as any;
  return (
    Boolean(anyClient?.analyticsEvent?.create) &&
    Boolean(anyClient?.campaignLink?.create) &&
    Boolean(anyClient?.campaignMeta?.create) &&
    Boolean(anyClient?.catalogItem?.create) &&
    Boolean(anyClient?.popClip?.create)
  );
}

const prismaClient =
  globalForPrisma.prisma && hasLatestModels(globalForPrisma.prisma)
    ? (globalForPrisma.prisma as PrismaClient)
    : new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prismaClient;
}

if (process.env.NODE_ENV !== "production" && !hasLoggedPrismaUrl.__prismaUrlLogged) {
  hasLoggedPrismaUrl.__prismaUrlLogged = true;
  console.info("[prisma] Using DATABASE_URL", {
    url: resolvedDatabaseUrl,
    cwd: process.cwd(),
  });
}

export default prismaClient;
