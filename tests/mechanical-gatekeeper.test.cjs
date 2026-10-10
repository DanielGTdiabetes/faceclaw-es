const test = require('node:test');
const assert = require('node:assert/strict');
const { MechanicalGatekeeper, FILTER_POLICY } = require('../.test-build/app/conversation-detection/mechanical-gatekeeper.js');
const context = (texts, episodeId = 1, revision = 1, start = 1) => ({
  ref: { sessionId: 's', streamId: 1, associationVersion: 0, episodeId, revision },
  turns: texts.map((text, i) => ({ seq: start + i, text })) });
test('isolated words do not trigger calls but negative replies, names and quantities stay with the phrase', () => {
  const f = new MechanicalGatekeeper(); f.begin();
  for (const text of ['No', 'María', '42', '...']) assert.equal(f.decide(context([text]), 'assess', 0), 'short');
  assert.equal(f.decide(context(['No', 'María llega mañana a las 12']), 'assess', 0), 'send');
  assert.equal(f.decide(context(['¿Qué hora es?']), 'assess', 0), 'send');
  assert.equal(f.decide(context(['Això és una conversa en valencià']), 'assess', 0), 'send');
});
test('new batches wait, immediate assess-to-assist is bounded, and consumed text cannot trigger again', () => {
  const f = new MechanicalGatekeeper(); f.begin(); const c=context(['Mañana salimos hacia Valencia']);
  assert.equal(f.decide(c,'assess',0),'send'); f.submitted(c,'assess',0);
  assert.equal(f.decide(c,'assist',1),'send'); f.submitted(c,'assist',1);
  assert.equal(f.decide(c,'assist',20000),'unchanged');
  const newer=context(['No','¿A qué hora sale el tren?'],1,2,2);
  assert.equal(f.decide(newer,'assist',19000),'cadence');
  assert.equal(f.decide(newer,'assist',20000),'send'); f.submitted(newer,'assist',20000);
  assert.equal(f.decide(context(['No'],1,3,4),'assist',40000),'short');
});
test('rolling cap counts both calls and survives OFF/ON, stream changes and errors; expires at one hour', () => {
  const f = new MechanicalGatekeeper(); f.begin();
  for(let i=0;i<60;i++) {
    const c=context(['Esta frase contiene suficiente texto'],i+1);
    const now=i*20000;
    assert.equal(f.decide(c,'assess',now),'send'); f.submitted(c,'assess',now);
    assert.equal(f.decide(c,'assist',now),'send'); f.submitted(c,'assist',now);
  }
  f.begin(); const next=context(['Otra frase con suficiente texto'],100);
  assert.equal(f.decide(next,'assess',1200000),'budget');
  assert.equal(f.snapshot(1200000).remaining,0);
  assert.equal(f.decide(next,'assess',FILTER_POLICY.hourMs),'send');
  assert.equal(f.snapshot(FILTER_POLICY.hourMs).remaining,2);
  assert.equal(JSON.stringify(f.snapshot(1200000)).includes('suficiente'),false);
});
