// Voice-selection carousel — adapted from the Kollect booth demo. Voices come
// from GET /api/voices; every voice is selectable. A real recording
// (`sampleAudio`) is preferred, otherwise the sample line is spoken in-browser.
let orbList = [];
let orbIndex = 0;
let _orbAudioEl = null;

async function initOrbs(){
  try {
    const res = await fetch('/api/voices');
    const voices = await res.json();
    if(Array.isArray(voices)) orbList = voices;
  } catch(e) { /* leave empty; the screen shows a retry message */ }
}

function renderOrbCarousel(autoplay){
  stopOrbAudio();
  const track = document.getElementById('orbCarousel');
  track.innerHTML = '';
  const confirmBtn = document.getElementById('btnOrbNext');
  if(!orbList.length){
    track.innerHTML = '<div class="orb-empty">Couldn&#8217;t load voices. <button type="button" class="orb-play" id="orbRetry">Retry</button></div>';
    confirmBtn.disabled = true;
    document.getElementById('orbRetry').onclick = () => initOrbs().then(() => renderOrbCarousel(false));
    return;
  }
  let frontOrb = null, frontEl = null;
  orbList.forEach((o, i) => {
    const offset = i - orbIndex;
    const dist = Math.abs(offset);
    const el = document.createElement('div');
    el.className = 'orb' + (offset === 0 ? ' front' : '');
    el.style.setProperty('--pastel', o.pastel || '#8ecbff');
    el.style.transform = 'translate(-50%,-50%) translate3d(' + (offset * 122) + 'px,0,' + (-dist * 70) + 'px) scale(' + (offset === 0 ? 1 : Math.max(0.5, 1 - dist * 0.22)) + ')';
    el.style.opacity = Math.max(0.28, 1 - dist * 0.3);
    el.style.zIndex = 100 - dist;
    el.innerHTML =
      '<div class="orb-sphere"><div class="orb-glow"></div></div>' +
      '<div class="orb-label">' +
        '<div class="oname">' + o.name + '</div>' +
        '<div class="olang">' + o.lang + '</div>' +
        (offset === 0 ? '<button class="orb-play" type="button" data-role="play">&#9654; Replay</button>' : '') +
      '</div>';
    el.addEventListener('click', (e) => {
      if(offset !== 0){ orbIndex = i; renderOrbCarousel(); return; }
      if(e.target.closest('[data-role="play"]') || e.target.closest('.orb-sphere')) playOrbSample(o, el);
    });
    if(offset === 0){ frontOrb = o; frontEl = el; }
    track.appendChild(el);
  });
  const front = orbList[orbIndex];
  state.voice = front;
  confirmBtn.disabled = false;
  document.getElementById('orbDetail').innerHTML =
    '<strong>' + front.name + '</strong> · ' + front.meta;
  if(autoplay !== false && frontOrb) playOrbSample(frontOrb, frontEl);
}

function stopOrbAudio(){
  if(_orbAudioEl){ _orbAudioEl.pause(); _orbAudioEl = null; }
  if('speechSynthesis' in window) window.speechSynthesis.cancel();
  document.querySelectorAll('.orb-sphere.speaking').forEach(s => s.classList.remove('speaking'));
  document.querySelectorAll('[data-role="play"].playing').forEach(b => b.classList.remove('playing'));
}

function playOrbSample(o, el){
  const sphere = el.querySelector('.orb-sphere');
  const btn = el.querySelector('[data-role="play"]');
  stopOrbAudio();
  sphere.classList.add('speaking');
  if(btn) btn.classList.add('playing');
  let done = false;
  function stopGlow(){
    if(done) return; done = true;
    sphere.classList.remove('speaking');
    if(btn) btn.classList.remove('playing');
  }
  if(o.sampleAudio){
    const audio = new Audio(o.sampleAudio);
    _orbAudioEl = audio;
    audio.addEventListener('ended', stopGlow);
    audio.addEventListener('error', stopGlow);
    setTimeout(stopGlow, 15000); // safety net if 'ended' never fires
    audio.play().catch(stopGlow);
    return;
  }
  setTimeout(stopGlow, 4500); // safety net: some browsers never fire utterance.onend
  try {
    if('speechSynthesis' in window && o.sample){
      const utter = new SpeechSynthesisUtterance(o.sample);
      utter.lang = o.ttsLang || 'hi-IN';
      utter.onend = stopGlow; utter.onerror = stopGlow;
      window.speechSynthesis.speak(utter);
      return;
    }
  } catch(e) {}
  setTimeout(stopGlow, 1500); // no TTS available — keep the glow brief
}

function stepOrb(delta){
  const next = Math.max(0, Math.min(orbList.length - 1, orbIndex + delta));
  if(next !== orbIndex){ orbIndex = next; renderOrbCarousel(); }
}

document.getElementById('orbPrev').addEventListener('click', () => stepOrb(-1));
document.getElementById('orbNext').addEventListener('click', () => stepOrb(1));

const _orbCarousel = document.getElementById('orbCarousel');
let _orbWheelLock = false;
_orbCarousel.addEventListener('wheel', (e) => {
  e.preventDefault();
  const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  if(Math.abs(delta) < 12 || _orbWheelLock) return;
  _orbWheelLock = true;
  stepOrb(delta > 0 ? 1 : -1);
  setTimeout(() => _orbWheelLock = false, 260);
}, { passive:false });

let _orbDragStartX = null;
_orbCarousel.addEventListener('pointerdown', (e) => { _orbDragStartX = e.clientX; });
_orbCarousel.addEventListener('pointerup', (e) => {
  if(_orbDragStartX === null) return;
  const dx = e.clientX - _orbDragStartX;
  if(Math.abs(dx) > 40) stepOrb(dx < 0 ? 1 : -1);
  _orbDragStartX = null;
});
document.addEventListener('keydown', (e) => {
  if(!document.getElementById('screen-orbs').classList.contains('active')) return;
  if(e.key === 'ArrowRight') stepOrb(1);
  if(e.key === 'ArrowLeft') stepOrb(-1);
});

document.getElementById('btnOrbNext').addEventListener('click', () => {
  stopOrbAudio();
  startPipeline();
});

initOrbs().then(() => renderOrbCarousel(false));
