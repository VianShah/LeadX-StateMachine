// Campaign type: cross-sell (existing customers) or cold sales (an uploaded list).
// The choice is stored in state.mode and read by startPipeline().
(function(){
  const cards = document.querySelectorAll('.mode-card');
  const next = document.getElementById('btnModeNext');
  function select(mode){
    state.mode = mode;
    cards.forEach(c => {
      const on = c.dataset.mode === mode;
      c.classList.toggle('selected', on);
      c.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    next.disabled = false;
  }
  cards.forEach(c => c.addEventListener('click', () => select(c.dataset.mode)));
  next.addEventListener('click', () => {
    // Cold sales routes leads to whichever agent speaks their language, so the
    // voice picked here is the lead agent rather than the only one.
    document.querySelector('.orbs-head p').textContent = state.mode === 'cold_sales'
      ? 'This is your lead agent. Prospects whose language it doesn’t speak are routed to the agent who does.'
      : 'Scroll, drag, use the arrow keys, or tap either side to browse. Each voice has its own language and style — and changes how the campaign plays out.';
    goTo('screen-orbs');
    renderOrbCarousel();
  });
})();
