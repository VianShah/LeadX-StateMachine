// Synthetic lead generation + the "Data Intelligence" scoring that feeds the
// state machine. Ported from the original static demo
// (legacy/leadx_e2e_pipeline_5.html: NEEDS, calcEligibleAmount, processRows)
// so numbers and copy stay consistent with what the team has already seen.
const { seeded, pick } = require('./rng');

const NEEDS = {
  'Business Loan': {
    signal: 'Business turnover shows consistent growth, no working-capital facility on file',
    why: 'From AA current-account turnover + CIBIL secured exposure — steady inflow with no existing business credit line marks a working-capital gap.',
    min: 500000, max: 5000000, round: 100000, label: 'Business Loan', keyword: 'business loan',
    weights: { bal: 0.7, cibil: 0.3 },
  },
  'Personal Loan': {
    signal: 'Recurring large debit detected — consolidation opportunity',
    why: 'From AA recurring-debit pattern + CIBIL repayment history — multiple stable EMIs with clean repayment marks consolidation fit, not risk.',
    min: 100000, max: 1500000, round: 50000, label: 'Personal Loan', keyword: 'personal loan',
    weights: { bal: 0.5, cibil: 0.5 },
  },
  'Credit Card': {
    signal: 'Spending pattern shows rising utilization on existing card',
    why: 'From AA card-spend trend + spend-category mix — utilization climbing with a dominant spend category marks fit for a category-matched card.',
    min: 25000, max: 500000, round: 5000, label: 'Credit Card limit', keyword: 'credit card',
    weights: { bal: 0.3, cibil: 0.7 },
  },
  EMI: {
    signal: 'Frequent small-ticket purchases detected, no active EMI facility',
    why: 'From AA transaction categories + CRM product record — repeated durable/retail purchases paid in full each time marks EMI-facility fit.',
    min: 10000, max: 200000, round: 5000, label: 'EMI facility', keyword: 'emi facility',
    weights: { bal: 0.4, cibil: 0.6 },
  },
};
const NEED_KEYS = Object.keys(NEEDS);

const LANGS = ['Hindi', 'English', 'Marathi', 'Hinglish', 'Tamil'];
const SPEND_CATEGORIES = ['Travel', 'Fuel', 'Dining', 'Entertainment', 'Shopping', 'Groceries'];
const FIRST_NAMES = ['R.', 'A.', 'P.', 'S.', 'N.', 'V.', 'M.', 'D.', 'K.', 'T.', 'G.', 'H.', 'J.', 'L.', 'B.', 'C.', 'F.', 'O.', 'U.', 'Y.'];
const LAST_NAMES = ['Sharma', 'Iyer', 'Deshmukh', 'Khan', 'Reddy', 'Kapoor', 'Joseph', 'Patel', 'Nair', 'Verma', 'Gupta', 'Chatterjee', 'Menon', 'Rao', 'Singh', 'Bhatt', 'Pillai', 'Mishra', 'Agarwal', 'Choudhury'];
const EXISTING_PRODUCT_SETS = ['Savings', 'Savings, FD', 'Savings, Credit Card', 'Savings, Personal Loan', 'Savings, Mutual Fund', 'Savings, FD, Credit Card', 'Savings, Auto Loan', 'Savings, Insurance', 'Savings, FD, Mutual Fund'];
const CITIES = ['Mumbai', 'Pune', 'Bengaluru', 'Delhi NCR', 'Chennai', 'Hyderabad', 'Ahmedabad', 'Kolkata', 'Jaipur', 'Chandigarh', 'Lucknow'];

const CARD_TYPE_MAP = {
  Travel: 'Travel Credit Card', Fuel: 'Fuel Credit Card', Dining: 'Dining & Lifestyle Credit Card',
  Entertainment: 'Entertainment Credit Card', Shopping: 'Shopping / Cashback Credit Card', Groceries: 'Everyday Cashback Credit Card',
};
const TONE_BY_BAND = {
  high: { tone: 'Warm, congratulatory', emotions: ['Pride', 'Opportunity'] },
  med:  { tone: 'Practical, reassuring', emotions: ['Relief', 'Control'] },
  low:  { tone: 'Light, respectful', emotions: ['Trust'] },
};
const BEST_TIMES = ['Tue & Thu, 6–8 PM', 'Weekday mornings, 10–11 AM', 'Weekend afternoons', 'Weekday evenings, post 7 PM'];

// Where the amount sits inside the product's range: high / med / low tier.
function tierForAmount(need, amount) {
  const cfg = NEEDS[need];
  const ratio = (amount - cfg.min) / (cfg.max - cfg.min);
  return ratio >= 0.66 ? 'high' : ratio >= 0.33 ? 'med' : 'low';
}

const clamp01 = (n) => Math.max(0, Math.min(1, n));

function calcEligibleAmount(need, normBal, normCibil) {
  const cfg = NEEDS[need];
  const factor = normBal * cfg.weights.bal + normCibil * cfg.weights.cibil;
  const raw = cfg.min + factor * (cfg.max - cfg.min);
  return Math.round(raw / cfg.round) * cfg.round;
}

function formatAmount(n) {
  if (n >= 100000) return '₹' + (n / 100000).toFixed(n % 100000 === 0 ? 0 : 1) + ' L';
  return '₹' + n.toLocaleString('en-IN');
}

function generateLeads(count, seed) {
  const leads = [];
  for (let i = 0; i < count; i++) {
    const rand = seeded('lead', seed, i);
    const name = FIRST_NAMES[i % FIRST_NAMES.length] + ' ' + LAST_NAMES[(i * 7 + Math.floor(i / 20)) % LAST_NAMES.length];
    const balance = 22000 + Math.floor(rand() * 80) * 12500;
    const cibil = 580 + Math.floor(rand() * 220);
    const existing = pick(EXISTING_PRODUCT_SETS, rand);

    const cNorm = Math.max(0, Math.min(100, (cibil - 500) / 4));
    const bNorm = Math.max(0, Math.min(100, balance / 2000));
    const score = Math.round(cNorm * 0.6 + bNorm * 0.4);
    const band = score >= 75 ? 'high' : score >= 55 ? 'med' : 'low';

    const available = NEED_KEYS.filter((n) => !existing.toLowerCase().includes(NEEDS[n].keyword));
    const need = pick(available.length ? available : NEED_KEYS, rand);
    const eligibleAmount = calcEligibleAmount(need, clamp01(balance / 600000), clamp01((cibil - 500) / 300));

    const language = pick(LANGS, rand);
    const city = pick(CITIES, rand);
    const spendCategory = pick(SPEND_CATEGORIES, rand);
    const bestTime = pick(BEST_TIMES, rand);
    const spendPct = 25 + Math.floor(rand() * 40);
    const eligibleDisplay = formatAmount(eligibleAmount);

    leads.push({
      id: 'LEAD-' + (1001 + i),
      name,
      city,
      language,
      existing,
      balance,
      cibil,
      score,
      band,
      need,
      signal: NEEDS[need].signal,
      why: NEEDS[need].why,
      eligibleAmount,
      eligibleLabel: NEEDS[need].label,
      eligibleDisplay,
      eligibleTier: tierForAmount(need, eligibleAmount),
      spendCategory,
      spendPct,
      cardType: CARD_TYPE_MAP[spendCategory],
      bestTime,
      tone: TONE_BY_BAND[band].tone,
      emotions: TONE_BY_BAND[band].emotions,
      note: `Already holds: ${existing}. Indicative band ${eligibleDisplay} (${NEEDS[need].label}), as surfaced from the bank's pre-approval / policy engine — LeadX personalizes the pitch around it, it doesn't set the number.`,
    });
  }
  return leads;
}

module.exports = { generateLeads, formatAmount, calcEligibleAmount, tierForAmount, NEEDS, NEED_KEYS };
