const express = require('express');
const voices = require('../voiceCatalog');
const sm = require('../lib/stateMachine');
const runner = require('../lib/runner');
const config = require('../config');
const cold = require('../lib/cold');
const agentLibrary = require('../lib/agentLibrary');
const { parseList, toCsv } = require('../lib/listParser');

const router = express.Router();

router.get('/health', (req, res) => res.json({ ok: true }));

router.get('/voices', (req, res) => {
  res.json(voices.map((v) => ({
    id: v.id, name: v.name, gender: v.gender, lang: v.lang, ttsLang: v.ttsLang, pastel: v.pastel,
    meta: v.meta, languages: v.languages, sample: v.sampleText, sampleAudio: v.sampleAudio, active: true,
  })));
});

// The Sales voice-agent library (from the Kollect agent catalog), for browsing by language / region.
router.get('/agent-library', (req, res) => res.json(agentLibrary.listing()));

// The machine definition — the UI renders states/edges from this.
router.get('/machine', (req, res) => res.json(sm.definition()));

function sendError(res, err, where) {
  if (err.status) return res.status(err.status).json({ error: err.code || err.message, message: err.code ? err.message : undefined, ...(err.extra || {}) });
  console.error(`[${where}] failed`, err);
  res.status(500).json({ error: 'internal_error' });
}

// Body: { name, voiceId, mode?: 'cross_sell' | 'cold_sales', leadCount? }.
// A cold_sales run created here uses the built-in sample list.
router.post('/runs', (req, res) => {
  const { name, voiceId, leadCount, mode } = req.body || {};
  try {
    const run = runner.createRun({ name, voiceId, mode, leadCount: parseInt(leadCount, 10) || config.defaultLeadCount });
    res.status(201).json(runner.snapshot(run));
  } catch (err) {
    sendError(res, err, 'runs');
  }
});

// Cold sales from an uploaded list. The raw file is the request body;
// ?filename= (.xlsx or .csv), ?voiceId= and ?name= travel in the query string.
router.post('/runs/upload', express.raw({ type: () => true, limit: '5mb' }), async (req, res) => {
  const { filename, voiceId, name } = req.query;
  try {
    const rows = await parseList(req.body, filename);
    const run = runner.createRun({ name, voiceId, mode: 'cold_sales', rows });
    res.status(201).json(runner.snapshot(run));
  } catch (err) {
    sendError(res, err, 'runs/upload');
  }
});

// The sample list as a CSV — also the template for what a list should look like.
router.get('/cold/sample.csv', (req, res) => {
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="leadx-cold-list-sample.csv"' });
  res.send(toCsv(cold.sampleRows()));
});

// Data Intelligence + Strategy + Fulfilment content for this run's leads and voice.
router.get('/runs/:id/pipeline', (req, res) => {
  const run = runner.getRun(req.params.id);
  if (!run) return res.status(404).json({ error: 'run_not_found' });
  res.json(runner.pipelineView(run));
});

router.post('/runs/:id/launch', (req, res) => {
  const run = runner.getRun(req.params.id);
  if (!run) return res.status(404).json({ error: 'run_not_found' });
  if (!runner.launchRun(run)) return res.status(409).json({ error: 'already_launched' });
  res.json(runner.snapshot(run));
});

router.get('/runs/:id', (req, res) => {
  const run = runner.getRun(req.params.id);
  if (!run) return res.status(404).json({ error: 'run_not_found' });
  res.json(runner.snapshot(run));
});

// Server-sent events: one `snapshot` on connect, then `run_started`, a message
// per transition, and a final `run_complete`.
router.get('/runs/:id/events', (req, res) => {
  const run = runner.getRun(req.params.id);
  if (!run) return res.status(404).json({ error: 'run_not_found' });
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' });
  res.flushHeaders();
  const send = (evt) => res.write(`id: ${evt.seq}\nevent: ${evt.type}\ndata: ${JSON.stringify(evt)}\n\n`);
  send({ type: 'snapshot', ...runner.snapshot(run) });
  if (run.status === 'complete') return res.end();
  const sub = (evt) => { send(evt); if (evt.type === 'run_complete') res.end(); };
  run.subscribers.add(sub);
  const ping = setInterval(() => res.write(': ping\n\n'), 15000);
  req.on('close', () => { clearInterval(ping); run.subscribers.delete(sub); });
});

module.exports = router;
