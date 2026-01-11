const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Module } = require("node:module");
const ts = require("typescript");

function loadObjectivesModule() {
  const sourcePath = path.join(process.cwd(), "src/lib/agency/objectives.ts");
  const source = fs.readFileSync(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
    },
  });
  const moduleInstance = new Module("objectives.ts", module);
  moduleInstance.filename = sourcePath;
  moduleInstance.paths = Module._nodeModulePaths(process.cwd());
  moduleInstance._compile(compiled.outputText, sourcePath);
  return moduleInstance.exports;
}

test("normalizeObjectiveCode slugifies to MAYUS_SNAKE", () => {
  const { normalizeObjectiveCode } = loadObjectivesModule();
  assert.equal(normalizeObjectiveCode("sell pack"), "SELL_PACK");
  assert.equal(normalizeObjectiveCode("  Connect  "), "CONNECT");
});

test("resolveObjectiveLabel respects locale for built-ins", () => {
  const { resolveObjectiveLabel } = loadObjectivesModule();
  assert.equal(resolveObjectiveLabel({ code: "CONNECT", locale: "es" }), "Conectar");
  assert.equal(resolveObjectiveLabel({ code: "SELL_MONTHLY", locale: "en" }), "Sell monthly");
});

test("resolveObjectiveLabel uses custom labels with fallback", () => {
  const { resolveObjectiveLabel } = loadObjectivesModule();
  const labelsByCode = new Map([
    ["CUSTOM_GOAL", { es: "Reactivar", en: "Re-engage" }],
  ]);

  assert.equal(
    resolveObjectiveLabel({ code: "custom goal", locale: "es", labelsByCode }),
    "Reactivar"
  );
  assert.equal(
    resolveObjectiveLabel({ code: "CUSTOM_GOAL", locale: "ro", labelsByCode }),
    "Re-engage"
  );
});

test("resolveObjectiveForScoring falls back to CONNECT for unknown", () => {
  const { resolveObjectiveForScoring } = loadObjectivesModule();
  assert.equal(resolveObjectiveForScoring("CUSTOM_GOAL"), "CONNECT");
});
