// Region-wise voices from the agent library (GET /api/agent-library — the Sales
// agents of the Kollect agent catalog). Batch and campaign cards show the top
// picks for their language/region; the modal browses the whole library.
let libraryCache = null;       // the /api/agent-library listing, fetched once
const libraryAgentsById = {};  // every agent we've rendered, for the profile view

const initials = (name) => (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
const statusDot = (s) => '<span class="lib-dot ' + escHtml(String(s).toLowerCase()) + '" title="' + escHtml(s) + '"></span>';

function remember(agents){ agents.forEach(a => { libraryAgentsById[a.id] = a; }); }

/** The "From the agent library" block on a batch card. `lib` comes from the server per batch. */
function libraryBlock(lib){
  if(!lib) return '';
  remember(lib.agents);
  const more = lib.available - lib.agents.length;
  return '<div class="lib-block">' +
    '<div class="lib-head"><span>Agent library' + (lib.region ? ' · ' + escHtml(lib.region) : '') + '</span>' +
      (lib.available ? '<button type="button" class="lib-more" data-lang="' + escHtml(lib.language) + '">' + lib.available + ' voices' + (more > 0 ? ' →' : '') + '</button>' : '') + '</div>' +
    (lib.agents.length
      ? '<div class="lib-chips">' + lib.agents.map(a =>
          '<button type="button" class="lib-chip" data-agent="' + escHtml(a.id) + '" title="' + escHtml(a.reasons.join(' · ')) + '">' +
          '<span class="lib-av">' + escHtml(initials(a.name)) + '</span><span class="lib-nm">' + escHtml(a.name) + '</span>' + statusDot(a.status) + '</button>').join('') + '</div>'
      : '') +
    (lib.note ? '<div class="lib-note">' + escHtml(lib.note) + '</div>' : '') +
  '</div>';
}

// Delegated: chips and "N voices" links work wherever a library block is rendered.
document.addEventListener('click', (e) => {
  const chip = e.target.closest('.lib-chip');
  if(chip){ openLibrary({ agentId: chip.dataset.agent }); return; }
  const more = e.target.closest('.lib-more, [data-open-library]');
  if(more){ openLibrary({ language: more.dataset.lang || '' }); }
});

/* ---------- modal ---------- */
const libState = { language: '', service: '', agentId: null, opener: null };

async function openLibrary({ language = '', agentId = null } = {}){
  libState.language = language; libState.agentId = agentId; libState.opener = document.activeElement;
  const modal = document.getElementById('libModal');
  modal.hidden = false;
  document.getElementById('libBody').innerHTML = '<div class="p-loading">Loading the agent library…</div>';
  try {
    if(!libraryCache){
      const res = await fetch('/api/agent-library');
      if(!res.ok) throw new Error('library ' + res.status);
      libraryCache = await res.json();
      remember(libraryCache.agents);
    }
    renderLibrary();
    document.getElementById('libClose').focus();
  } catch(e) {
    document.getElementById('libBody').innerHTML = '<div class="p-loading">Couldn&#8217;t load the agent library.</div>';
  }
}

function closeLibrary(){
  document.getElementById('libModal').hidden = true;
  if(libState.opener && libState.opener.focus) libState.opener.focus();
}

function renderLibrary(){
  if(libState.agentId && libraryAgentsById[libState.agentId]) return renderAgentProfile(libraryAgentsById[libState.agentId]);
  const L = libraryCache;
  const agents = L.agents.filter(a =>
    (!libState.language || a.languages.includes(libState.language === 'English' ? 'Hinglish' : libState.language)) &&
    (!libState.service || a.service === libState.service));
  const pill = (val, label, cur, attr) => '<button type="button" class="lib-filter' + (val === cur ? ' on' : '') + '" ' + attr + '="' + escHtml(val) + '">' + label + '</button>';
  document.getElementById('libTitle').textContent = 'Agent library — voices by region';
  document.getElementById('libBody').innerHTML =
    '<div class="lib-filters">' + pill('', 'All languages', libState.language, 'data-flang') +
      L.regions.map(r => pill(r.language, escHtml(r.language) + (r.region ? ' <span class="dim">· ' + escHtml(r.region) + '</span>' : '') + ' <span class="dim">' + r.count + '</span>', libState.language, 'data-flang')).join('') + '</div>' +
    '<div class="lib-filters">' + pill('', 'All services', libState.service, 'data-fsvc') + L.services.map(s => pill(s, escHtml(s), libState.service, 'data-fsvc')).join('') + '</div>' +
    '<div class="lib-count">' + agents.length + ' voices <span class="lib-legend">' + statusDot('Live') + ' Live ' + statusDot('Demo') + ' Demo ' + statusDot('Dev') + ' In development</span></div>' +
    '<div class="lib-grid">' + agents.map(a =>
      '<button type="button" class="lib-card" data-profile="' + escHtml(a.id) + '">' +
        '<div class="lib-card-top"><span class="lib-av lg">' + escHtml(initials(a.name)) + '</span><div><div class="lib-card-nm">' + escHtml(a.name) + ' ' + statusDot(a.status) + '</div>' +
        '<div class="dim sm">' + escHtml(a.service) + ' · ' + escHtml(a.personaTone) + ' · ' + escHtml(a.gender) + '</div></div></div>' +
        '<div class="lib-langs">' + a.languages.map(l => '<span class="chip">' + escHtml(l) + '</span>').join('') + '</div>' +
        (a.bestRegion ? '<div class="lib-region">Best in ' + escHtml(a.bestRegion) + '</div>' : '') +
      '</button>').join('') + '</div>';
  const body = document.getElementById('libBody');
  body.querySelectorAll('[data-flang]').forEach(b => b.onclick = () => { libState.language = b.dataset.flang; renderLibrary(); });
  body.querySelectorAll('[data-fsvc]').forEach(b => b.onclick = () => { libState.service = b.dataset.fsvc; renderLibrary(); });
  body.querySelectorAll('[data-profile]').forEach(b => b.onclick = () => { libState.agentId = b.dataset.profile; renderLibrary(); });
}

function renderAgentProfile(a){
  const p = a.performance || {};
  const row = (k, v) => '<div class="pitch-row"><span class="k">' + k + '</span><span class="v">' + v + '</span></div>';
  const dash = '<span class="dim">—</span>';
  document.getElementById('libTitle').textContent = a.name;
  document.getElementById('libBody').innerHTML =
    '<button type="button" class="btn-ghost" id="libBack">← All voices</button>' +
    '<div class="lib-profile">' +
      '<div class="lib-card-top"><span class="lib-av xl">' + escHtml(initials(a.name)) + '</span><div><div class="lib-card-nm big">' + escHtml(a.name) + ' ' + statusDot(a.status) + ' <span class="dim sm">' + escHtml(a.status) + '</span></div>' +
        '<div class="dim">' + escHtml(a.service) + ' · ' + escHtml(a.objective) + '</div></div></div>' +
      '<p class="lib-desc">' + escHtml(a.description) + '</p>' +
      (a.reasons ? '<div class="lib-why">' + a.reasons.map(r => '<span class="chip">' + escHtml(r) + '</span>').join('') + '</div>' : '') +
      row('Languages', a.languages.map(escHtml).join(', ')) +
      row('Best region', a.bestRegion ? escHtml(a.bestRegion) : '<span class="dim">—</span>') +
      row('Products', a.products.map(escHtml).join(', ')) +
      row('Tone · voice', escHtml(a.personaTone) + ' · ' + escHtml(a.gender)) +
      row('Rating', a.rating != null ? escHtml(a.rating) + ' / 5' : dash) +
      row('QC score', p.qcScore != null ? escHtml(p.qcScore) + '%' : dash) +
      row('Latency', p.latencyMs != null ? escHtml(p.latencyMs) + ' ms' : dash) +
      row('Minutes spoken', Number(a.minutesSpoken || 0).toLocaleString('en-IN')) +
    '</div>';
  document.getElementById('libBack').onclick = () => { libState.agentId = null; renderLibrary(); };
}

document.getElementById('libClose').addEventListener('click', closeLibrary);
document.getElementById('libModal').addEventListener('click', (e) => { if(e.target.id === 'libModal') closeLibrary(); });
document.addEventListener('keydown', (e) => { if(e.key === 'Escape' && !document.getElementById('libModal').hidden) closeLibrary(); });
