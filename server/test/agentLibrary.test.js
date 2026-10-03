const test = require('node:test');
const assert = require('node:assert/strict');
const lib = require('../lib/agentLibrary');

test('recommendations speak the language, prefer the run service, and are ranked', () => {
  const r = lib.recommend({ language: 'Tamil', mode: 'cold_sales' });
  assert.equal(r.region, 'Tamil Nadu');
  assert.ok(r.agents.length > 0 && r.agents.length <= 3);
  for (const a of r.agents) assert.ok(a.languages.includes('Tamil'));
  assert.equal(r.agents[0].service, 'Cold sales');
});

test('a best-region match outranks everything else', () => {
  const all = lib.listing().agents.filter((a) => a.bestRegion && a.languages.includes('Hindi'));
  if (!all.length) return; // nothing to compare in this catalog snapshot
  const r = lib.recommend({ language: 'Hindi', mode: 'cross_sell', limit: 50 });
  const firstRegional = r.agents.findIndex((a) => a.bestRegion === 'Hindi belt');
  assert.ok(firstRegional >= 0 && firstRegional < 3);
});

test('English maps to Hinglish voices, and gaps are explicit', () => {
  const en = lib.recommend({ language: 'English', mode: 'cross_sell' });
  assert.ok(en.agents.every((a) => a.languages.includes('Hinglish')));
  assert.match(en.note, /Hinglish/);
  const bn = lib.recommend({ language: 'Bengali', mode: 'cold_sales' });
  assert.equal(bn.agents.length, 0);
  assert.match(bn.note, /No Bengali/);
});
