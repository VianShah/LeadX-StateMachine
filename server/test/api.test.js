const test = require('node:test');
const assert = require('node:assert/strict');
process.env.STEP_DELAY_MS = '1';
process.env.RUN_CONCURRENCY = '10';

const app = require('../index');

let server, base;
test.before(async () => {
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});
test.after(() => server.close());

const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('GET /voices returns Maya, Ria and Vijay', async () => {
  const voices = await (await fetch(base + '/voices')).json();
  assert.deepEqual(voices.map((v) => v.name), ['Maya', 'Ria', 'Vijay']);
});

test('GET /machine returns states and edges', async () => {
  const m = await (await fetch(base + '/machine')).json();
  assert.ok(m.states.length > 10 && m.edges.length > 10);
});

test('POST /runs rejects an unknown voice', async () => {
  const res = await post('/runs', { name: 'T', voiceId: 'nope' });
  assert.equal(res.status, 400);
});

test('a run streams over SSE to completion and counts add up', async () => {
  const res = await post('/runs', { name: 'Tester', voiceId: 'maya', leadCount: 12 });
  assert.equal(res.status, 201);
  const run = await res.json();
  assert.equal(run.leads.length, 12);

  const sse = await fetch(`${base}/runs/${run.id}/events`);
  const text = await sse.text(); // server ends the stream on run_complete
  assert.match(text, /event: snapshot/);
  assert.match(text, /event: run_complete/);

  const final = await (await fetch(`${base}/runs/${run.id}`)).json();
  assert.equal(final.status, 'complete');
  assert.equal(final.counts.won + final.counts.lost, 12);
  assert.ok(final.leads.every((l) => l.state === 'won' || l.state === 'lost'));
});

test('unknown run is 404', async () => {
  assert.equal((await fetch(base + '/runs/missing')).status, 404);
});
