const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const js = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function geometry() {
  const settings = Object.fromEntries(Object.entries({
    displayModeSetting: '576x288', verticalPositionSetting: 'middle',
    navigateDisplayModeSetting: 'global', navigateVerticalPositionSetting: 'global',
    terminalDisplayModeSetting: 'default', terminalVerticalPositionSetting: 'global',
    appSwitcherPositionSetting: 'left', uiDepthSetting: '0',
  }).map(([name, value]) => [name, { value, get() { return this.value; } }]));
  const context = { exports: {}, require: (name) => {
    if (name === '../../graphics/image') return { G2_LENS_WIDTH: 640, G2_LENS_HEIGHT: 480 };
    assert.equal(name, '../dashboard-settings');
    return settings;
  } };
  vm.runInNewContext(js(read('app/ui/shell/geometry.ts')), context);
  const rect = (mode, appId) => ({ ...context.exports.appViewportRect(mode, appId) });
  return { ...context.exports, settings, rect };
}

test('defaults preserve normal windows, EvenHub height and tall terminal sessions', () => {
  const g = geometry();
  assert.deepEqual(g.rect('min', 'navigate'), { x: 64, y: 124, width: 576, height: 260 });
  assert.deepEqual(g.rect('min', 'terminal'), g.rect('min'));
  assert.deepEqual(g.rect('max', 'terminal'), { x: 64, y: 28, width: 576, height: 452 });
  assert.equal(g.windowBandHeight('medium', 'evenhub'), 316);
  g.settings.displayModeSetting.value = '640x480';
  assert.deepEqual(g.rect('max', 'terminal'), { x: 0, y: 28, width: 640, height: 452 });
});

test('Navigate can use a small bottom band while other apps fill the panel', () => {
  const g = geometry();
  g.settings.displayModeSetting.value = '640x480';
  g.settings.navigateDisplayModeSetting.value = '576x288';
  g.settings.navigateVerticalPositionSetting.value = 'bottom';
  assert.deepEqual(g.rect('min', 'navigate'), { x: 64, y: 220, width: 576, height: 260 });
  assert.equal(g.minWindowTop('navigate'), 192);
  assert.equal(g.sidebarStripVisible('window', 'navigate'), true);
  assert.equal(g.sidebarStripVisible('window', 'other'), false);
  assert.deepEqual(g.rect('min', 'other'), { x: 0, y: 28, width: 640, height: 452 });
});

test('Terminal can disable its tall default, inherit position or override both dimensions', () => {
  const g = geometry();
  g.settings.terminalDisplayModeSetting.value = 'global';
  assert.deepEqual(g.rect('max', 'terminal'), g.rect('min'));
  g.settings.verticalPositionSetting.value = 'top';
  assert.equal(g.windowTop('max', 'terminal'), 0);
  g.settings.terminalVerticalPositionSetting.value = 'lower';
  assert.equal(g.windowTop('max', 'terminal'), 144);
  g.settings.terminalDisplayModeSetting.value = '640x480';
  assert.deepEqual(g.rect('max', 'terminal'), { x: 0, y: 28, width: 640, height: 452 });
  assert.equal(g.sidebarStripVisible('window', 'terminal'), false);
  assert.equal(g.sidebarStripVisible('sidebar', 'terminal'), true);
  g.settings.terminalDisplayModeSetting.value = '576x480';
  assert.deepEqual(g.rect('max', 'terminal'), { x: 64, y: 28, width: 576, height: 452 });
});

test('all explicit size/position combinations stay within the display and align content below the bar', () => {
  const g = geometry();
  for (const switcher of ['left', 'right', 'bottom']) {
    g.settings.appSwitcherPositionSetting.value = switcher;
    for (const globalMode of ['576x288', '576x480', '640x480']) {
      g.settings.displayModeSetting.value = globalMode;
      for (const appId of ['navigate', 'terminal']) {
        for (const mode of ['global', '576x288', '576x480', '640x480']) {
          g.settings[`${appId}DisplayModeSetting`].value = mode;
          for (const position of ['global', 'top', 'upper', 'middle', 'lower', 'bottom']) {
            g.settings[`${appId}VerticalPositionSetting`].value = position;
            for (const heightMode of ['min', 'medium', 'max']) {
              const rect = g.rect(heightMode, appId);
              const fullPanel = g.displayMode(appId) === '640x480';
              assert.equal(rect.x + rect.width, fullPanel ? 640 : { left: 640, right: 576, bottom: 608 }[switcher]);
              assert.equal(rect.y, g.windowTop(heightMode, appId) + g.TOP_BAR_HEIGHT);
              assert.ok(rect.y >= 28 && rect.y + rect.height <= 480 - g.switcherRowHeight(appId));
              const row = g.switcherRect(heightMode, appId);
              assert.ok(row.y + row.height <= 480);
              // A reserved bottom row hangs right under the window, as wide as it.
              if (g.switcherRowHeight(appId)) assert.deepEqual([row.x, row.y, row.width], [rect.x, rect.y + rect.height, rect.width]);
              // The frame's sides, just outside the window, survive the
              // deepest shift (±62 moves each lens 31px).
              if (g.windowFramed(appId)) assert.ok(rect.x - 1 - 31 >= 0 && rect.x + rect.width + 31 < 640);
            }
          }
        }
      }
    }
  }
});

test('the app switcher can sit on the right edge', () => {
  const g = geometry();
  g.settings.appSwitcherPositionSetting.value = 'right';
  assert.deepEqual(g.rect('min'), { x: 0, y: 124, width: 576, height: 260 });
  assert.deepEqual({ ...g.switcherRect('max') }, { x: 576, y: 96, width: 64, height: 288 });
  assert.equal(g.screenCenterInViewportX(), 320);
  assert.equal(g.isOnSwitcherEdge(600, 10, 'min'), true);
  assert.equal(g.isOnSwitcherEdge(10, 200, 'min'), false);
  assert.equal(g.windowFramed(), false);
  // Depth needs the bottom row's side margins.
  g.settings.uiDepthSetting.value = '32';
  assert.equal(g.uiDepth(), 0);
  g.settings.displayModeSetting.value = '640x480';
  assert.deepEqual(g.rect('max'), { x: 0, y: 28, width: 640, height: 452 });
});

test('a bottom app switcher centres 576-wide windows and hangs one tall tab under them', () => {
  const g = geometry();
  g.settings.appSwitcherPositionSetting.value = 'bottom';
  assert.equal(g.SWITCHER_ROW_HEIGHT, 36);
  assert.deepEqual(g.rect('max', 'terminal'), { x: 32, y: 28, width: 576, height: 416 });
  assert.deepEqual({ ...g.switcherRect('max', 'terminal') }, { x: 32, y: 444, width: 576, height: 36 });
  // Band and row share the slack: no gap under a band shorter than the screen.
  assert.deepEqual(g.rect('min'), { x: 32, y: 106, width: 576, height: 260 });
  assert.deepEqual({ ...g.switcherRect('min') }, { x: 32, y: 366, width: 576, height: 36 });
  assert.equal(g.isOnSwitcherEdge(10, 370, 'min'), true);
  assert.equal(g.isOnSwitcherEdge(10, 360, 'min'), false);
  g.settings.verticalPositionSetting.value = 'bottom';
  assert.equal(g.switcherRect('min').y, 444);
  // The true centre is the viewport's own with the window centred.
  assert.equal(g.screenCenterInViewportX(), 288);
  // Depth applies only here, as does the window frame.
  g.settings.uiDepthSetting.value = '-48';
  assert.equal(g.uiDepth(), -48);
  assert.equal(g.windowFramed(), true);
  // Full panel: windows fill the panel and the row overlays the bottom edge while focused.
  g.settings.displayModeSetting.value = '640x480';
  assert.deepEqual(g.rect('max'), { x: 0, y: 28, width: 640, height: 452 });
  assert.deepEqual({ ...g.switcherRect('max') }, { x: 0, y: 444, width: 640, height: 36 });
  assert.equal(g.sidebarStripVisible('window'), false);
  assert.equal(g.sidebarStripVisible('sidebar'), true);
  assert.equal(g.windowFramed(), false);
});

test('a bottom app switcher frames the foreground window\'s content in a rounded border', () => {
  const g = geometry();
  g.settings.appSwitcherPositionSetting.value = 'bottom';
  g.settings.uiDepthSetting.value = '62';
  const graphics = require('../.test-build/app/graphics/image.js');
  const shellScene = require('../.test-build/app/graphics/shell-scene.js');
  const font = { lineHeight: 12, ascent: 10, measureText: (text) => text.length * 4, drawText() {} };
  let nextKey = 100;
  const modules = {
    '../../graphics/shell-scene': shellScene, '../../graphics/image': graphics,
    '../../graphics/ui-fonts': { getDefaultSmallFont: () => font, getDefaultMediumFont: () => font },
    './ambient-cards': { activeAmbientCards: () => [] },
    '../../native/notification-icons': { readActiveNotificationIcons: () => ({ icons: [], stale: false }) },
    '../../native/phone-battery': { readPhoneBatteryState: () => ({ battery: null }) },
    '../../util/render-freshness': { renderPassAllowsStaleData: () => false },
    '../dashboard-settings': { batteryDisplayModeSetting: { get: () => 'icon' } },
    '../clock-format': { formatClockDate: () => '', formatClockTime: () => '' },
    '../layers': { LayerStack: { allocateShellKey: () => nextKey++ } },
    '../menu': { scrollToKeepSelectionVisible: () => 0 },
    './geometry': g,
  };
  const context = { exports: {}, require: (name) => modules[name] ?? {} };
  vm.runInNewContext(js(read('app/ui/shell/chrome-layer.ts')), context);
  const state = {
    windows: [{ attention: false, drawIcon() {} }], selectedIndex: 0, focus: 'window', foregroundHeightMode: 'min',
    battery: { headset: null, ring: null, watch: null }, trayIcons: [],
  };
  const chrome = new context.exports.ShellChromeLayer(() => state);
  const parts = chrome.paintParts();
  // The min band's content spans y=106..365, between the bar's bottom row
  // (the frame's top) at 105 and the row's top edge (its bottom) at 366.
  const part = (key) => parts.find((p) => p.shellKey === key);
  const [left, right, top, strip] = [part(100), part(101), part(102), part(1)];
  assert.deepEqual([left.x, left.y, left.image.width, left.image.height], [31, 105, 8, 261]);
  assert.deepEqual([right.x, right.image.width], [601, 8]);
  assert.deepEqual([top.x, top.y, top.image.width, top.image.height], [39, 105, 562, 1]);
  assert.ok(!left.depth && !right.depth && !top.depth);
  const at = (p, x, y) => p.image.pixels[(y - p.y) * p.image.width + x - p.x];
  // Straight sides just outside the window; the top along the bar's bottom row.
  assert.equal(at(left, 31, 200), 40);
  assert.equal(at(right, 608, 200), 40);
  assert.equal(at(top, 300, 105), 40);
  // Rounded corners: black outside the curve, the window's own corner masked.
  assert.equal(at(left, 31, 105), 1);
  assert.equal(at(left, 36, 105), 40);
  assert.equal(at(left, 32, 106), 1);
  assert.equal(at(left, 32, 365), 1);
  assert.equal(at(right, 607, 365), 1);
  // The separator is the bottom side, starting where the corner's curve ends.
  assert.equal(at(strip, 35, 366), 1);
  assert.equal(at(strip, 36, 366), 40);
  assert.equal(at(strip, 603, 366), 40);
  assert.equal(at(strip, 604, 366), 1);
  // Parts after the -2 top bar, so the frame draws over it.
  assert.ok(parts.indexOf(part(2)) < parts.indexOf(left));
  shellScene.encodeShellScene(parts, g.uiDepth());
  // The flat paint matches. The bar's own divider gives way to the frame's
  // top, and the frame stops short of the bar.
  const image = chrome.paint();
  assert.equal(image.pixels[200 * 640 + 31], 40);
  assert.equal(image.pixels[200 * 640 + 608], 40);
  assert.equal(image.pixels[105 * 640 + 33], 1);
  assert.equal(image.pixels[105 * 640 + 300], 40);
  assert.equal(image.pixels[90 * 640 + 31], 0);
  const bar = part(2);
  assert.equal(bar.image.pixels[(105 - bar.y) * bar.image.width + 300 - bar.x], 1);
  // No frame in the full-panel mode.
  g.settings.displayModeSetting.value = '640x480';
  assert.equal(chrome.paintParts().filter((p) => p.shellKey >= 100).length, 0);
});

// Exercise the real worker message handler with platform work stubbed out.
function resizeHandler(file, globals) {
  const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
  const handler = source.statements.find((s) => ts.isExpressionStatement(s)
    && ts.isBinaryExpression(s.expression) && s.expression.left.getText(source) === 'global.onmessage');
  assert.ok(handler);
  const context = { global: {}, ...globals };
  vm.runInNewContext(js(handler.getText(source)), context);
  return (viewport) => context.global.onmessage({ data: { type: 'resize-window', windowId: 'test', viewport } });
}

test('Navigate resize preserves its active route and window, and remeasures an open menu', () => {
  let paints = 0;
  let menuSize;
  const window = { windowId: 'test', viewportWidth: 640, viewportHeight: 452,
    menu: { resize: (size) => { menuSize = size; } }, lastSubmittedFingerprint: 'old' };
  const route = { destination: 'Home' };
  const resize = resizeHandler('app/apps/navigate/navigate-app.worker.ts', {
    window, route, phase: 'navigating', render: () => { paints++; },
  });
  resize({ width: 576, height: 260 });
  assert.equal(window.viewportHeight, 260);
  assert.equal(window.viewportWidth, 576);
  assert.equal(window.lastSubmittedFingerprint, '');
  assert.equal(route.destination, 'Home');
  assert.deepEqual(menuSize, { width: 576, height: 260 });
  resize({ width: 576, height: 260 });
  assert.equal(paints, 1);
});

test('Terminal resize keeps the view identity, negotiates its grid and skips position-only changes', () => {
  const calls = [];
  const window = { kind: 'view', windowId: 'test', socket: 'session-1',
    viewportWidth: 576, viewportHeight: 452, cellWidth: 8, cellHeight: 16,
    menu: null, reconnectTimer: 42, emulator: { dispose: () => calls.push("dispose") },
    client: { stop: () => calls.push('stop'), setViewport: (...size) => calls.push(size) },
  };
  const resize = resizeHandler('app/apps/terminal/terminal-app.worker.ts', {
    windows: new Map([['test', window]]), clearTimeout: (timer) => calls.push(timer),
    TerminalEmulator: class { constructor(cols, rows) { this.cols = cols; this.rows = rows; } },
    reconnectView: (view) => { assert.equal(view, window); calls.push('reconnect'); },
    scheduleRender: () => calls.push('paint'),
  });
  resize({ width: 576, height: 260 });
  assert.equal(window.socket, 'session-1');
  assert.equal(window.gridCols, 72);
  assert.equal(window.gridRows, 16);
  assert.equal(window.emulator.rows, 16);
  assert.deepEqual(calls, [42, 'stop', [72, 16], 'dispose', 'reconnect', 'paint']);
  resize({ width: 576, height: 260 });
  assert.equal(calls.length, 6);
});

test('resizing a terminal reconnects with the new grid and ignores callbacks from the old socket', () => {
  const sockets = [];
  const context = {
    exports: {}, require: () => ({}),
    com: { faceclaw: { app: {
      FaceclawWebSocketListener: class { constructor(callbacks) { return callbacks; } },
      FaceclawWebSocket: class {
        constructor(url, listener) { this.listener = listener; this.messages = []; sockets.push(this); }
        sendText(text) { this.messages.push(JSON.parse(text)); }
        close() {}
      },
    } } },
  };
  const socketContext = { exports: {}, com: context.com };
  vm.runInNewContext(js(read('app/native/socket.ts')), socketContext);
  context.require = name => name === './socket' ? socketContext.exports : {};
  vm.runInNewContext(js(read('app/native/g2mirror-client.ts')), context);
  const client = new context.exports.G2MirrorClient({ host: 'localhost', port: 1234, cols: 72, rows: 28 });
  client.start();
  const oldSocket = sockets[0];
  oldSocket.listener.onOpen();
  assert.equal(oldSocket.messages[0].height, 28);
  client.stop();
  client.setViewport(80, 16);
  client.start();
  const newSocket = sockets[1];
  oldSocket.listener.onClosed(1000, 'bye');
  oldSocket.listener.onFailure('late failure');
  oldSocket.listener.onTextMessage('{"type":"error","message":"late error"}');
  assert.equal(client.state().phase, 'connecting');
  newSocket.listener.onOpen();
  assert.equal(newSocket.messages[0].width, 80);
  assert.equal(newSocket.messages[0].height, 16);
  assert.equal(client.state().status, 'Authenticating...');
});
