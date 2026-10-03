// The LeadX next-best-action state machine.
//
// Everything about the machine lives here as data (STATES, EDGES) plus one
// pure function (decide) that picks a lead's next transition. The runner
// (runner.js) just calls decide() repeatedly; the frontend renders STATES and
// EDGES straight from GET /api/machine, so adding a state here shows up in
// the UI with no frontend change.
//
// Ported from legacy/leadx_e2e_pipeline_5.html (NBA_MAP + buildRoundFlow),
// with outcomes now sampled per call instead of hash-assigned, and with the
// chosen agent voice influencing intent (see voiceCatalog.js `profile`).
const { seeded, pick } = require('./rng');

const MAX_CALL_ATTEMPTS = 3;

// kind: 'pipeline' (in flight) | 'outcome' (what the call revealed) |
//       'action' (a next-best-action being carried out) | 'terminal'
const STATES = {
  queued:        { label: 'Queued',           kind: 'pipeline', color: '#5D7089', nba: 'Waiting for a free agent slot' },
  dialing:       { label: 'On call',          kind: 'pipeline', color: '#8CA0B8', nba: 'Agent is on the line — listening for intent' },

  not_connected: { label: 'Not connected',    kind: 'outcome',  color: '#5D7089', nba: 'Retry at a different time slot (up to 2 more attempts), then fall back to SMS' },
  wrong_party:   { label: 'Wrong party',      kind: 'outcome',  color: '#D98B7B', nba: 'Flag contact for data verification, pull from this campaign until confirmed' },
  opt_out:       { label: 'Opted out',        kind: 'outcome',  color: '#B33A3A', nba: 'Full suppression — no further contact on any channel, per explicit request' },
  low:           { label: 'Low intent',       kind: 'outcome',  color: '#8C93E8', nba: 'Suppress from voice for 30 days, move to SMS/WhatsApp nurture' },
  medium:        { label: 'Medium intent',    kind: 'outcome',  color: '#4FADA0', nba: 'Confirm on WhatsApp, then close in-app with one confirmation step' },
  high:          { label: 'High intent',      kind: 'outcome',  color: '#C9A24B', nba: 'Hand to the LeadX+ in-app agent — completes end-to-end, no human handoff' },

  sms_fallback:  { label: 'SMS fallback',     kind: 'action',   color: '#5D7089', nba: 'Offer link sent by SMS because voice failed repeatedly' },
  data_flagged:  { label: 'Data flagged',     kind: 'action',   color: '#D98B7B', nba: 'Contact record flagged for verification' },
  suppressed:    { label: 'Suppressed',       kind: 'action',   color: '#B33A3A', nba: 'Opt-out honored across all channels' },
  nurture_sms:   { label: 'Nurture · SMS',    kind: 'action',   color: '#8C93E8', nba: 'Low-key SMS nurture after a cooling-off period' },
  nurture_wa:    { label: 'Nurture · WhatsApp', kind: 'action', color: '#8C93E8', nba: 'One soft WhatsApp check-in, then close the cycle' },
  wa_confirm:    { label: 'WhatsApp confirm', kind: 'action',   color: '#4FADA0', nba: 'Confirmation message with the application link' },
  inapp_handoff: { label: 'In-app handoff',   kind: 'action',   color: '#C9A24B', nba: 'LeadX+ agent guiding the application in-app — form auto-filled from AA + CRM' },
  kyc_check:     { label: 'KYC verification', kind: 'action',   color: '#C9A24B', nba: 'Agent briefs the customer before KYC so the environment is ready' },
  mandate_setup: { label: 'Mandate setup',    kind: 'action',   color: '#C9A24B', nba: 'Auto-pay mandate with retry / switch-UPI / finish-later fallbacks — never a hard restart' },

  won:           { label: 'Won',              kind: 'terminal', color: '#34d399', nba: 'Converted — application and mandate completed' },
  lost:          { label: 'Lost',             kind: 'terminal', color: '#f56565', nba: 'Cycle closed without conversion' },
};

// Every transition decide() can emit. `event` is the label shown on the edge.
const EDGES = [
  { from: 'queued',        to: 'dialing',       event: 'dispatch' },
  { from: 'dialing',       to: 'not_connected', event: 'no answer' },
  { from: 'dialing',       to: 'wrong_party',   event: 'wrong person' },
  { from: 'dialing',       to: 'opt_out',       event: 'asked to stop' },
  { from: 'dialing',       to: 'low',           event: 'intent scored' },
  { from: 'dialing',       to: 'medium',        event: 'intent scored' },
  { from: 'dialing',       to: 'high',          event: 'intent scored' },
  { from: 'not_connected', to: 'dialing',       event: 'retry' },
  { from: 'not_connected', to: 'sms_fallback',  event: 'retries exhausted' },
  { from: 'sms_fallback',  to: 'lost',          event: 'awaiting self-serve' },
  { from: 'wrong_party',   to: 'data_flagged',  event: 'halt outreach' },
  { from: 'data_flagged',  to: 'lost',          event: 'data-quality flag' },
  { from: 'opt_out',       to: 'suppressed',    event: 'suppress' },
  { from: 'suppressed',    to: 'lost',          event: 'opt-out honored' },
  { from: 'low',           to: 'nurture_sms',   event: 'nurture' },
  { from: 'nurture_sms',   to: 'nurture_wa',    event: 'no response' },
  { from: 'nurture_wa',    to: 'lost',          event: 'cycle exhausted' },
  { from: 'medium',        to: 'wa_confirm',    event: 'confirm on WhatsApp' },
  { from: 'wa_confirm',    to: 'inapp_handoff', event: 'confirmed, hand to LeadX+' },
  { from: 'wa_confirm',    to: 'lost',          event: 'no reply' },
  { from: 'high',          to: 'inapp_handoff', event: 'hand to LeadX+' },
  { from: 'inapp_handoff', to: 'kyc_check',     event: 'form completed' },
  { from: 'inapp_handoff', to: 'lost',          event: 'abandoned the form' },
  { from: 'kyc_check',     to: 'mandate_setup', event: 'KYC verified' },
  { from: 'kyc_check',     to: 'lost',          event: 'KYC failed' },
  { from: 'mandate_setup', to: 'won',           event: 'mandate set' },
  { from: 'mandate_setup', to: 'lost',          event: 'mandate dropped' },
];

const SENTIMENT = {
  high:   ['Asked how soon it can be activated', 'Confirmed interest, wants next steps', 'Positive tone, asked for the documentation list'],
  medium: ['Interested but wants to think it over', 'Asked to compare against their current product', 'Neutral tone, asked for a callback later'],
  low:    ['Not interested at this time', 'Raised a concern about rate / fees', 'Said it is not a priority right now'],
  opt_out: ['Asked not to be contacted again', 'Wants zero further contact, on any channel'],
};

const BAND_MIX = {
  high: { high: 0.55, medium: 0.30, low: 0.15 },
  med:  { high: 0.30, medium: 0.45, low: 0.25 },
  low:  { high: 0.12, medium: 0.38, low: 0.50 },
};

const OPT_OUT_RATE = 0.06;
const WRONG_PARTY_RATE = 0.06;
const WA_CONFIRM_RATE = 0.8;
// Fulfilment: each in-app step hits friction some of the time; the built-in
// fix recovers most of those, and the rest drop off (see fulfilment.js).
const FRICTION_RATE = 0.3;
const FIX_RECOVERY_RATE = 0.8;

function friction(rand, step) {
  if (rand() >= FRICTION_RATE) return null;
  return { step, outcome: rand() < FIX_RECOVERY_RATE ? 'recovered' : 'dropped' };
}

/** Probability of each intent level for this lead + voice, summing to 1. */
function intentMix(lead, voice) {
  const mix = { ...BAND_MIX[lead.band] };
  const bias = (voice && voice.profile && voice.profile.intentBias) || {};
  for (const k of Object.keys(mix)) mix[k] += bias[k] || 0;
  // Language match: the agent speaks the lead's language, so intent skews up.
  const matched = !!(voice && voice.languages && voice.languages.includes(lead.language));
  if (matched) { mix.high += 0.08; mix.low -= 0.06; }
  for (const k of Object.keys(mix)) mix[k] = Math.max(0.02, mix[k]);
  const total = mix.high + mix.medium + mix.low;
  for (const k of Object.keys(mix)) mix[k] /= total;
  return { mix, languageMatch: matched };
}

function sample(mix, r) {
  if (r < mix.high) return 'high';
  if (r < mix.high + mix.medium) return 'medium';
  return 'low';
}

/**
 * Decide a lead's next transition.
 *   state:  the lead's current state key
 *   ctx:    { lead, voice, seed, attempt }  (attempt = calls placed so far)
 * Returns { to, event, channel, action, signal, insight, weight } where
 * `weight` scales the step delay (a call takes longer than a message).
 * Returns null from a terminal state.
 */
function decide(state, ctx) {
  const { lead, voice, seed, attempt } = ctx;
  const rand = seeded('step', seed, lead.id, state, attempt);
  const need = `${lead.need} (${lead.eligibleDisplay})`;

  switch (state) {
    case 'queued':
      return { to: 'dialing', event: 'dispatch', channel: 'Voice', weight: 0.4,
        action: `${voice.name} dials ${lead.name} (${lead.language}) — attempt ${attempt + 1}`,
        signal: `Pitching ${need}`, insight: `Persona ${voice.name} · ${voice.lang}` };

    case 'dialing': {
      const rate = voice.profile && voice.profile.connectRate;
      const connectRate = typeof rate === 'number' ? rate : 0.8;
      if (rand() > connectRate) {
        return { to: 'not_connected', event: 'no answer', channel: 'Voice', weight: 2.2,
          action: 'Attempted the call', signal: 'No answer after 6 rings',
          insight: 'Unreachable at this time of day' };
      }
      if (rand() < WRONG_PARTY_RATE) {
        return { to: 'wrong_party', event: 'wrong person', channel: 'Voice', weight: 2.2,
          action: 'Called the number on file', signal: 'Different person answered, not the account holder',
          insight: 'Contact data is unreliable for this lead' };
      }
      if (rand() < OPT_OUT_RATE) {
        return { to: 'opt_out', event: 'asked to stop', channel: 'Voice', weight: 2.6,
          action: `Pitched ${need}`, signal: pick(SENTIMENT.opt_out, rand),
          insight: 'Wants zero further contact, on any channel' };
      }
      const { mix, languageMatch } = intentMix(lead, voice);
      const level = sample(mix, rand());
      const insights = {
        high: 'High affinity, likely to convert with the right handoff',
        medium: 'Interested, but needs a light nudge rather than a hard close',
        low: 'Low urgency, not a rate or trust objection',
      };
      return { to: level, event: 'intent scored', channel: 'Voice', weight: 3,
        action: `Called and pitched ${need}`, signal: pick(SENTIMENT[level], rand),
        insight: insights[level] + (languageMatch ? ` · ${voice.name} spoke ${lead.language}` : '') };
    }

    case 'not_connected':
      if (attempt < MAX_CALL_ATTEMPTS) {
        return { to: 'dialing', event: 'retry', channel: 'Voice', weight: 1,
          action: 'Retrying at a different time slot', signal: `Attempt ${attempt + 1} of ${MAX_CALL_ATTEMPTS}`,
          insight: 'Unreachable on the previous attempt' };
      }
      return { to: 'sms_fallback', event: 'retries exhausted', channel: 'SMS', weight: 1,
        action: 'Sent the offer link since voice failed repeatedly', signal: 'Delivered',
        insight: 'Best-effort fallback channel engaged' };
    case 'sms_fallback':
      return { to: 'lost', event: 'awaiting self-serve', channel: 'SMS', weight: 0.8,
        action: 'Closed the cycle', signal: 'Never reached live; fallback SMS sent',
        insight: 'Lost — voice never connected' };

    case 'wrong_party':
      return { to: 'data_flagged', event: 'halt outreach', channel: 'CRM', weight: 0.8,
        action: 'Halted outreach, flagged for data verification', signal: 'Contact pulled from campaign',
        insight: 'Data-quality flag rather than a rejection' };
    case 'data_flagged':
      return { to: 'lost', event: 'data-quality flag', channel: 'CRM', weight: 0.6,
        action: 'Closed the cycle', signal: 'Awaiting verified contact details',
        insight: 'Lost — data-quality issue, not a rejection' };

    case 'opt_out':
      return { to: 'suppressed', event: 'suppress', channel: 'All channels', weight: 0.8,
        action: 'Full suppression applied', signal: 'Explicit opt-out recorded',
        insight: 'Honored immediately across every channel' };
    case 'suppressed':
      return { to: 'lost', event: 'opt-out honored', channel: 'All channels', weight: 0.6,
        action: 'Closed the cycle', signal: 'No further contact',
        insight: 'Lost — explicit opt-out honored' };

    case 'low':
      return { to: 'nurture_sms', event: 'nurture', channel: 'SMS', weight: 1,
        action: 'Suppressed from voice, sent a low-key nurture SMS', signal: 'Delivered, no response',
        insight: 'Still not engaging on this channel' };
    case 'nurture_sms':
      return { to: 'nurture_wa', event: 'no response', channel: 'WhatsApp', weight: 1,
        action: 'Sent a soft WhatsApp check-in', signal: 'Delivered, no response',
        insight: 'Contact strategy exhausted for this cycle' };
    case 'nurture_wa':
      return { to: 'lost', event: 'cycle exhausted', channel: 'WhatsApp', weight: 0.6,
        action: 'Closed the cycle', signal: 'No engagement',
        insight: 'Lost — nurture cycle exhausted with no live conversion' };

    case 'medium':
      return { to: 'wa_confirm', event: 'confirm on WhatsApp', channel: 'WhatsApp', weight: 1,
        action: 'Sent a confirmation message with the application link', signal: 'Delivered and read',
        insight: 'Engaged with the reminder' };
    case 'wa_confirm':
      if (rand() < WA_CONFIRM_RATE) {
        return { to: 'inapp_handoff', event: 'confirmed, hand to LeadX+', channel: 'LeadX+ Agent', weight: 1.2,
          action: 'Confirmed on WhatsApp, handed to the LeadX+ in-app agent', signal: 'Confirmed',
          insight: 'One confirmation step done — ready to self-serve' };
      }
      return { to: 'lost', event: 'no reply', channel: 'WhatsApp', weight: 1.2,
        action: 'Waited for confirmation', signal: 'No reply to the confirmation',
        insight: 'Lost — confirmation never came back' };

    case 'high':
      return { to: 'inapp_handoff', event: 'hand to LeadX+', channel: 'LeadX+ Agent', weight: 1,
        action: 'Handed to the LeadX+ in-app agent, application link sent', signal: 'Link sent only after live intent was confirmed',
        insight: 'High affinity, ready to self-serve' };

    case 'inapp_handoff': {
      const f = friction(rand, 'open_link');
      if (f && f.outcome === 'dropped') {
        return { to: 'lost', event: 'abandoned the form', channel: 'In-app', weight: 1.4, friction: f,
          action: 'Opened the link to a long form', signal: 'Abandoned the form',
          insight: 'Lost — the changed need had nowhere to go' };
      }
      return { to: 'kyc_check', event: 'form completed', channel: 'In-app', weight: 1.4, friction: f,
        action: 'Form auto-filled from the AA + CRM relationship',
        signal: f ? 'Customer wanted a different amount — negotiated live on the call' : 'Opened the link, nothing to re-enter',
        insight: f ? 'Friction recovered by the built-in fix' : 'Clean pass' };
    }

    case 'kyc_check': {
      const f = friction(rand, 'kyc');
      if (f && f.outcome === 'dropped') {
        return { to: 'lost', event: 'KYC failed', channel: 'In-app', weight: 1.4, friction: f,
          action: 'KYC attempted', signal: 'Repeated failures (connection, light, camera permission)',
          insight: 'Lost — confidence eroded after failed attempts' };
      }
      return { to: 'mandate_setup', event: 'KYC verified', channel: 'In-app', weight: 1.4, friction: f,
        action: f ? 'Agent briefed the customer on a quiet, well-lit spot — KYC retried' : 'Identity verified first time',
        signal: f ? 'First KYC attempt failed (low light)' : 'KYC verified',
        insight: f ? 'Friction recovered by the built-in fix' : 'Clean pass' };
    }

    case 'mandate_setup': {
      const f = friction(rand, 'mandate');
      if (f && f.outcome === 'dropped') {
        return { to: 'lost', event: 'mandate dropped', channel: 'In-app', weight: 1.4, friction: f,
          action: 'Auto-pay mandate setup', signal: 'Errored, and the customer disengaged',
          insight: 'Lost — fatigue after a mandate error' };
      }
      return { to: 'won', event: 'mandate set', channel: 'In-app', weight: 1.4, friction: f,
        action: f ? 'Mandate errored — agent offered a UPI switch and kept the application intact' : 'Auto-pay mandate set up',
        signal: f ? 'Bank timeout on the first attempt' : 'Mandate registered',
        insight: 'Won — application and mandate completed, no human handoff' };
    }

    default:
      return null; // won / lost are terminal
  }
}

function isTerminal(state) {
  return !!STATES[state] && STATES[state].kind === 'terminal';
}

function definition() {
  return {
    states: Object.entries(STATES).map(([key, s]) => ({ key, ...s })),
    edges: EDGES,
    maxCallAttempts: MAX_CALL_ATTEMPTS,
  };
}

module.exports = { STATES, EDGES, MAX_CALL_ATTEMPTS, decide, isTerminal, definition, intentMix };
