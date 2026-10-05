// UI de «Hermes en conversación»: presentación en lentes, Shell real con LayerStack real y control
// del móvil. Sin móvil, red, proveedor ni gafas: los efectos físicos se observan solo como llamadas
// al mecanismo real de Shell (sleep/wake → onScreenStateChanged), nunca como pantallas observadas.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');

/** Transpile app modules on demand; `mocks` is keyed by app-relative path without extension. */
function makeLoader(mocks, globals = {}) {
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    vm.runInNewContext(source, {
      exports: module.exports, module, console, Uint8Array, WeakSet, Map, Set, Promise, Symbol, Error, Math,
      global: { isAndroid: true, isIOS: false }, ...globals,
      require(name) {
        if (!name.startsWith('.')) {
          if (name in mocks) return mocks[name];
          throw new Error(`Unmocked package ${name} from ${path.relative(ROOT, file)}`);
        }
        const resolved = path.resolve(path.dirname(file), name);
        const key = path.relative(path.join(ROOT, 'app'), resolved).split(path.sep).join('/');
        if (key in mocks) return mocks[key];
        return load(`${resolved}.ts`);
      },
    }, { filename: file });
    return module.exports;
  }
  return (relative) => load(path.join(ROOT, relative));
}

class FakeImage {
  constructor(width, height) { this.width = width; this.height = height; this.text = []; this.fills = []; }
  fillRect(x, y, w, h, v) { this.fills.push([x, y, w, h, v]); }
  drawRect() {}
  drawText(_font, _x, _y, text) { this.text.push(text); }
  drawTextWrapped({ text }) { this.text.push(text); }
  dimmed() { return this; }
}
const font = { lineHeight: 20, measureText: (t) => [...t].length * 10, getGlyph: () => ({ dwidthX: 10 }) };

function fakeTimers() {
  const timers = new Map(); let seq = 0;
  return {
    setTimeout(fn, ms) { const id = ++seq; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    run() { for (const [id, t] of [...timers]) { timers.delete(id); t.fn(); } },
    count: () => timers.size,
  };
}

/** Shared presentation mocks: graphics and geometry only; LayerStack and Shell stay real. */
function graphicsMocks() {
  return {
    'graphics/image': { G2_LENS_WIDTH: 640, G2_LENS_HEIGHT: 480, GrayImage: FakeImage },
    'graphics/plane': { singlePlane: (image) => [{ image }], dimPlanes: (planes) => planes },
    'graphics/shell-scene': { encodeShellScene: () => new Uint8Array() },
    'graphics/ui-fonts': { getDefaultSmallFont: () => font, getDefaultMediumFont: () => font },
    'graphics/textwrap': {
      wrapText: (_f, text, width) => {
        const max = Math.max(1, Math.floor(width / 10)); const out = [];
        for (let i = 0; i < text.length; i += max) out.push(text.slice(i, i + max));
        return out.length ? out : [''];
      },
      truncateText: (_f, text) => text,
    },
    'ui/metrics': { lineStep: (f) => f.lineHeight + 2 },
    'native/frame-timings': { spanCurrent: (_n, fn) => fn() },
    'ui/shell/geometry': {
      minWindowTop: () => 96, appViewportRect: () => ({ x: 0, y: 96, width: 640, height: 288 }), sidebarWidth: () => 0,
      switcherPosition: () => 'left', switcherRowHeight: () => 0, uiDepth: () => 0, windowBandHeight: () => 288,
      windowFramed: () => false, windowTop: () => 96,
    },
  };
}

/**
 * Real Shell (app/ui/shell/shell.ts) with its real LayerStack, voice-activity and audio-priority.
 * Only leaf UI classes (menus, dialogs, chrome) and settings are replaced by small fakes.
 */
function realShell({ wakeWordAction = 'voice-input', conversationControl } = {}) {
  const timers = fakeTimers();
  class Leaf {
    constructor(options) { this.options = options; }
    paint(_ctx, below) { return below ? below() : new FakeImage(640, 480); }
    handleInput() {}
    onRemoved() { this.options?.onClosed?.(); this.options?.onRemoved?.(); }
  }
  class VoiceInputLayer extends Leaf { startCapture() { this.capturing = true; } endCapture() {} }
  class KeyboardInputLayer extends Leaf {}
  const session = { isTurnActive: () => false, sendUtterance() {}, cancel() {} };
  const setting = (value) => ({ get: () => value });
  const mocks = {
    ...graphicsMocks(),
    'g2/events': {},
    'ui/input-monitor': { acceptInput: () => true },
    'ui/gestures': {
      directionalFallback: (e) => e, isDirectionalInput: (e) => e.type.startsWith('swipe'), isWatchInput: () => false,
      gestureHints: () => '', GESTURE_SHORT_THEN_LONG_PRESS: 1, makeInputEvent: (type) => ({ type }),
    },
    'ui/menu': { CONTEXT_MENU_DIM: 0.25, MenuLayer: class extends Leaf { constructor(title, items) { super(); this.items = items; } selectItem() {} }, openModalMenu() {} },
    'ui/shell/voice-input': { VoiceInputLayer },
    'ui/shell/keyboard-input': { KeyboardInputLayer },
    'ui/shell/assistant': { AssistantLayer: class extends Leaf { startTurn() {} onTextDelta() {} onToolActivity() {} onTurnDone() {} onError() {} } },
    'assistant/session': { AssistantSession: class {} },
    'assistant/models': { resolveAssistantModel: () => ({ provider: 'x' }) },
    'assistant/conversations': { AssistantConversations: class {
      current() { return { session, model: 'm', reasoning: 'default' }; }
      ensureSession() { return session; }
    } },
    'native/settings-store': { getStringSetting: () => '', setStringSetting() {} },
    'ui/notifications': { SingleNotificationLayer: class extends Leaf {} },
    'ui/dashboard-settings': new Proxy({
      onAnySettingChanged: () => () => {}, batteryIndicatorSettingsKey: () => '',
      wakeWordActionSetting: setting(wakeWordAction), assistantBackendSetting: setting('direct'),
      assistantSkipConfirmationSetting: setting(false), assistantModelSetting: setting('m'),
    }, { get: (target, key) => key in target ? target[key] : setting('') }),
    'ui/shell/ambient-cards': { onAmbientCardsChanged() {} },
    'ui/shell/chrome-layer': { ShellChromeLayer: class extends Leaf {}, sidebarContentSpan: () => ({ left: 0, right: 0 }) },
    'ui/shell/modal-layer': { ShellModalLayer: class extends Leaf {} },
    'ui/shell/tool-debug-layer': { ToolDebugMenuLayer: class extends Leaf {} },
    'ui/shell/brightness-picker-layer': { BrightnessPickerLayer: class extends Leaf {} },
    'assistant/tool-registry': { toolRegistry: {} },
  };
  const load = makeLoader(mocks, { setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout });
  const { shell } = load('app/ui/shell/shell.ts');
  const ui = load('app/ui/shell/conversation-hermes-ui.ts');
  const { voiceActivity } = load('app/ui/shell/voice-activity.ts');
  const screen = [];
  let renders = 0;
  shell.configure({
    actions: { requestRender: () => {} }, getScreenTimeoutMs: () => 10_000,
    requestShellRender: () => { renders++; }, onScreenStateChanged: (on) => screen.push(on),
    prepareVoiceCapture: async () => true,
    conversationControl,
  });
  const windows = {};
  const addWindow = (appId, extra = {}) => {
    const window = { appId, windowId: appId, title: appId, surfaceId: appId, closeable: true, heightMode: 'min',
      drawIcon() {}, handleInput() {}, requestRender() {}, inputs: [], ...extra };
    window.handleInput = (event) => { window.inputs.push(event.type); };
    windows[appId] = window; shell.registerWindow(window);
    return window;
  };
  addWindow('launcher', { closeable: false });
  return { shell, ui, voiceActivity, screen, timers, windows, addWindow, renders: () => renders,
    input: (type) => shell.receiveInput({ type, source: 'ring', timestampMs: 0 }) };
}

/** Structural controller fake with the documented contract only. */
function fakeController({ supported = true } = {}) {
  let selected = false, message = '', detectorOn = false, captureStarts = 0, channelCalls = 0;
  let runtime = { enabled: false, busy: false, requests: 0, listening: false, episode: { state: 'off' } };
  const listeners = new Set();
  const emit = () => { for (const listener of [...listeners]) listener(); };
  const controller = {
    conversationHermesSelected: () => selected,
    setConversationHermesSelected(enabled) {
      if (detectorOn || (enabled && !supported)) return false;
      selected = enabled; emit(); return true;
    },
    get conversationHermesMessage() { return message; },
    dismissConversationHermesMessage() { message = ''; emit(); },
    onConversationHermesChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    conversationHermes: { snapshot: () => runtime },
    setConversationCaptureEnabled() { captureStarts++; },
  };
  return { controller, emit, listeners,
    arm(listening = true) { detectorOn = true; runtime = { ...runtime, enabled: true, listening, episode: { state: 'esperando' } }; emit(); },
    listening(value) { runtime = { ...runtime, listening: value }; emit(); },
    off() { detectorOn = false; runtime = { ...runtime, enabled: false, listening: false, episode: { state: 'off' } }; message = ''; emit(); },
    tick(patch) { runtime = { ...runtime, ...patch }; emit(); },
    say(text) { message = text; emit(); },
    setMessageSilently(text) { message = text; },
    counts: () => ({ captureStarts, channelCalls, listeners: listeners.size }),
    selected: () => selected,
  };
}

function topLayer(shell) { return shell.stack.layers.at(-1); }

test('glasses system menu starts from any app and a stale ON menu cannot restart an expired session', () => {
  let enabled = false;
  const calls = [];
  const h = realShell({ conversationControl: {
    enabled: () => enabled, setEnabled(wanted) { calls.push(wanted); enabled = wanted; return ''; },
    wearerActions: () => [], wearerChoices: () => [],
  } });
  h.shell.wake('window'); h.shell.openEscapeMenu();
  let action = topLayer(h.shell).items.find(i => i.label.includes('Hermes en conversación'));
  assert.match(action.label, /OFF/); action.onSelect({ stack: h.shell.stack });
  assert.equal(enabled, true);
  h.shell.openEscapeMenu();
  action = topLayer(h.shell).items.find(i => i.label.includes('Hermes en conversación'));
  assert.match(action.label, /ON/);
  enabled = false; // Session expires while the user leaves the menu open.
  action.onSelect({ stack: h.shell.stack });
  assert.equal(enabled, false); assert.deepEqual(calls, [true, false]);
});
function overlayText(shell) {
  const layer = topLayer(shell);
  return layer.paint({ stack: shell.stack, actions: { requestRender() {} } }, () => new FakeImage(640, 480)).text.join('\n');
}

test('selection OFF/ON is RAM-only, never starts capture, and a refusal keeps OFF with a notice', () => {
  const { ui } = realShell();
  const f = fakeController({ supported: false });
  assert.equal(ui.toggleHermesSelection(f.controller, false), 'No disponible: el puente no anuncia conv/1. Sigue OFF.');
  assert.equal(f.selected(), false);
  assert.equal(ui.hermesPhoneButton(f.controller.conversationHermesSelected()), 'Hermes en conversación: OFF');
  const g = fakeController();
  assert.equal(ui.toggleHermesSelection(g.controller, false), '');
  assert.equal(g.selected(), true);
  assert.equal(ui.hermesPhoneButton(true), 'Hermes en conversación: ON');
  g.arm();
  assert.equal(ui.toggleHermesSelection(g.controller, true), 'Cambia solo con la conversación OFF.');
  assert.equal(g.selected(), true, 'refused change while ON keeps the previous selection');
  assert.equal(g.counts().captureStarts, 0);
  assert.match(ui.hermesPhoneStatus({ selected: true, supported: true, detectorOn: false, armed: false,
    listening: false, requests: 0, episode: 'off', notice: '' }), /No implica que el servidor/);
});

test('binding never selects, starts audio or shows a message pending before bind (restore/reconnect)', () => {
  const h = realShell();
  const f = fakeController();
  f.setMessageSilently('Respuesta antigua');
  const dispose = h.ui.bindHermesConversationUi(f.controller);
  assert.equal(f.selected(), false);
  assert.equal(f.counts().captureStarts, 0);
  assert.ok(h.shell.stack.isAtBase());
  f.emit(); f.emit();
  assert.ok(h.shell.stack.isAtBase(), 'same stale message on later emits is not shown');
  assert.deepEqual(h.screen, []);
  dispose();
  assert.equal(f.counts().listeners, 0);
});

test('armed listening blanks with the real sleep once; ticks, verdicts, "nada" and errors never wake', () => {
  const h = realShell();
  const f = fakeController();
  h.ui.bindHermesConversationUi(f.controller);
  f.arm(false);
  assert.equal(h.shell.isScreenOn(), true, 'arming before listening does not blank');
  f.listening(true);
  assert.equal(h.shell.isScreenOn(), false);
  assert.deepEqual(h.screen, [false]);
  for (let i = 0; i < 20; i++) f.tick({ requests: i, busy: i % 2 === 0, episode: { state: i % 2 ? 'candidata' : 'activa' } });
  f.say(''); f.say('');
  assert.deepEqual(h.screen, [false], 'no wake/sleep churn from runtime changes');
  assert.ok(h.shell.stack.isAtBase());
  assert.equal(h.ui.hermesConversationPresentation(), true);
});

test('a final contribution wakes once, shows one overlay, then retires and re-sleeps', () => {
  const h = realShell();
  const f = fakeController();
  h.ui.bindHermesConversationUi(f.controller);
  f.arm();
  f.say('Puedes proponer el martes a las diez.');
  assert.deepEqual(h.screen, [false, true]);
  assert.equal(h.shell.stack.layers.length, 2);
  assert.match(overlayText(h.shell), /Hermes[\s\S]*martes a las diez/);
  for (let i = 0; i < 5; i++) f.emit();
  f.tick({ requests: 3 });
  assert.equal(h.shell.stack.layers.length, 2, 'repeated emits of the same event do not multiply overlays');
  assert.deepEqual(h.screen, [false, true]);
  f.say('');
  assert.ok(h.shell.stack.isAtBase());
  assert.deepEqual(h.screen, [false, true, false], 'expiry returns to dark listening');
});

test('a newer contribution replaces the text in place without a second wake', () => {
  const h = realShell();
  const f = fakeController();
  h.ui.bindHermesConversationUi(f.controller);
  f.arm();
  f.say('Primera');
  f.say('Segunda');
  assert.equal(h.shell.stack.layers.length, 2);
  assert.match(overlayText(h.shell), /Segunda/);
  assert.doesNotMatch(overlayText(h.shell), /Primera/);
  assert.deepEqual(h.screen, [false, true]);
});

test('new turn/identity (message cleared), suspension and OFF retire the overlay', () => {
  for (const end of ['clear', 'suspend', 'off']) {
    const h = realShell();
    const f = fakeController();
    h.ui.bindHermesConversationUi(f.controller);
    f.arm();
    f.say('Aportación');
    if (end === 'clear') f.say('');
    if (end === 'suspend') f.listening(false);
    if (end === 'off') f.off();
    assert.ok(h.shell.stack.isAtBase(), end);
    assert.equal(h.shell.isScreenOn(), false, `${end}: back to the state before the wake`);
    if (end === 'suspend') {
      // The same event must not reappear when listening resumes.
      f.listening(true);
      assert.ok(h.shell.stack.isAtBase());
      assert.deepEqual(h.screen, [false, true, false]);
    }
  }
});

test('a message is never shown while listening is suspended or the runtime is not armed', () => {
  const h = realShell();
  const f = fakeController();
  h.ui.bindHermesConversationUi(f.controller);
  f.say('Sin modo Hermes');
  assert.ok(h.shell.stack.isAtBase());
  f.arm(false);
  f.say('Escucha suspendida');
  assert.ok(h.shell.stack.isAtBase());
  assert.equal(h.shell.isScreenOn(), true);
  assert.deepEqual(h.screen, []);
});

test('tap dismisses through the controller and returns to dark; scroll pages without dismissing', async () => {
  const h = realShell();
  const f = fakeController();
  h.ui.bindHermesConversationUi(f.controller);
  f.arm();
  f.say('x'.repeat(1000));
  await h.input('scroll-down');
  assert.equal(h.shell.stack.layers.length, 2);
  assert.equal(f.controller.conversationHermesMessage, 'x'.repeat(1000));
  await h.input('click');
  assert.equal(f.controller.conversationHermesMessage, '');
  assert.ok(h.shell.stack.isAtBase());
  assert.equal(h.shell.isScreenOn(), false);
});

test('expiry while the phone keyboard is open never closes it nor turns the screen off', () => {
  const h = realShell();
  const f = fakeController();
  h.ui.bindHermesConversationUi(f.controller);
  f.arm();
  f.say('Aportación');
  const keyboard = h.shell.startKeyboardInput();
  assert.ok(keyboard, 'keyboard has priority and opens');
  assert.equal(f.controller.conversationHermesMessage, '', 'the overlay yielded and the event was dismissed');
  f.say('');
  assert.equal(topLayer(h.shell), keyboard);
  assert.equal(h.shell.isScreenOn(), true);
  assert.deepEqual(h.screen, [false, true]);
});

test('Hey Even (wakeword) and the system menu take the display from the overlay without re-sleeping', async () => {
  for (const type of ['wakeword', 'long-press']) {
    const h = realShell();
    const f = fakeController();
    h.ui.bindHermesConversationUi(f.controller);
    f.arm();
    f.say('Aportación');
    await h.input(type);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(f.controller.conversationHermesMessage, '', type);
    assert.equal(h.shell.isScreenOn(), true, type);
    assert.equal(h.shell.stack.layers.length, 2, `${type}: only the explicit layer remains`);
    assert.notEqual(topLayer(h.shell).constructor.name, 'HermesContributionLayer');
  }
});

test('push-to-talk, an open keyboard or a focused chat refuse the overlay: no wake, no sleep', () => {
  const ptt = realShell();
  let capturing = true;
  ptt.addWindow('ai-chat', { isVoiceCapturing: () => capturing });
  ptt.shell.focusWindow('ai-chat');
  const f = fakeController();
  ptt.ui.bindHermesConversationUi(f.controller);
  f.arm();
  assert.equal(ptt.shell.isScreenOn(), true, 'listening never blanks over an explicit interaction');
  f.say('Aportación');
  assert.ok(ptt.shell.stack.isAtBase());
  assert.deepEqual(ptt.screen, []);
  capturing = false;
  f.say('Otra');
  assert.ok(ptt.shell.stack.isAtBase(), 'the chat window focused on screen keeps priority');

  const kb = realShell();
  const g = fakeController();
  kb.ui.bindHermesConversationUi(g.controller);
  const keyboard = kb.shell.startKeyboardInput();
  g.arm();
  g.say('Aportación');
  assert.equal(topLayer(kb.shell), keyboard);
  assert.deepEqual(kb.screen, []);
});

test('the idle sleep removes the overlay and the event is not shown again', () => {
  const h = realShell();
  const f = fakeController();
  h.ui.bindHermesConversationUi(f.controller);
  f.arm();
  f.say('Aportación');
  h.shell.applyScreenTimeout(Date.now() + 60_000);
  assert.equal(h.shell.isScreenOn(), false);
  assert.equal(f.controller.conversationHermesMessage, '');
  f.emit();
  assert.ok(h.shell.stack.isAtBase());
});

test('a buried retired overlay is dropped once the explicit layer closes, without re-sleeping', () => {
  const h = realShell();
  const f = fakeController();
  h.ui.bindHermesConversationUi(f.controller);
  f.arm();
  f.say('Aportación');
  const overlay = topLayer(h.shell);
  h.shell.showAlert('Aviso');
  assert.equal(h.shell.stack.layers.length, 3);
  const renders = h.renders();
  f.say('');
  assert.ok(h.renders() > renders, 'invalidated text below the alert must be recomposed immediately');
  assert.equal(h.shell.stack.layers.length, 3, 'the alert above is untouched');
  assert.equal(overlay.isRetired(), true);
  assert.equal(overlayText(h.shell).includes('Aportación'), false);
  h.timers.run();
  assert.ok(h.shell.stack.isAtBase());
  assert.equal(h.shell.isScreenOn(), true);
});

test('the layer only paints the controller-validated message: no setter, sanitized and gated', () => {
  const h = realShell();
  const f = fakeController();
  h.ui.bindHermesConversationUi(f.controller);
  f.arm();
  f.say('Hola\u0007\u001b[31m mundo  ');
  const layer = topLayer(h.shell);
  assert.equal(typeof layer.setText, 'undefined');
  assert.equal(Object.keys(layer).some((key) => typeof layer[key] === 'string'), false, 'no text stored on the layer');
  assert.match(overlayText(h.shell), /Hola\[31m mundo/);
  assert.doesNotMatch(overlayText(h.shell), /\u001b|\u0007/);
  f.setMessageSilently('Payload crudo inyectado');
  f.tick({ listening: false });
  assert.ok(h.shell.stack.isAtBase());
  assert.equal(h.ui.sanitizeHermesText({ text: 'x' }), '');
  assert.equal(h.ui.sanitizeHermesText('a'.repeat(5000)).length, h.ui.HERMES_LENS_MAX_CHARS);
});

test('dispose releases the subscription and removes a showing overlay without re-sleeping', () => {
  const h = realShell();
  const f = fakeController();
  const dispose = h.ui.bindHermesConversationUi(f.controller);
  f.arm();
  f.say('Aportación');
  dispose();
  assert.ok(h.shell.stack.isAtBase());
  assert.equal(h.shell.isScreenOn(), true);
  assert.equal(f.counts().listeners, 0);
  assert.equal(h.ui.hermesConversationPresentation(), false);
});

/** Local conversation window with Hermes armed: no transcript read, no screen hold, no capture on restore. */
function localConversation(armed, manual = false) {
  let snapshot = { enabled: true, state: 'escuchando', reason: '', epoch: 1, stopReason: 'none', remainingMs: 90_500,
    participationMode: 'conversation', transcription: { enabled: true, engine: 'soniox' } };
  let reads = 0, renders = 0, detectorListener = null, hermesListener = null;
  const starts = [];
  const session = { detector: {
    snapshot: () => snapshot, ownProfileState: () => 'guardado', transcriptText: () => { reads++; return 'texto privado'; },
    wearerActionRef: () => null, observedSpeakers: () => [],
    subscribe(fn) { detectorListener = fn; return () => { detectorListener = null; }; },
  }, voiceModel: () => 'ready', textModel: () => 'ready', setEnabled: (...args) => starts.push(args) };
  if (manual) session.setManualEnabled = enabled => { starts.push(['manual', enabled]); return ''; };
  let options;
  const timers = fakeTimers();
  const load = makeLoader({
    ...graphicsMocks(),
    'conversation-detection/conversation-ui': { conversationDetail: () => 'Detalle', textLanguageLabel: () => 'castellano', wearerLine: () => '' },
    'conversation-detection/session-controls': {
      conversationSession: () => session, conversationTextLanguage: () => 'es', conversationTextSelected: () => true,
      lensConversationPlan: () => ({ canStart: true, button: 'Iniciar', hint: '' }), onConversationTextSelected: () => () => {},
      setConversationTextSelected() {}, toggleLensConversation: (s) => s.setEnabled(false), wearerActions: () => [], wearerChoices: () => [],
    },
    'ui/menu': { openModalMenu() {} },
    'ui/shell/shell': { shell: { isWindowVisible: () => false, yieldFocusToSidebar() {} } },
    'ui/shell/in-process-window': { createInProcessWindow: (value) => { options = value; return { requestRender() { renders++; } }; } },
    'ui/shell/conversation-hermes-ui': {
      hermesConversationPresentation: () => armed,
      onHermesConversationPresentation: (fn) => { hermesListener = fn; return () => { hermesListener = null; }; },
    },
  }, { setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout });
  const app = load('app/apps/local-conversation/local-conversation-app.ts');
  app.createLocalConversationWindow({ onClosed() {} });
  return { options, starts, app,
    paint: () => options.baseLayer.paint({ stack: { getBaseSize: () => ({ width: 640, height: 288 }) } }).text.join('\n'),
    patch(p) { snapshot = { ...snapshot, ...p }; detectorListener?.(snapshot); },
    counts: () => ({ reads, renders, detector: detectorListener !== null, hermes: hermesListener !== null }) };
}

test('local conversation in Hermes mode: no transcript on lenses, no screen hold, deduplicated paints', () => {
  const h = localConversation(true);
  const text = h.paint();
  assert.match(text, /Hermes en conversación/);
  assert.doesNotMatch(text, /texto privado/);
  assert.equal(h.counts().reads, 0, 'the transcript is never read');
  assert.equal(h.options.keepsScreenOn(), false, 'capture does not hold the lenses on');
  for (let i = 0; i < 10; i++) h.patch({ remainingMs: 90_400 - i });
  assert.equal(h.counts().renders, 1, 'one paint for one visible second, not one per chunk');
  h.patch({ remainingMs: 88_000 });
  assert.equal(h.counts().renders, 2);
  assert.deepEqual(h.starts, [], 'paint/restore never starts capture');
  h.options.onClosed();
  assert.deepEqual(h.starts, [[false]], 'closing only turns OFF');
  assert.equal(h.counts().hermes, false, 'presentation subscription released on close');
  assert.equal(h.counts().detector, false);
});

test('local conversation without Hermes keeps the classic transcript view and screen hold', () => {
  const h = localConversation(false);
  assert.match(h.paint(), /texto privado/);
  assert.equal(h.options.keepsScreenOn(), true);
});

test('glasses product conversation uses the shared manual owner, one menu control and no legacy transcript', () => {
  const h = localConversation(false, true);
  h.patch({ enabled: false, state: 'desactivado' });
  assert.match(h.paint(), /Máximo 20 min/);
  assert.doesNotMatch(h.paint(), /2 min\)|castellano|Identificar|texto privado/);
  assert.equal(h.counts().reads, 0);
  assert.deepEqual(h.starts, [], 'opening and rendering do not start audio');
  assert.equal(h.options.menuItems().length, 1);
  h.options.baseLayer.handleInput({ type: 'click' });
  assert.deepEqual(h.starts, [['manual', true]], 'same controller entry point as phone/system menu');
  h.patch({ enabled: true, state: 'escuchando' });
  assert.equal(h.options.keepsScreenOn(), false);
  assert.equal(h.counts().reads, 0);
});

test('a glasses manual stop menu retained after expiry cannot restart capture', () => {
  const h = localConversation(true, true);
  const stop = h.options.menuItems()[0];
  h.patch({ enabled: false, state: 'desactivado' });
  stop.onSelect({ stack: { pop() {} } });
  assert.deepEqual(h.starts, [['manual', false]]);
});

function phoneHarness(f) {
  let detectorOn = false;
  const captureCalls = [];
  // Exercise the actual owner methods, extracted from the controller to avoid native boot effects.
  const file = path.join(ROOT, 'app/g2/dashboard-controller.ts');
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const klass = source.statements.find(s => ts.isClassDeclaration(s) && s.name?.text === 'DashboardController');
  const methods = klass.members.filter(m => ['toggleManualConversation', 'setManualConversationEnabled'].includes(m.name?.getText(source)));
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(`export class Manual { ${methods.map(m => m.getText(source)).join('\n')} }`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, { module, exports: module.exports,
    assistantBridge: { conversation: { isSupported: () => f.supported, supportsOptionalIdentity: () => f.optional === true } },
    sonioxApiKeySetting: { get: () => 'synthetic' }, setConversationTextEngine() {},
    conversationSessionOptions: () => ({ language: 'es' }),
  });
  const owner = { ...f.controller,
    conversationDetector: { hasOwnProfile: () => f.profile !== false, snapshot: () => ({ enabled: detectorOn, state: detectorOn ? 'escuchando' : 'desactivado', remainingMs: 1200000 }) },
    detectorEnvironment: () => ({ available: true }),
    setConversationCaptureEnabled(enabled, ...args) { detectorOn = enabled; captureCalls.push([enabled, ...args]); if (enabled) f.arm(); else f.off(); },
    toggleManualConversation: module.exports.Manual.prototype.toggleManualConversation,
    setManualConversationEnabled: module.exports.Manual.prototype.setManualConversationEnabled,
  };
  const bridgeListeners = new Set();
  const timers = fakeTimers();
  const unsubscribed = [];
  const tracked = (name) => () => () => unsubscribed.push(name);
  const notified = [];
  const load = makeLoader({
    '@nativescript/core': { Dialogs: {}, Application: {}, Frame: {}, ImageSource: {}, Screen: { mainScreen: {} }, SwipeDirection: {} },
    'phone-ui/remote-controls-view-model': { RemoteControlsViewModel: class {} },
    'g2/dashboard-controller': { dashboardController: { ...owner,
      conversationDetector: { ...owner.conversationDetector, subscribe: tracked('detector') },
      subscribe: tracked('controller'), onConversationHermesChange: (fn) => { const off = f.controller.onConversationHermesChange(fn); return () => { off(); unsubscribed.push('hermes'); }; } } },
    'assistant/bridge-client': { assistantBridge: { conversation: { isSupported: () => f.supported, supportsOptionalIdentity: () => f.optional === true },
      onStateChange: (fn) => { bridgeListeners.add(fn); return () => { bridgeListeners.delete(fn); unsubscribed.push('bridge'); }; } } },
    'ui/shell/conversation-hermes-ui': realShell().ui,
    'ui/dashboard-settings': { onAnySettingChanged: tracked('settings'), mirrorTouchSetting: {}, showBleBandwidthSetting: { get: () => false }, sonioxApiKeySetting: { get: () => '' } },
    'native/asr-model': { onAsrModelStateChanged: tracked('asr') },
    'apps/microphones/mic-models': { onMicModelStateChanged: tracked('mic') },
    'conversation-detection/session-controls': { onConversationTextSelected: tracked('text') },
    'graphics/image': { G2_LENS_WIDTH: 640, G2_LENS_HEIGHT: 480 },
  }, { setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout });
  const { MainViewModel } = load('app/phone-ui/main-view-model.ts');
  const view = Object.create(MainViewModel.prototype);
  Object.assign(view, { unsubscribers: [], hermesNotice: '', hermesShown: { button: '', status: '' },
    notifyPropertyChange: (name, value) => notified.push([name, value]), syncBleBandwidthPolling() {}, stopBleBandwidthPolling() {} });
  view.attach();
  return { view, captureCalls, notified, unsubscribed, bridgeListeners, bridgeChanged: () => { for (const fn of bridgeListeners) fn({}); } };
}

test('phone and actual controller: one tap starts manual bilingual capture, OFF stops, subscriptions die with view', () => {
  const f = fakeController();
  f.supported = true;
  const { view, captureCalls, notified, unsubscribed, bridgeListeners } = phoneHarness(f);
  assert.deepEqual(notified.map(([name]) => name), ['conversationHermesButton', 'conversationHermesStatus']);
  notified.length = 0;
  for (let i = 0; i < 5; i++) f.emit();
  assert.deepEqual(notified, [], 'unchanged labels are not re-notified on runtime ticks');
  view.onConversationHermesTap();
  assert.equal(f.selected(), true);
  assert.equal(view.conversationHermesButton, 'Hermes en conversación: ON · detener');
  assert.equal(captureCalls[0][1], true);
  assert.equal(captureCalls[0][2], 'conversation');
  assert.equal(captureCalls[0][3].manualConversation, true);
  assert.equal(captureCalls[0][3].language, 'auto');
  assert.deepEqual(notified.map(([name]) => name), ['conversationHermesButton', 'conversationHermesStatus']);
  view.onConversationHermesTap();
  assert.equal(view.conversationHermesButton, 'Hermes en conversación: OFF · iniciar');
  assert.equal(captureCalls.at(-1)[0], false);
  assert.equal(f.counts().captureStarts, 0);
  view.dispose();
  for (const name of ['hermes', 'bridge']) assert.ok(unsubscribed.includes(name), name);
  assert.equal(bridgeListeners.size, 0);
  assert.equal(f.counts().listeners, 0);
});

test('phone manual control: unavailable Hermes cannot start; an active session can always be stopped', () => {
  const f = fakeController({ supported: false });
  f.supported = false;
  const h = phoneHarness(f);
  h.view.onConversationHermesTap();
  assert.equal(h.view.conversationHermesButton, 'Hermes en conversación: OFF · iniciar', 'no false ON');
  assert.equal(h.view.conversationHermesStatus, 'Hermes no está disponible. La conversación sigue OFF.');
  assert.equal(h.captureCalls.length, 0);
  h.bridgeChanged();
  assert.equal(h.view.conversationHermesStatus, 'Hermes no disponible en el puente actual.');
  const g = fakeController();
  g.supported = true;
  const r = phoneHarness(g);
  r.view.onConversationHermesTap();
  r.view.onConversationHermesTap();
  assert.equal(r.view.conversationHermesButton, 'Hermes en conversación: OFF · iniciar');
  assert.equal(r.captureCalls.at(-1)[0], false);
  assert.equal(g.counts().captureStarts, 0);
});
