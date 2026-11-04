# Stockyllix API

Node / Express / TypeScript. It checks every Firebase ID token and runs every game rule in Firestore transactions. The client cannot set balances, prices, rates or time. Production runs at `https://stockyllix-api.onrender.com/api`; `/health` shows the version, release and deployed commit.

## Where things are

| Folder | Responsibility |
| --- | --- |
| `src/domain` | Pure rules: reserving and executing orders, valuation, weekly MDD and scoring, the clock target |
| `src/services` | `GameService` (players, orders, clock jobs, rankings), `WorldClockService` (saved 1× clock and admin controls), quiz, performance, watchlist, profile, Bank of Israel reference rate, test simulations |
| `src/world` | Trading sessions, datasets and events, dataset loading, the historical and simulated builders, ECB/BOI rate parsing |
| `src/api/app.ts` | Routes, input validation (zod), authentication, admin checks, the test-realm header, rate limits and error format |
| `src/data` | The store interface, the Firestore adapter, the in-memory test store and the test-realm prefix |
| `src/scripts` | Seeding, the local smoke test, the 1,000-player load test and the private data importers |

## Commands

From this folder, with Node 26.13.0 (Java 21 only for the emulator suite):

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npx firebase emulators:exec --only auth,firestore --project demo-stockyllix --config ../firebase.json "npm run test:emulator"
```

| Script | Purpose |
| --- | --- |
| `npm run dev` | Run the API with reload (needs `.env`, see the runbook) |
| `npm run seed:local` / `npm run smoke:local` | Create emulator-only accounts, then place and execute one order over HTTP |
| `npm run test:load` | Time a 1,000-player week on the in-memory store (engine only, not cloud capacity) |
| `npm run import:ecb` | Prepare the fixed ECB rates for the older simulated world (also part of the Render build) |
| `npm run import:boi` | Stage the Bank of Israel history used by the historical dataset |
| `npm run import:yahoo` | Build the private historical dataset from the private yfinance report, calendar and BOI rates |

Local setup, configuration, deployment and recovery are in the [runbook](../docs/runbook.md). Never commit `.env`, keys, private datasets or seeds.
