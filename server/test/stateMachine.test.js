const test = require('node:test');
const assert = require('node:assert/strict');
process.env.STEP_DELAY_MS = '1';

const sm = require('../lib/stateMachine');
const voices = require('../voiceCatalog');
const { generateLeads } = require('../lib/leads');

const edgeKey = (from, to) => `${from}>${to}`;
const declared = new Set(sm.EDGES.map((e) => edgeKey(e.from, e.to)));

function walk(lead, voice, seed) {
  let state = 'queued', attempt = 0;
  const path = [state];
  for (let i = 0; i < 40; i++) {
    const step = sm.decide(state, { lead, voice, seed, attempt });
    if (!step) return { path, end: state };
    assert.ok(declared.has(edgeKey(state, step.to)), `undeclared edge ${state} -> ${step.to}`);
    if (step.to === 'dialing') attempt += 1;
    state = step.to;
    path.push(state);
  }
  assert.fail('walk did not terminate');
}

test('every emitted transition is a declared edge and every walk terminates', () => {
  for (const voice of voices) {
    for (const lead of generateLeads(60, 'unit')) {
      const { end } = walk(lead, voice, 'unit');
      assert.ok(end === 'won' || end === 'lost');
    }
  }
});

test('decisions are deterministic for the same seed', () => {
  const lead = generateLeads(1, 's')[0];
  assert.deepEqual(walk(lead, voices[0], 'x'), walk(lead, voices[0], 'x'));
});

test('calls are capped at MAX_CALL_ATTEMPTS before SMS fallback', () => {
  const lead = generateLeads(1, 's')[0];
  const noAnswer = { ...voices[0], profile: { connectRate: 0, intentBias: {} } };
  const { path } = walk(lead, noAnswer, 'x');
  assert.equal(path.filter((s) => s === 'dialing').length, sm.MAX_CALL_ATTEMPTS);
  assert.deepEqual(path.slice(-2), ['sms_fallback', 'lost']);
});

test('all states in edges exist, and the outcomes cover high/medium/low in a sample', () => {
  for (const e of sm.EDGES) { assert.ok(sm.STATES[e.from]); assert.ok(sm.STATES[e.to]); }
  const seen = new Set();
  for (const lead of generateLeads(60, 'cov')) walk(lead, voices[0], 'cov').path.forEach((s) => seen.add(s));
  for (const s of ['high', 'medium', 'low', 'won', 'lost']) assert.ok(seen.has(s), `never reached ${s}`);
});

test('language match raises high-intent probability', () => {
  const lead = { ...generateLeads(1, 's')[0], band: 'med', language: 'Marathi' };
  const matched = sm.intentMix(lead, voices.find((v) => v.id === 'vijay')).mix.high;
  const unmatched = sm.intentMix(lead, voices.find((v) => v.id === 'ria')).mix.high;
  assert.ok(matched > unmatched);
});
