import { spawn } from "child_process";
import net from "net";
import { createRequire } from "module";

const fetchFn = globalThis.fetch;
if (typeof fetchFn !== "function") {
  throw new Error("Global fetch is not available. Run with Node 18+ to use built-in fetch.");
}

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");

async function findPort(start = 3100, max = 3999) {
  for (let port = start; port <= max; port += 1) {
    // eslint-disable-next-line no-await-in-loop
    const free = await new Promise((resolve) => {
      const server = net.createServer();
      server.unref();
      server.on("error", () => resolve(false));
      server.listen(port, () => {
        server.close(() => resolve(true));
      });
    });
    if (free) return port;
  }
  throw new Error("No free port found for smoke test");
}

function waitForReady(child, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for dev server")), timeoutMs);
    child.stdout.on("data", (data) => {
      const text = data.toString();
      if (text.toLowerCase().includes("started server")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.stderr.on("data", (data) => {
      const text = data.toString();
      if (text.toLowerCase().includes("error")) {
        clearTimeout(timer);
        reject(new Error(text));
      }
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Dev server exited early with code ${code}`));
    });
  });
}

async function main() {
  const port = await findPort();
  const child = spawn(process.execPath, [nextBin, "dev", "-p", String(port)], {
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });

  try {
    await waitForReady(child);
    const base = `http://127.0.0.1:${port}`;

    const fansRes = await fetchFn(`${base}/api/fans`);
    const fansJson = await fansRes.json().catch(() => ({}));
    if (!fansRes.ok || !fansJson?.ok || !Array.isArray(fansJson.items)) {
      throw new Error(`fans failed status=${fansRes.status} body=${JSON.stringify(fansJson)}`);
    }

    const ids = fansJson.items.slice(0, 3).map((fan) => fan.id).filter(Boolean);
    for (const id of ids) {
      const msgRes = await fetchFn(`${base}/api/messages?fanId=${encodeURIComponent(id)}`);
      const msgJson = await msgRes.json().catch(() => ({}));
      if (!msgRes.ok || !msgJson?.ok || !Array.isArray(msgJson.items)) {
        throw new Error(`messages failed id=${id} status=${msgRes.status} body=${JSON.stringify(msgJson)}`);
      }
    }
    console.log("smoke: ok");
  } finally {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (!child.killed) {
          child.kill("SIGKILL");
        }
        resolve(undefined);
      }, 5000);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve(undefined);
      });
    });
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
