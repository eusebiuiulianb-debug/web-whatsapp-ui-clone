import "dotenv/config";
import path from "path";
import { defineConfig, env } from "prisma/config";

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

process.env.DATABASE_URL = normalizeDatabaseUrl(process.env.DATABASE_URL);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node --experimental-strip-types prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
