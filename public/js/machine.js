// Live state-machine screen. The machine definition (states + edges) comes from
// GET /api/machine, a run is started with POST /api/runs, and every transition
// arrives over SSE from /api/runs/:id/events — nothing here is scripted.
let machineDef = null;
let eventSource = null;
let nodeEls = {};      // state key -> node element
let edgeEls = {};      // "from>to" -> svg path
let chipEls = {};      // lead id -> chip button
let selectedLeadId = null;
let leadsById = {};
let stateByKey = {};
let visits = {};        // state key -> how many leads have ever entered it (the node's big number)

// Node positions as % of the graph box: [x, y]. Outcomes form one lane per
// row; each lane flows right: outcome -> actions -> won/lost.
const LAYOUT = {
  queued: [8.5, 51], dialing: [25, 51],
  not_connected: [41.5, 9], wrong_party: [41.5, 26], opt_out: [41.5, 43], low: [41.5, 60], medium: [41.5, 77], high: [41.5, 94],
  sms_fallback: [58, 9], data_flagged: [58, 26], suppressed: [58, 43], nurture_sms: [58, 60], wa_confirm: [58, 77], inapp_handoff: [58, 94],
  nurture_wa: [74.5, 60],
  lost: [91, 28], won: [91, 78],
};

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const reduceMotionPref = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

async function startRun(){
  closeStream();
  document.getElementById('mBanner').hidden = true;
  goTo('screen-machine');
  setStatus('Starting campaign…');
  try {
    if(!machineDef){
      const res = await fetch('/api/machine');
      if(!res.ok) throw new Error('machine ' + res.status);
      machineDef = await res.json();
      stateByKey = Object.fromEntries(machineDef.states.map(s => [s.key, s]));
    }
    const res = await fetch('/api/runs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: state.name, voiceId: state.voice.id }),
    });
    if(!res.ok) throw new Error('runs ' + res.status);
    state.run = await res.json();
  } catch(e) {
    setStatus('');
    showBanner(`Couldn&#8217;t start the campaign. <button class="btn-ghost" id="bnRetry" type="button">Retry</button>`);
    document.getElementById('bnRetry').onclick = startRun;
    return;
  }
  buildGraph();
  applySnapshot(state.run);
  openStream(state.run.id);
}

function closeStream(){
  if(eventSource){ eventSource.close(); eventSource = null; }
}

function openStream(runId){
  const es = new EventSource('/api/runs/' + runId + '/events');
  eventSource = es;
  es.addEventListener('snapshot', (e) => {
    const snap = JSON.parse(e.data);
    applySnapshot(snap); // idempotent — also covers an auto-reconnect
    if(snap.status === 'complete') { closeStream(); onComplete(snap.summary); }
  });
  es.addEventListener('transition', (e) => onTransition(JSON.parse(e.data)));
  es.addEventListener('run_complete', (e) => {
    const evt = JSON.parse(e.data);
    state.run.counts = evt.counts; state.run.summary = evt.summary;
    renderStats(); closeStream(); onComplete(evt.summary);
  });
  es.onerror = () => {
    if(es.readyState === EventSource.CLOSED && state.run && state.run.status !== 'complete') setStatus('Disconnected');
  };
}

/* ---------- graph ---------- */
function buildGraph(){
  const graph = document.getElementById('mGraph');
  graph.querySelectorAll('.m-node').forEach(n => n.remove());
  const svg = document.getElementById('mEdges');
  svg.innerHTML = '';
  nodeEls = {}; edgeEls = {};
  machineDef.states.forEach(s => {
    const pos = LAYOUT[s.key];
    if(!pos) return;
    const el = document.createElement('div');
    el.className = 'm-node zero' + (s.kind === 'terminal' ? ' terminal' : '');
    el.style.left = pos[0] + '%'; el.style.top = pos[1] + '%';
    el.style.setProperty('--c', s.color);
    el.innerHTML = `<div class="nl">${esc(s.label)}</div><div class="nk">${esc(s.kind)}</div><div class="nlive"></div><div class="nc">0</div>`;
    el.addEventListener('mouseenter', () => showNba(s));
    el.addEventListener('focus', () => showNba(s));
    graph.appendChild(el);
    nodeEls[s.key] = el;
  });
  drawEdges();
}

function anchors(fromEl, toEl){
  const fx = fromEl.offsetLeft, fy = fromEl.offsetTop, tx = toEl.offsetLeft, ty = toEl.offsetTop;
  const fw = fromEl.offsetWidth / 2, th = toEl.offsetHeight / 2, tw = toEl.offsetWidth / 2;
  if(tx - tw > fx + fw){ // forward: right edge -> left edge
    const x1 = fx + fw, x2 = tx - tw, dx = (x2 - x1) / 2;
    return { d: `M${x1},${fy} C${x1 + dx},${fy} ${x2 - dx},${ty} ${x2},${ty}`, mx: (x1 + x2) / 2, my: (fy + ty) / 2 };
  }
  // backward (the retry loop): left edge of source -> top of target
  const x1 = fx - fw, y2 = ty - th;
  return { d: `M${x1},${fy} C${x1 - 50},${fy} ${tx},${y2 - 60} ${tx},${y2}`, mx: (x1 + tx) / 2 - 12, my: (fy + y2) / 2 - 22 };
}

function drawEdges(){
  const svg = document.getElementById('mEdges');
  const ns = 'http://www.w3.org/2000/svg';
  svg.innerHTML = '<defs><marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#3a4150"/></marker></defs>';
  machineDef.edges.forEach(e => {
    const a = nodeEls[e.from], b = nodeEls[e.to];
    if(!a || !b) return;
    const g = anchors(a, b);
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', g.d);
    path.setAttribute('marker-end', 'url(#arrow)');
    svg.appendChild(path);
    edgeEls[e.from + '>' + e.to] = path;
    // Label only edges with room for it (long spans and the retry loop) —
    // short lane hops would collide with the nodes; the feed names every event.
    const gap = Math.abs(b.offsetLeft - a.offsetLeft) - a.offsetWidth;
    if(gap > 100 || b.offsetLeft <= a.offsetLeft){
      const t = document.createElementNS(ns, 'text');
      t.setAttribute('x', g.mx); t.setAttribute('y', g.my - 3);
      t.setAttribute('text-anchor', 'middle'); t.setAttribute('class', 'edge-label');
      t.textContent = e.event;
      svg.appendChild(t);
    }
  });
}

function showNba(s){
  document.getElementById('mNba').innerHTML = `<b>${esc(s.label)}</b> &mdash; ${esc(s.nba)}`;
}

function pulseEdge(from, to){
  const path = edgeEls[from + '>' + to];
  if(!path) return;
  path.classList.add('hot');
  setTimeout(() => path.classList.remove('hot'), 900);
  if(reduceMotionPref()) return;
  const svg = document.getElementById('mEdges');
  const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  dot.setAttribute('r', 4); dot.setAttribute('class', 'particle');
  svg.appendChild(dot);
  const len = path.getTotalLength(), t0 = performance.now(), dur = 700;
  (function frame(now){
    const p = Math.min(1, (now - t0) / dur);
    const pt = path.getPointAtLength(len * p);
    dot.setAttribute('cx', pt.x); dot.setAttribute('cy', pt.y);
    if(p < 1) requestAnimationFrame(frame); else dot.remove();
  })(t0);
}

/* ---------- state updates ---------- */
function applySnapshot(snap){
  state.run = snap;
  leadsById = Object.fromEntries(snap.leads.map(l => [l.id, l]));
  visits = {};
  snap.leads.forEach(l => {
    visits.queued = (visits.queued || 0) + 1;
    l.rounds.forEach(r => { visits[r.to] = (visits[r.to] || 0) + 1; });
  });
  document.getElementById('mAgent').innerHTML =
    `Agent <strong>${esc(snap.voice.name)}</strong> &middot; ${esc(snap.voice.lang)} &middot; ${snap.leads.length} leads`;
  renderCounts();
  renderStats();
  renderLeadChips();
  setStatus(snap.status === 'complete' ? 'Complete' : 'Live', snap.status !== 'complete');
  if(selectedLeadId && leadsById[selectedLeadId]) renderLead(selectedLeadId);
}

function onTransition(evt){
  const run = state.run;
  run.counts = evt.counts; run.summary = evt.summary;
  visits[evt.round.to] = (visits[evt.round.to] || 0) + 1;
  const lead = leadsById[evt.leadId];
  if(lead){
    lead.state = evt.round.to; lead.rounds.push(evt.round);
    if(evt.round.to === 'dialing') lead.attempt += 1;
  }
  renderCounts(evt.round.to);
  renderStats();
  pulseEdge(evt.round.from, evt.round.to);
  addFeedRow(evt);
  const chip = chipEls[evt.leadId];
  if(chip) chip.style.setProperty('--c', (stateByKey[evt.round.to] || {}).color);
  if(selectedLeadId === evt.leadId) renderLead(evt.leadId);
}

function renderCounts(flashKey){
  const counts = state.run.counts;
  // Big number = leads that have passed through this state; "live" = leads in it right now.
  Object.keys(nodeEls).forEach(key => {
    const el = nodeEls[key], seen = visits[key] || 0, now = counts[key] || 0;
    el.querySelector('.nc').textContent = seen;
    el.querySelector('.nlive').textContent = now > 0 && stateByKey[key].kind !== 'terminal' ? '● ' + now + ' live' : '';
    el.classList.toggle('zero', seen === 0);
    el.classList.toggle('occupied', now > 0);
  });
  if(flashKey && nodeEls[flashKey]){
    const el = nodeEls[flashKey];
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 450);
  }
}

function renderStats(){
  const s = state.run.summary;
  document.getElementById('mStats').innerHTML =
    stat('Leads', s.total) + stat('In flight', s.inFlight) + stat('Won', s.won, 'won') +
    stat('Lost', s.lost, 'lost') + stat('Conversion', s.conversionRate + '%', 'conv');
}
const stat = (k, v, cls) => `<div class="m-stat ${cls || ''}"><div class="v">${esc(v)}</div><div class="k">${esc(k)}</div></div>`;

function setStatus(text, live){
  const el = document.getElementById('mStatus');
  el.textContent = text;
  el.classList.toggle('live', !!live);
}

function addFeedRow(evt){
  const feed = document.getElementById('mFeed');
  const lead = leadsById[evt.leadId];
  const to = stateByKey[evt.round.to] || { label: evt.round.to };
  const row = document.createElement('div');
  row.className = 'm-feed-row';
  row.innerHTML = `<span class="who">${esc(lead ? lead.name : evt.leadId)}</span>` +
    `<span class="what"><b>${esc(to.label)}</b> &middot; ${esc(evt.round.action)}</span>`;
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
    `<h3>${esc(l.name)}</h3>` +
    `<div class="meta">${esc(l.city)} &middot; ${esc(l.language)} &middot; score ${esc(l.score)} &middot; CIBIL ${esc(l.cibil)}<br>Holds: ${esc(l.existing)}</div>` +
    `<div class="need">Pitch: <b>${esc(l.need)}</b> up to <b>${esc(l.eligibleDisplay)}</b><br>${esc(l.signal)}</div>` +
    `<div class="need">Now: <b>${esc(st.label)}</b> &mdash; ${esc(st.nba)}</div>` +
    l.rounds.map(r =>
      `<div class="m-round"><div class="rh"><span>Step ${r.n} &middot; ${esc(r.channel)}</span><span>${esc(r.event)}</span></div>` +
      `<div class="ra">${esc(r.action)}</div><div class="rs">${esc(r.signal)} &mdash; ${esc(r.insight)}</div></div>`).join('');
}

function showBanner(html){
  const b = document.getElementById('mBanner');
  b.innerHTML = html; b.hidden = false;
}

function onComplete(summary){
  setStatus('Complete');
  showBanner(
    `<span>Campaign complete &mdash; <b>${summary.won}</b> won, ${summary.lost} lost &middot; <b>${summary.conversionRate}%</b> conversion with ${esc(state.run.voice.name)}</span>` +
    `<button class="btn-ghost" id="bnTry" type="button">Try another voice</button>`);
  document.getElementById('bnTry').onclick = changeVoice;
}

function changeVoice(){
  closeStream();
  document.getElementById('mBanner').hidden = true;
  goTo('screen-orbs');
  renderOrbCarousel(false);
}

document.getElementById('btnChangeVoice').addEventListener('click', changeVoice);
document.getElementById('btnRerun').addEventListener('click', () => { selectedLeadId = null; startRun(); });
