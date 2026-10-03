// The voice-agent library, region-wise. Data is the Sales line of the agent
// catalog from the Kollect demo (VianShah/Kollect-StateMachine,
// server/agentCatalog.json) — the 48 cross-selling and cold-sales agents.
//
// For each campaign batch we recommend the library voices best suited to it:
// they must speak the batch's language; then the agent's best-performing
// region, whether it works this service (cross-sell vs cold sales), the
// product, its live status and QC score decide the order.
const AGENTS = require('../data/agentLibrary.json');

const SERVICE_FOR_MODE = { cross_sell: 'Cross-selling', cold_sales: 'Cold sales' };
// Which region a language points to — the same regions the catalog's bestRegion uses.
const REGION_FOR_LANGUAGE = {
  Hindi: 'Hindi belt', Hinglish: 'Metro cities', English: 'Metro cities',
  Marathi: 'Maharashtra', Gujarati: 'Gujarat', Punjabi: 'Punjab',
  Tamil: 'Tamil Nadu', Telugu: 'Telangana & Andhra Pradesh', Kannada: 'Karnataka',
  Bengali: 'West Bengal', Malayalam: 'Kerala',
};
// LeadX product names -> the catalog's product names.
const CATALOG_PRODUCT = { 'Credit Card': 'Credit Cards', 'Personal Loan': 'Personal Loan' };
const STATUS_WEIGHT = { Live: 15, Demo: 5, Dev: 0 };

const LIBRARY_LANGUAGES = [...new Set(AGENTS.flatMap((a) => a.languages))].sort();

function publicAgent(a) {
  return {
    id: a.id, name: a.name, gender: a.gender, service: a.service, products: a.products,
    objective: a.objective, personaTone: a.personaTone, description: a.description,
    languages: a.languages, bestRegion: a.bestRegion || null, rating: a.rating, status: a.status,
    minutesSpoken: a.minutesSpoken, performance: a.performance,
  };
}

/**
 * Recommend up to `limit` agents for one language.
 * The library has no English-only voices, so English batches are matched to
 * Hinglish speakers (they cover metro English-speaking customers).
 */
function recommend({ language, mode, need, limit = 3 }) {
  const region = REGION_FOR_LANGUAGE[language] || null;
  const speak = language === 'English' ? 'Hinglish' : language;
  const service = SERVICE_FOR_MODE[mode];
  const product = CATALOG_PRODUCT[need];
  const pool = AGENTS.filter((a) => a.languages.includes(speak));
  const scored = pool.map((a) => {
    const reasons = [`Speaks ${speak}`];
    let score = (a.performance?.qcScore || 0) / 10 + (a.rating || 0) * 2 + (STATUS_WEIGHT[a.status] || 0);
    if (region && a.bestRegion === region) { score += 40; reasons.push(`Best performer in ${region}`); }
    if (a.service === service) { score += 25; reasons.push(a.service); }
    if (product && a.products.includes(product)) { score += 10; reasons.push(`Pitches ${product}`); }
    if (a.status === 'Live') reasons.push('Live');
    return { agent: a, score, reasons };
  }).sort((x, y) => y.score - x.score);

  let note = null;
  if (!pool.length) note = `No ${language}-speaking sales voice in the library yet`;
  else if (language === 'English') note = 'No English-only voices in the library — Hinglish voices cover metro English speakers';
  return {
    language, region, available: pool.length, note,
    agents: scored.slice(0, limit).map((s) => ({ ...publicAgent(s.agent), reasons: s.reasons })),
  };
}

/**
 * Attach recommendations to campaign batches, by the batch's language — for a
 * cold batch that is the prospects' own language even when the call runs in an
 * English bridge, which is exactly the gap the library can fill.
 */
function decorateBatches(batches, mode) {
  return batches.map((b) => ({ ...b, library: recommend({ language: b.language, mode, need: b.need }) }));
}

function listing() {
  return {
    agents: AGENTS.map(publicAgent),
    languages: LIBRARY_LANGUAGES,
    regions: LIBRARY_LANGUAGES.map((l) => ({ language: l, region: REGION_FOR_LANGUAGE[l] || null, count: AGENTS.filter((a) => a.languages.includes(l)).length })),
    services: Object.values(SERVICE_FOR_MODE),
  };
}

module.exports = { recommend, decorateBatches, listing, REGION_FOR_LANGUAGE };
