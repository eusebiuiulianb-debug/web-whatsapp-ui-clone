const { spawnSync } = require("child_process");

function runPrismaGenerate() {
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(command, ["prisma", "generate"], { encoding: "utf-8" });
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  if (result.status && result.status !== 0) {
    const output = `${result.stdout || ""}\n${result.stderr || ""}`;
    if (/EPERM|operation not permitted/i.test(output)) {
      console.error(
        "[prisma] EPERM detected. Close `npm run dev` and any Node processes, then re-run prisma generate/migrate."
      );
    }
    process.exit(result.status);
  }
}

runPrismaGenerate();
