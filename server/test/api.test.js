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
  assert.equal(run.status, 'ready'); // nothing dispatches until launched

  const launch = await post(`/runs/${run.id}/launch`, {});
  assert.equal(launch.status, 200);
  assert.equal((await post(`/runs/${run.id}/launch`, {})).status, 409);

  const sse = await fetch(`${base}/runs/${run.id}/events`);
  const text = await sse.text(); // server ends the stream on run_complete
  assert.match(text, /event: snapshot/);
  assert.match(text, /event: run_complete/);

  const final = await (await fetch(`${base}/runs/${run.id}`)).json();
  assert.equal(final.status, 'complete');
  assert.equal(final.counts.won + final.counts.lost, 12);
  assert.ok(final.leads.every((l) => l.state === 'won' || l.state === 'lost'));
});

test('GET /runs/:id/pipeline returns every stage, consistent with the run', async () => {
  const run = await (await post('/runs', { name: 'P', voiceId: 'vijay', leadCount: 16 })).json();
  const p = await (await fetch(`${base}/runs/${run.id}/pipeline`)).json();
  assert.equal(p.fetch.sources.length, 3);
  assert.equal(p.opportunities.rows.length, 16);
  assert.equal(p.pitch.rows.length, 16);
  assert.equal(p.eligibility.buckets.reduce((n, b) => n + b.rows.length, 0), 16);
  assert.equal(p.batching.batches.reduce((n, b) => n + b.count, 0), 16);
  assert.equal(p.fulfilment.slides.length, 4);
  // Vijay speaks Hindi/Marathi only: a batch is a voice match iff its language is one of those.
  for (const b of p.batching.batches) assert.equal(b.voiceMatch, ['Hindi', 'Marathi'].includes(b.language));
});

test('cold sales: sample run, upload, phone privacy, and a list with nothing callable', async () => {
  const sample = await post('/runs', { name: 'C', voiceId: 'maya', mode: 'cold_sales' });
  assert.equal(sample.status, 201);
  const run = await sample.json();
  assert.equal(run.mode, 'cold_sales');
  assert.ok(run.leads.length > 20);
  assert.ok(run.leads.every((l) => !('phone' in l) && /^••••••\d{4}$/.test(l.phoneMasked)));

  const p = await (await fetch(`${base}/runs/${run.id}/pipeline`)).json();
  assert.equal(p.mode, 'cold_sales');
  assert.ok(p.intake.excludedCount > 0);
  assert.equal(p.contact.rows.length, run.leads.length);
  assert.match(p.fulfilment.slides[1].fix, /consent/);

  const csv = 'Name,Phone,CIBIL\nAsha,9876543210,742\nRavi,9123456789,701\nBad,123,700\n';
  const up = await fetch(`${base}/runs/upload?filename=list.csv&voiceId=ria&name=U`, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: csv });
  assert.equal(up.status, 201);
  const uploaded = await up.json();
  assert.equal(uploaded.leads.length, 2);
  assert.ok(!JSON.stringify(uploaded).includes('9876543210'));

  const none = await fetch(`${base}/runs/upload?filename=list.csv&voiceId=ria`, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: 'Name,Phone\nA,1\n' });
  assert.equal(none.status, 422);
  assert.equal((await none.json()).error, 'no_eligible_leads');

  const bad = await fetch(`${base}/runs/upload?filename=list.pdf&voiceId=ria`, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: 'x' });
  assert.equal(bad.status, 400);

  const tpl = await fetch(`${base}/cold/sample.csv`);
  assert.match(tpl.headers.get('content-type'), /text\/csv/);
  assert.match(await tpl.text(), /^Customer Name,Mobile Number,CIBIL Score/);
});

test('unknown run is 404', async () => {
  assert.equal((await fetch(base + '/runs/missing')).status, 404);
});
