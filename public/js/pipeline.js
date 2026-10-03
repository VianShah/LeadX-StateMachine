// The pipeline screen: four stages (Data Intelligence -> Strategy -> Execution
// -> Fulfilment) with sub-steps. Everything shown is read from the server —
// POST /api/runs creates a run (leads + chosen voice), GET /api/runs/:id/pipeline
// returns what each step displays. Steps unlock one at a time; you can always go
// back to any step you've reached.
const TABS = [
  { label: 'Data Intelligence', sub: 'Fetch → score → band' },
  { label: 'Strategy Building', sub: 'Pitch → batch' },
  { label: 'Execution', sub: 'Intent matching' },
  { label: 'Fulfilment', sub: 'Friction, addressed' },
];
const STEPS = [
  { k: 'fetch',       tab: 0, label: 'Fetching',          sub: 'From bank systems' },
  { k: 'process',     tab: 0, label: 'Processing',        sub: 'Clean + enrich' },
  { k: 'intent',      tab: 0, label: 'Cross-sell opportunities', sub: 'Propensity model' },
  { k: 'eligibility', tab: 0, label: 'Eligibility',       sub: 'Buckets' },
  { k: 'pitch',       tab: 1, label: 'Pitch',             sub: 'Behaviour-based' },
  { k: 'batching',    tab: 1, label: 'Batching',          sub: 'By persona' },
  { k: 'execution',   tab: 2, label: 'Run & measure',     sub: 'Launch + state machine' },
  { k: 'fulfilment',  tab: 3, label: 'Fulfilment',        sub: 'Friction, addressed' },
];
const STEP_EXECUTION = 6, STEP_FULFILMENT = 7;

const pipe = { step: 0, max: 0, data: null, done: {}, timers: [], pitchIdx: 0 };
let machineDef = null;

const fmtAmount = (n) => n >= 100000 ? '₹' + (n / 100000).toFixed(n % 100000 === 0 ? 0 : 1) + ' L' : '₹' + n.toLocaleString('en-IN');

async function startPipeline(){
  clearPipeTimers();
  goTo('screen-pipeline');
  const panel = document.getElementById('panel-steps');
  showPanel('steps');
  document.getElementById('pTabs').innerHTML = '';
  document.getElementById('pStepper').hidden = true;
  panel.innerHTML = '<div class="p-loading">Preparing your campaign…</div>';
  try {
    if(!machineDef){
      const res = await fetch('/api/machine');
      if(!res.ok) throw new Error('machine ' + res.status);
      machineDef = await res.json();
    }
    const created = await fetch('/api/runs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: state.name, voiceId: state.voice.id }),
    });
    if(!created.ok) throw new Error('runs ' + created.status);
    const run = await created.json();
    const pres = await fetch('/api/runs/' + run.id + '/pipeline');
    if(!pres.ok) throw new Error('pipeline ' + pres.status);
    pipe.data = await pres.json();
    pipe.step = 0; pipe.max = 0; pipe.done = {}; pipe.pitchIdx = 0;
    prepareRun(run, machineDef, pipe.data); // machine.js
    document.getElementById('mAgent').innerHTML =
      'Agent <strong>' + escHtml(run.voice.name) + '</strong> &middot; ' + escHtml(run.voice.lang) + ' &middot; ' + run.leads.length + ' leads';
    renderPipeline();
  } catch(e) {
    panel.innerHTML = '<div class="p-loading">Couldn&#8217;t prepare the campaign. <button class="btn-ghost" id="pRetry" type="button">Retry</button></div>';
    document.getElementById('pRetry').onclick = startPipeline;
  }
}

function clearPipeTimers(){ pipe.timers.forEach(clearTimeout); pipe.timers = []; }
function later(fn, ms){ pipe.timers.push(setTimeout(fn, ms)); }

function showPanel(which){
  document.getElementById('panel-steps').hidden = which !== 'steps';
  document.getElementById('panel-execution').hidden = which !== 'execution';
  document.getElementById('panel-fulfilment').hidden = which !== 'fulfilment';
}

function goStep(i){
  if(i < 0 || i >= STEPS.length || i > pipe.max) return;
  pipe.step = i;
  renderPipeline();
}
function nextStep(){
  pipe.max = Math.max(pipe.max, pipe.step + 1);
  goStep(pipe.step + 1);
}
function unlockStep(i){
  if(i > pipe.max){ pipe.max = i; renderTabsAndStepper(); }
}

function renderTabsAndStepper(){
  const cur = STEPS[pipe.step];
  document.getElementById('pTabs').innerHTML = TABS.map((t, ti) => {
    const first = STEPS.findIndex(s => s.tab === ti);
    const locked = first > pipe.max;
    return '<button type="button" class="p-tab' + (ti === cur.tab ? ' active' : '') + (locked ? ' locked' : '') + '" data-first="' + first + '"' + (locked ? ' disabled' : '') + '>' +
      '<span class="pt-num">0' + (ti + 1) + '</span><span class="pt-label">' + t.label + '</span><span class="pt-sub">' + t.sub + '</span></button>';
  }).join('');
  document.querySelectorAll('.p-tab').forEach(b => b.addEventListener('click', () => {
    // Land on the furthest step reached inside that tab.
    const ti = [...b.parentNode.children].indexOf(b);
    const inTab = STEPS.map((s, i) => ({ s, i })).filter(x => x.s.tab === ti && x.i <= pipe.max);
    goStep(inTab.length ? inTab[inTab.length - 1].i : parseInt(b.dataset.first, 10));
  }));

  const sibs = STEPS.map((s, i) => ({ s, i })).filter(x => x.s.tab === cur.tab);
  const stepper = document.getElementById('pStepper');
  stepper.hidden = sibs.length < 2;
  stepper.innerHTML = sibs.map(({ s, i }, n) => {
    const locked = i > pipe.max;
    return '<button type="button" class="p-step' + (i === pipe.step ? ' active' : '') + (i < pipe.step ? ' done' : '') + (locked ? ' locked' : '') + '" data-i="' + i + '"' + (locked ? ' disabled' : '') + '>' +
      '<span class="ps-n">' + (n + 1) + '</span><span class="ps-t">' + s.label + '</span></button>';
  }).join('');
  stepper.querySelectorAll('.p-step').forEach(b => b.addEventListener('click', () => goStep(parseInt(b.dataset.i, 10))));
}

function renderPipeline(){
  clearPipeTimers();
  renderTabsAndStepper();
  const k = STEPS[pipe.step].k;
  if(k === 'execution'){ showPanel('execution'); onExecutionShown(); return; }   // machine.js
  if(k === 'fulfilment'){ showPanel('fulfilment'); onFulfilmentShown(); return; } // fulfilment.js
  showPanel('steps');
  const panel = document.getElementById('panel-steps');
  ({ fetch: renderFetch, process: renderProcess, intent: renderIntent, eligibility: renderEligibility, pitch: renderPitch, batching: renderBatching })[k](panel);
}

const navBar = (label, id) => '<div class="nav-btns"><span></span><button class="btn-next" id="' + id + '" type="button">' + label + '</button></div>';

function checklist(items, idPrefix){
  return items.map((t, i) => '<div class="chk-item" id="' + idPrefix + i + '"><div class="chk-box"></div><div>' + escHtml(t) + '</div></div>').join('');
}
function tick(id){
  const el = document.getElementById(id);
  if(!el) return;
  el.classList.add('done');
  el.querySelector('.chk-box').textContent = '✓';
}

/* ---------- Data Intelligence ---------- */
function renderFetch(panel){
  const f = pipe.data.fetch;
  panel.innerHTML =
    '<h2>Fetching customer data</h2>' +
    '<div class="desc">LeadX connects directly to the bank&#8217;s own systems &mdash; this isn&#8217;t a manual export step in production. This run pulls from three connected sources.</div>' +
    '<div class="fetch-grid">' + f.sources.map(s =>
      '<div class="fetch-card ' + s.key + '"><div class="fetch-title">' + escHtml(s.title) + '</div>' +
      '<div class="fetch-status" id="status-' + s.key + '">Connecting…</div>' +
      '<div class="fetch-records">' + s.records + ' records</div>' +
      '<div class="checklist">' + checklist(s.items, 'fi-' + s.key + '-') + '</div></div>').join('') + '</div>' +
    '<div class="footnote">' + escHtml(f.note) + '</div>' +
    '<div id="fetchNav"></div>';
  const finish = () => {
    f.sources.forEach(s => { const el = document.getElementById('status-' + s.key); if(el){ el.textContent = 'Synced ✓'; el.classList.add('ok'); } });
    document.getElementById('fetchNav').innerHTML = navBar('Continue to processing →', 'btnFetchNext');
    document.getElementById('btnFetchNext').onclick = nextStep;
  };
  if(pipe.done.fetch){
    f.sources.forEach(s => s.items.forEach((_, i) => tick('fi-' + s.key + '-' + i)));
    finish(); return;
  }
  let total = f.sources.reduce((n, s) => n + s.items.length, 0), done = 0;
  f.sources.forEach((s, ci) => {
    later(() => { const el = document.getElementById('status-' + s.key); if(el) el.textContent = 'Fetching…'; }, ci * 200);
    s.items.forEach((_, i) => later(() => {
      tick('fi-' + s.key + '-' + i);
      if(++done === total){ pipe.done.fetch = true; finish(); }
    }, ci * 260 + (i + 1) * 420));
  });
}

function renderProcess(panel){
  const tasks = pipe.data.process.tasks;
  panel.innerHTML =
    '<h2>Processing &amp; enrichment</h2>' +
    '<div class="desc">Matching the records to CRM, Account Aggregator and CIBIL, then normalizing them into a single scoring frame.</div>' +
    '<div class="checklist wide">' + checklist(tasks, 'task-') + '</div><div id="procNav"></div>';
  const finish = () => {
    document.getElementById('procNav').innerHTML = navBar('Next: Cross-sell opportunities →', 'btnProcNext');
    document.getElementById('btnProcNext').onclick = nextStep;
  };
  if(pipe.done.process){ tasks.forEach((_, i) => tick('task-' + i)); finish(); return; }
  tasks.forEach((_, i) => later(() => {
    tick('task-' + i);
    if(i === tasks.length - 1){
      pipe.done.process = true;
      finish();
      later(() => { if(STEPS[pipe.step].k === 'process') nextStep(); }, 600); // auto-advance, as in the original demo
    }
  }, (i + 1) * 550));
}

function renderIntent(panel){
  const o = pipe.data.opportunities;
  panel.innerHTML =
    '<h2>Cross-selling opportunity identification</h2>' +
    '<div class="desc">' + o.rows.length + ' opportunities identified this run &mdash; each row shows the signal, the need it points to, why, and the bank&#8217;s indicative eligibility band.</div>' +
    '<div class="model-box"><div class="model-box-label">How the propensity model extracts opportunities</div><div class="model-steps">' +
      o.model.map(m => '<div class="model-step"><b>' + escHtml(m.title) + '</b><span>' + escHtml(m.body) + '</span></div>').join('') + '</div></div>' +
    '<div class="table-scroll tall"><table><thead><tr><th>Customer</th><th>Signal detected</th><th>Need identified</th><th>Why this need</th><th>Eligibility</th><th>Score</th></tr></thead><tbody>' +
      o.rows.map(r => '<tr><td class="mono">' + escHtml(r.id) + ' · ' + escHtml(r.name) + '</td><td class="dim">' + escHtml(r.signal) + '</td>' +
        '<td>' + escHtml(r.need) + (r.spendCategory ? ' · ' + escHtml(r.spendCategory) : '') + '</td>' +
        '<td class="why">' + escHtml(r.why) + '</td><td class="mono gold">' + escHtml(r.eligibleDisplay) + '</td><td class="mono dim">' + r.score + '</td></tr>').join('') +
    '</tbody></table></div>' +
    '<div class="footnote">' + escHtml(o.footnote) + '</div>' + navBar('Next: Eligibility buckets →', 'btnIntentNext');
  document.getElementById('btnIntentNext').onclick = nextStep;
}

function renderEligibility(panel){
  const b = pipe.data.eligibility.buckets;
  const tierColor = { high: 'var(--amber)', med: 'var(--green)', low: 'var(--purple)' };
  panel.innerHTML =
    '<h2>Eligibility buckets</h2>' +
    '<div class="desc">Same product, different ceilings &mdash; the band comes from the bank&#8217;s own pre-approval / policy engine, not from LeadX. LeadX reads the difference to prioritize and personalize.</div>' +
    '<div class="buckets">' + b.map(col =>
      '<div class="bucket-col"><h3>' + escHtml(col.need) + ' (' + col.rows.length + ')</h3>' +
      '<div class="bucket-range">' + (col.batchRange ? 'Range this batch: ' + fmtAmount(col.batchRange[0]) + ' – ' + fmtAmount(col.batchRange[1]) : 'Product range: ' + fmtAmount(col.productRange[0]) + ' – ' + fmtAmount(col.productRange[1])) + '</div>' +
      '<div class="bucket-list">' + (col.rows.map(r => '<div class="bucket-card"><div class="nm">' + escHtml(r.name) + '</div><div class="nd" style="color:' + tierColor[r.tier] + '">' + escHtml(r.eligibleDisplay) + '</div></div>').join('') || '<div class="bucket-card nd">None in this batch</div>') + '</div></div>').join('') + '</div>' +
    navBar('Next: Personalized pitch →', 'btnEligNext');
  document.getElementById('btnEligNext').onclick = nextStep;
}

/* ---------- Strategy ---------- */
function renderPitch(panel){
  const rows = pipe.data.pitch.rows;
  panel.innerHTML =
    '<h2>Personalized pitch</h2>' +
    '<div class="desc">Built from behaviour and past buying pattern &mdash; language, timing, platform, tone, emotion, and (for cards) the specific card variant, per customer.</div>' +
    '<div class="pitch-grid"><div class="table-scroll tall"><table><thead><tr><th>Customer</th><th>Need</th><th>Eligibility</th></tr></thead><tbody id="pitchRows"></tbody></table></div><div id="pitchDetail"></div></div>' +
    navBar('Next: Persona batching →', 'btnPitchNext');
  document.getElementById('btnPitchNext').onclick = nextStep;
  const rowsEl = document.getElementById('pitchRows');
  const row = (k, v) => '<div class="pitch-row"><span class="k">' + k + '</span><span class="v">' + v + '</span></div>';
  function draw(){
    rowsEl.innerHTML = rows.map((r, i) => '<tr class="clickable' + (i === pipe.pitchIdx ? ' selected' : '') + '" data-i="' + i + '"><td class="mono">' + escHtml(r.name) + '</td><td>' + escHtml(r.need) + '</td><td class="mono gold">' + escHtml(r.eligibleDisplay) + '</td></tr>').join('');
    rowsEl.querySelectorAll('tr').forEach(tr => tr.addEventListener('click', () => { pipe.pitchIdx = parseInt(tr.dataset.i, 10); draw(); }));
    const r = rows[pipe.pitchIdx];
    document.getElementById('pitchDetail').innerHTML =
      row('Customer', escHtml(r.name)) +
      row('Indicative eligibility', '<span class="gold">' + escHtml(r.eligibleDisplay) + '</span> (' + escHtml(r.eligibleLabel) + ')') +
      (r.cardType ? row('Card variant', '<span class="rose">' + escHtml(r.cardType) + '</span>') + row('Why this variant', escHtml(r.cardReason)) : '') +
      row('Language', escHtml(r.language)) + row('Best day / time', escHtml(r.bestTime)) + row('Platform', escHtml(r.platform)) + row('Tone', escHtml(r.tone)) +
      row('Emotion to evoke', r.emotions.map(e => '<span class="chip">' + escHtml(e) + '</span>').join('')) +
      '<div class="pitch-note">' + escHtml(r.note) + '</div>' +
      '<div class="past-pattern"><b>Past buying pattern:</b> ' + escHtml(r.existing) + '</div>';
  }
  draw();
}

function renderBatching(panel){
  const b = pipe.data.batching;
  const voice = state.run ? state.run.voice : state.voice;
  panel.innerHTML =
    '<h2>Persona batching</h2>' +
    '<div class="desc">Leads grouped by language + product need, so each batch gets one consistent script and send window. <b>' + escHtml(voice.name) + '</b> speaks the language of <b>' + b.matchedLeads + ' of ' + b.totalLeads + '</b> leads.</div>' +
    '<div class="board">' + b.batches.map(p =>
      '<div class="persona' + (p.voiceMatch ? ' match' : '') + '"><div class="lang">' + escHtml(p.language) + '</div><div class="name">' + escHtml(p.need) + '</div>' +
      '<div class="count">' + p.count + '<small>' + (p.count === 1 ? 'lead' : 'leads') + '</small></div>' +
      '<div class="status">' + (p.voiceMatch ? escHtml(voice.name) + ' speaks this ✓' : 'Different language — lower intent expected') + '</div></div>').join('') + '</div>' +
    navBar('Next: Launch the campaign →', 'btnBatchNext');
  document.getElementById('btnBatchNext').onclick = nextStep;
}

document.getElementById('btnChangeVoice').addEventListener('click', () => {
  if(typeof teardownRun === 'function') teardownRun();
  clearPipeTimers();
  goTo('screen-orbs');
  renderOrbCarousel(false);
});
document.getElementById('btnRerun').addEventListener('click', () => { teardownRun(); startPipeline(); });
