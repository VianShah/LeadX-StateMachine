// The Fulfilment tab: where in-app journeys usually break, and the fix built into
// this one. Slide copy comes from the server (GET /api/runs/:id/pipeline); the
// numbers are computed live from the same transition stream the Execution tab
// uses — each round the engine emits carries a `friction` marker when a step hit
// friction and whether the built-in fix recovered it.
const STEP_STATE = { open_link: 'inapp_handoff', kyc: 'kyc_check', mandate: 'mandate_setup' };
let fulIdx = 0;
let fulSlides = [];

function resetFulfilment(data){
  fulSlides = data.fulfilment.slides;
  fulIdx = 0;
  fulGraph = null;
  document.getElementById('fSlides').innerHTML = '';
  document.getElementById('fGraph').querySelectorAll('.m-node').forEach(n => n.remove());
  document.getElementById('fEdges').innerHTML = '';
}

function onFulfilmentShown(){
  fulGraph = new StateGraph({
    graphEl: document.getElementById('fGraph'), svgEl: document.getElementById('fEdges'), nbaEl: document.getElementById('fNba'),
    layout: LAYOUT_FUL,
  });
  fulGraph.build(machineDef);
  refreshGraphs();
  renderFulSlide();
  const s = state.run && state.run.status;
  document.getElementById('fStatus').textContent = !launched ? 'Launch the campaign to fill this in' : (s === 'complete' ? 'Complete' : 'Live');
  document.getElementById('fStatus').classList.toggle('live', launched && s !== 'complete');
}

function fulStats(step){
  const leads = Object.values(leadsById);
  if(step === 'intent_call'){
    const sent = leads.filter(l => l.rounds.some(r => r.to === 'inapp_handoff')).length;
    return [
      ['Leads', leads.length], ['Link sent', sent, 'good'],
      ['Mass-SMS baseline', leads.length], ['Held back', launched ? leads.length - sent : 0],
    ];
  }
  const from = STEP_STATE[step];
  let entered = 0, hit = 0, recovered = 0, dropped = 0;
  for(const l of leads) for(const r of l.rounds){
    if(r.from !== from) continue;
    entered++;
    if(r.friction){ hit++; if(r.friction.outcome === 'recovered') recovered++; else dropped++; }
  }
  return [['Reached this step', entered], ['Clean pass', entered - hit], ['Friction recovered', recovered, 'good'], ['Dropped off', dropped, 'bad']];
}

function updateFulfilmentStats(){
  const el = document.getElementById('fStats');
  if(!el || !fulSlides.length) return;
  el.innerHTML = fulStats(fulSlides[fulIdx].step).map(([k, v, cls]) =>
    '<div class="f-stat ' + (cls || '') + '"><div class="v">' + (launched ? escHtml(v) : '—') + '</div><div class="k">' + escHtml(k) + '</div></div>').join('');
}

function renderFulSlide(){
  const s = fulSlides[fulIdx];
  const box = document.getElementById('fSlides');
  box.innerHTML =
    '<div class="slide-eyebrow">' + escHtml(s.eyebrow) + '</div>' +
    '<h3>' + escHtml(s.title) + '</h3>' +
    '<div class="slide-body">' + escHtml(s.body) + '</div>' +
    '<div class="slide-fix"><span class="tag">Fix</span><span class="txt">' + escHtml(s.fix) + '</span></div>' +
    '<div class="f-stats" id="fStats"></div>' +
    '<div class="slide-nav"><button class="btn-ghost" id="fPrev" type="button">← Previous</button>' +
    '<div class="slide-dots">' + fulSlides.map((_, i) => '<button type="button" class="slide-dot' + (i === fulIdx ? ' active' : '') + '" data-i="' + i + '" aria-label="Slide ' + (i + 1) + '"></button>').join('') + '</div>' +
    '<button class="btn-ghost" id="fNext" type="button">Next →</button></div>';
  document.getElementById('fPrev').onclick = () => { fulIdx = (fulIdx - 1 + fulSlides.length) % fulSlides.length; renderFulSlide(); };
  document.getElementById('fNext').onclick = () => { fulIdx = (fulIdx + 1) % fulSlides.length; renderFulSlide(); };
  box.querySelectorAll('.slide-dot').forEach(d => d.onclick = () => { fulIdx = parseInt(d.dataset.i, 10); renderFulSlide(); });
  updateFulfilmentStats();
  // Tie the slide to the graph: light up the node this slide is about.
  if(fulGraph) Object.entries(fulGraph.nodeEls).forEach(([key, el]) => el.classList.toggle('focus', key === STEP_STATE[s.step]));
}
