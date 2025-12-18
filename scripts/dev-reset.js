const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

function cleanNext() {
  const target = path.join(process.cwd(), ".next");
  try {
    fs.rmSync(target, { recursive: true, force: true });
  } catch (_err) {
    // silent best-effort
  }
}

function startDev() {
  const child = spawn("npx", ["next", "dev", "-p", "3005"], {
    stdio: "inherit",
    shell: true,
  });
  child.on("exit", (code) => process.exit(code ?? 0));
}

cleanNext();
startDev();
