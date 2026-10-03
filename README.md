# LeadX — Lead to Revenue (live state-machine demo)

An Express app that replaces the old static `leadx_e2e_pipeline_5.html` with a
server-driven demo. Flow, modelled on the Kollect booth demo:

1. **Welcome** — capture the visitor's name.
2. **Intro** — a seven-beat cinematic sequence (Data Intelligence → Strategy →
   Execution → Fulfilment). Tap to advance, or skip. Text only for now.
3. **Campaign type** — **Cross-sell** (existing customers, read from the bank's
   systems) or **Cold sales** (a new prospect list uploaded as Excel/CSV).
4. **Voice selection** — an orb carousel with three agents: **Maya**, **Ria**,
   **Vijay**. Previews are spoken in-browser (Web Speech API) until real
   recordings are added. In cold sales this is the lead agent; prospects in a
   language it doesn't speak are routed to the agent who does.
5. **Pipeline** — four stages, mirroring the original static demo, all driven by
   the server for this run's leads and chosen voice. For **cross-sell**:
   - **Data Intelligence** — fetching (AA / CRM / CIBIL), processing,
     cross-sell opportunity identification, eligibility buckets.
   - **Strategy Building** — a per-customer personalized pitch, and persona
     batching (language × product) that shows how many leads the chosen voice speaks.
   - **Execution** — launch the campaign and watch the next-best-action state
     machine live; every transition streams to the browser over SSE.
   - **Fulfilment** — the in-app journey (link opened → KYC → mandate), with the
     four friction points, the fix built into each, and live counts of how often
     each was hit, recovered or dropped.

   For **cold sales**, Data Intelligence and Strategy change (Execution and
   Fulfilment are shared):
   - **Upload list** — `.xlsx` or `.csv`, up to 1,000 rows. Only name and phone
     are required; column names are matched loosely ("Mobile No.", "CIBIL Score",
     "Monthly Salary"…). A fictional sample list is built in, and downloadable
     from `/api/cold/sample.csv` as a template.
   - **Validation** — phones normalised to 10-digit Indian mobiles; invalid,
     duplicate, DND-flagged and below-CIBIL-cutoff (650) rows excluded, each with
     its reason.
   - **Product fit** — occupation picks the product family, CIBIL + income the
     tier and indicative amount; fit score = CIBIL 55% + income 30% + completeness 15%.
   - **Buckets** — Hot (≥ 65), Warm (45–64), Cold (< 45).
   - **Contact strategy** — per prospect: *when* (from occupation, always inside
     9 AM–9 PM), *how* (Hot: direct call, 3 attempts · Warm: WhatsApp intro then
     call, 2 · Cold: SMS intro then one call) and *which language* (from the list,
     else inferred from city/state and age; English as the bridge language when
     no agent speaks it).
   - **Campaigns** — bucket × language × time slot, each with its agent.

   In the state machine, cold prospects with an intro go `queued → warmup →
   dialing`, each bucket keeps to its attempt budget, and a cold list connects
   less often and converts less than existing customers.

   Raw phone numbers stay on the server; the browser only ever sees them masked.

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
  lib/pipeline.js       Data Intelligence + Strategy content for a run (fetch, process, opportunities, eligibility, pitch, batching)
  lib/fulfilment.js     Friction slides: where in-app journeys break and the fix for each (per mode)
  lib/cold.js           Cold sales: column mapping, validation, product fit, buckets, contact plan, sample list
  lib/listParser.js     .xlsx (exceljs) and .csv parsing for uploaded lists
  lib/runner.js         Dispatches leads with bounded concurrency, emits one event per transition
  lib/rng.js            Seeded RNG so runs are reproducible
  routes/api.js         /api/voices, /api/machine, POST /api/runs (mode: cross_sell | cold_sales),
                        POST /api/runs/upload, GET /api/runs/:id[/pipeline|/events (SSE)],
                        POST /api/runs/:id/launch, GET /api/cold/sample.csv
  test/                 State-machine invariants, cold-list analysis, API/SSE integration
public/
  index.html, css/, js/ Vanilla JS front end; the graph is drawn from GET /api/machine
legacy/                 The original static HTML, kept for reference only
```

The front end renders states and edges from `GET /api/machine`, so adding a
state in `stateMachine.js` (plus a position in `LAYOUT_EXEC` or `LAYOUT_FUL` in `public/js/machine.js`)
shows it in the UI.

## State machine

A run is created first (leads generated, nothing dispatched); the campaign only
starts when launched from the Execution tab.

`queued → dialing →` one of `not_connected` (retry up to 3 calls, then SMS
fallback), `wrong_party` (flag data), `opt_out` (suppress), or an intent level
`low` (SMS/WhatsApp nurture) / `medium` (WhatsApp confirm) / `high` (LeadX+
in-app handoff). Both `medium` (after the WhatsApp confirmation) and `high` continue
through the Fulfilment chain `inapp_handoff → kyc_check → mandate_setup → won`; each
leg can hit friction, which the built-in fix usually recovers, and can drop to `lost`. `server/test/` asserts every
transition the engine can emit is a declared edge and that every lead terminates.

## Not done yet

- Voice recordings for Maya/Ria/Vijay (set `sampleAudio` in `voiceCatalog.js`).
- Intro voiceover.
- The Fulfilment tab does not yet include the old demo's scripted call-to-in-app phone mockup.
- Real outbound calls (the Kollect repo's VOIZ client/poller is the model for this).
- Maya/Ria/Vijay languages and styles in `voiceCatalog.js` are placeholders — adjust to the real agents.
- Cold sales: the DND check only honours the list's own DND column — production needs the TRAI NCPR registry.
  Only Hindi, Hinglish, English and Marathi have agents; other languages fall back to English.
