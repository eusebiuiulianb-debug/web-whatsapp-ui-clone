const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { createRequire } = require("module");

const require = createRequire(__filename);
const nextBin = require.resolve("next/dist/bin/next");

function cleanNext() {
  const target = path.join(process.cwd(), ".next");
  try {
    fs.rmSync(target, { recursive: true, force: true });
  } catch (_err) {
    // silent best-effort
  }
}

function startDev() {
  const child = spawn(process.execPath, [nextBin, "dev", "-p", "3005"], {
    stdio: "inherit",
    shell: false,
  });
  child.on("exit", (code) => process.exit(code ?? 0));
}

cleanNext();
startDev();
