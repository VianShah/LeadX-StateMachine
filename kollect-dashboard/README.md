# Kollect Dashboard (by Predixion AI)

Next.js 15 + Tailwind 4 + Recharts collections command center. Six modules (Home, Performance, Borrowers,
Channels, Call Audit, Usage) plus a Data page for Excel import.

```bash
cd kollect-dashboard && npm install && npm run dev   # http://localhost:3000
```

Demo logins (password `kollect123`): `admin`, `supervisor`, `operator`, `client` (pinned to "Alpha NBFC").

## Data flow
- **Mock first**: a seeded generator (`lib/mock.ts`) populates the in-memory server store (`lib/store.ts`, persisted to `data/store.json`).
- **Excel**: Data page → download template → upload. Sheets `Borrowers`, `Calls`, `Agents`; headers matched by alias (`lib/excel.ts`).
- **Live API**: `POST /api/ingest/events` (header `x-api-key: $INGEST_KEY`) accepts call events and agent live/max counts. Channels polls every 5s.
- **Fallback**: if the API is unreachable, pages compute from a local copy of the mock and keep actions in browser state.

## Role access
| Role | Modules | Actions |
|---|---|---|
| admin | all + Data | everything |
| supervisor | all except Data | send link, escalate, edit capacity, hide calls |
| operator | Home, Borrowers, Call Audit | send link, escalate |
| client | Home, Performance, Borrowers, Usage (own portfolio, visible calls only) | none |

Auth is demo-grade (hardcoded users, signed cookie). Replace `lib/auth.ts` with SSO/JWT and the store with a database for production.
