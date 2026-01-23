import { rm } from "fs/promises";
import net from "net";
import path from "path";
import { spawn, spawnSync } from "child_process";
import { fileURLToPath } from "url";

const PORTS_TO_CHECK = [3005, 3000, 3007];
const HOST = "127.0.0.1";
const SCHEMA_ARG = "prisma/schema.prisma";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NODE_MAJOR = Number.parseInt(process.versions.node.split(".")[0] || "0", 10);

async function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const cleanup = (open) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(open);
    };

    socket.setTimeout(300);
    socket.once("connect", () => cleanup(true));
    socket.once("timeout", () => cleanup(false));
    socket.once("error", () => cleanup(false));
    socket.connect(port, HOST);
  });
}

async function checkPorts() {
  const results = await Promise.all(PORTS_TO_CHECK.map(async (port) => [port, await isPortOpen(port)]));
  return results.filter(([, open]) => open).map(([port]) => port);
}

function resolveCommand(command, args) {
  if (process.platform !== "win32") {
    return { cmd: command, args };
  }
  if (Number.isFinite(NODE_MAJOR) && NODE_MAJOR >= 24) {
    return { cmd: "cmd.exe", args: ["/d", "/s", "/c", command.replace(/\.cmd$/i, ""), ...args] };
  }
  return { cmd: command, args };
}

function runGenerate() {
  const baseCommand = process.platform === "win32" ? "npx.cmd" : "npx";
  const baseArgs = ["prisma", "generate", "--schema", SCHEMA_ARG];
  const { cmd, args } = resolveCommand(baseCommand, baseArgs);
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: "inherit",
      shell: false,
      cwd: repoRoot,
    });
    child.on("error", (err) => reject(err));
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`prisma generate exited with code ${code ?? "unknown"}`));
    });
  });
}

function runSmoke() {
  const smokePath = path.join(repoRoot, "scripts", "prisma-smoke.cjs");
  const result = spawnSync(process.execPath, [smokePath], {
    encoding: "utf-8",
    cwd: repoRoot,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  const ok =
    /fan:\s*true/.test(output) &&
    /message:\s*true/.test(output) &&
    /creator:\s*true/.test(output) &&
    /popClip:\s*true/.test(output);
  return { ok, status: result.status ?? 0 };
}

function printDiagnostics() {
  console.error("[prisma] Smoke failed. Diagnostics:");
  console.error(`[prisma] generate args: prisma generate --schema ${SCHEMA_ARG}`);

  const resolveResult = spawnSync(process.execPath, ["-e", "console.log(require.resolve('@prisma/client'))"], {
    encoding: "utf-8",
    cwd: repoRoot,
  });
  if (resolveResult.stdout) {
    console.error(`[prisma] @prisma/client resolved to: ${resolveResult.stdout.trim()}`);
  }
  if (resolveResult.stderr) {
    console.error(resolveResult.stderr.trim());
  }
  if (resolveResult.error) {
    console.error("[prisma] Error resolving @prisma/client:", resolveResult.error);
  }

  const npmBaseCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const { cmd, args } = resolveCommand(npmBaseCommand, ["ls", "prisma", "@prisma/client"]);
  const npmResult = spawnSync(cmd, args, {
    encoding: "utf-8",
    cwd: repoRoot,
  });
  if (npmResult.stdout) console.error(npmResult.stdout.trim());
  if (npmResult.stderr) console.error(npmResult.stderr.trim());
}

async function run() {
  const openPorts = await checkPorts();
  if (openPorts.length > 0) {
    console.error(
      `Puertos activos detectados: ${openPorts.join(
        ", "
      )}. Cierra \`npm run dev\` (Node bloquea Prisma). Luego reintenta.`
    );
    process.exit(1);
  }

  await rm(path.join(repoRoot, "node_modules", ".prisma"), { recursive: true, force: true });

  await runGenerate();
  const smoke = runSmoke();
  if (!smoke.ok || smoke.status !== 0) {
    printDiagnostics();
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("Error ejecutando prisma generate:", err);
  process.exit(1);
});
