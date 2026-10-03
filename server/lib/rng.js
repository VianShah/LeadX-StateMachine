// Deterministic helpers. The simulation is seeded so a given (run, lead,
// step) always resolves the same way — runs are reproducible and testable
// without mocking Math.random.
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

// mulberry32 — small, fast, good-enough PRNG. Returns a float in [0, 1).
function seeded(...parts) {
  let a = hashStr(parts.join('|')) || 1;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(arr, rand) {
  return arr[Math.floor(rand() * arr.length) % arr.length];
}

module.exports = { hashStr, seeded, pick };
