const fs = require("fs");
const path = require("path");

function isNextHealthy() {
  const root = process.cwd();
  const buildIdPath = path.join(root, ".next", "BUILD_ID");
  const pagesManifestPath = path.join(root, ".next", "server", "pages-manifest.json");
  return fs.existsSync(buildIdPath) && fs.existsSync(pagesManifestPath);
}

function cleanNext() {
  const target = path.join(process.cwd(), ".next");
  try {
    fs.rmSync(target, { recursive: true, force: true });
  } catch (_err) {
    // Silence on purpose.
  }
}

if (!isNextHealthy()) {
  cleanNext();
}
