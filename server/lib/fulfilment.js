// Fulfilment — where digital lending journeys usually break, and the fix built
// into this one. Copy ported from the original static demo. `step` ties each
// slide to the `friction.step` the state machine emits (stateMachine.js), so the
// UI can show live counts of how often each friction point was hit and fixed.
const SLIDES = [
  {
    step: 'intent_call',
    eyebrow: 'Step 01 — Before the click',
    title: 'A mass SMS blast, sent with no read on intent',
    body: "This is what's done today: the same application link goes out to the entire base by SMS, regardless of whether that customer has any real reason to act right now. There's nothing prompting a click, so almost nobody does.",
    fix: 'A measured-intent call comes first — the agent qualifies real interest live, and the link only goes out once someone is actually engaged. Customers are 37% more likely to complete the journey this way.',
  },
  {
    step: 'open_link',
    eyebrow: 'Step 02 — Opening the link',
    title: 'A big form, and a need that goes unheard',
    body: "The link opens straight into a long form asking for information the bank already has — forcing the customer to manually re-enter it. And if what the customer actually wants shifts here (a higher amount, a different product), there's nowhere for that to go. The need feels disconnected, and the loop breaks.",
    fix: 'Fields auto-fill from the existing bank relationship (AA + CRM). And because the agent is still on the line, any change in what the customer wants gets negotiated live — toward a resolution — instead of hitting a dead end.',
  },
  {
    step: 'kyc',
    eyebrow: 'Step 03 — Verification',
    title: 'KYC fails on conditions, not just consent',
    body: 'Verification breaks down for reasons that have nothing to do with willingness — patchy internet, a crowded or noisy place, a camera permission the customer didn\'t realize they needed to grant. Each failed attempt quietly erodes confidence in the whole process.',
    fix: 'The agent briefs the customer before KYC starts — find a quiet, well-lit spot, check the connection, allow camera access — so the environment is ready before the step begins, not discovered as a failure mid-way.',
  },
  {
    step: 'mandate',
    eyebrow: 'Step 04 — Setting up repayment',
    title: 'Mandate setup breaks, and the whole thing restarts',
    body: "The OTP itself isn't the problem — customers are used to entering it. The real drop-off is when auto-pay mandate setup errors out (bank timeout, UPI mismatch) and the application resets from scratch, leaving the customer confused and too fatigued to redo it all.",
    fix: 'On a mandate error, the agent reassures the customer and offers alternatives — retry, switch UPI app, or finish the mandate later — while keeping the rest of the application intact. Never a hard restart.',
  },
];

// Cold sales has no bank relationship to pre-fill from, so the Step 02 fix is
// different: consent-based data pull at the form instead of AA + CRM auto-fill.
const COLD_OVERRIDES = {
  intent_call: {
    body: 'This is what usually happens with a bought or partner list: the same link goes out by SMS to every number on it, from a sender the person has never heard of. Most ignore it; many mark it as spam.',
    fix: 'A short warm-up message first, then a call in the right language at the right time slot — the link only goes out once the person has said yes on the call.',
  },
  open_link: {
    body: 'A new-to-bank prospect has nothing on file, so the form asks for everything — income, employer, address, documents — and that long list is exactly where cold leads drop off.',
    fix: 'The agent asks for consent to fetch income and bank data through the Account Aggregator right inside the form, so most fields fill themselves; changes in what they want are negotiated live on the call.',
  },
};

function slidesFor(mode) {
  if (mode !== 'cold_sales') return SLIDES;
  return SLIDES.map((s) => (COLD_OVERRIDES[s.step] ? { ...s, ...COLD_OVERRIDES[s.step] } : s));
}

module.exports = { SLIDES, slidesFor };
