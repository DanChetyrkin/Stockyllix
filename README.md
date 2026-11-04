# Stockyllix

An educational portfolio league built with Expo, React Native, TypeScript, Express, Firebase Authentication and Firestore. Start with **₪1,000,000**, submit shekel-denominated orders, and compare weekly return and maximum drawdown.

**Play in your browser:** [stockyllix.web.app](https://stockyllix.web.app). The same link works on a phone without installing an app.

**Reviewer administrator:** `admin@stockyllix.com`. Ask the project owner for the password. Administrators can advance the shared clock and reset the demonstration world; ordinary players cannot.

**Data disclosure:** instrument names are real; stock prices are simulated. USD/ILS uses historical ECB reference rates downloaded separately. The shared world replays October 5–30, 2026, with November 2 as an execution buffer. It is not a live trading feed. No real money is involved.

## What works in the implementation

- One Expo app for browser and mobile, with email/password authentication.
- Server-owned balances, reservations, execution prices, currency conversion and clock.
- Twenty instruments, ten from each market, fractional units and pending orders.
- A 20% concentration limit, no leverage, no short selling and no cancellation.
- Weekly return/MDD scoring, archived leaderboards and a personal daily review.
- Resumable clock jobs, atomic updates, request deduplication and administrator access.
- Your supplied logo, grouped navigation, private profile photo/name, and persisted Auto/Light/Dark appearance.
- A financial quiz that changes with the shared game day, private price targets, revealed-price charts and reversible daily-change/name sorting.
- A How to play guide, compact game-status details and explicit paused/loading/error states.
- Realized/unrealized ILS profit using weighted average cost, plus same-period simulated SPY comparison. Nothing is annualized.

The public Web app uses Firebase Authentication and the Render API at `https://stockyllix-api.onrender.com/api`. Hosting, static files, internal routes and administrator sign-in have been checked in the cloud. See [verification](docs/verification.md) for measured checks and remaining limits.

The authenticated `/api/reference/fx` endpoint separately fetches the latest published Bank of Israel representative rate; it is not an intraday quote or the replay's execution rate. A historical stock importer is prepared for Twelve Data, but no provider key, full market coverage or public-display rights have been verified. The active game still uses simulated stocks and historical ECB FX.

## Run locally on Windows

Use Node **26.13.0** and Java **21** for the Firestore emulator. Run commands from this checkout; quote paths containing spaces.

```powershell
Set-Location -LiteralPath "C:\Users\danch\OneDrive\Desktop\House of Finance Project\Stockyllix\server"
npm ci
if (-not (Test-Path -LiteralPath ".env")) { Copy-Item -LiteralPath ".env.example" -Destination ".env" }
npm run import:ecb
```

Set `DATASET_SEED` in `server/.env` to a private random value. Keep the emulator settings and `FIREBASE_PROJECT_ID=demo-stockyllix` for local work. Do not use a real service-account key with the emulators.

Terminal 1, from `server`:

```powershell
npx firebase emulators:start --only auth,firestore --project demo-stockyllix --config ../firebase.json
```

Terminal 2, from `server`:

```powershell
npm run seed:local
npm run dev
```

Terminal 3:

```powershell
Set-Location -LiteralPath "C:\Users\danch\OneDrive\Desktop\House of Finance Project\Stockyllix\mobile"
npm ci
if (-not (Test-Path -LiteralPath ".env.local")) { Copy-Item -LiteralPath ".env.example" -Destination ".env.local" }
npm run web
```

Before starting Expo, fill the public settings with project `demo-stockyllix`, API key `demo-key`, app ID `demo-app`, API URL `http://localhost:3000/api`, and `EXPO_PUBLIC_USE_EMULATORS=true`. The auth emulator URL is `http://127.0.0.1:9099`. These dummy values are for local emulators only. The setup screen explains missing settings. Restart Expo after changing environment variables.

The local seed creates `admin@example.test` and `player@example.test`, password `stockyllix-local-demo`. These accounts exist only in the local Auth emulator. Set `ADMIN_UIDS=demo-admin` in `server/.env`. For physical devices, configure an appropriate LAN host and origins; loopback on a phone refers to the phone, not your computer.

Do not start a second emulator if the ports are already occupied. Local emulator state is temporary unless explicitly exported/imported. If `java` is missing from PATH, add your installed Java 21 `bin` directory to that terminal's `$env:PATH`; no system setting needs to change.

## Advance the shared clock

Sign in with an administrator UID configured in the API. Open **World controls**, choose the next event or an ISO timestamp, then **Advance clock**. Processing starts automatically through bounded requests. If interrupted or paused, reopen controls and choose **Resume & process**. A long advance may require another resume after the client reaches its processing limit. Players keep their last completed data; a newly opened screen explains that processing is paused instead of showing an endless loader. Open **How to play** in the menu for a first-order walkthrough.

Reset is administrator-only and requires typing `RESET`. It creates a new world; it does not delete the old world or cancel an in-progress job. All players then initialize once in the new world.

## Decisions and trade-offs

The detailed [rule table](docs/rules.md) defines reservations, rounding, ties, week boundaries and missing data. [Market-data notes](docs/data-sources.md) explain source checks, ECB attribution, simulation and future-data limits.

Orders submitted while their market is open execute at that session's close. Otherwise they execute at the next open. Accepted orders can be rejected at execution if a rule no longer permits the fill. They cannot be cancelled by the player.

Weekly score is `0.85 × return percentile + 0.15 × stability percentile`. Stability uses sampled maximum drawdown. Assets and cash carry into the next week; competition statistics reset. Cash and reserved assets remain part of portfolio value.

We intentionally omitted a second web client, push notifications, news, paid feeds, Cloud Functions, Docker, commissions, dividends and corporate-action processing. The daily review adds educational value without rewarding unnecessary trades. Actual return visits use server real dates, separately from simulation days; retention improvement has not been proven.

Charts reveal known observations only; price targets never place an order. Daily change needs a prior session close. Company fundamentals are omitted because a suitable public source was not verified. Performance and capacity limits are detailed in the [runbook](docs/runbook.md).

Auto appearance follows real Israel time (dark 20:00–07:00), not the simulation. The quiz allows one answer per user/game day in Israel time. All players share that day's question; retries preserve the first answer, and the next game day replaces the current saved answer. Quiz results do not affect score or cash. Real-date review visits remain separate retention instrumentation. Sign-up checks 8+ characters with a letter and digit plus matching confirmation; verify the Firebase password policy before public release. Sign-in errors do not reveal whether an email exists.

## Tests and deployment

```powershell
# from server
npm run typecheck
npm run lint
npm test
npm run build
npm run test:load
npm run test:load -- 1000 week
npx firebase emulators:exec --only auth,firestore --project demo-stockyllix --config ../firebase.json "npm run test:emulator"
```

From `mobile`, run `npm run typecheck`, `npm run lint`, `npm run test:config`, `npm run test:auth`, `npm run test:theme`, `npm run test:requests`, `npm run test:name`, `npm run test:market`, and `npm run build:web`. GitHub Actions configuration covers application and emulator checks; an actual GitHub run still needs verification. No deployment secrets are exposed to pull-request jobs.

Before each release, run `npm run check:release` from `mobile`, rebuild the production Web app, deploy only Hosting, then check the live files and authenticated application. The production API URL is `https://stockyllix-api.onrender.com/api`. Keep emulator settings out of the production build.

Deployment is **Firebase Hosting (static SPA) → Render Free (API) → Firebase Auth + Firestore Spark**. Cloud Functions and App Hosting are not used. Never enter a payment card or enable Blaze. Free-tier sleep, quotas and recovery limits are explicit in the [runbook](docs/runbook.md). The repo includes deployment configuration, not a claim that cloud access was already granted.

For the learning sequence and interview walkthrough, see [learning notes](docs/learning.md).
