# Operations runbook

How to deploy, operate and recover Stockyllix. The product decisions, test evidence and known limits are in the [README](../README.md).

## Production map

| Part | Where |
| --- | --- |
| Web app | https://stockyllix.web.app (Firebase Hosting, static Expo export from `mobile/dist`) |
| TradingView wrapper | https://stockyllix-panels.web.app/provider-widget.html (second Hosting site, files from `widgets/`; an iframe on the web and a WebView in the phone app) |
| API | `https://stockyllix-api.onrender.com/api` (Render free plan, service `stockyllix-api`, root `server`) |
| Health | https://stockyllix-api.onrender.com/health (version, release and deployed commit) |
| Identity and data | Firebase project `stockyllix` on the Spark plan: Authentication and Firestore |

- The browser signs in with Firebase Authentication and calls only the API. Firestore rules deny every direct client read and write. The API uses the Admin SDK and checks the user and the administrator list itself.
- The shared league uses the private historical dataset `historical-8c9e717c12d59090` (October 19–November 2, 2026). Worlds keep the exact dataset they were created with. Never point an existing world at different prices.
- An administrator's test realm is selected with the `X-Stockyllix-Test: true` header and stored under `testRealms/<uid>/`. It never changes the shared world, its players or its clock.
- Service-account keys, `.env` files, private datasets and `node_modules` never go into Git, the client bundle, screenshots or logs. The public Firebase web config is not a secret.

## Server configuration

| Setting | Value |
| --- | --- |
| `FIREBASE_PROJECT_ID` | `stockyllix` |
| `FIREBASE_SERVICE_ACCOUNT` | Render secret with the dedicated service-account JSON. Never a local file path |
| `ADMIN_UIDS` | Comma-separated Firebase user IDs allowed to use World controls. A hidden button is not authorization |
| `CORS_ORIGINS` | Exact HTTPS origins, for example `https://stockyllix.web.app`, with no trailing slash |
| `HISTORICAL_DATASET_PATH` | `/etc/secrets/yahoo-world.json`, the Render secret file with the real historical snapshot. The server refuses to start without it |

`readConfig` refuses to start in production without HTTPS `CORS_ORIGINS` and at least one admin ID, and refuses emulator settings in production.

## Deploying a release

Render: Blueprint `render.yaml`, free plan, auto-deploy off, so every API release is a manual deploy. Build: `npm ci --include=dev && npm run build && npm prune --omit=dev`. Start: `npm start`.

1. Check the exact commit: local typecheck, lint and tests, then all three CI jobs on that commit, including the Firestore emulator tests. Review staged files for secrets and private data.
2. **Deploy Hosting first.** From `mobile`, with `.env.local` copied from `.env.example`, run `npm run build:web` and `npm run check:release`. Then from `server`:

   ```powershell
   npx firebase deploy --only hosting --config ../firebase.json --project stockyllix
   ```

   Keep each web release compatible with the API that is still live, so deploying it first leaves no broken window.
3. **Then deploy the API.** Manually deploy the same commit on Render and check that `/health` shows the version and release from `server/src/api/app.ts` and that commit.
4. In the browser, sign in, open the isolated test game and run the 3–5 minute walkthrough from the README. Check a phone-width window as well. Do not trade or move time in the shared league to test.
5. If the release changes a measured number or a known limit, update the README.

Firestore rules and indexes are deployed separately, only when they change. A wrapper-only release can use `--only hosting:stockyllix-panels`.

### Historical dataset

The shared league runs on the private snapshot `historical-8c9e717c12d59090`, which Render reads from the secret file in `HISTORICAL_DATASET_PATH`. Deploy with that same file. `npm run import:yahoo` (from `server`) can rebuild it from the private probe report, the verified market calendar and the Bank of Israel history, but do not download the prices again: Yahoo requires permission for automated collection ([data sources](data-sources.md#data-rights)). New data means a new game, never new prices under an existing one.

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
| 401 / 403 | Check the sign-in, `ADMIN_UIDS` and the exact origin. Never turn off token checks |
| Quota reached | Stop retrying and wait for the Spark daily reset |

A player's event marker is saved together with its portfolio, so replaying an event after a crash is safe. Never edit the job cursor or remove the fence checks. Business rejections release their reservation; infrastructure errors leave the job resumable instead.

## Monitoring

- `/health` shows the version, release and deployed commit. Render's health check uses it.
- Every API log line is JSON with a request ID, method, path, status, duration and user ID, never a token. Error responses return the same request ID, so a player's report leads to the log line.
- A failed clock step logs `clock_sync_failed` and keeps its error code on the saved job, where World controls shows it.
- Not yet in place: alerts. Nothing notifies anyone when the API is down or the clock falls behind. The first two to add are an uptime check on `/health` and an alert when a due event has not been processed within a few minutes.

## Capacity and limits

- **Cloud Firestore (Spark).** 1 GiB of storage, 50,000 document reads and 20,000 writes per day ([quotas](https://firebase.google.com/docs/firestore/quotas#free_quota)). Clock processing and the league use more of them as players are added.
- **Firebase Hosting (Spark).** 10 GB of storage and 10 GB of data transfer per month ([quotas](https://firebase.google.com/docs/hosting/usage-quotas-pricing)). The demo video on How to play is 13.5 MB and loads only when someone presses play, so about 700 full plays would use the whole month's transfer on their own.
- **Render free.** One instance that spins down after 15 minutes without traffic and takes about a minute to wake ([Render](https://render.com/docs/free#spinning-down-on-idle)). Its disk is temporary. Rate limits are per process: 180 requests per minute per user, with a separate bucket for administrator clock steps.
- **Load test.** `npm run test:load -- 1000 week` (from `server`) runs 1,000 players through one simulated week on the in-memory store: 1,068 clock steps, 135,571 document reads and 32,223 writes, in 17–25 s on a laptop. The counts are the same on every run; the time depends on the machine. That is the engine's work, not cloud throughput, and it is more than Spark allows in a day.

Latency: the Render service runs in Render's Oregon region and Firestore in Tel Aviv (`me-west1`). A clock step makes several sequential transactions, each crossing the ocean, so the live server processes about one event every 6 seconds for a single player (a jump to October 29 took about 4 minutes). A Render service in Frankfurt, the closest Render region, would cut each round trip several times. That means a new service URL, so update `EXPO_PUBLIC_API_URL`, `CORS_ORIGINS` and the secrets together.

## Handover checklist

- GitHub **Write** access for the reviewer account, as the assignment requires.
- The reviewer's administrator login is in the README on purpose. Change that password after the review, because the repository is public.
- The Firebase password policy in the console should match the sign-up form: 8+ characters with a letter and a number.
- A real iPhone session in Expo Go. Android was recorded on a phone; see the demo video.
