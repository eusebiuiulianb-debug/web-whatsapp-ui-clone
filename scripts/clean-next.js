const fs = require("fs");
const path = require("path");

function cleanNextDir() {
  const target = path.join(process.cwd(), ".next");
  try {
    fs.rmSync(target, { recursive: true, force: true });
  } catch (_err) {
    // Silent failure is fine; the goal is best-effort cleanup.
  }
}

cleanNextDir();
