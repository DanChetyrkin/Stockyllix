# Operations runbook

How to run Stockyllix locally, deploy it, and recover it. Design decisions, test results and demo limits are in the [README](../README.md).

## Production map

| Part | Where |
| --- | --- |
| Web app | https://stockyllix.web.app (Firebase Hosting, static Expo export from `mobile/dist`) |
| TradingView wrapper | https://stockyllix-panels.web.app (second Hosting site, files from `widgets/`; an iframe on the web and a WebView in the phone app) |
| API | https://stockyllix-api.onrender.com/api (Render free plan, service `stockyllix-api`, root `server`) |
| Health | https://stockyllix-api.onrender.com/health (version, release and deployed commit) |
| Identity and data | Firebase project `stockyllix` on the Spark plan: Authentication and Firestore |

- The browser signs in with Firebase Authentication and calls only the API. Firestore rules deny every direct client read and write. The API verifies the Firebase identity and enforces permissions before using the Admin SDK.
- The shared league uses the private historical dataset `historical-8c9e717c12d59090` (October 19–November 2, 2026). Worlds keep the exact dataset they were created with. Never point an existing world at different prices.
- The `X-Stockyllix-Test: true` header selects a permitted account's test realm, stored under `testRealms/<uid>/`. The realm keeps its own world, players and clock.
- Service-account keys, `.env` files, private datasets, the dataset seed, emulator exports and `node_modules` never go into Git, the client bundle, screenshots or logs. The public Firebase web config is not a secret.

## Local setup with emulators (Windows PowerShell)

Use Node 26.13.0. Java 21 is needed for the Firestore emulator. Run these from the repository root. The emulator project must be `demo-stockyllix`; never use a real service-account key with it.

```powershell
Set-Location server
npm ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

In `server/.env`, keep the emulator hosts, set `ADMIN_UIDS=demo-admin` and choose a private `DATASET_SEED`. The default simulated world needs the ECB rate file: run `npm run import:ecb` (it downloads or restores the fixed historical rates). Without network access, set `ALLOW_SIMULATED_FX=true` for a world with clearly labelled simulated rates.

```powershell
npx firebase emulators:start --only auth,firestore --project demo-stockyllix --config ../firebase.json
```

Leave that running. In a second terminal, from `server`:

```powershell
npm run seed:local
npm run dev
```

`seed:local` creates `admin@example.test` and `player@example.test` with password `stockyllix-local-demo`, in the emulator only. Running it again does not add money. `npm run smoke:local` then places, retries and executes one order over HTTP.

In a third terminal:

```powershell
Set-Location mobile
npm ci
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
npx expo start --web
```

For emulator mode, set `EXPO_PUBLIC_USE_EMULATORS=true`, `EXPO_PUBLIC_API_URL=http://localhost:3000/api`, `EXPO_PUBLIC_FIREBASE_PROJECT_ID=demo-stockyllix` and `EXPO_PUBLIC_AUTH_EMULATOR_URL=http://127.0.0.1:9099`. Restart Expo after changing env values.

## Expo Go against the deployed game

Install Expo Go with SDK 58 support on the phone. From `mobile`, run `npm ci` and copy `.env.example` to `.env.local` to use the hosted API. Back up any emulator settings in `.env.local` before replacing them. Run `npx expo start --go --clear` and scan the QR code on a phone on the same network. Add `--tunnel` if needed. For a browser walkthrough against the hosted API, open the live site.

## Server configuration

| Setting | Value |
| --- | --- |
| `FIREBASE_PROJECT_ID` | `stockyllix` in production, `demo-stockyllix` with emulators |
| `FIREBASE_SERVICE_ACCOUNT` | Render secret with the dedicated service-account JSON. Never a local file path |
| `ADMIN_UIDS` | Comma-separated Firebase user IDs for private operators who can manage the shared league and their own test game |
| `REVIEWER_UIDS` | Optional comma-separated Firebase user IDs that can manage only their own isolated test game. Configure separately from `ADMIN_UIDS` |
| `CORS_ORIGINS` | Exact HTTPS origins, for example `https://stockyllix.web.app`, with no trailing slash |
| `DATASET_SEED` | Private seed for the default simulated world. Never rotate it in a code release |
| `HISTORICAL_DATASET_PATH` | `/etc/secrets/yahoo-world.json`, the Render secret file with the real historical snapshot |
| `DATASET_PATH` / `FX_DATA_PATH` | Optional private files. Keep existing values unchanged |
| `WORLD_CLOCK_AUTOSTART` | `true` (the default) starts a new world's clock at 1× |
| `ALLOW_SIMULATED_FX` | Local use only: allows labelled simulated rates when the ECB file is missing |

The server requires HTTPS `CORS_ORIGINS` and at least one admin UID in production. It refuses emulator settings in production and UIDs present in both access lists.

### Reviewer access

The reviewer role in this repository requires a client and API deployment and Firebase Auth configuration before use on the hosted demo. Reviewers can play as ordinary users in the shared league. The server allows their clock and reset actions only inside their own test realm.

1. Keep at least one private operator account in `ADMIN_UIDS`. Remove the formerly public account from that list, rotate or disable its credentials and revoke its sessions.
2. Create a separate Firebase Auth account for the reviewer, add its UID to `REVIEWER_UIDS` and share sign-in details privately.
3. Verify shared administration with a private operator in the emulators. After deployment, verify the reviewer can open an isolated test game and run the demo. With the reviewer account, request `GET /api/admin/clock/targets` without the test header and expect 403. Check the shared world's ID and revision before and after the walkthrough.

## Deploying a release

Render: Blueprint `render.yaml`, free plan, auto-deploy off, manual deploys from branch `codex/render-free-deploy`. Build: `npm ci --include=dev && npm run import:ecb && npm run build && npm prune --omit=dev`. Start: `npm start`.

1. Check the exact commit: local typecheck, lint, tests and the emulator suite, then all three CI jobs on that commit. Review staged files for secrets and private data.
2. **Deploy Hosting first.** From `mobile`, with the ignored `.env.production.local` (real Firebase web config, the HTTPS Render `/api` URL, emulators off), run `npm run build:web` and `npm run check:release`. Then from `server`:

   ```powershell
   npx firebase deploy --only hosting --config ../firebase.json --project stockyllix
   ```

   The new web app also works with the previous API, so deploying it first leaves no broken window.
3. **Then deploy the API.** Manually deploy the same commit on Render and check that `/health` shows the version and release from `server/src/api/app.ts` and that commit.
4. In the browser, sign in, open the isolated test game and run the 3–5 minute walkthrough from the README. Check a phone-width window as well. Do not trade or move time in the shared league to test.
5. Record any new result that changes the [test summary](../README.md#what-i-tested).

Firestore rules and indexes are deployed separately, only when they change. A wrapper-only release can use `--only hosting:stockyllix-panels`.

### ECB build step

`npm run import:ecb` keeps the older ECB-based simulated world readable; the shared league uses its own Bank of Israel rates. The step first validates an existing local rate file (22 fixed observations, pinned hash). If there is none, it restores the same rows from the private Firestore document `referenceData/ecb-2026-10-02_2026-11-02-v1` with the server's credentials (8-second limit). Only if that also fails does it try the official ECB CSV twice and the XML once, 12 seconds each. Changed or invalid rates fail the build instead of being replaced. `npm run import:ecb -- --refresh` rechecks the same official rows on purpose.

### Historical dataset

The shared league uses the fixed `historical-8c9e717c12d59090` snapshot from October 19 to November 2, 2026, with the October 16 close as baseline. The private snapshot has 21 market sessions and 420 opening and closing prices. Data preparation converts Tel Aviv agorot to shekels, checks the market calendar and rejects missing observations. The replay window excludes reported splits and dividends.

From `server`, `npm run import:yahoo` rebuilds the snapshot from the existing private probe report, market calendar and Bank of Israel rates. Render uses the saved snapshot through `HISTORICAL_DATASET_PATH`. Keep the same dataset for existing games. [Probe inputs](../tools/README.md)

## Clock operations and recovery

- A running clock saves an anchor (game time + server time) in Firestore and advances 1×. A paused clock stays fixed. Jumps (next market event, or a chosen date and time) become a saved job that processes every event in order.
- Render sleeps after inactivity, and its disk is temporary. Nothing depends on a timer or the disk: the next authenticated request continues the saved job. While events are processed, trading returns `CLOCK_SYNCING` and the app keeps the last completed data on screen.
- For a different period or an earlier date, create a new game (in the test realm for experiments). Never move a world backwards, change price timestamps, or add money to fix a display.

If synchronization does not finish, open **World controls → Advanced**:

| Symptom | Action |
| --- | --- |
| Slow first load or a timeout | Check `/health` and let Render wake up. Retry with the same saved request; the app does this for orders |
| Pending buy, unchanged total value | Expected: the cash is reserved until execution |
| `WORLD_ADVANCING` / `CLOCK_SYNCING` | Wait, or choose **Resume synchronization**, which continues the same saved job |
| `JOB_BUSY` / lease held | Another request is working on the job. Wait for the lease (60 s) and resume |
| `DATA_INTEGRITY` or a missing price or rate | Keep the job. Restore the exact private input. Never use zero, a future rate or generated data in real history |
| `DATASET_MISMATCH` | Restore the original dataset file or version for that world |
| 401 / 403 | Check the sign-in, selected realm, the matching UID list and the exact origin |
| Quota reached | Stop retrying and wait for the Spark daily reset |

A player's event marker is saved together with its portfolio, so replaying an event after a crash is safe. Never edit the job cursor or remove the fence checks. Business rejections release their reservation; infrastructure errors leave the job resumable instead.

## Capacity and limits

- **Firebase Hosting.** Spark includes 10 GB of stored content and 10 GB of data transfer per month. The 13.5 MB demo video loads on play. About 700 full views would use most of that transfer if each is served in full, before other site traffic. [Hosting quotas](https://firebase.google.com/docs/hosting/usage-quotas-pricing)
- **Cloud Firestore.** The free quota includes 1 GiB of stored data, 50,000 document reads per day and 20,000 writes per day. Clock updates and ranking consume database operations as the number of players grows. [Firestore quotas](https://firebase.google.com/docs/firestore/quotas#free_quota)
- **Render.** The free API spins down after 15 minutes without incoming traffic. Render estimates about a minute to spin back up. Rate limits are per process, at 180 requests per minute per player with a separate bucket for clock steps. [Render free instances](https://render.com/docs/free#free-web-services)
- **Clock processing.** For hosted load tests, measure event completion lag, p95 API latency and Firestore usage. A worker would let the clock process events without incoming traffic. [Demo limits](../README.md#limits-and-next-steps)

### Local workload benchmark

Run `npm run test:load -- 1000 week` from `server`. The serialized in-memory scenario submits 2,000 buys for 1,000 players, accepts 1,000 and checks settlement and rankings after a simulated week.

| Run | Time | Adapter reads | Adapter writes |
| --- | ---: | ---: | ---: |
| November 7, 2026 | 6.6 s | 135,571 | 32,223 |
| Earlier run before removing per-player valuation writes | 84.9 s | 132,575 | 58,223 |

Both runs took 1,068 steps. The adapter counters describe local work. Hosted capacity and billed operations require a cloud test.

## Handover checklist

- GitHub **Write** access for the reviewer account, as the assignment requires.
- Provision the reviewer's isolated access and share sign-in details privately. Remove the reviewer role or disable the review account after the review.
- The Firebase password policy in the console should match the sign-up form: 8+ characters with a letter and a number.
- A real iPhone session in Expo Go. Android was recorded on a phone; see the demo video.
