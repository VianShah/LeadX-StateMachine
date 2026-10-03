// A reusable state-graph renderer. The Execution tab and the Fulfilment tab each
// draw a different slice of the same server-defined machine (GET /api/machine):
// a graph is configured with the node positions it shows, and draws every edge
// of the machine whose endpoints it contains.
const SVG_NS = 'http://www.w3.org/2000/svg';
const escHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const prefersReducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

class StateGraph {
  /**
   * opts.graphEl / svgEl / nbaEl — DOM hooks
   * opts.layout       — { stateKey: [x%, y%] } — which states this graph shows, and where
   * opts.skipEdgesFrom — states whose outgoing edges belong to the other graph
   * opts.ghost        — optional { key, label, sub, pos:[x,y], after:stateKey, onClick } exit node
   */
  constructor(opts) {
    Object.assign(this, opts);
    this.skipEdgesFrom = opts.skipEdgesFrom || [];
    this.nodeEls = {}; this.edgeEls = {}; this.def = null; this.byKey = {};
  }

  owns(from, to) {
    return !!this.layout[from] && !!this.layout[to] && !this.skipEdgesFrom.includes(from);
  }

  build(def) {
    this.def = def;
    this.byKey = Object.fromEntries(def.states.map((s) => [s.key, s]));
    this.graphEl.querySelectorAll('.m-node').forEach((n) => n.remove());
    this.nodeEls = {}; this.edgeEls = {};
    for (const s of def.states) {
      const pos = this.layout[s.key];
      if (!pos) continue;
      this._addNode(s.key, pos, s.label, s.kind, s.color, () => this._showNba(s));
    }
    const g = this.ghost;
    if (g) {
      const el = this._addNode(g.key, g.pos, g.label, g.sub, '#C9A24B', () => { this.nbaEl.innerHTML = '<b>' + escHtml(g.label) + '</b> &mdash; ' + escHtml(g.hint); });
      el.classList.add('ghost');
      el.tabIndex = 0;
      el.addEventListener('click', g.onClick);
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') g.onClick(); });
    }
    this._drawEdges();
    // Edges are drawn in pixels from the nodes' laid-out positions, so redraw
    // whenever the graph box changes size (e.g. the completion banner appearing).
    if (!this._ro && window.ResizeObserver) {
      this._ro = new ResizeObserver(() => {
        if (this._raf) return;
        this._raf = requestAnimationFrame(() => { this._raf = 0; if (this.def && this.graphEl.offsetWidth) this._drawEdges(); });
      });
      this._ro.observe(this.graphEl);
    }
  }

  _addNode(key, pos, label, kind, color, onHover) {
    const el = document.createElement('div');
    el.className = 'm-node zero' + (kind === 'terminal' ? ' terminal' : '');
    el.style.left = pos[0] + '%'; el.style.top = pos[1] + '%';
    el.style.setProperty('--c', color);
    el.innerHTML = '<div class="nl">' + escHtml(label) + '</div><div class="nk">' + escHtml(kind) + '</div><div class="nlive"></div><div class="nc">0</div>';
    el.addEventListener('mouseenter', onHover);
    el.addEventListener('focus', onHover);
    this.graphEl.appendChild(el);
    this.nodeEls[key] = el;
    return el;
  }

  _showNba(s) {
    this.nbaEl.innerHTML = '<b>' + escHtml(s.label) + '</b> &mdash; ' + escHtml(s.nba);
  }

  _anchors(a, b) {
    const fx = a.offsetLeft, fy = a.offsetTop, tx = b.offsetLeft, ty = b.offsetTop;
    const fw = a.offsetWidth / 2, tw = b.offsetWidth / 2, th = b.offsetHeight / 2;
    if (tx - tw > fx + fw) { // forward: right edge -> left edge
      const x1 = fx + fw, x2 = tx - tw, dx = (x2 - x1) / 2;
      return { d: 'M' + x1 + ',' + fy + ' C' + (x1 + dx) + ',' + fy + ' ' + (x2 - dx) + ',' + ty + ' ' + x2 + ',' + ty, mx: (x1 + x2) / 2, my: (fy + ty) / 2, gap: x2 - x1 };
    }
    if (Math.abs(tx - fx) < fw + tw && ty > fy) { // stacked in one column: bottom edge -> top edge
      const y1 = fy + a.offsetHeight / 2, y2 = ty - th;
      return { d: 'M' + fx + ',' + y1 + ' L' + tx + ',' + y2, mx: fx, my: (y1 + y2) / 2, gap: 0 };
    }
    // backward (the retry loop): left edge of source -> top of target
    const x1 = fx - fw, y2 = ty - th;
    return { d: 'M' + x1 + ',' + fy + ' C' + (x1 - 50) + ',' + fy + ' ' + tx + ',' + (y2 - 60) + ' ' + tx + ',' + y2, mx: (x1 + tx) / 2 - 12, my: (fy + y2) / 2 - 22, gap: 999 };
  }

  _drawEdges() {
    const svg = this.svgEl;
    svg.innerHTML = '<defs><marker id="arrow-' + svg.id + '" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#3a4150"/></marker></defs>';
    const add = (from, to, event, dashed) => {
      const a = this.nodeEls[from], b = this.nodeEls[to];
      if (!a || !b) return;
      const g = this._anchors(a, b);
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', g.d);
      path.setAttribute('marker-end', 'url(#arrow-' + svg.id + ')');
      if (dashed) path.setAttribute('stroke-dasharray', '4 4');
      svg.appendChild(path);
      this.edgeEls[from + '>' + to] = path;
      // Label only edges with room for it; short hops would collide with the
      // nodes, and the live feed names every event anyway.
      if (event && g.gap > 100) {
        const t = document.createElementNS(SVG_NS, 'text');
        t.setAttribute('x', g.mx); t.setAttribute('y', g.my - 3);
        t.setAttribute('text-anchor', 'middle'); t.setAttribute('class', 'edge-label');
        t.textContent = event;
        svg.appendChild(t);
      }
    };
    for (const e of this.def.edges) if (this.owns(e.from, e.to)) add(e.from, e.to, e.event, false);
    if (this.ghost) add(this.ghost.after, this.ghost.key, '', true);
  }

  /** visits: { key: leads that ever entered it }, live: { key: leads in it now }. */
  update(visits, live, flashKey) {
    for (const key of Object.keys(this.nodeEls)) {
      const el = this.nodeEls[key];
      const seen = visits[key] || 0, now = live[key] || 0;
      const st = this.byKey[key];
      el.querySelector('.nc').textContent = seen;
      el.querySelector('.nlive').textContent = now > 0 && st && st.kind !== 'terminal' ? '● ' + now + ' live' : '';
      el.classList.toggle('zero', seen === 0);
      el.classList.toggle('occupied', now > 0 && !!st && st.kind !== 'terminal');
    }
    if (flashKey && this.nodeEls[flashKey]) {
      const el = this.nodeEls[flashKey];
      el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), 450);
    }
  }

  pulse(from, to) {
    const path = this.edgeEls[from + '>' + to];
    if (!path) return;
    path.classList.add('hot');
    setTimeout(() => path.classList.remove('hot'), 900);
    if (prefersReducedMotion()) return;
    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('r', 4); dot.setAttribute('class', 'particle');
    this.svgEl.appendChild(dot);
    const len = path.getTotalLength(), t0 = performance.now(), dur = 700;
    (function frame(now) {
      const p = Math.min(1, (now - t0) / dur);
      const pt = path.getPointAtLength(len * p);
      dot.setAttribute('cx', pt.x); dot.setAttribute('cy', pt.y);
      if (p < 1) requestAnimationFrame(frame); else dot.remove();
    })(t0);
  }
}
