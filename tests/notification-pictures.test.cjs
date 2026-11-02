const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(source, dependencies, globals = {}) {
  const sandbox = { exports: {}, require(name) {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  }, ...globals };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(source, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, sandbox, { filename: source });
  return sandbox.exports;
}

class Image {
  constructor(width, height) { this.width = width; this.height = height; this.pixels = new Uint8Array(width * height); this.text = []; this.blits = []; }
  drawText(_font, x, y, text) { this.text.push({ x, y, text }); }
  bitBlt(image, x, y) { this.blits.push({ image, x, y }); }
}

function harness(android = true) {
  let now = 1000, calls = 0, fail = false, empty = false, listener, observer;
  const globals = { global: { isAndroid: android }, Date: { now: () => now }, setTimeout: fn => fn(),
    java: { lang: { Runnable: function (value) { return value; } } },
    com: { faceclaw: { app: {
      FaceclawNotificationListener: function (value) { return value; },
      FaceclawMediaNotificationListenerService: {
        getNotificationPictureGray(_key, width, height) {
          calls++;
          if (fail) throw new Error('synthetic lost access');
          if (empty) return [];
          const w = Math.min(40, width), h = Math.min(20, height);
          return [w, 0, h, 0, ...Array(w * h).fill(200)];
        },
        addNotificationListener(value) { listener = value; }, removeNotificationListener() {},
        addListenerStateObserver(value) { observer = value; }, removeListenerStateObserver() {},
      },
    } } } };
  const common = { '../graphics/image': { GrayImage: Image }, '../util/array-util': { toUint8Array: value => Uint8Array.from(value || []) } };
  const files = load('app/native/image-files.ts', common, globals);
  const api = load('app/native/notification-icons.ts', { ...common,
    './frame-timings': { spanCurrent: (_name, fn) => fn(), logCurrent() {} },
    './notification-sources': { rememberNotificationSources() {} }, './image-files': files,
  }, globals);
  api.onAndroidNotificationsChanged(() => {});
  return { api, calls: () => calls, fail(value) { fail = value; }, empty(value) { empty = value; },
    advance(ms) { now += ms; }, removed(key) { listener.onNotificationRemoved(key); },
    stateChanged() { observer.run(); } };
}

const notification = (key = 'synthetic-chart', postTime = 100) => ({ key, postTime, hasPicture: true });

test('pictures load only when requested; stale paint and unsupported notifications do no native work', () => {
  const h = harness();
  assert.equal(h.api.readNotificationPicture(notification(), 100, 50, true).stale, true);
  assert.equal(h.calls(), 0);
  assert.equal(h.api.readNotificationPicture({ ...notification(), hasPicture: false }, 100, 50, false).picture, null);
  for (const [width, height] of [[0, 10], [10, -1], [NaN, 10], [10, Infinity]]) {
    assert.equal(h.api.readNotificationPicture(notification(), width, height, false).picture, null);
  }
  assert.equal(h.calls(), 0);
  const ios = harness(false);
  assert.equal(ios.api.readNotificationPicture(notification(), 100, 50, false).picture, null);
  assert.equal(ios.calls(), 0);
});

test('cache avoids decoding every paint and refreshes when the same chart is updated', () => {
  const h = harness();
  const first = h.api.readNotificationPicture(notification(), 100, 50, false).picture;
  assert.equal(first.width, 40);
  assert.equal(h.api.readNotificationPicture(notification(), 100, 50, false).picture, first);
  assert.equal(h.calls(), 1);
  h.api.readNotificationPicture(notification('synthetic-chart', 101), 100, 50, false);
  assert.equal(h.calls(), 2);
  h.advance(60_001);
  h.api.readNotificationPicture(notification('synthetic-chart', 101), 100, 50, false);
  assert.equal(h.calls(), 3);
});

test('an earlier picture is not reused into a smaller viewport', () => {
  const h = harness();
  h.api.readNotificationPicture(notification(), 100, 50, false);
  assert.equal(h.api.readNotificationPicture(notification(), 10, 10, true).picture, null);
  const next = h.api.readNotificationPicture(notification(), 10, 10, false).picture;
  assert.equal(next.width, 10); assert.equal(next.height, 10);
});

test('lost native access and missing pictures fall back without crashing or a retry per frame', () => {
  for (const mode of ['fail', 'empty']) {
    const h = harness(); h[mode](true);
    assert.equal(h.api.readNotificationPicture(notification(), 100, 50, false).picture, null);
    assert.equal(h.api.readNotificationPicture(notification(), 100, 50, false).picture, null);
    assert.equal(h.calls(), 1);
    h[mode](false); h.stateChanged();
    assert.ok(h.api.readNotificationPicture(notification(), 100, 50, false).picture);
    assert.equal(h.calls(), 2);
  }
});

test('removal and listener-state changes invalidate pictures, including null results', () => {
  const h = harness();
  h.api.readNotificationPicture(notification(), 100, 50, false);
  h.removed('synthetic-chart');
  assert.equal(h.api.readNotificationPicture(notification(), 100, 50, true).picture, null);
  h.api.readNotificationPicture(notification(), 100, 50, false);
  h.stateChanged();
  assert.equal(h.api.readNotificationPicture(notification(), 100, 50, true).picture, null);
});

test('only eight recently viewed pictures are retained', () => {
  const h = harness();
  for (let i = 0; i < 9; i++) h.api.readNotificationPicture(notification(`chart-${i}`), 100, 50, false);
  h.api.readNotificationPicture(notification('chart-0'), 100, 50, false);
  assert.equal(h.calls(), 10);
});

function detailHarness({ picture = true, lineHeight = 12 } = {}) {
  let calls = 0;
  const chart = { ...notification(), packageName: 'example.synthetic', appName: 'Synthetic chart', title: '', text: '',
    bigText: '', subText: '', infoText: '', summaryText: '', lines: [], actions: [] };
  const api = load('app/ui/notifications.ts', {
    '~/util/numeric-util': { clamp: (n, lo, hi) => Math.max(lo, Math.min(hi, n)) },
    '~/util/date-util': { formatRelativeTime: () => 'now' },
    '../graphics/ui-fonts': { getDefaultSmallFont: () => ({ lineHeight }) },
    '../graphics/textwrap': { wrapText: (_f, text) => [text], truncateText: (_f, text) => text },
    '../graphics/image': { GrayImage: Image },
    './metrics': { lineStep: () => lineHeight + 4, centeredTextY: (_f, y) => y },
    '../native/notification-icons': { ALL_NOTIFICATIONS: 999,
      readActiveNotifications: () => [chart], readNotificationIconByKey: () => ({ icon: null, stale: false }),
      readNotificationPicture: (_n, w, h) => { calls++; return { picture: picture ? new Image(w, h) : null, stale: false }; } },
    '../native/notification-sources': {}, '../native/notification-access': {},
    '../util/render-freshness': { renderPassAllowsStaleData: () => false, noteStaleDataUsed() {} },
    './menu-core': { Menu: class { setItems() {} paint() {} } },
  });
  return { paint(origin) {
    return new api.SingleNotificationLayer(chart.key, { origin }).paint({ stack: {
      getBaseSize: () => ({ width: 576, height: 288 }), isFocused: () => true,
    } });
  }, calls: () => calls };
}

test('a titleless synthetic chart fits in detail without obscuring the header or actions', () => {
  const h = detailHarness(), image = h.paint('notifications-list');
  assert.equal(h.calls(), 1); assert.equal(image.blits.length, 1);
  const { image: chart, x, y } = image.blits[0];
  assert.ok(x >= 0 && y > 21 + 12);
  assert.ok(x + chart.width < 576 - 148);
  assert.ok(y + chart.height <= 288 - 12);
  assert.equal(image.text.some(row => row.text === '(untitled)'), false);
});

test('automatic popups keep their text-only path and never decode an attachment', () => {
  const h = detailHarness(), image = h.paint('new-notification-modal');
  assert.equal(h.calls(), 0); assert.equal(image.blits.length, 0);
  assert.ok(image.text.some(row => row.text === '(untitled)'));
});

test('unavailable images and large fonts retain a readable text fallback', () => {
  const unavailable = detailHarness({ picture: false }).paint('notification-tray');
  assert.ok(unavailable.text.some(row => row.text === '(untitled)'));
  const large = detailHarness({ lineHeight: 120 });
  assert.ok(large.paint('notifications-list').text.some(row => row.text === '(untitled)'));
  assert.equal(large.calls(), 0);
});
