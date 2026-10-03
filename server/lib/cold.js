// Cold sales: turn a raw prospect list (name, phone, CIBIL, a few basics) into
// callable leads with a contact strategy.
//
// Unlike cross-sell there is no bank relationship to read from (no AA / CRM),
// so everything is derived from what the list itself carries:
//   1. intake      — map the list's own column names onto known fields
//   2. validation  — phone format, duplicates, the list's DND flag, CIBIL cutoff
//   3. fit         — which product to pitch, from CIBIL + income + occupation
//   4. buckets     — Hot / Warm / Cold by fit score (plus the excluded rows)
//   5. contact plan — when to call, how (direct vs warm-up first), which language
// The resulting leads run through the same state machine as cross-sell.
const { NEEDS, formatAmount, calcEligibleAmount, tierForAmount } = require('./leads');
const { seeded, pick } = require('./rng');

const CIBIL_CUTOFF = 650;
const MAX_ROWS = 1000;

// Header aliases, compared after lower-casing and stripping non-letters, so
// "Mobile No.", "mobile_number" and "MobileNumber" all land on `phone`.
const ALIASES = {
  name: ['name', 'customername', 'fullname', 'leadname', 'prospectname'],
  phone: ['phone', 'mobile', 'phonenumber', 'mobilenumber', 'mobileno', 'phoneno', 'contact', 'contactnumber', 'contactno'],
  cibil: ['cibil', 'cibilscore', 'creditscore', 'bureauscore', 'score'],
  city: ['city', 'location', 'town'],
  state: ['state', 'region'],
  age: ['age'],
  income: ['income', 'monthlyincome', 'salary', 'monthlysalary', 'netmonthlyincome'],
  occupation: ['occupation', 'employment', 'employmenttype', 'profession', 'jobtype'],
  language: ['language', 'preferredlanguage', 'lang'],
  dnd: ['dnd', 'donotcall', 'dndflag', 'dndstatus', 'ndnc'],
};
const HEADER_TO_FIELD = {};
for (const [field, keys] of Object.entries(ALIASES)) for (const k of keys) HEADER_TO_FIELD[k] = field;
const headerKey = (h) => String(h || '').toLowerCase().replace(/[^a-z]/g, '');

const CITY_STATE = {
  mumbai: 'Maharashtra', pune: 'Maharashtra', nagpur: 'Maharashtra', nashik: 'Maharashtra', thane: 'Maharashtra',
  chennai: 'Tamil Nadu', coimbatore: 'Tamil Nadu', madurai: 'Tamil Nadu',
  bengaluru: 'Karnataka', bangalore: 'Karnataka', mysuru: 'Karnataka', mysore: 'Karnataka',
  hyderabad: 'Telangana', vijayawada: 'Andhra Pradesh', visakhapatnam: 'Andhra Pradesh',
  kolkata: 'West Bengal', ahmedabad: 'Gujarat', surat: 'Gujarat', vadodara: 'Gujarat',
  kochi: 'Kerala', thiruvananthapuram: 'Kerala',
  delhi: 'Delhi', newdelhi: 'Delhi', noida: 'Uttar Pradesh', gurgaon: 'Haryana', gurugram: 'Haryana',
  lucknow: 'Uttar Pradesh', kanpur: 'Uttar Pradesh', jaipur: 'Rajasthan', patna: 'Bihar',
  bhopal: 'Madhya Pradesh', indore: 'Madhya Pradesh', chandigarh: 'Chandigarh',
};
const STATE_LANGUAGE = {
  maharashtra: 'Marathi', tamilnadu: 'Tamil', karnataka: 'Kannada', telangana: 'Telugu', andhrapradesh: 'Telugu',
  westbengal: 'Bengali', gujarat: 'Gujarati', kerala: 'Malayalam', punjab: 'Punjabi',
};
const METROS = new Set(['mumbai', 'pune', 'bengaluru', 'bangalore', 'hyderabad', 'chennai', 'kolkata', 'delhi', 'newdelhi', 'noida', 'gurgaon', 'gurugram', 'ahmedabad']);
// Regions where young metro professionals mostly switch to Hinglish rather than English.
const HINGLISH_REGIONS = new Set(['Hindi', 'Marathi', 'Gujarati', 'Punjabi']);

const KNOWN_LANGUAGES = ['Hindi', 'English', 'Hinglish', 'Marathi', 'Tamil', 'Telugu', 'Kannada', 'Bengali', 'Gujarati', 'Malayalam', 'Punjabi'];

const SLOTS = {
  salaried:      { when: 'Weekday evenings, 6–8 PM', why: 'Salaried — most reachable after office hours' },
  self_employed: { when: 'Weekdays, 11 AM–1 PM', why: 'Business owners pick up between the morning rush and lunch' },
  retired:       { when: 'Weekdays, 3–5 PM', why: 'Daytime availability; avoids early mornings and late evenings' },
  homemaker:     { when: 'Weekdays, 2–4 PM', why: 'Quieter post-lunch window' },
  student:       { when: 'Weekends, 12–2 PM', why: 'Outside class hours' },
  unknown:       { when: 'Weekday evenings, 6–8 PM', why: 'No occupation on the list — default to the highest-answer window' },
};

const PLANS = {
  hot:  { how: 'Direct voice call', warmup: null, maxAttempts: 3,
          why: 'Strong bureau + income fit — call first, while it still feels timely' },
  warm: { how: 'WhatsApp intro, then voice call', warmup: 'WhatsApp', maxAttempts: 2,
          why: 'A short intro first, so the call does not come from an unknown number' },
  cold: { how: 'SMS intro, then one voice call', warmup: 'SMS', maxAttempts: 1,
          why: 'Lower fit — keep cost down: one call after an SMS intro, then nurture' },
};

const BUCKETS = [
  { key: 'hot',  label: 'Hot',  rule: 'Fit score ≥ 65', band: 'high' },
  { key: 'warm', label: 'Warm', rule: 'Fit score 45–64', band: 'med' },
  { key: 'cold', label: 'Cold', rule: 'Fit score < 45', band: 'low' },
];

const EXCLUSION_LABELS = {
  invalid_phone: 'Invalid phone number',
  duplicate: 'Duplicate phone number',
  dnd: 'Marked Do-Not-Call on the list',
  below_cutoff: `CIBIL below ${CIBIL_CUTOFF} policy cutoff`,
};

const clamp01 = (n) => Math.max(0, Math.min(1, n));
const cleanText = (v) => (v == null ? '' : String(v).trim());

function normalizePhone(v) {
  let d = cleanText(v).replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}
const maskPhone = (p) => '••••••' + p.slice(-4);

function parseNumber(v) {
  const n = parseFloat(cleanText(v).replace(/[₹,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function normalizeOccupation(v) {
  const s = cleanText(v).toLowerCase();
  if (!s) return 'unknown';
  if (/self|business|owner|proprietor|entrepreneur|shop|trader/.test(s)) return 'self_employed';
  if (/salar|employ|service|job|engineer|manager|executive|private|govt|government/.test(s)) return 'salaried';
  if (/retir|pension/.test(s)) return 'retired';
  if (/home|house/.test(s)) return 'homemaker';
  if (/student/.test(s)) return 'student';
  return 'unknown';
}
const OCCUPATION_LABEL = { salaried: 'Salaried', self_employed: 'Self-employed', retired: 'Retired', homemaker: 'Homemaker', student: 'Student', unknown: 'Not on list' };

function isTruthyFlag(v) {
  return /^(y|yes|true|1|dnd|registered)$/i.test(cleanText(v));
}

/** Map raw rows (objects keyed by the list's own headers) onto known fields. */
function mapColumns(rows) {
  const headers = new Set();
  rows.forEach((r) => Object.keys(r).forEach((h) => headers.add(h)));
  const mapping = {}, ignored = [];
  for (const h of headers) {
    const field = HEADER_TO_FIELD[headerKey(h)];
    if (field && !Object.values(mapping).includes(field)) mapping[h] = field;
    else ignored.push(h);
  }
  const mapped = rows.map((r) => {
    const out = {};
    for (const [h, field] of Object.entries(mapping)) out[field] = r[h];
    return out;
  });
  return { mapped, detected: Object.entries(mapping).map(([column, field]) => ({ column, field })), ignored };
}

function inferLanguage(row, occupation) {
  const given = cleanText(row.language);
  const known = KNOWN_LANGUAGES.find((l) => l.toLowerCase() === given.toLowerCase());
  if (known) return { language: known, source: 'From the list' };
  const cityKey = headerKey(row.city);
  const state = cleanText(row.state) || CITY_STATE[cityKey] || '';
  const regional = STATE_LANGUAGE[headerKey(state)] || 'Hindi';
  const age = parseNumber(row.age);
  if (METROS.has(cityKey) && age != null && age < 35 && occupation === 'salaried') {
    return HINGLISH_REGIONS.has(regional)
      ? { language: 'Hinglish', source: `Inferred — young metro professional in ${cleanText(row.city)}` }
      : { language: 'English', source: `Inferred — young metro professional in ${cleanText(row.city)}` };
  }
  return { language: regional, source: state ? `Inferred from ${state}` : 'No location — defaulted to Hindi' };
}

function productFit(occupation, cibil, income) {
  const c = cibil == null ? 680 : cibil;
  if (occupation === 'self_employed') {
    return { need: 'Business Loan', why: 'Self-employed with a clean bureau record — working capital is the most common need' };
  }
  if (occupation === 'salaried') {
    if (c >= 750 && (income || 0) >= 60000) return { need: 'Credit Card', why: 'Prime CIBIL and high salary — fits a premium card' };
    if ((income || 0) >= 30000) return { need: 'Personal Loan', why: 'Salaried with steady income — personal loan is the easiest first product' };
    return { need: 'EMI', why: 'Entry-level salary — a small EMI facility is the low-risk first product' };
  }
  if (c >= 750) return { need: 'Credit Card', why: 'Strong CIBIL without salary data — start with a card at a modest limit' };
  return { need: 'EMI', why: 'Thin profile — a small EMI facility is the low-risk first product' };
}

/** Full analysis of a raw list. `voices` is the agent roster, `leadVoice` the chosen agent. */
function analyze(rawRows, leadVoice, voices) {
  const { mapped, detected, ignored } = mapColumns(rawRows);
  const seen = new Set();
  const leads = [], excluded = [];
  const missing = { cibil: 0, income: 0, occupation: 0, language: 0 };

  mapped.forEach((row, i) => {
    const name = cleanText(row.name) || `Prospect ${i + 1}`;
    const phone = normalizePhone(row.phone);
    const cibilRaw = parseNumber(row.cibil);
    const cibil = cibilRaw != null && cibilRaw >= 300 && cibilRaw <= 900 ? Math.round(cibilRaw) : null;
    const reject = (reason) => excluded.push({ row: i + 2, name, phoneMasked: phone ? maskPhone(phone) : cleanText(row.phone) ? 'invalid' : 'missing', reason, reasonLabel: EXCLUSION_LABELS[reason] });

    if (!phone) return reject('invalid_phone');
    if (seen.has(phone)) return reject('duplicate');
    seen.add(phone);
    if (isTruthyFlag(row.dnd)) return reject('dnd');
    if (cibil != null && cibil < CIBIL_CUTOFF) return reject('below_cutoff');

    const income = parseNumber(row.income);
    const occupation = normalizeOccupation(row.occupation);
    if (cibil == null) missing.cibil++;
    if (income == null) missing.income++;
    if (occupation === 'unknown') missing.occupation++;
    if (!cleanText(row.language)) missing.language++;

    const { language, source: languageSource } = inferLanguage(row, occupation);
    const { need, why } = productFit(occupation, cibil, income);
    const cibilN = cibil == null ? 0.3 : clamp01((cibil - CIBIL_CUTOFF) / 250);
    const incomeN = income == null ? 0.3 : clamp01(income / 150000);
    const present = [cibil != null, income != null, occupation !== 'unknown', !!(cleanText(row.city) || cleanText(row.state)), !!cleanText(row.language)];
    const completeness = present.filter(Boolean).length / present.length;
    const score = Math.round(cibilN * 55 + incomeN * 30 + completeness * 15);
    const bucket = score >= 65 ? 'hot' : score >= 45 ? 'warm' : 'cold';
    const eligibleAmount = calcEligibleAmount(need, incomeN, cibilN);

    // Which language to call in: the lead's own language when an agent speaks it,
    // otherwise English as the bridge language.
    const covered = voices.some((v) => v.languages.includes(language));
    const callLanguage = covered ? language : 'English';
    const agent = (leadVoice.languages.includes(callLanguage) ? leadVoice : voices.find((v) => v.languages.includes(callLanguage))) || leadVoice;
    const slot = SLOTS[occupation];
    const plan = PLANS[bucket];

    leads.push({
      id: 'COLD-' + (1001 + leads.length),
      mode: 'cold_sales',
      name, phone, phoneMasked: maskPhone(phone),
      city: cleanText(row.city) || cleanText(row.state) || 'Not on list',
      age: parseNumber(row.age),
      income, incomeDisplay: income == null ? 'Not on list' : formatAmount(Math.round(income)) + '/mo',
      occupation, occupationLabel: OCCUPATION_LABEL[occupation],
      cibil, cibilDisplay: cibil == null ? 'Pending bureau pull' : String(cibil),
      language, languageSource, callLanguage,
      score, bucket, band: BUCKETS.find((b) => b.key === bucket).band,
      need, why, signal: why,
      eligibleAmount, eligibleDisplay: formatAmount(eligibleAmount), eligibleLabel: NEEDS[need].label,
      eligibleTier: tierForAmount(need, eligibleAmount),
      existing: 'New to bank — no prior relationship',
      voiceId: agent.id,
      plan: { when: slot.when, whenWhy: slot.why, how: plan.how, howWhy: plan.why, warmup: plan.warmup, maxAttempts: plan.maxAttempts },
    });
  });

  const intake = {
    received: rawRows.length, valid: leads.length, excludedCount: excluded.length,
    detected, ignored, missing,
    excludedByReason: Object.keys(EXCLUSION_LABELS).map((reason) => ({ reason, label: EXCLUSION_LABELS[reason], count: excluded.filter((e) => e.reason === reason).length })),
    cutoff: CIBIL_CUTOFF,
  };
  return { leads, excluded, intake };
}

/** The Data Intelligence + Strategy view for a cold run. */
function pipelineView(leads, excluded, intake, leadVoice, voices) {
  const voiceName = (id) => (voices.find((v) => v.id === id) || leadVoice).name;
  const groups = new Map();
  for (const l of leads) {
    // Grouped by the prospect's own language (not the bridge language), so a
    // campaign of Tamil speakers stays one campaign even while it is called in English.
    const key = `${l.bucket}|${l.language}|${l.plan.when}`;
    if (!groups.has(key)) groups.set(key, { key, bucket: l.bucket, language: l.language, callLanguage: l.callLanguage, when: l.plan.when, how: l.plan.how, agent: voiceName(l.voiceId), count: 0 });
    groups.get(key).count += 1;
  }
  const order = { hot: 0, warm: 1, cold: 2 };
  const batches = [...groups.values()].sort((a, b) => order[a.bucket] - order[b.bucket] || b.count - a.count);

  return {
    mode: 'cold_sales',
    intake,
    validation: {
      tasks: [
        `Reading ${intake.received} rows and mapping ${intake.detected.length} recognised columns`,
        'Normalising phone numbers to 10-digit Indian mobiles',
        'Removing duplicate numbers',
        'Honouring the Do-Not-Call flag on the list',
        `Applying the CIBIL ${CIBIL_CUTOFF} policy cutoff`,
        'Inferring language from location where the list has none',
      ],
      note: 'In production the DND check runs against the TRAI NCPR registry; this demo only honours the DND column on the uploaded list.',
    },
    fit: {
      model: [
        { title: 'Inputs', body: 'Only what the list carries: CIBIL, monthly income, occupation, location. No bank relationship to read from.' },
        { title: 'Product fit', body: 'Occupation decides the product family; CIBIL and income decide the tier (e.g. prime salaried → premium card).' },
        { title: 'Fit score', body: 'CIBIL (55%) + income (30%) + how complete the row is (15%). Missing data lowers the score instead of guessing.' },
      ],
      rows: leads.map((l) => ({ id: l.id, name: l.name, phoneMasked: l.phoneMasked, cibilDisplay: l.cibilDisplay, incomeDisplay: l.incomeDisplay,
        occupationLabel: l.occupationLabel, need: l.need, why: l.why, eligibleDisplay: l.eligibleDisplay, score: l.score })),
    },
    buckets: {
      buckets: BUCKETS.map((b) => ({ ...b, plan: PLANS[b.key].how,
        rows: leads.filter((l) => l.bucket === b.key).sort((x, y) => y.score - x.score).map((l) => ({ id: l.id, name: l.name, score: l.score, need: l.need })) })),
      excluded,
    },
    contact: {
      rows: leads.map((l) => ({ id: l.id, name: l.name, phoneMasked: l.phoneMasked, bucket: l.bucket,
        language: l.language, languageSource: l.languageSource, callLanguage: l.callLanguage,
        when: l.plan.when, whenWhy: l.plan.whenWhy, how: l.plan.how, howWhy: l.plan.howWhy, maxAttempts: l.plan.maxAttempts,
        agent: voiceName(l.voiceId), need: l.need, eligibleDisplay: l.eligibleDisplay })),
      note: 'Every call slot sits inside the 9 AM–9 PM window allowed for promotional calls.',
    },
    batching: {
      batches,
      matchedLeads: leads.filter((l) => l.voiceId === leadVoice.id).length,
      totalLeads: leads.length,
      routedLeads: leads.filter((l) => l.voiceId !== leadVoice.id).length,
    },
  };
}

// A fictional sample list. It deliberately includes rows that must be excluded
// (a bad number, a duplicate, DND, low CIBIL) and rows with missing fields, so
// every validation rule has something to show.
const SAMPLE_FIRST = ['Aarav', 'Diya', 'Kabir', 'Ishita', 'Rohan', 'Meera', 'Vikram', 'Sneha', 'Arjun', 'Pooja', 'Nikhil', 'Ananya', 'Rahul', 'Kavya', 'Siddharth', 'Neha', 'Aditya', 'Priya', 'Karan', 'Tanvi'];
const SAMPLE_LAST = ['Sharma', 'Iyer', 'Kulkarni', 'Reddy', 'Banerjee', 'Patel', 'Nair', 'Singh', 'Menon', 'Joshi', 'Gupta', 'Rao'];
const SAMPLE_CITIES = ['Mumbai', 'Pune', 'Bengaluru', 'Chennai', 'Hyderabad', 'Delhi', 'Lucknow', 'Kolkata', 'Ahmedabad', 'Jaipur', 'Nagpur', 'Kochi'];
const SAMPLE_OCC = ['Salaried', 'Salaried', 'Salaried', 'Self-employed', 'Business owner', 'Retired', 'Homemaker', ''];

function sampleRows(count = 40) {
  const rand = seeded('cold-sample');
  const rows = [];
  for (let i = 0; i < count; i++) {
    const occ = pick(SAMPLE_OCC, rand);
    rows.push({
      'Customer Name': `${SAMPLE_FIRST[i % SAMPLE_FIRST.length]} ${SAMPLE_LAST[(i * 5) % SAMPLE_LAST.length]}`,
      'Mobile Number': '9' + String(800000000 + Math.floor(rand() * 199999999)).padStart(9, '0'),
      'CIBIL Score': rand() < 0.08 ? '' : String(660 + Math.floor(rand() * 200)),
      'City': pick(SAMPLE_CITIES, rand),
      'Age': String(23 + Math.floor(rand() * 40)),
      'Monthly Income': rand() < 0.1 ? '' : String(18000 + Math.floor(rand() * 40) * 4000),
      'Occupation': occ,
      'Preferred Language': rand() < 0.35 ? pick(['Hindi', 'English', 'Marathi', 'Tamil'], rand) : '',
      'DND': 'No',
    });
  }
  rows[5]['Mobile Number'] = '12345';                         // invalid
  rows[11]['Mobile Number'] = rows[3]['Mobile Number'];       // duplicate
  rows[17].DND = 'Yes';                                       // do-not-call
  rows[24].DND = 'Yes';
  rows[8]['CIBIL Score'] = '612';                             // below cutoff
  rows[29]['CIBIL Score'] = '585';
  rows[33]['CIBIL Score'] = '640';
  return rows;
}

module.exports = { analyze, pipelineView, sampleRows, normalizePhone, mapColumns, inferLanguage, CIBIL_CUTOFF, MAX_ROWS, ALIASES };
