const test = require('node:test');
const assert = require('node:assert/strict');
const { EvoWatchdog, inOffWindow, lastOffWindowEnd } = require('../.test-build/app/assistant/evo-watchdog.js');

// Local clock times, so the expectations hold in any test time zone.
const at = (day, hour, minute, second = 0) => new Date(2026, 9, day, hour, minute, second).getTime();

function harness(startMs) {
  const h = { now: startMs, reachable: true, enabled: true, alerts: [] };
  h.watchdog = new EvoWatchdog({ now: () => h.now, enabled: () => h.enabled, reachable: () => h.reachable,
    alert: text => h.alerts.push(text) });
  h.run = (untilMs, stepMs = 30_000) => { for (; h.now <= untilMs; h.now += stepMs) h.watchdog.check(); h.now -= stepMs; };
  return h;
}

test('night window crosses midnight and ends at 03:50', () => {
  assert.equal(inOffWindow(at(24, 20, 59)), false);
  assert.equal(inOffWindow(at(24, 21, 0)), true);
  assert.equal(inOffWindow(at(25, 0, 30)), true);
  assert.equal(inOffWindow(at(25, 3, 49)), true);
  assert.equal(inOffWindow(at(25, 3, 50)), false);
  assert.equal(lastOffWindowEnd(at(25, 4, 0)), at(25, 3, 50));
  assert.equal(lastOffWindowEnd(at(24, 23, 0)), at(24, 3, 50));
});

test('a short outage is silent; a long one alerts once and its recovery once', () => {
  const h = harness(at(24, 10, 0));
  h.run(at(24, 11, 0));
  h.reachable = false; h.run(at(24, 11, 9));
  assert.deepEqual(h.alerts, []);
  h.reachable = true; h.run(at(24, 11, 15));
  h.reachable = false; h.run(at(24, 11, 40));
  assert.equal(h.alerts.length, 1);
  assert.match(h.alerts[0], /^EVO-X2 inaccesible desde este móvil desde las 11:15\. Puede ser el equipo, la red o Tailscale\.$/);
  h.reachable = true; h.run(at(24, 11, 41));
  assert.equal(h.alerts.length, 2);
  assert.equal(h.alerts[1], 'EVO-X2 accesible de nuevo desde este móvil (sin conexión 25 min).');
});

test('the scheduled night shutdown with a normal 03:50 boot says nothing', () => {
  const h = harness(at(24, 20, 0));
  h.run(at(24, 21, 20));
  h.reachable = false; h.run(at(25, 3, 55));          // off from 21:20, booting at 03:50
  h.reachable = true; h.run(at(25, 4, 30));
  assert.deepEqual(h.alerts, []);
});

test('an EVO that does not come back after the night window is reported from 03:50', () => {
  const h = harness(at(24, 20, 0));
  h.run(at(24, 21, 30));
  h.reachable = false; h.run(at(25, 4, 30));
  assert.deepEqual(h.alerts, ['EVO-X2 inaccesible desde este móvil desde las 03:50: no ha vuelto tras el apagado nocturno.']);
});

test('an outage before the window is reported before 21:00 and not repeated in the morning', () => {
  const h = harness(at(24, 20, 0));
  h.run(at(24, 20, 30));
  h.reachable = false; h.run(at(25, 5, 0));
  assert.equal(h.alerts.length, 1);
  assert.match(h.alerts[0], /desde las 20:30\. Puede ser/);
});

test('disabled bridge (not configured or another backend) never alerts', () => {
  const h = harness(at(24, 10, 0));
  h.enabled = false; h.reachable = false; h.run(at(24, 12, 0));
  assert.deepEqual(h.alerts, []);
  h.enabled = true; h.run(at(24, 12, 9));
  assert.deepEqual(h.alerts, []);                      // counts from when it was enabled again
  h.run(at(24, 12, 11));
  assert.equal(h.alerts.length, 1);
});

test('an outage already present when the app starts counts from the start', () => {
  const h = harness(at(24, 15, 0));
  h.reachable = false; h.run(at(24, 15, 10));
  assert.equal(h.alerts.length, 1);
  assert.match(h.alerts[0], /desde las 15:00/);
});
