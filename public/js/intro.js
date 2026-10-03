// Cinematic intro — adapted from the Kollect booth demo's soft-launch screen
// (same beat/orb/chip mechanics, new LeadX story, no voiceover for now).
// Only enterIntro() is called from outside (capture.js).
let introTimers = [];

function renderWaveformConstant(){
  const el = document.getElementById('ibWaveformConstant');
  if(!el || el.dataset.built) return; // build once, colors/toggles from then on
  el.dataset.built = '1';
  const heights = [13, 25, 19, 33, 23, 16, 27, 12, 8, 6, 5, 4, 3, 3];
  el.innerHTML = heights.map((h, i) => {
    const opacity = Math.max(.32, 1 - i * 0.045).toFixed(2);
    return `<div class="ib-wave-bar" style="height:${h}px; opacity:${opacity}; animation-delay:${(i*0.07).toFixed(2)}s"></div>`;
  }).join('');
}

/* Word-level mask reveal (Kinetic exploration) — each word gets its own
   overflow-hidden mask + staggered transition-delay, so a headline cascades
   into place word by word instead of fading in as one flat block. */
function wordSpans(text){
  return text.split(' ').map((w, i) => `<span class="ib-word-mask"><span class="ib-word" style="transition-delay:${i*40}ms">${w}</span></span>`).join(' ');
}

/* Cluster of glass agent-orbs — each assigned a different behavior, so it reads as many
   distinct processes running at once, not one animation repeated. Positioned as a halo
   around the center text (top/bottom/sides), using the whole screen instead of one huddle. */
const AGENT_ORB_LAYOUT = [
  // top band, above the headline
  {x:12, y:8,  s:32}, {x:30, y:4,  s:26}, {x:50, y:9,  s:36}, {x:70, y:5,  s:28}, {x:88, y:9,  s:24},
  // side bands, level with the text but off to the edges
  {x:4,  y:32, s:40}, {x:6,  y:52, s:34}, {x:94, y:30, s:38}, {x:93, y:54, s:44},
  // bottom band, below the badge
  {x:14, y:74, s:42}, {x:33, y:88, s:30}, {x:52, y:78, s:46}, {x:70, y:90, s:32}, {x:87, y:76, s:38},
];
const AGENT_ORB_TYPES = ['type-pulse','type-spin','type-blink','type-orbit'];
function renderAgentBackground(){
  const el = document.getElementById('ibAgentsBg');
  if(!el || el.dataset.built) return; // build once, reused across the sequence
  el.dataset.built = '1';
  const cluster = document.createElement('div');
  cluster.className = 'ib-agent-cluster';
  cluster.id = 'ibAgentCluster';
  cluster.innerHTML = AGENT_ORB_LAYOUT.map((o, i) => {
    const delay = (i * 0.35).toFixed(2);
    const glowDelay = (i * 0.25).toFixed(2);
    const type = AGENT_ORB_TYPES[i % AGENT_ORB_TYPES.length];
    const orbitR = (o.s / 2 + 4).toFixed(0);
    return `<div class="ib-agent-orb ${type}" style="left:${o.x}%; top:${o.y}%; width:${o.s}px; height:${o.s}px; animation-delay:${delay}s, ${glowDelay}s; --orbit-r:${orbitR}px;"></div>`;
  }).join('');
  el.appendChild(cluster);

  // 3D touch — the whole halo tilts toward the pointer, like the voice-orb carousel
  document.addEventListener('pointermove', (e) => {
    const screenEl = document.getElementById('screen-intro');
    if(!screenEl || !screenEl.classList.contains('active')) return;
    const rect = screenEl.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    cluster.style.transform = `rotateY(${(px * 10).toFixed(1)}deg) rotateX(${(-py * 7).toFixed(1)}deg)`;
  });
}

const JOURNEY_R = 66, JOURNEY_C = 2 * Math.PI * JOURNEY_R;

/* One re-strategize loop icon, shared by every "loop" chip — a plain
   refresh glyph, colored via the chip's own --ch through normal CSS
   custom-property inheritance rather than an inline fill. */
const LOOP_ICON = `<svg class="ib-chip-loop-icon" viewBox="0 0 24 24"><path d="M12 4V1L8 5l4 4V6a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z"/></svg>`;

/* Fills #ibJourneyChips for the current beat — cleared and rebuilt each
   stage change (agents don't persist across stages, they spawn fresh per
   stage) with a small spread + stagger so they read as several agents
   arriving together, not one after another in a queue. */
function renderChips(b){
  const chipsEl = document.getElementById('ibJourneyChips');
  chipsEl.innerHTML = '';
  if(!b.agents) return;
  const total = b.agents.length + (b.loop ? 1 : 0);
  const spreads = { 1:[0], 2:[-45,45], 3:[-70,0,70], 4:[-90,-30,30,90] };
  const dx = spreads[total] || spreads[3];
  const makeChip = (label, idx, isLoop) => {
    const chip = document.createElement('div');
    chip.className = 'ib-chip' + (isLoop ? ' loop' : '');
    chip.style.setProperty('--ch', b.ch || 'var(--blue)');
    chip.style.setProperty('--dx', dx[idx] + 'px');
    chip.style.transitionDelay = (idx * 90) + 'ms';
    chip.innerHTML = isLoop ? `${LOOP_ICON}${label}` : `<span class="ib-chip-dot"></span>${label}`;
    chipsEl.appendChild(chip);
  };
  b.agents.forEach((name, idx) => makeChip(name, idx, false));
  if(b.loop) makeChip('Re-strategizing', b.agents.length, true);
  // Same synchronous-reflow reveal as the headline (see showBeat below) —
  // no rAF, so this can't silently stall if the tab isn't actively rendering.
  void chipsEl.offsetWidth;
  [...chipsEl.children].forEach(c => c.classList.add('show'));
}


function enterIntro(){
  goTo('screen-intro');
  runIntro();
}

function leaveIntro(){
  introTimers.forEach(t => clearTimeout(t));
  introTimers = [];
  goTo('screen-orbs');
  renderOrbCarousel();
}

function runIntro(){
  const firstName = (state.name || '').split(' ')[0] || 'there';
  const stage = document.getElementById('ibStage');
  const content = document.querySelector('#screen-intro .sl-content');
  const journey = document.getElementById('ibJourney');
  const journeyProgress = document.getElementById('ibJourneyProgress');
  const journeySphere = document.getElementById('ibJourneySphere');
  const agentsBg = document.getElementById('ibAgentsBg');
  const waveEl = document.getElementById('ibWaveformConstant');
  journey.classList.remove('show');
  journeyProgress.style.strokeDasharray = JOURNEY_C;
  journeyProgress.style.strokeDashoffset = JOURNEY_C;
  journeyProgress.style.stroke = 'var(--blue)';
  stage.innerHTML = '';
  agentsBg.classList.remove('show');
  waveEl.classList.remove('wave-blue', 'wave-hidden');
  renderAgentBackground();
  renderWaveformConstant();

  // The four stages mirror the LeadX pipeline: Data Intelligence → Strategy
  // → Execution (the state machine) → Fulfilment.
  const beats = [
    { text:'Most leads never become revenue.',
      sub:'Wrong customer. Wrong pitch. Wrong moment.', dur:4600 },
    { text:'LeadX is a platform of specialized agents, working in perfect harmony.',
      sub:'Proactive. Personalized. Outcome-based by design.', dur:4800, revealAgents:true },
    { text:'It starts with Data Intelligence: every signal, pulled in at once.',
      sub:'Account Aggregator · CIBIL · CRM · Transactions',
      ch:'var(--blue)', agents:['Data Fetch Agent','Enrichment Agent','Propensity Agent'], dur:5000, hideWave:true },
    { text:'Then Strategy builds a pitch that actually sounds personal.',
      sub:'Product · Language · Tone · Timing',
      ch:'var(--purple)', agents:['Pitch Agent','Persona Batching','Eligibility Agent'], dur:5000 },
    { text:"Execution isn't one call. Every outcome decides the next best action.",
      sub:'Voice · WhatsApp · SMS · In-app — re-strategized after every touchpoint',
      ch:'var(--amber)', agents:['Voice Agent','Intent Matching','NBA State Machine'], loop:true, dur:6200 },
    { text:'Until Fulfilment: from interest to revenue, without drop-offs.',
      sub:'In-app closing · Friction handled · Audited',
      ch:'var(--green)', agents:['LeadX+ In-app Agent','Reconciliation Agent','Audit Agent'], dur:5000 },
    { text:'This is LeadX.', sub:`Welcome, ${firstName}. Let's pick the voice of your agent.`, dur:4600 },
  ];
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  introTimers.forEach(t => clearTimeout(t));
  introTimers = [];

  function showBeat(i){
    const b = beats[i];
    const isLast = i === beats.length - 1;
    if(b.revealAgents){ agentsBg.classList.add('show'); waveEl.classList.add('wave-blue'); }
    if(b.hideWave) waveEl.classList.add('wave-hidden');
    const dir = reduceMotion ? '' : (i % 2 === 0 ? 'from-left' : 'from-right');
    stage.innerHTML = `
      <div class="ib-beat ${dir}" id="ibBeat">
        <div class="ib-headline${isLast ? ' ib-headline-climax' : ''}">${wordSpans(b.text)}</div>
        ${b.sub ? `<div class="ib-sub">${b.sub}</div>` : ''}
      </div>`;
    // Synchronous reflow (not rAF) so the transition always plays even if
    // the tab is backgrounded at the wrong instant.
    const beatEl = document.getElementById('ibBeat');
    if(beatEl){ void beatEl.offsetWidth; beatEl.classList.add('show'); }
    journeyProgress.style.strokeDashoffset = JOURNEY_C - (JOURNEY_C * (i + 1)) / beats.length;
    journeyProgress.style.stroke = b.ch || 'var(--blue)';
    journeySphere.classList.remove('pulse');
    void journeySphere.offsetWidth;
    journeySphere.classList.add('pulse');
    renderChips(b);
  }

  let beatIndex = 0;
  function scheduleNext(delay){
    introTimers.push(setTimeout(() => {
      beatIndex++;
      if(beatIndex < beats.length){ showBeat(beatIndex); scheduleNext(beats[beatIndex].dur); }
      else { introTimers.push(setTimeout(leaveIntro, 300)); }
    }, delay));
  }

  setTimeout(() => journey.classList.add('show'), 150);
  showBeat(0);
  scheduleNext(600 + beats[0].dur);

  // Tap anywhere to advance a beat early. .onclick (not addEventListener) so
  // a replayed intro overwrites the handler instead of stacking.
  content.onclick = () => {
    if(beatIndex >= beats.length - 1) return;
    introTimers.forEach(t => clearTimeout(t));
    introTimers = [];
    beatIndex++;
    showBeat(beatIndex);
    scheduleNext(beats[beatIndex].dur);
  };
}

document.getElementById('btnSkipIntro').addEventListener('click', (e) => {
  e.stopPropagation();
  leaveIntro();
});
