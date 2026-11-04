# Operations and handover

This is the current operating guide for the 1.4.0 / demo-controls-v4 source release. Consult [verification](verification.md) before assuming that a source change has passed cloud acceptance. Older dated evidence is kept in [the archive](archive/verification-through-v1.3.md).

## Production boundaries and data

- App: **https://stockyllix.web.app**. API: **https://stockyllix-api.onrender.com/api**. Health: **https://stockyllix-api.onrender.com/health**.
- Firebase Hosting serves `mobile/dist` as a static SPA; internal routes rewrite to `index.html`. A second static Hosting site, `stockyllix-panels.web.app`, contains only the provider wrapper from `widgets/`. Third-party scripts cannot access the application origin's Firebase session.
- Firebase Authentication supplies identity. Every game read/write goes through the token-verifying API. Firestore Rules deny direct client access; Admin SDK access bypasses Rules and is checked by server authorization and IAM.
- Shared real replay: `historical-8c9e717c12d59090`, October 19–November 2, 2026, twenty instruments, real BOI execution FX, conservative next-day FX availability. Preserve the exact private file and all legacy datasets still referenced by worlds.
- Administrator-only test scope uses `X-Stockyllix-Test: true` and storage under `testRealms/<authenticatedUid>/`. Its new simulated games have an explicit selected date and simulated prices/FX. They never change the shared world's source, cash, users or pointer. Prior test games are also preserved.

No service-account key, private dataset, generator seed, `.env`, emulator export or `node_modules` belongs in Git, a client bundle, screenshots or logs. Public Firebase Web config is client configuration, not an administrator credential.

## Local Windows setup

Use Node 26.13.0 and Java 21 for the emulators. The Firebase emulator project must be `demo-stockyllix`; never use a real service-account key there.

```powershell
Set-Location -LiteralPath "C:\Users\danch\OneDrive\Desktop\House of Finance Project\Stockyllix\server"
npm ci
if (-not (Test-Path -LiteralPath ".env")) { Copy-Item -LiteralPath ".env.example" -Destination ".env" }
```

Fill the local `.env` from its placeholders: emulator project/hosts, `ADMIN_UIDS=demo-admin` and a private `DATASET_SEED`. Import the fixed historical ECB FX if no private dataset/FX file is already configured:

```powershell
npm run import:ecb
npx firebase emulators:start --only auth,firestore --project demo-stockyllix --config ../firebase.json
```

Leave that terminal running. In a second terminal from `server`:

```powershell
npm run seed:local
npm run dev
```

The local seed creates `admin@example.test` and `player@example.test`, both with password `stockyllix-local-demo`, in the **emulator only**. Seeding again does not replenish an existing portfolio. Do not start duplicate emulators on occupied ports. Their state is temporary unless explicitly exported/imported.

From a third terminal:

```powershell
Set-Location -LiteralPath "C:\Users\danch\OneDrive\Desktop\House of Finance Project\Stockyllix\mobile"
npm ci
if (-not (Test-Path -LiteralPath ".env.local")) { Copy-Item -LiteralPath ".env.example" -Destination ".env.local" }
npx expo start --web
```

For this local mode, set project `demo-stockyllix`, API key `demo-key`, app ID `demo-app`, `EXPO_PUBLIC_USE_EMULATORS=true`, API `http://localhost:3000/api`, and auth emulator `http://127.0.0.1:9099`. Restart Expo after changing env values. Preserve existing env settings before switching modes.

## Expo Go against the deployed game

This requires no emulator or locally running API. In ignored `mobile/.env.local`, use the genuine public Firebase client config already used for Hosting and:

```dotenv
EXPO_PUBLIC_API_URL=https://stockyllix-api.onrender.com/api
EXPO_PUBLIC_USE_EMULATORS=false
EXPO_PUBLIC_FIREBASE_PROJECT_ID=stockyllix
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=stockyllix.firebaseapp.com
```

Set `EXPO_PUBLIC_FIREBASE_API_KEY` and `EXPO_PUBLIC_FIREBASE_APP_ID` from that same public config. Remove `EXPO_PUBLIC_AUTH_EMULATOR_URL`. Back up earlier emulator settings to an ignored file such as `.env.local.emulators.backup` that Expo does not automatically load; check the actual ignore rule before saving it.

```powershell
Set-Location -LiteralPath "C:\Users\danch\OneDrive\Desktop\House of Finance Project\Stockyllix\mobile"
npx expo start --go --clear
```

Keep Metro running, connect phone/computer to the same reachable network and scan the QR with a compatible Expo Go. Loopback on a phone means the phone. If testing local emulators instead, use the computer's LAN address for **both** API and Auth emulator and configure matching origins. A web-width test or Android export does not prove a physical Expo Go run.

## Clock and safe demonstrations

Use the [3–5 minute walkthrough](reviewer-demo.md). Administrators sign in through normal Firebase Auth and open World controls. Current Israel time is separate from game time; all date/time entry is interpreted as `Asia/Jerusalem`, with DST validation.

A running clock persists a game/server anchor in Firestore and advances at 1× server time. Due events are processed in bounded requests. A paused clock stays fixed. A custom forward date/time, next pending-order execution or next market event processes all intermediate events once. A forward jump can include multiple weekly summaries; it is not just a UI date change.

The processed event time can precede the displayed game target when no event occurred between them. Do not change price timestamps to match the display. The quiz follows the logical game day; prices change only at their declared events.

Render Free sleeps after inactivity and has ephemeral local disk. No job depends on a browser timer, process-local interval, disk or background work after a response. On the next authenticated request, persisted anchors and jobs catch up. During synchronization, keep the last completed portfolio visible and disable unsafe new trading with a reason. Cold start or a reached job can require a short wait; it is not proof of lost money.

Use a separate **Simulation** test game for March 2027 or earlier-time experiments. Its date range and generated source are disclosed. Do not move an existing world backwards, relabel history, replace datasets under holdings or reset someone else's money. At the period end, explicitly create another game rather than looping or automatically crediting balances. Realtime execution is unavailable until appropriate current execution prices and FX are verified.

### Recovery and diagnosis

Normal users do not need worker-step controls. Use the status and advanced diagnostics only if synchronization does not finish:

1. Record the request ID, world/job ID and error code from server diagnostics; do not expose IDs as ordinary player labels.
2. Let an active lease finish. If a worker died, wait for the lease expiry and retry the **same saved job**. Respect `Retry-After` for a busy job or quota limit.
3. A player/event transaction commits outcomes and a processed marker together. The durable cursor may lag after a crash; safe replay is expected. Never manually advance the cursor or remove fencing checks.
4. Business-rule rejection releases that order's reservation. Missing source data, database failure or exhausted quota leaves processing resumable rather than turning it into a business rejection.
5. Do not start a replacement advance, reset the world or add money merely to clear a loading state.

| Symptom | Action |
| --- | --- |
| Slow initial load / network timeout | Check `/health`, allow Render to wake, retry with the original order request key. A working internet connection does not mean the API is awake. |
| Pending buy, unchanged total value | Inspect reserved/available cash and expected event. A pending ₪50,000 buy reserves money; execution exchanges it for holdings. |
| Buy unavailable | Read the reason: not initialized, synchronization, no remaining event, period ended, insufficient available cash, concentration or an unresolved saved request. Use the corresponding initialize/wait/retry/new-test-game action. |
| Unknown order response | Keep the UUID and exact payload; retry that request. Clearing a local unaccepted draft never cancels a server order. |
| 401 / 403 | Check sign-in, project/env mode, admin UID and exact origin. Never disable token verification to fix access. |
| WORLD_ADVANCING / CLOCK_SYNCING | Wait for bounded processing; inspect the saved job if it stalls. Do not render partial new account data. |
| JOB_BUSY / lease held | Wait and resume the same job; another synchronization request may legitimately own it. |
| DATASET_MISMATCH | Restore the original file/version. Never point existing portfolios at another price series. |
| Price or FX missing | Preserve the job and fix the exact private input; do not use zero, a future rate or generated replacement in real history. |
| Quota reached | Stop repeated retries, check Firebase/Render usage and wait for reset. Spark has no automatic paid overflow. |
| BOI reference/feed unavailable | Optional current-reference/display failure does not change historical execution FX. Keep old observations explicitly labelled stale. |

Logs contain request IDs, path/status/duration and clock stage/error identifiers, without passwords/tokens. Provider logging is not a backup plan. A code rollback uses the last reviewed compatible commit; keep immutable datasets and seed unchanged. If a rollback cannot understand a newly persisted test descriptor version, leave that test game preserved and restore the compatible server rather than rewriting it.

## Existing free deployment

The service already exists. Keep repository `DanChetyrkin/Stockyllix`, branch `codex/render-free-deploy`, Blueprint Path `render.yaml`, root `server`, **Free** plan and auto-deploy off. The manifest creates one Node service, no database/disk. Do not enable Blaze, Functions, App Hosting, paid backups, a trial requiring a card or a new worker.

| Server setting | Preserve/configure |
| --- | --- |
| `FIREBASE_PROJECT_ID` | `stockyllix` |
| `FIREBASE_SERVICE_ACCOUNT` | Existing server-only secret containing the dedicated credential JSON; never a local Windows path |
| `ADMIN_UIDS` | Existing authorized Firebase UIDs; frontend visibility is not authorization |
| `CORS_ORIGINS` | Exact HTTPS origins, including `https://stockyllix.web.app` and alternate Hosting origin if used; no trailing slash/path |
| `DATASET_SEED` | Existing private seed; do not rotate it as part of a code release |
| `HISTORICAL_DATASET_PATH` | `/etc/secrets/yahoo-world.json`, with the existing Render secret file |
| `DATASET_PATH` / `FX_DATA_PATH` | Preserve existing values and exact referenced data |
| `WORLD_CLOCK_AUTOSTART` | Existing configuration; defaults true for normal 1× playback |
| `YAHOO_AUTOMATED_ACCESS_AUTHORIZED` | False/unset without actual supplier permission |
| `CURRENT_MARKET_ACCESS` / `NEWS_ACCESS` | Keep existing guarded settings; these are separate from public TradingView embeds |

Build: `npm ci --include=dev && npm run import:ecb && npm run build && npm prune --omit=dev`; start: `npm start`; health: `/health`. The ECB file keeps legacy simulated worlds readable; installed historical replay uses its own BOI observations. A historical file in Secret Files is deployment configuration, not ephemeral runtime storage. Ordinary trades do not fetch provider prices.

### Bounded ECB build preparation

The Render build command and environment stay unchanged. Standalone ECB preparation is for **legacy-world compatibility**; it does not supply or replace the real historical replay's embedded BOI execution rates.

1. If `DATASET_PATH` names a complete valid default dataset, validate it and skip standalone FX preparation. Otherwise, validate any existing local FX file: the original **22 observations**, pinned canonical SHA-256 and full legacy coverage, including the initial rate and maximum age. A valid local file uses no network.
2. If that file is absent, read the private immutable Firestore cache at `referenceData/ecb-2026-10-02_2026-11-02-v1` with the **existing** server Firebase credentials. Validate its schema and the same rows/hash/coverage before restoring the ignored local FX file. Each cache worker has a hard **8-second** deadline that also bounds SDK retry/cleanup behavior; this is not another hosted service.
3. If the file is absent and the cache is absent or unreachable, try the official CSV endpoint twice, then the official XML endpoint once. Each attempt is bounded to **12 seconds**, with **500ms** and **1,000ms** delays between attempts. Validate exact immutable observations before writing the local file or creating the private cache. Cache-write failure is reported but does not reject an already validated local file.
4. An invalid present file/cache or changed official observations **fails closed**. Do not overwrite it, rotate `DATASET_SEED`, switch datasets, enable generated fallback or change prices to make the build succeed. Restore the original validated private material, or retry the bounded official preparation when access recovers.

No raw rates are committed, no new Render variable/secret is needed, and only the private reference-data cache is used; game worlds, users, money and prices are untouched. The cache is immutable rather than a latest-rate feed. For an intentional source consistency check only, run `npm run import:ecb -- --refresh`: it bypasses reuse to verify those **same** observations and still refuses a changed replay. Routine builds should use the normal command. Deployed verification of this recovery path must be recorded from actual runs, not assumed from these instructions.

Do not recreate service credentials for a routine deploy. If setup is missing on a fresh environment, the owner creates a dedicated least-privilege server credential and enters it privately in Render. Firebase CLI login is separate; it is already configured for the owner's existing Hosting workflow. Check `stockyllix` in `npx firebase projects:list` before deploying.

### Release procedure

1. Review the exact diff and staged files for secrets/private future data. Run all required checks and inspect all three CI jobs on the exact commit.
2. Deploy the reviewed server commit manually. Verify `version`, `release` and exact `commit` in `/health`; do not equate the repository head with the running server.
3. Build the client using ignored production settings with real Firebase Web config, the HTTPS Render `/api` URL and emulators false. Preserve `.env.local` used by Expo Go; inspect which env mode the export actually loads.
4. From `mobile`, run `npm run build:web` then `npm run check:release`. This checks health/config/CORS, not an authenticated trade.
5. From `server`, publish only the existing Hosting sites:

```powershell
npx firebase deploy --only hosting --config ../firebase.json --project stockyllix
```

Rules/index deployments are separate reviewed changes. Current Rules deny direct access; do not overwrite unrelated Firebase data access. Wrapper-only releases can use `--only hosting:stockyllix-panels`.

6. Verify app bytes/internal routes and normal sign-in. Use a separate test realm for trades/time. Compare the unchanged public baseline before/after; run the reviewer flow on mobile width and check actual native/device behavior separately.
7. Restart Render, confirm world/cash/orders survive, and retry a saved request without duplicate fill. Record measured evidence in verification.md. No new configuration flag grants market-data rights.

## Source integrations and import safety

TradingView is source-owned display with attribution and supported filters/themes; its data is not scraped or copied into game fills. Latest BOI `/api/reference/fx` has a separate reference cache. Guarded Yahoo quotes have a shared persistent cache/lease/cooldown but no working cloud stock feed; prior Render requests received 429, and new collection is disabled absent source permission. Alpha Vantage News keeps metadata only with a six-hour shared cache/request budget; the tested free key returned Premium-required.

The existing historical snapshot was built privately from already downloaded observations, reviewed calendar and BOI history. Loading it makes no new Yahoo request. Historical storage/display permission remains unverified. Do not rerun an acquisition tool as a routine build step. The prepared Twelve Data importer is not verified access to twenty symbols or public display. See [data-source evidence](data-sources.md) and [tools](../tools/README.md).

## Capacity and outstanding handover

Dated planning limits: Firestore Spark 50k reads/20k writes per day and 1GiB storage; Hosting 360MB/day transfer; Render Free one sleeping instance. Recheck dashboards/provider docs before capacity changes. The isolated 1,000-player memory week used 132,575 adapter reads and 58,223 writes in 84.9 seconds; that one-day jump would exceed Spark quotas. It is not Firestore/Render load proof. Shared clock processing, global ranking, per-player valuations and profile/quiz reads remain limits.

Rate guards are process-local: ordinary authenticated traffic 180/minute per UID, a coarse unsuccessful-IP guard, and a separate authorized clock-step bucket. Respect backoff. Resumability protects correctness, not unlimited quota. No production support for thousands is claimed.

The November 3 dependency audit reported only moderate findings: server runtime 4, full development tree 25, client runtime-installed tree 8. Those are dated results, not a fresh clean audit. Avoid unreviewed major overrides; rerun appropriate tests when updating dependencies.

Before submission: verify accepted `rotemyavne7` **Write** (last checked Read), share only the administrator email publicly, provide its password privately, confirm Firebase password policy matches the form, and finish physical Expo Go/second-device checks. Client sign-up requires a 2–40 character display name, an email address and an 8+ character password including a letter and number; sign-in errors do not reveal email existence.
