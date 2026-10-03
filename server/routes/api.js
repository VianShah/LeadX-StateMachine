const express = require('express');
const voices = require('../voiceCatalog');
const sm = require('../lib/stateMachine');
const runner = require('../lib/runner');
const config = require('../config');

const router = express.Router();

router.get('/health', (req, res) => res.json({ ok: true }));

router.get('/voices', (req, res) => {
  res.json(voices.map((v) => ({
    id: v.id, name: v.name, gender: v.gender, lang: v.lang, ttsLang: v.ttsLang, pastel: v.pastel,
    meta: v.meta, languages: v.languages, sample: v.sampleText, sampleAudio: v.sampleAudio, active: true,
  })));
});

// The machine definition — the UI renders states/edges from this.
router.get('/machine', (req, res) => res.json(sm.definition()));

router.post('/runs', (req, res) => {
  const { name, voiceId, leadCount } = req.body || {};
  try {
    const run = runner.createRun({ name, voiceId, leadCount: parseInt(leadCount, 10) || config.defaultLeadCount });
    res.status(201).json(runner.snapshot(run));
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[runs] create failed', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

router.get('/runs/:id', (req, res) => {
  const run = runner.getRun(req.params.id);
  if (!run) return res.status(404).json({ error: 'run_not_found' });
  res.json(runner.snapshot(run));
});

// Server-sent events: one `snapshot` on connect, then a message per
// transition and a final `run_complete`.
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
