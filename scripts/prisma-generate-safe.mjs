import { rm } from "fs/promises";
import net from "net";
import path from "path";
import { spawn } from "child_process";

const PORTS_TO_CHECK = [3005, 3000, 3007];
const HOST = "127.0.0.1";

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

function getPrismaBinary() {
  const binName = process.platform === "win32" ? "prisma.cmd" : "prisma";
  return path.join("node_modules", ".bin", binName);
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

  await rm("node_modules/.prisma", { recursive: true, force: true });

  const prismaBin = getPrismaBinary();
  const child = spawn(prismaBin, ["generate"], { stdio: "inherit" });
  child.on("exit", (code) => process.exit(code ?? 1));
  child.on("error", () => process.exit(1));
}

run().catch((err) => {
  console.error("Error ejecutando prisma generate:", err);
  process.exit(1);
});
