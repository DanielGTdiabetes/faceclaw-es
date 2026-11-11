const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const { loader } = require("./helpers/load-typescript.cjs");

test("switching from G2 to a saved G1 closes the old link before restoring addresses", async () => {
  const settings = new Map();
  const load = loader({}, {
    "@nativescript/core": { ApplicationSettings: {
      getString: (key, fallback) => settings.get(key) ?? fallback,
      setString: (key, value) => settings.set(key, value),
      remove: (key) => settings.delete(key),
    } },
    "./even-advertisement": { normalizeMacAddress: (value) => value.toUpperCase() },
  });
  const addresses = load("app/g2/device-addresses.ts");
  const g1 = { left: "10:00:00:00:00:01", right: "10:00:00:00:00:02", ring: "" };
  const g2 = { left: "20:00:00:00:00:01", right: "20:00:00:00:00:02", ring: "20:00:00:00:00:03" };
  addresses.saveDeviceAddresses(g1);
  addresses.rememberEvenPair("g1");
  addresses.saveDeviceAddresses(g2);

  const source = ts.createSourceFile("main.ts", fs.readFileSync("app/phone-ui/main-view-model.ts", "utf8"),
    ts.ScriptTarget.Latest, true);
  const main = source.statements.find((node) => ts.isClassDeclaration(node) && node.name.text === "MainViewModel");
  const switchMethod = main.members.find((node) => node.name?.getText(source) === "onSwitchEvenPairTap");
  const view = { canRun: true, phase: "connected" };
  let active = "g2";
  let release;
  const disconnected = new Promise((resolve) => { release = resolve; });
  const context = {
    exports: {}, ...addresses, isPreviewOnlyMode: () => false,
    glassesTypeSetting: { get: () => active, set: (model) => { active = model; } },
    dashboardController: {
      async disconnect() { await disconnected; view.phase = "disconnected"; },
      async connect() {
        assert.equal(view.phase, "disconnected");
        assert.equal(active, "g1");
        assert.deepEqual({ ...addresses.loadDeviceAddresses() }, g1);
        view.phase = "connected";
      },
    },
  };
  vm.runInNewContext(ts.transpileModule(`export class Harness { ${switchMethod.getText(source)} }`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, context);
  const pending = context.exports.Harness.prototype.onSwitchEvenPairTap.call(view);
  assert.equal(active, "g2");
  assert.deepEqual({ ...addresses.loadDeviceAddresses() }, g2);
  release();
  await pending;
  assert.equal(active, "g1");
  assert.equal(view.phase, "connected");
  assert.deepEqual({ ...addresses.loadSavedEvenPair("g2").addresses }, g2);
});
