// Uniform viewport-fit scaling — the whole app is authored at a fixed
// 1440x900 reference size (see #app in styles.css) and this scales that
// entire box to fit whatever screen it's actually opened on: an iPad, a
// laptop at some browser zoom level, an ultrawide monitor. Every element
// still lays out against the same 1440x900 box it always has, so nothing
// reflows differently at different sizes — it's the identical layout,
// just uniformly bigger or smaller. This replaces chasing individual
// cropping bugs (phone mockup, comm-history, transcript...) one breakpoint
// at a time with a single fix that covers the whole app at once.
(function () {
  const REF_WIDTH = 1440;
  const REF_HEIGHT = 900;
  // Below this, the app would rather show slightly less margin around it
  // (letterboxing) than shrink text to the point of being unreadable — the
  // real devices this needs to support (iPad, laptops) don't get anywhere
  // near this floor; it only matters for a genuinely tiny window.
  const MIN_SCALE = 0.5;

  function applyFit() {
    const app = document.getElementById('app');
    if (!app) return;
    const scale = Math.max(
      MIN_SCALE,
      Math.min(window.innerWidth / REF_WIDTH, window.innerHeight / REF_HEIGHT)
    );
    app.style.transform = `translate(-50%, -50%) scale(${scale})`;
  }

  applyFit();
  window.addEventListener('resize', applyFit);
  // Orientation changes on a tablet don't always fire a resize event in
  // time for the new dimensions to be readable yet — a short delay covers it.
  window.addEventListener('orientationchange', () => setTimeout(applyFit, 150));
})();
