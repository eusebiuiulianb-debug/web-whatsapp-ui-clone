const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Module } = require("node:module");
const ts = require("typescript");

function loadPriorityModule() {
  const sourcePath = path.join(process.cwd(), "src/lib/agency/priorityScore.ts");
  const source = fs.readFileSync(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
    },
  });
  const moduleInstance = new Module("priorityScore.ts", module);
  moduleInstance.filename = sourcePath;
  moduleInstance.paths = Module._nodeModulePaths(process.cwd());
  moduleInstance._compile(compiled.outputText, sourcePath);
  return moduleInstance.exports;
}

test("priority score scenarios: NEW+VIP, OFFER+frio, HEAT+activo, RECOVERY", () => {
  const { computeAgencyPriorityScore } = loadPriorityModule();
  const now = new Date("2024-02-10T12:00:00.000Z");

  const scores = {
    newVip: computeAgencyPriorityScore({
      now,
      stage: "NEW",
      objective: "CONNECT",
      intensity: "MEDIUM",
      lastIncomingAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      lastOutgoingAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
      spent7d: 0,
      spent30d: 0,
      flags: { vip: true, isNew: true },
    }),
    offerCold: computeAgencyPriorityScore({
      now,
      stage: "OFFER",
      objective: "SELL_EXTRA",
      intensity: "MEDIUM",
      lastIncomingAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
      lastOutgoingAt: new Date(now.getTime() - 11 * 24 * 60 * 60 * 1000),
      spent7d: 0,
      spent30d: 50,
      flags: {},
    }),
    heatActive: computeAgencyPriorityScore({
      now,
      stage: "HEAT",
      objective: "SELL_EXTRA",
      intensity: "INTENSE",
      lastIncomingAt: new Date(now.getTime() - 1 * 60 * 60 * 1000),
      lastOutgoingAt: new Date(now.getTime() - 3 * 60 * 60 * 1000),
      spent7d: 40,
      spent30d: 120,
      flags: {},
    }),
    recovery: computeAgencyPriorityScore({
      now,
      stage: "RECOVERY",
      objective: "RECOVER",
      intensity: "MEDIUM",
      lastIncomingAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
      lastOutgoingAt: new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000),
      spent7d: 0,
      spent30d: 0,
      flags: { atRisk: true },
    }),
  };

  Object.entries(scores).forEach(([label, score]) => {
    assert.equal(Number.isFinite(score), true, `${label} should be a finite score`);
  });

  assert.ok(scores.heatActive > scores.offerCold, "heat+activo should outrank offer+frio");
  assert.ok(scores.offerCold > scores.recovery, "offer+frio should outrank recovery");
  assert.ok(scores.recovery > scores.newVip, "recovery should outrank new+vip");
});
