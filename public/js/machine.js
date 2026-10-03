// Run lifecycle + the Execution tab. The machine definition (states + edges) comes
// from GET /api/machine; the campaign is launched with POST /api/runs/:id/launch,
// and every transition arrives over SSE from /api/runs/:id/events — nothing here
// is scripted. The Fulfilment tab (fulfilment.js) listens to the same stream.
let eventSource = null;
let execGraph = null, fulGraph = null;
let leadsById = {};
let stateByKey = {};
let selectedLeadId = null;
let chipEls = {};
let launched = false;

// Node positions as % of the graph box: [x, y]. Execution is one lane per
// outcome, flowing right; Fulfilment is the in-app chain the high-intent lane
// hands off into.
const LAYOUT_EXEC = {
  queued: [8.5, 51], dialing: [25, 51],
  not_connected: [41.5, 9], wrong_party: [41.5, 26], opt_out: [41.5, 43], low: [41.5, 60], medium: [41.5, 77], high: [41.5, 91],
  sms_fallback: [58, 9], data_flagged: [58, 26], suppressed: [58, 43], nurture_sms: [58, 60], wa_confirm: [58, 77],
  nurture_wa: [74.5, 60], inapp_handoff: [74.5, 88],
  lost: [91, 30],
};
// Cold sales adds the warm-up message (WhatsApp / SMS intro) between queued and
// the first call, stacked under the queue.
function execLayout(){
  if(!state.run || state.run.mode !== 'cold_sales') return LAYOUT_EXEC;
  return { ...LAYOUT_EXEC, queued: [8.5, 34], warmup: [8.5, 68] };
}
const LAYOUT_FUL = {
  inapp_handoff: [12, 50], kyc_check: [38, 50], mandate_setup: [64, 50],
  won: [90, 26], lost: [90, 74],
};

/* ---------- lifecycle ---------- */
function prepareRun(run, def, data){
  teardownRun();
  state.run = run;
  stateByKey = Object.fromEntries(def.states.map(s => [s.key, s]));
  leadsById = Object.fromEntries(run.leads.map(l => [l.id, l]));
  launched = false;
  selectedLeadId = null;
  document.getElementById('mFeed').innerHTML = '';
  document.getElementById('mLead').innerHTML = '<div class="m-empty">Click a transition or a lead below to follow its journey.</div>';
  document.getElementById('mBanner').hidden = true;
  document.getElementById('xLive').hidden = true;
  document.getElementById('xLaunch').hidden = false;
  renderLaunchCard(data);
  resetFulfilment(data); // fulfilment.js
}

function teardownRun(){
  closeStream();
  execGraph = null; fulGraph = null;
}

function closeStream(){
  if(eventSource){ eventSource.close(); eventSource = null; }
}

function renderLaunchCard(data){
  const b = data.batching, voice = state.run.voice;
  const cold = data.mode === 'cold_sales';
  const rows = cold
    ? b.batches.map(p =>
      '<div class="camp-row"><div class="name">' + bucketChip(p.bucket) + ' ' + escHtml(p.language) + ' — ' + escHtml(p.when) + '</div>' +
      '<div class="meta">' + p.count + (p.count === 1 ? ' prospect' : ' prospects') + ' · ' + escHtml(p.agent) + '</div>' +
      '<span class="status-pill ready">Ready</span></div>')
    : b.batches.map(p =>
      '<div class="camp-row"><div class="name">' + escHtml(p.need) + ' — ' + escHtml(p.language) + '</div>' +
      '<div class="meta">' + p.count + (p.count === 1 ? ' lead' : ' leads') + ' · Voice</div>' +
      '<span class="status-pill ready">Ready</span></div>');
  document.getElementById('xLaunch').innerHTML =
    '<h2>Run &amp; measure</h2>' +
    (cold
      ? '<div class="desc">Launch the ' + b.batches.length + ' cold campaigns. Warm and Cold prospects get their intro message first; every call runs in its time slot and language, and each outcome picks that prospect&#8217;s next best action.</div>'
      : '<div class="desc">Launch each persona batch as a voice campaign with <b>' + escHtml(voice.name) + '</b>. Once it runs, every call outcome is captured &mdash; not just the ones that convert &mdash; and each one picks that lead&#8217;s next best action.</div>') +
    '<div class="camp-list">' + rows.join('') + '</div>' +
    '<div class="x-launch-actions"><button class="btn-primary x-launch-btn" id="btnLaunch" type="button">Launch campaign &amp; measure intent</button><div id="launchErr" class="launch-err"></div></div>' +
    '<div class="footnote">Scoring, sentiment and outcomes here are simulated for this walkthrough. Production runs on the full Account Aggregator + CRM + CIBIL signal set described in Data Intelligence.</div>';
  document.getElementById('btnLaunch').onclick = launchCampaign;
}

async function launchCampaign(){
  const btn = document.getElementById('btnLaunch');
  btn.disabled = true;
  try {
    const res = await fetch('/api/runs/' + state.run.id + '/launch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if(!res.ok && res.status !== 409) throw new Error('launch ' + res.status);
  } catch(e) {
    btn.disabled = false;
    document.getElementById('launchErr').textContent = 'Couldn’t launch the campaign — try again.';
    return;
  }
  launched = true;
  document.getElementById('xLaunch').hidden = true;
  document.getElementById('xLive').hidden = false;
  buildExecGraph();
  unlockStep(STEP_FULFILMENT);
  setStatus('Dispatching…', true);
  openStream(state.run.id);
}

function buildExecGraph(){
  execGraph = new StateGraph({
    graphEl: document.getElementById('mGraph'), svgEl: document.getElementById('mEdges'), nbaEl: document.getElementById('mNba'),
    layout: execLayout(), skipEdgesFrom: ['inapp_handoff'],
    ghost: { key: '__fulfilment', label: 'To Fulfilment', sub: 'in-app journey', pos: [91, 88], after: 'inapp_handoff',
      hint: 'Leads that said yes continue into the in-app journey — click to see where it breaks and the fix.',
      onClick: () => goStep(STEP_FULFILMENT) },
  });
  execGraph.build(machineDef);
  refreshGraphs();
}

function onExecutionShown(){
  if(launched && execGraph){ // re-layout now that the panel is visible again
    execGraph.build(machineDef);
    refreshGraphs();
  }
}

/* ---------- streaming ---------- */
function openStream(runId){
  const es = new EventSource('/api/runs/' + runId + '/events');
  eventSource = es;
  es.addEventListener('snapshot', (e) => {
    const snap = JSON.parse(e.data);
    applySnapshot(snap); // idempotent — also covers an auto-reconnect
    if(snap.status === 'complete'){ closeStream(); onComplete(snap.summary); }
  });
  es.addEventListener('transition', (e) => onTransition(JSON.parse(e.data)));
  es.addEventListener('run_complete', (e) => {
    const evt = JSON.parse(e.data);
    state.run.counts = evt.counts; state.run.summary = evt.summary; state.run.status = 'complete';
    renderStats(); closeStream(); onComplete(evt.summary);
  });
  es.onerror = () => {
    if(es.readyState === EventSource.CLOSED && state.run && state.run.status !== 'complete') setStatus('Disconnected');
  };
}

function applySnapshot(snap){
  state.run = snap;
  leadsById = Object.fromEntries(snap.leads.map(l => [l.id, l]));
  renderStats();
  renderLeadChips();
  setStatus(snap.status === 'complete' ? 'Complete' : 'Live', snap.status !== 'complete');
  refreshGraphs();
  if(selectedLeadId && leadsById[selectedLeadId]) renderLead(selectedLeadId);
}

function onTransition(evt){
  const run = state.run;
  run.counts = evt.counts; run.summary = evt.summary;
  const lead = leadsById[evt.leadId];
  if(lead){
    lead.state = evt.round.to; lead.rounds.push(evt.round);
    if(evt.round.to === 'dialing') lead.attempt += 1;
  }
  refreshGraphs(evt.round.to);
  if(execGraph) execGraph.pulse(evt.round.from, evt.round.to);
  if(fulGraph) fulGraph.pulse(evt.round.from, evt.round.to);
  renderStats();
  addFeedRow(evt);
  const chip = chipEls[evt.leadId];
  if(chip) chip.style.setProperty('--c', (stateByKey[evt.round.to] || {}).color);
  if(selectedLeadId === evt.leadId) renderLead(evt.leadId);
  updateFulfilmentStats(); // fulfilment.js
}

/* ---------- graphs ---------- */
// Per graph: how many leads ever entered each node. A drop into `lost` counts only
// on the graph that owns that edge, so Execution and Fulfilment losses stay separate.
function computeVisits(graph){
  const v = {};
  for(const l of Object.values(leadsById)){
    v.queued = (v.queued || 0) + 1;
    for(const r of l.rounds){
      if(r.to === 'lost' && !graph.owns(r.from, 'lost')) continue;
      v[r.to] = (v[r.to] || 0) + 1;
    }
  }
  if(graph.ghost) v[graph.ghost.key] = v.inapp_handoff || 0;
  return v;
}

function refreshGraphs(flashKey){
  const live = state.run ? state.run.counts : {};
  if(execGraph) execGraph.update(computeVisits(execGraph), live, flashKey);
  if(fulGraph) fulGraph.update(computeVisits(fulGraph), live, flashKey);
}

/* ---------- panels ---------- */
function renderStats(){
  const s = state.run && state.run.summary;
  if(!s) return;
  document.getElementById('mStats').innerHTML =
    stat('Leads', s.total) + stat('In flight', s.inFlight) + stat('Won', s.won, 'won') +
    stat('Lost', s.lost, 'lost') + stat('Conversion', s.conversionRate + '%', 'conv');
}
const stat = (k, v, cls) => '<div class="m-stat ' + (cls || '') + '"><div class="v">' + escHtml(v) + '</div><div class="k">' + escHtml(k) + '</div></div>';

function setStatus(text, live){
  for(const id of ['mStatus', 'fStatus']){
    const el = document.getElementById(id);
    el.textContent = text;
    el.classList.toggle('live', !!live);
  }
}

function addFeedRow(evt){
  const feed = document.getElementById('mFeed');
  const lead = leadsById[evt.leadId];
  const to = stateByKey[evt.round.to] || { label: evt.round.to };
  const row = document.createElement('div');
  row.className = 'm-feed-row';
  row.innerHTML = '<span class="who">' + escHtml(lead ? lead.name : evt.leadId) + '</span>' +
    '<span class="what"><b>' + escHtml(to.label) + '</b> &middot; ' + escHtml(evt.round.action) + '</span>';
  row.addEventListener('click', () => selectLead(evt.leadId));
  feed.prepend(row);
  while(feed.children.length > 60) feed.lastChild.remove();
}

function renderLeadChips(){
  const wrap = document.getElementById('mChips');
  wrap.innerHTML = ''; chipEls = {};
  state.run.leads.forEach(l => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'm-chip' + (l.id === selectedLeadId ? ' sel' : '');
    b.title = l.name; b.setAttribute('aria-label', 'Lead ' + l.name);
    b.style.setProperty('--c', (stateByKey[l.state] || {}).color);
    b.addEventListener('click', () => selectLead(l.id));
    wrap.appendChild(b); chipEls[l.id] = b;
  });
}

function selectLead(id){
  selectedLeadId = id;
  Object.entries(chipEls).forEach(([lid, el]) => el.classList.toggle('sel', lid === id));
  renderLead(id);
}

function renderLead(id){
  const l = leadsById[id];
  if(!l) return;
  const st = stateByKey[l.state] || { label: l.state, nba: '' };
  document.getElementById('mLead').innerHTML =
    '<h3>' + escHtml(l.name) + '</h3>' +
    (l.mode === 'cold_sales'
      ? '<div class="meta">' + escHtml(l.phoneMasked) + ' · ' + escHtml(l.city) + ' · ' + escHtml(l.occupationLabel) + ' · CIBIL ' + escHtml(l.cibilDisplay) + '<br>' +
        bucketChip(l.bucket) + ' ' + escHtml(l.plan.how) + ' · ' + escHtml(l.plan.when) + ' · in ' + escHtml(l.callLanguage) + '</div>'
      : '<div class="meta">' + escHtml(l.city) + ' · ' + escHtml(l.language) + ' · score ' + escHtml(l.score) + ' · CIBIL ' + escHtml(l.cibil) + '<br>Holds: ' + escHtml(l.existing) + '</div>') +
    '<div class="need">Pitch: <b>' + escHtml(l.need) + '</b> up to <b>' + escHtml(l.eligibleDisplay) + '</b><br>' + escHtml(l.signal) + '</div>' +
    '<div class="need">Now: <b>' + escHtml(st.label) + '</b> &mdash; ' + escHtml(st.nba) + '</div>' +
    l.rounds.map(r =>
      '<div class="m-round' + (r.friction ? ' friction ' + r.friction.outcome : '') + '"><div class="rh"><span>Step ' + r.n + ' · ' + escHtml(r.channel) + '</span><span>' + escHtml(r.event) + '</span></div>' +
      '<div class="ra">' + escHtml(r.action) + '</div><div class="rs">' + escHtml(r.signal) + ' &mdash; ' + escHtml(r.insight) + '</div>' +
      (r.friction ? '<div class="rf">Friction ' + escHtml(r.friction.outcome === 'recovered' ? 'recovered by the built-in fix' : 'not recovered — dropped off') + '</div>' : '') + '</div>').join('');
}

function showBanner(html){
  const b = document.getElementById('mBanner');
  b.innerHTML = html; b.hidden = false;
}

function onComplete(summary){
  setStatus('Complete');
  showBanner(
    '<span>Campaign complete &mdash; <b>' + summary.won + '</b> won, ' + summary.lost + ' lost · <b>' + summary.conversionRate + '%</b> conversion with ' + escHtml(state.run.voice.name) + '</span>' +
    '<span class="banner-actions"><button class="btn-ghost" id="bnFul" type="button">See fulfilment</button><button class="btn-ghost" id="bnTry" type="button">Try another voice</button></span>');
  document.getElementById('bnFul').onclick = () => goStep(STEP_FULFILMENT);
  document.getElementById('bnTry').onclick = () => document.getElementById('btnChangeVoice').click();
}
