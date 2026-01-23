const { spawnSync } = require("child_process");
const path = require("path");
const NODE_MAJOR = Number.parseInt(process.versions.node.split(".")[0] || "0", 10);

function resolveCommand(command, args) {
  if (process.platform !== "win32") {
    return { cmd: command, args };
  }
  if (Number.isFinite(NODE_MAJOR) && NODE_MAJOR >= 24) {
    return { cmd: "cmd.exe", args: ["/d", "/s", "/c", command.replace(/\.cmd$/i, ""), ...args] };
  }
  return { cmd: command, args };
}

function runPrismaGenerate() {
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const args = ["prisma", "generate", "--schema", "prisma/schema.prisma"];
  const repoRoot = path.resolve(__dirname, "..");
  const resolved = resolveCommand(command, args);
  const result = spawnSync(resolved.cmd, resolved.args, { encoding: "utf-8", shell: false, cwd: repoRoot });
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
