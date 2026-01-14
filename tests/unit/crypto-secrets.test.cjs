const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Module } = require("node:module");
const ts = require("typescript");

function loadSecretsModule() {
  const sourcePath = path.join(process.cwd(), "src/lib/crypto/secrets.ts");
  const source = fs.readFileSync(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
    },
  });
  const moduleInstance = new Module("secrets.ts", module);
  moduleInstance.filename = sourcePath;
  moduleInstance.paths = Module._nodeModulePaths(process.cwd());
  moduleInstance._compile(compiled.outputText, sourcePath);
  return moduleInstance.exports;
}

function withEnv(overrides, fn) {
  const previous = {};
  for (const key of Object.keys(overrides)) {
    previous[key] = process.env[key];
    const value = overrides[key];
    if (value === undefined || value === null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return fn();
  } finally {
    for (const key of Object.keys(overrides)) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
}

test("decrypts payload encrypted with legacy hex when in keyring fallback", () => {
  const base64Key = Buffer.alloc(32, 7).toString("base64");
  const hexKey = Buffer.alloc(32, 3).toString("hex");
  const payload = withEnv(
    { APP_SECRET_KEYS: `hex:${hexKey}`, APP_SECRET_KEY: undefined },
    () => {
      const secrets = loadSecretsModule();
      return secrets.encryptSecret("hello");
    }
  );

  const decrypted = withEnv(
    { APP_SECRET_KEYS: `${base64Key},hex:<${hexKey}>`, APP_SECRET_KEY: undefined },
    () => {
      const secrets = loadSecretsModule();
      return secrets.decryptSecret(payload);
    }
  );

  assert.equal(decrypted, "hello");
});

test("accepts hex:64hex and raw <64hex> entries", () => {
  const hexKey1 = Buffer.alloc(32, 11).toString("hex");
  const hexKey2 = Buffer.alloc(32, 19).toString("hex");
  withEnv({ APP_SECRET_KEYS: `hex:${hexKey1},<${hexKey2}>`, APP_SECRET_KEY: undefined }, () => {
    const secrets = loadSecretsModule();
    const encrypted = secrets.encryptSecret("ping");
    const decrypted = secrets.decryptSecret(encrypted);
    assert.equal(decrypted, "ping");
  });
});
