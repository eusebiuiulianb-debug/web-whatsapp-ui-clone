const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function prismaClientExists() {
  const clientPath = path.join(process.cwd(), "node_modules", ".prisma", "client", "index.js");
  return fs.existsSync(clientPath);
}

function runPrismaGenerate() {
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(command, ["prisma", "generate"], { stdio: "inherit" });
  if (result.status && result.status !== 0) {
    process.exit(result.status);
  }
}

if (!prismaClientExists()) {
  console.log("[prisma] Client missing; running prisma generate.");
  runPrismaGenerate();
}
