// Runs a campaign: dispatches leads through the state machine with bounded
// concurrency and emits an event for every transition. Runs live in memory
// (this is a demo server) and are pruned after RUN_TTL_MS.
const crypto = require('crypto');
const config = require('../config');
const voices = require('../voiceCatalog');
const { generateLeads } = require('./leads');
const pipeline = require('./pipeline');
const { slidesFor } = require('./fulfilment');
const cold = require('./cold');
const agentLibrary = require('./agentLibrary');
const sm = require('./stateMachine');

const RUN_TTL_MS = 60 * 60 * 1000;
const MAX_RUNS = 50;
const MODES = ['cross_sell', 'cold_sales'];
const MAX_COLD_LEADS = 200; // a demo run dispatches at most this many valid rows
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

// Raw phone numbers never leave the server — the UI only ever sees phoneMasked.
function publicLead(rt) {
  const { phone, ...lead } = rt.lead;
  return { ...lead, state: rt.state, attempt: rt.attempt, rounds: rt.rounds };
}

function snapshot(run) {
  return {
    id: run.id, name: run.name, mode: run.mode, status: run.status, createdAt: run.createdAt,
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

function httpError(status, code, extra) {
  const e = new Error(code); e.status = status; e.extra = extra; return e;
}

/**
 * mode 'cross_sell' (default): synthetic existing customers, leadCount of them.
 * mode 'cold_sales': `rows` from an uploaded list (or the sample list when absent),
 *   analysed by cold.js; only valid rows become leads, each routed to the agent
 *   that speaks its call language.
 */
function createRun({ name, voiceId, leadCount, mode = 'cross_sell', rows }) {
  const voice = findVoice(voiceId);
  if (!voice) throw httpError(400, 'unknown_voice');
  if (!MODES.includes(mode)) throw httpError(400, 'unknown_mode');
  const id = crypto.randomBytes(6).toString('hex');
  const run = {
    id, name: String(name || '').slice(0, 60), voice, mode, status: 'ready', createdAt: Date.now(),
    seed: id, seq: 0, counts: emptyCounts(), leads: new Map(), subscribers: new Set(), queue: [], active: 0,
  };

  let leads;
  if (mode === 'cold_sales') {
    const analysis = cold.analyze(rows || cold.sampleRows(), voice, voices);
    if (!analysis.leads.length) throw httpError(422, 'no_eligible_leads', { intake: analysis.intake, excluded: analysis.excluded });
    leads = analysis.leads.sort((a, b) => b.score - a.score).slice(0, MAX_COLD_LEADS);
    analysis.intake.dispatched = leads.length;
    analysis.intake.truncated = analysis.leads.length > leads.length;
    run.pipeline = cold.pipelineView(leads, analysis.excluded, analysis.intake, voice, voices);
  } else {
    const n = Math.min(config.maxLeadCount, Math.max(1, leadCount || config.defaultLeadCount));
    leads = generateLeads(n, id);
    run.pipeline = pipeline.build(leads, voice);
  }

  for (const lead of leads) {
    run.leads.set(lead.id, { lead, voice: findVoice(lead.voiceId) || voice, state: 'queued', attempt: 0, rounds: [] });
    run.counts.queued += 1;
    run.queue.push(lead.id);
  }
  // Bigger lists get more parallel lines so a long upload still finishes in minutes.
  run.concurrency = Math.min(30, Math.max(config.concurrency, Math.ceil(leads.length / 6)));
  runs.set(id, run);
  prune();
  return run;
}

// Library voices the visitor picked on the batching step. Mirrors the UI rule:
// for each lead, the latest pick among its batch's recommended voices (the ones
// agentLibrary.recommend lists on the batch card) takes the call.
function applyLibraryPicks(run, picks) {
  if (!Array.isArray(picks) || !picks.length) return;
  const cache = new Map();
  for (const rt of run.leads.values()) {
    const key = `${rt.lead.language}|${rt.lead.need}`;
    if (!cache.has(key)) cache.set(key, new Set(agentLibrary.recommend({ language: rt.lead.language, mode: run.mode, need: rt.lead.need }).agents.map((a) => a.id)));
    const ids = cache.get(key);
    const pick = [...picks].reverse().find((id) => typeof id === 'string' && ids.has(id));
    const voice = pick && agentLibrary.asVoice(pick, rt.voice);
    if (voice) rt.voice = voice;
  }
}

// Dispatch starts only when the visitor launches the campaign from the
// Execution tab, after walking through Data Intelligence and Strategy.
function launchRun(run, libraryPicks) {
  if (run.status !== 'ready') return false;
  applyLibraryPicks(run, libraryPicks);
  run.status = 'running';
  emit(run, 'run_started', { counts: run.counts, summary: summarize(run) });
  // Next tick so the client's SSE subscription can land before the first transition.
  setTimeout(() => pump(run), Math.min(600, config.stepDelayMs));
  return true;
}

function pipelineView(run) {
  const batching = { ...run.pipeline.batching, batches: agentLibrary.decorateBatches(run.pipeline.batching.batches, run.mode) };
  return { ...run.pipeline, batching, mode: run.mode, fulfilment: { slides: slidesFor(run.mode) } };
}

function pump(run) {
  while (run.active < run.concurrency && run.queue.length) {
    const rt = run.leads.get(run.queue.shift());
    run.active += 1;
    advance(run, rt);
  }
}

// One step for one lead, then schedule the next. The delay is applied *before*
// the transition so the UI shows a lead "sitting" in a state for a beat.
function advance(run, rt) {
  const step = sm.decide(rt.state, { lead: rt.lead, voice: rt.voice, seed: run.seed, attempt: rt.attempt });
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
