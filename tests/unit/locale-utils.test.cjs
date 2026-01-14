const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Module } = require("node:module");
const ts = require("typescript");

function loadLanguageModule() {
  const sourcePath = path.join(process.cwd(), "src/lib/language.ts");
  const source = fs.readFileSync(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
    },
  });
  const moduleInstance = new Module("language.ts", module);
  moduleInstance.filename = sourcePath;
  moduleInstance.paths = Module._nodeModulePaths(process.cwd());
  moduleInstance._compile(compiled.outputText, sourcePath);
  return moduleInstance.exports;
}

test("normalizeLocale returns exact + base", () => {
  const { normalizeLocale } = loadLanguageModule();
  assert.deepEqual(normalizeLocale("fr-FR"), ["fr-FR", "fr"]);
  assert.deepEqual(normalizeLocale("pt_br"), ["pt-BR", "pt"]);
});

test("getLabel resolves exact, base, and en fallback", () => {
  const { getLabel } = loadLanguageModule();
  const labels = { "pt-BR": "Oi", es: "Hola", en: "Hi" };
  assert.equal(getLabel(labels, "pt-br", "CODE"), "Oi");
  assert.equal(getLabel(labels, "pt-PT", "CODE"), "Oi");
  assert.equal(getLabel(labels, "fr-FR", "CODE"), "Hi");
});
