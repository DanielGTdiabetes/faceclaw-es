const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/load-typescript.cjs');

const NOW = Date.parse('2026-10-02T12:00:00Z');
const fix = () => ({ latitude: 40.416775, longitude: -3.70379, accuracyMeters: 12, timestampMs: NOW - 5000 });

function harness({ permission = true, lookup = async () => fix(), ios = false } = {}) {
  let granted = permission, reads = 0, active = true;
  const messages = [];
  const load = loader({
    global: { isIOS: ios }, Promise, setTimeout, clearTimeout,
    Date: class extends Date { static now() { return NOW; } },
  }, {
    '../native/calendar': {}, '../native/calendar-permissions': {},
    '../native/location': { getCurrentLocation: () => { reads++; return lookup(); } },
    '../native/location-permissions': { hasLocationPermission: () => granted },
    '../native/media-controller': { mediaControllerBridge: { start: async () => {} } },
    '../native/notification-icons': {}, '../ui/shell/shell': {},
  });
  const { ToolRegistry } = load('app/assistant/tool-registry.ts');
  const registry = new ToolRegistry();
  load('app/assistant/system-tools.ts').registerSystemTools(registry);
  const { AssistantMcpServer } = load('app/assistant/mcp-server.ts');
  const server = new AssistantMcpServer({ registry, send: msg => messages.push(msg),
    isTurnActive: () => active, allowProactive: () => true });
  async function call() {
    server.handleMessage({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'location.get_current', arguments: {} } });
    await new Promise(resolve => setImmediate(resolve));
    return messages.at(-1).result;
  }
  return { registry, server, messages, call, reads: () => reads,
    permission: value => { granted = value; }, active: value => { active = value; } };
}

test('OpenClaw discovers and calls phone location without opening a glasses app', async () => {
  const h = harness();
  h.server.handleMessage({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  const tool = h.messages[0].result.tools.find(tool => tool.name === 'location.get_current');
  assert.ok(tool);
  assert.ok(h.registry.listTools().find(tool => tool.name === 'location.get_current').timeoutMs > 15000);
  const result = await h.call();
  assert.equal(result.isError, false);
  assert.deepEqual(JSON.parse(result.content[0].text), {
    latitude: 40.416775, longitude: -3.70379, accuracy_meters: 12,
    timestamp_ms: NOW - 5000, age_seconds: 5, is_stale: false,
  });
  assert.equal(h.reads(), 1);
});

test('location works with either platform native bridge, including approximate fixes', async () => {
  const h = harness({ ios: true, lookup: async () => ({ ...fix(), accuracyMeters: 2500 }) });
  const result = await h.registry.callTool('location.get_current', {});
  assert.equal(result.ok, true);
  assert.equal(JSON.parse(result.content).accuracy_meters, 2500);
});

test('missing or revoked permission never exposes coordinates', async () => {
  const denied = harness({ permission: false });
  const result = await denied.call();
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /permiso/);
  assert.equal(denied.reads(), 0);
  const revoked = harness({ lookup: async () => { revoked.permission(false); return fix(); } });
  const after = await revoked.call();
  assert.equal(after.isError, true);
  assert.match(after.content[0].text, /revocado/);
  assert.doesNotMatch(after.content[0].text, /40\.416775/);
});

test('location cannot be read proactively even when proactive assistant actions are enabled', async () => {
  const h = harness(); h.active(false);
  const result = await h.call();
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /outside a conversation/);
  assert.equal(h.reads(), 0);
  assert.equal(h.registry.listTools({ proactiveOnly: true }).some(tool => tool.name === 'location.get_current'), false);
});

test('old or undated cached fixes are explicitly marked stale', async () => {
  for (const timestampMs of [NOW - 86400000, 0, NaN, NOW + 60000]) {
    const h = harness({ lookup: async () => ({ ...fix(), timestampMs, accuracyMeters: null }) });
    const result = await h.call();
    assert.equal(result.isError, false);
    const content = JSON.parse(result.content[0].text);
    assert.equal(content.is_stale, true);
    assert.equal(content.accuracy_meters, null);
    assert.equal(content.age_seconds, timestampMs < NOW && timestampMs > 0 ? 86400 : null);
  }
});

test('provider errors and invalid coordinates produce a useful tool error', async () => {
  for (const lookup of [async () => { throw new Error('Turn on Location on your phone'); },
    async () => ({ ...fix(), latitude: NaN }), async () => ({ ...fix(), longitude: 181 })]) {
    const result = await harness({ lookup }).call();
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /ubicación/);
    assert.doesNotMatch(result.content[0].text, /latitude/);
  }
});
