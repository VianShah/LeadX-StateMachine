# LeadX — Lead to Revenue (live state-machine demo)

An Express app that replaces the old static `leadx_e2e_pipeline_5.html` with a
server-driven demo. Flow, modelled on the Kollect booth demo:

1. **Welcome** — capture the visitor's name.
2. **Intro** — a seven-beat cinematic sequence (Data Intelligence → Strategy →
   Execution → Fulfilment). Tap to advance, or skip. Text only for now.
3. **Voice selection** — an orb carousel with three agents: **Maya**, **Ria**,
   **Vijay**. Previews are spoken in-browser (Web Speech API) until real
   recordings are added.
4. **State machine** — a campaign of leads is dispatched by the server and
   moves through the next-best-action state machine live. Every transition is
   streamed to the browser over SSE.

Calls are **simulated** (no telephony provider yet). The chosen voice changes
the outcome mix: each persona has its own connect rate and intent bias, and a
voice that speaks the lead's language gets a small boost to high intent.

## Run

```bash
npm install
cp .env.example .env   # optional — every value has a default
npm run dev            # http://localhost:3001
npm test
```

`STEP_DELAY_MS` controls pacing (default 1100 ms per step; lower it for a faster demo).

## Layout

```
server/
  index.js              Express app (exports `app`; listens only when run directly)
  config.js             Env-driven settings
  voiceCatalog.js       Maya / Ria / Vijay personas + intent profiles
  lib/stateMachine.js   STATES, EDGES and decide() — the whole machine, as data + one pure function
  lib/leads.js          Seeded lead generation + eligibility scoring (ported from the old HTML)
  lib/runner.js         Dispatches leads with bounded concurrency, emits one event per transition
  lib/rng.js            Seeded RNG so runs are reproducible
  routes/api.js         /api/voices, /api/machine, /api/runs, /api/runs/:id, /api/runs/:id/events (SSE)
  test/                 State-machine invariants + API/SSE integration test
public/
  index.html, css/, js/ Vanilla JS front end; the graph is drawn from GET /api/machine
legacy/                 The original static HTML, kept for reference only
```

The front end renders states and edges from `GET /api/machine`, so adding a
state in `stateMachine.js` (plus a position in `LAYOUT` in `public/js/machine.js`)
shows it in the UI.

## State machine

`queued → dialing →` one of `not_connected` (retry up to 3 calls, then SMS
fallback), `wrong_party` (flag data), `opt_out` (suppress), or an intent level
`low` (SMS/WhatsApp nurture) / `medium` (WhatsApp confirm) / `high` (LeadX+
in-app handoff) — each ending in `won` or `lost`. `server/test/` asserts every
transition the engine can emit is a declared edge and that every lead terminates.

## Not done yet

- Voice recordings for Maya/Ria/Vijay (set `sampleAudio` in `voiceCatalog.js`).
- Intro voiceover.
- Real outbound calls (the Kollect repo's VOIZ client/poller is the model for this).
- Maya/Ria/Vijay languages and styles in `voiceCatalog.js` are placeholders — adjust to the real agents.
