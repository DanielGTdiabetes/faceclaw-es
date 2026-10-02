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
    appSwitcherPositionSetting: 'left', uiDepthSetting: '0', statusBarPositionSetting: 'top',
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
  for (const [switcher, statusBar] of [['left', 'top'], ['right', 'top'], ['bottom', 'top'], ['bottom', 'switcher'], ['left', 'switcher']]) {
    g.settings.appSwitcherPositionSetting.value = switcher;
    g.settings.statusBarPositionSetting.value = statusBar;
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
              const header = g.windowHeaderHeight(appId);
              assert.equal(header, g.statusInSwitcherRow(appId) ? 1 : g.TOP_BAR_HEIGHT);
              assert.equal(g.statusInSwitcherRow(appId), statusBar === 'switcher' && g.switcherRowHeight(appId) > 0);
              assert.equal(rect.y, g.windowTop(heightMode, appId) + header);
              assert.ok(rect.y >= header && rect.y + rect.height <= 480 - g.switcherRowHeight(appId));
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

// The real chrome layer over the given geometry, with platform pieces stubbed:
// a 4px-per-character font that paints each character as a 2x6 block, up to
// `notifications` 24px notification icons, and a phone battery at 80%.
const graphics = require('../.test-build/app/graphics/image.js');
const shellScene = require('../.test-build/app/graphics/shell-scene.js');
const displayList = require('../.test-build/app/graphics/display-list.js');
function chromeLayer(g, { notifications = 0, phoneBattery = null, windows = 1, trayIcons = [] } = {}) {
  const font = { lineHeight: 12, ascent: 10, measureText: (text) => text.length * 4,
    drawText: (image, x, y, text, value) => { for (let i = 0; i < text.length; i++) image.fillRect(x + i * 4, y + 2, 2, 6, value); } };
  let nextKey = 100;
  const requested = [];
  const settings = { get: () => 'always' };
  const modules = {
    '../../graphics/shell-scene': shellScene, '../../graphics/image': graphics,
    '../../graphics/display-list': displayList, '../../graphics/ui-fonts': { getDefaultSmallFont: () => font, getDefaultMediumFont: () => font },
    '../../graphics/battery': require('../.test-build/app/graphics/battery.js'),
    './ambient-cards': { activeAmbientCards: () => [] },
    '../../native/notification-icons': { readActiveNotificationIcons: (max) => {
      requested.push(max);
      return { icons: Array.from({ length: Math.min(max, notifications) }, () => new graphics.GrayImage(24, 24, 200)), stale: false };
    } },
    '../../native/phone-battery': { readPhoneBatteryState: () => ({ battery: phoneBattery, charging: false }) },
    '../../util/render-freshness': { renderPassAllowsStaleData: () => false },
    '../dashboard-settings': { batteryDisplayModeSetting: { get: () => 'icon' }, phoneBatteryVisibilitySetting: settings,
      batteryIndicatorVisible: () => true },
    '../clock-format': { formatClockDate: () => 'Thu Oct 2', formatClockTime: () => '9:41' },
    '../layers': { LayerStack: { allocateShellKey: () => nextKey++ } },
    '../menu': { scrollToKeepSelectionVisible: () => 0 },
    './geometry': g,
  };
  const context = { exports: {}, require: (name) => modules[name] ?? {} };
  vm.runInNewContext(js(read('app/ui/shell/chrome-layer.ts')), context);
  const state = {
    windows: Array.from({ length: windows }, () => ({ attention: false, drawIcon: (image, x, y, size) => image.fillRect(x, y, size, size, 120) })),
    selectedIndex: 0, focus: 'window', foregroundHeightMode: 'min',
    battery: { headset: null, ring: null, watch: null }, trayIcons,
  };
  return { chrome: new context.exports.ShellChromeLayer(() => state), state, requested };
}

test('a bottom app switcher frames the foreground window\'s content in a rounded border', () => {
  const g = geometry();
  g.settings.appSwitcherPositionSetting.value = 'bottom';
  g.settings.uiDepthSetting.value = '62';
  const { chrome } = chromeLayer(g);
  const parts = chrome.paintParts();
  // Just the top bar and then the row: the frame is no surface of its own.
  const part = (key) => parts.find((p) => p.shellKey === key);
  const [bar, strip] = [part(2), part(1)];
  assert.deepEqual(Array.from(parts, (p) => p.shellKey), [2, 1]);
  // The min band's content spans y=106..365, between the bar's bottom row
  // (the frame's top) at 105 and the row's top edge (its bottom) at 366. The
  // frame is one rounded rect riding on the row, replayed after the bar.
  const frames = (image) => image.draws.filter((d) => d.presentation?.displayList);
  const [frame] = frames(strip.image);
  assert.deepEqual([strip.x + frame.x, strip.y + frame.y, frame.source.width, frame.source.height, frame.presentation.depth], [31, 105, 578, 262, 0]);
  assert.deepEqual(JSON.parse(JSON.stringify(frame.presentation.displayList.calls)), [{ op: displayList.DrawOp.ROUNDED_RECT, x: 0, y: 0, width: 578, height: 262,
    radius: 8, background: 0, border: 3, outside: 0, clip: { x: 0, y: 0, width: 578, height: 261 } }]);
  // Over a lit screen: the sides just outside the window, the top along the
  // bar's bottom row, the content's corners cut black, its interior left
  // alone, and the bottom row left to the separator.
  const lit = new Uint8Array(640 * 480).fill(255);
  displayList.paintDisplayList(lit, lit.slice(), 640, 480, { displayList: frame.presentation.displayList,
    x: strip.x + frame.x, y: strip.y + frame.y, width: 578, height: 262, depth: 0 });
  const px = (x, y) => lit[y * 640 + x];
  assert.deepEqual([px(31, 200), px(608, 200), px(300, 105)], [48, 48, 48]);
  assert.deepEqual([px(31, 105), px(32, 106), px(32, 365), px(607, 365)], [0, 0, 0, 0]);
  assert.deepEqual([px(36, 105), px(300, 200), px(300, 366), px(36, 366)], [48, 255, 255, 255]);
  const at = (p, x, y) => p.image.pixels[(y - p.y) * p.image.width + x - p.x];
  // The separator is the bottom side, starting where the corner's curve ends.
  assert.deepEqual([at(strip, 35, 366), at(strip, 36, 366), at(strip, 603, 366), at(strip, 604, 366)], [1, 40, 40, 1]);
  // The bar's own divider gives way to the frame's top.
  assert.equal(at(bar, 300, 105), 1);
  shellScene.encodeShellScene(parts, g.uiDepth());
  // The flat paint carries the same frame.
  const image = chrome.paint();
  assert.deepEqual(frames(image).map((d) => [d.x, d.y]), [[31, 105]]);
  // No frame in the full-panel mode.
  g.settings.displayModeSetting.value = '640x480';
  assert.equal(chrome.paintParts().flatMap((p) => frames(p.image)).length, 0);
});

test('the status bar can join a bottom app switcher, and windows grow into the top bar', () => {
  const g = geometry();
  g.settings.statusBarPositionSetting.value = 'switcher';
  // Only beside a reserved bottom row.
  assert.equal(g.statusInSwitcherRow(), false);
  g.settings.appSwitcherPositionSetting.value = 'bottom';
  assert.equal(g.statusInSwitcherRow(), true);
  // A one-row header (the frame's top) replaces the 28px top bar; medium
  // windows keep a 288px (EvenHub) content area.
  assert.equal(g.windowHeaderHeight(), 1);
  assert.deepEqual(g.rect('min'), { x: 32, y: 79, width: 576, height: 287 });
  assert.deepEqual(g.rect('medium'), { x: 32, y: 79, width: 576, height: 288 });
  assert.deepEqual(g.rect('max', 'terminal'), { x: 32, y: 1, width: 576, height: 443 });
  assert.deepEqual({ ...g.switcherRect('min') }, { x: 32, y: 366, width: 576, height: 36 });
  // The full-panel mode keeps the top bar: its row shows only while focused.
  g.settings.displayModeSetting.value = '640x480';
  assert.equal(g.statusInSwitcherRow(), false);
  assert.deepEqual(g.rect('max'), { x: 0, y: 28, width: 640, height: 452 });
});

test('the switcher row lays out windows, free space, notifications, widgets, batteries and the clock', () => {
  const g = geometry();
  g.settings.appSwitcherPositionSetting.value = 'bottom';
  g.settings.statusBarPositionSetting.value = 'switcher';
  const tray = new graphics.GrayImage(30, 20, 180);
  const { chrome, requested } = chromeLayer(g, { notifications: 2, phoneBattery: 80, trayIcons: [tray] });
  const parts = chrome.paintParts();
  // No top bar: the row, then the status bar on the top bar's surface and depth.
  assert.deepEqual(Array.from(parts, (p) => [p.shellKey, p.depth ?? 0]), [[1, 0], [2, -2]]);
  const [row, status] = parts;
  // Right to left from the row's end (x=608), centred under its separator
  // line (y=366): "Thu Oct 2 9:41" (56px) 10px in; the battery block (label
  // 20 + gap 5 + gauge 21) 16px before it; the 30px widget 10px before that;
  // then the two notification icons, 8px clear of the widget.
  const clockX = 608 - 10 - 56, batteryLeft = clockX - 16 - 46, trayLeft = batteryLeft - 40, iconsLeft = trayLeft - 8 - 56 + 4;
  assert.deepEqual([status.x, status.y, status.image.width, status.image.height], [iconsLeft, 367, 608 - iconsLeft, 35]);
  const at = (p, x, y) => p.image.withDrawsBaked().pixels[(y - p.y) * p.image.width + x - p.x];
  // The clock's text runs 8 rows down the top bar's layout, which sits 5 rows into the row.
  assert.deepEqual([at(status, clockX, 366 + 5 + 8 + 2), at(status, trayLeft, 366 + 5 + 4), at(status, iconsLeft, 366 + 5 + 2)], [210, 180, 200]);
  assert.equal(at(status, batteryLeft, 366 + 5 + 8 + 2), 150, 'battery label');
  // Windows take what the status bar leaves; the rest is free space.
  assert.equal(at(row, 40 + 2, 366 + 2), 120, 'first window icon');
  assert.equal(chrome.windowIndexAt(45, 380, 1), 0);
  assert.equal(chrome.windowIndexAt(iconsLeft + 2, 380, 1), null);
  // Notification icons stop short of the one window slot's room (with the
  // row's margins and the gap to the status bar).
  assert.equal(requested.at(-1), Math.floor((trayLeft - 8 - (32 + 20 + 40 - 8 + 8) + 4) / 28));
  // No top bar, but the frame is still there, its top one row above the content.
  const [frame] = row.image.draws.filter((d) => d.presentation?.displayList);
  assert.deepEqual([row.x + frame.x, row.y + frame.y, frame.source.height], [31, 78, 289]);
  shellScene.encodeShellScene(parts, g.uiDepth());
});

test('many windows scroll in what the notification icons leave them', () => {
  const g = geometry();
  g.settings.appSwitcherPositionSetting.value = 'bottom';
  g.settings.statusBarPositionSetting.value = 'switcher';
  const { chrome, requested } = chromeLayer(g, { notifications: 40, windows: 12 });
  const [row, status] = chrome.paintParts();
  // Clock only (no batteries or widgets): notifications end 8px before its
  // 8px lead-in, and stop where three window slots plus margins remain.
  const trayLeft = 608 - 10 - 56 - 8, floor = 32 + 20 + 3 * 40 - 8 + 8;
  const max = Math.floor((trayLeft - 8 - floor + 4) / 28);
  assert.equal(requested.at(-1), max);
  const iconsLeft = trayLeft - 8 - max * 28 + 4;
  assert.equal(status.x, iconsLeft);
  // Three windows fit before the status bar's gap; the rest scroll, with the
  // chevron at the end of the windows rather than of the row.
  assert.equal(chrome.windowIndexAt(32 + 10 + 2 * 40 + 4, 380, 12), 2);
  assert.equal(chrome.windowIndexAt(32 + 10 + 3 * 40 + 4, 380, 12), null);
  const windowsRight = iconsLeft - 8;
  const chevron = row.image.pixels.findIndex((v, i) => v === 140);
  assert.equal(chevron % row.image.width + row.x, windowsRight - 6);
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
