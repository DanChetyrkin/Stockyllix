# Operations runbook

How to run Stockyllix locally, deploy it, and recover it. The product and rule decisions are in the [README](../README.md). Test evidence is in [verification](verification.md).

## Production map

| Part | Where |
| --- | --- |
| Web app | https://stockyllix.web.app (Firebase Hosting, static Expo export from `mobile/dist`) |
| TradingView wrapper | https://stockyllix-panels.web.app (second Hosting site, files from `widgets/`; an iframe on the web and a WebView in the phone app) |
| API | https://stockyllix-api.onrender.com/api (Render free plan, service `stockyllix-api`, root `server`) |
| Health | https://stockyllix-api.onrender.com/health (version, release and deployed commit) |
| Identity and data | Firebase project `stockyllix` on the Spark plan: Authentication and Firestore |

- The browser signs in with Firebase Authentication and calls only the API. Firestore rules deny every direct client read and write. The API uses the Admin SDK and checks the user and the administrator list itself.
- The shared league uses the private historical dataset `historical-8c9e717c12d59090` (October 19–November 2, 2026). Worlds keep the exact dataset they were created with. Never point an existing world at different prices.
- An administrator's test realm is selected with the `X-Stockyllix-Test: true` header and stored under `testRealms/<uid>/`. It never changes the shared world, its players or its clock.
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

No emulator or local API is needed: `mobile/.env.example` already holds the live game's public settings. If `mobile/.env.local` holds emulator settings, first keep them in a file Expo does not load, such as `.env.local.emulators.backup`. Then, from `mobile`, copy `.env.example` to `.env.local`, run `npx expo start --go --clear` and scan the QR code from a phone on the same network (add `--tunnel` otherwise). The live API accepts phone requests without a browser origin; a local web dev server on `localhost` is not in `CORS_ORIGINS`, so use the live site for the browser. A browser check at phone width or an Android export does not replace a real Expo Go session.

## Server configuration

| Setting | Value |
| --- | --- |
| `FIREBASE_PROJECT_ID` | `stockyllix` in production, `demo-stockyllix` with emulators |
| `FIREBASE_SERVICE_ACCOUNT` | Render secret with the dedicated service-account JSON. Never a local file path |
| `ADMIN_UIDS` | Comma-separated Firebase user IDs allowed to use World controls. A hidden button is not authorization |
| `CORS_ORIGINS` | Exact HTTPS origins, for example `https://stockyllix.web.app`, with no trailing slash |
| `DATASET_SEED` | Private seed for the default simulated world. Never rotate it in a code release |
| `HISTORICAL_DATASET_PATH` | `/etc/secrets/yahoo-world.json`, the Render secret file with the real historical snapshot |
| `DATASET_PATH` / `FX_DATA_PATH` | Optional private files. Keep existing values unchanged |
| `WORLD_CLOCK_AUTOSTART` | `true` (the default) starts a new world's clock at 1× |
| `ALLOW_SIMULATED_FX` | Local use only: allows labelled simulated rates when the ECB file is missing |

`readConfig` refuses to start in production without HTTPS `CORS_ORIGINS` and at least one admin ID, and refuses emulator settings in production.

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
5. Record what was actually checked in [verification](verification.md).

Firestore rules and indexes are deployed separately, only when they change. A wrapper-only release can use `--only hosting:stockyllix-panels`.

### ECB build step

`npm run import:ecb` keeps the older ECB-based simulated world readable; the shared league uses its own Bank of Israel rates. The step first validates an existing local rate file (22 fixed observations, pinned hash). If there is none, it restores the same rows from the private Firestore document `referenceData/ecb-2026-10-02_2026-11-02-v1` with the server's credentials (8-second limit). Only if that also fails does it try the official ECB CSV twice and the XML once, 12 seconds each. Changed or invalid rates fail the build instead of being replaced. `npm run import:ecb -- --refresh` rechecks the same official rows on purpose.

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
| 401 / 403 | Check the sign-in, environment mode, `ADMIN_UIDS` and the exact origin. Never turn off token checks |
| Quota reached | Stop retrying and wait for the Spark daily reset |

A player's event marker is saved together with its portfolio, so replaying an event after a crash is safe. Never edit the job cursor or remove the fence checks. Business rejections release their reservation; infrastructure errors leave the job resumable instead.

## Capacity and limits

Spark: 50k reads and 20k writes per day, 1 GiB storage, 10 GB of Hosting transfer per month. The demo video on How to play is 13.5 MB and loads only when someone presses play, so about 700 full views fit in that transfer. Render free: one instance that sleeps. A local 1,000-player week (`npm run test:load`) took 84.9 s, 132,575 reads and 58,223 writes. That is engine timing, not cloud throughput, and it is more than Spark allows in a day. Rate limits are per process: 180 requests per minute per user, with a separate bucket for administrator clock steps.

Latency: the Render service runs in Oregon (`us-west1`) and Firestore in Tel Aviv (`me-west1`). A clock step makes several sequential transactions, each crossing the ocean, so the live server processes about one event every 6 seconds for a single player (a 10-day jump took about 4 minutes). A Render service in Frankfurt, the closest Render region, would cut each round trip several times. That means a new service URL, so update `EXPO_PUBLIC_API_URL`, `CORS_ORIGINS` and the secrets together.

## Handover checklist

- GitHub **Write** access for the reviewer account, as the assignment requires.
- The reviewer's administrator login is in the README on purpose. Change that password after the review, because the repository is public.
- The Firebase password policy in the console should match the sign-up form: 8+ characters with a letter and a number.
- A real iPhone session in Expo Go. Android was recorded on a phone; see the demo video.
