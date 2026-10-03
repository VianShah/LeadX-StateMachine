// The Data Intelligence + Strategy stages, computed from a run's leads. Each
// section is the server-side counterpart of a tab in the original static demo
// (legacy/leadx_e2e_pipeline_5.html): fetch, process, cross-sell opportunities,
// eligibility buckets, pitch and persona batching.
const { NEEDS, NEED_KEYS } = require('./leads');

const SOURCES = [
  { key: 'aa', title: 'Account Aggregator', items: ['Turnover & balance trend', 'Spend category mix', 'Recurring debit pattern'] },
  { key: 'crm', title: 'CRM / Core Banking', items: ['Product holdings', 'Existing relationships', 'Language preference'] },
  { key: 'cibil', title: 'CIBIL Bureau', items: ['Credit score & trend', 'Exposure & repayment history'] },
];

function fetchStage(leads) {
  return {
    sources: SOURCES.map((s) => ({ ...s, records: leads.length })),
    note: 'Account Aggregator data is consent-scoped per pull — this fetch reflects an active, valid consent window with the customer, refreshed automatically as it nears expiry.',
  };
}

function processStage(leads) {
  return {
    tasks: [
      'Validating record schema',
      'Matching customers to CRM records',
      'Pulling Account Aggregator signals',
      'Pulling CIBIL bureau data',
      `Normalizing ${leads.length} records for scoring`,
    ],
  };
}

function opportunitiesStage(leads) {
  return {
    model: [
      { title: 'Inputs', body: 'AA behaviour signals + CRM product gaps + CIBIL exposure & repayment' },
      { title: 'Scoring', body: 'Each customer is scored against every product, not just one — weights shift by product (e.g. Business Loan leans on turnover, Credit Card leans on bureau score)' },
      { title: 'Output', body: 'Highest-propensity product per customer surfaces as the identified opportunity, with the signal that drove it' },
    ],
    rows: leads.map((l) => ({
      id: l.id, name: l.name, signal: l.signal, need: l.need, why: l.why,
      spendCategory: l.need === 'Credit Card' ? l.spendCategory : null,
      eligibleDisplay: l.eligibleDisplay, score: l.score,
    })),
    footnote: "Indicative eligibility is a band surfaced from the bank's own pre-approval / credit-policy engine (CIBIL + internal risk rules) — LeadX reads and personalizes around it, it does not perform underwriting or set the final sanctioned amount.",
  };
}

function eligibilityStage(leads) {
  return {
    buckets: NEED_KEYS.map((need) => {
      const rows = leads.filter((l) => l.need === need).sort((a, b) => b.eligibleAmount - a.eligibleAmount);
      return {
        need,
        productRange: [NEEDS[need].min, NEEDS[need].max],
        batchRange: rows.length ? [rows[rows.length - 1].eligibleAmount, rows[0].eligibleAmount] : null,
        rows: rows.map((l) => ({ id: l.id, name: l.name, eligibleAmount: l.eligibleAmount, eligibleDisplay: l.eligibleDisplay, tier: l.eligibleTier })),
      };
    }),
  };
}

function pitchStage(leads) {
  return {
    rows: leads.map((l) => ({
      id: l.id, name: l.name, need: l.need, eligibleDisplay: l.eligibleDisplay, eligibleLabel: l.eligibleLabel,
      language: l.language, bestTime: l.bestTime, platform: 'Voice call', tone: l.tone, emotions: l.emotions,
      cardType: l.need === 'Credit Card' ? l.cardType : null,
      cardReason: l.need === 'Credit Card' ? `${l.spendCategory} is ${l.spendPct}% of monthly spend` : null,
      existing: l.existing, note: l.note,
    })),
  };
}

// Leads grouped by language + product need, so each batch gets one script and
// one send window. `voiceMatch` tells whether the chosen agent speaks the
// batch's language — that is what the voice-selection screen feeds into.
function batchingStage(leads, voice) {
  const groups = new Map();
  for (const l of leads) {
    const key = `${l.language} · ${l.need}`;
    if (!groups.has(key)) groups.set(key, { key, language: l.language, need: l.need, count: 0 });
    groups.get(key).count += 1;
  }
  const batches = [...groups.values()]
    .map((g) => ({ ...g, voiceMatch: voice.languages.includes(g.language) }))
    .sort((a, b) => b.count - a.count);
  return {
    batches,
    matchedLeads: batches.filter((b) => b.voiceMatch).reduce((n, b) => n + b.count, 0),
    totalLeads: leads.length,
  };
}

function build(leads, voice) {
  return {
    fetch: fetchStage(leads),
    process: processStage(leads),
    opportunities: opportunitiesStage(leads),
    eligibility: eligibilityStage(leads),
    pitch: pitchStage(leads),
    batching: batchingStage(leads, voice),
  };
}

module.exports = { build };
