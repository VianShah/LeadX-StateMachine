// Runs a campaign: dispatches leads through the state machine with bounded
// concurrency and emits an event for every transition. Runs live in memory
// (this is a demo server) and are pruned after RUN_TTL_MS.
const crypto = require('crypto');
const config = require('../config');
const voices = require('../voiceCatalog');
const { generateLeads } = require('./leads');
const pipeline = require('./pipeline');
const fulfilmentSlides = require('./fulfilment');
const sm = require('./stateMachine');

const RUN_TTL_MS = 60 * 60 * 1000;
const MAX_RUNS = 50;
const runs = new Map();

function findVoice(id) {
  return voices.find((v) => v.id === id) || null;
}

function emptyCounts() {
  const counts = {};
  for (const key of Object.keys(sm.STATES)) counts[key] = 0;
  return counts;
}

function summarize(run) {
  const total = run.leads.size;
  const won = run.counts.won;
  const lost = run.counts.lost;
  return {
    total, won, lost,
    inFlight: total - won - lost,
    conversionRate: won + lost ? Math.round((won / (won + lost)) * 1000) / 10 : 0,
  };
}

function publicLead(rt) {
  return { ...rt.lead, state: rt.state, attempt: rt.attempt, rounds: rt.rounds };
}

function snapshot(run) {
  return {
    id: run.id, name: run.name, status: run.status, createdAt: run.createdAt,
    voice: { id: run.voice.id, name: run.voice.name, lang: run.voice.lang, meta: run.voice.meta },
    counts: run.counts, summary: summarize(run),
    leads: [...run.leads.values()].map(publicLead),
    seq: run.seq,
  };
}

function emit(run, type, data) {
  run.seq += 1;
  const evt = { seq: run.seq, type, ...data };
  for (const fn of run.subscribers) {
    try { fn(evt); } catch (_) { /* a dead subscriber must not break the run */ }
  }
}

function transition(run, rt, step) {
  const from = rt.state;
  run.counts[from] -= 1;
  run.counts[step.to] += 1;
  rt.state = step.to;
  if (step.to === 'dialing') rt.attempt += 1;
  const round = {
    n: rt.rounds.length + 1, from, to: step.to, event: step.event, channel: step.channel,
    action: step.action, signal: step.signal, insight: step.insight, at: Date.now(),
    friction: step.friction || null,
  };
  rt.rounds.push(round);
  emit(run, 'transition', { leadId: rt.lead.id, round, counts: run.counts, summary: summarize(run) });
}

function finishIfDone(run) {
  if (run.status !== 'running' || run.counts.won + run.counts.lost < run.leads.size) return;
  run.status = 'complete';
  emit(run, 'run_complete', { counts: run.counts, summary: summarize(run) });
}

function createRun({ name, voiceId, leadCount }) {
  const voice = findVoice(voiceId);
  if (!voice) { const e = new Error('unknown_voice'); e.status = 400; throw e; }
  const n = Math.min(config.maxLeadCount, Math.max(1, leadCount || config.defaultLeadCount));
  const id = crypto.randomBytes(6).toString('hex');
  const run = {
    id, name: String(name || '').slice(0, 60), voice, status: 'ready', createdAt: Date.now(),
    seed: id, seq: 0, counts: emptyCounts(), leads: new Map(), subscribers: new Set(), queue: [], active: 0,
  };
  for (const lead of generateLeads(n, id)) {
    run.leads.set(lead.id, { lead, state: 'queued', attempt: 0, rounds: [] });
    run.counts.queued += 1;
    run.queue.push(lead.id);
  }
  run.pipeline = pipeline.build([...run.leads.values()].map((rt) => rt.lead), voice);
  runs.set(id, run);
  prune();
  return run;
}

// Dispatch starts only when the visitor launches the campaign from the
// Execution tab, after walking through Data Intelligence and Strategy.
function launchRun(run) {
  if (run.status !== 'ready') return false;
  run.status = 'running';
  emit(run, 'run_started', { counts: run.counts, summary: summarize(run) });
  // Next tick so the client's SSE subscription can land before the first transition.
  setTimeout(() => pump(run), Math.min(600, config.stepDelayMs));
  return true;
}

function pipelineView(run) {
  return { ...run.pipeline, fulfilment: { slides: fulfilmentSlides } };
}

function pump(run) {
  while (run.active < config.concurrency && run.queue.length) {
    const rt = run.leads.get(run.queue.shift());
    run.active += 1;
    advance(run, rt);
  }
}

// One step for one lead, then schedule the next. The delay is applied *before*
// the transition so the UI shows a lead "sitting" in a state for a beat.
function advance(run, rt) {
  const step = sm.decide(rt.state, { lead: rt.lead, voice: run.voice, seed: run.seed, attempt: rt.attempt });
  if (!step) { // terminal — free the slot
    run.active -= 1;
    finishIfDone(run);
    pump(run);
    return;
  }
  const delay = Math.max(1, Math.round(config.stepDelayMs * step.weight));
  setTimeout(() => {
    transition(run, rt, step);
    advance(run, rt);
  }, delay);
}

function prune() {
  const now = Date.now();
  for (const [id, run] of runs) {
    if (now - run.createdAt > RUN_TTL_MS) runs.delete(id);
  }
  while (runs.size > MAX_RUNS) runs.delete(runs.keys().next().value);
}

const getRun = (id) => runs.get(id) || null;

module.exports = { createRun, launchRun, pipelineView, getRun, snapshot, summarize };
