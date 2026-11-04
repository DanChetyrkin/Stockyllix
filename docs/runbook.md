# Operations and handover

## Boundaries

The browser authenticates with Firebase. Every game read and write goes through the API. Firestore rules deny direct client access. The Admin SDK bypasses those rules, so server validation and IAM are essential. Never put a service-account private key, generator seed or private dataset in the app bundle, public GitHub, logs or `EXPO_PUBLIC_*` variables.

Production refuses emulator variables. Local emulator use requires the `demo-stockyllix` project and both Auth/Firestore emulator settings. The API defaults to loopback locally. Authentication and game initialization are separate operations: retry initialization after a network failure; do not create another account.

## Free deployment, without a card

1. Keep Firebase on Spark. Do not enable Blaze, Functions, App Hosting or paid backups.
2. Register a Render **Free** Node web service using `render.yaml`. Stop if the account flow requires a card; do not start a paid trial. No account-specific deployment success is implied by the manifest.
3. Set `FIREBASE_SERVICE_ACCOUNT` as a Render secret, using a dedicated project service account with the minimum required Firestore permissions. Set `ADMIN_UIDS`, exact HTTPS `CORS_ORIGINS` and a private random `DATASET_SEED` of at least32 characters. Keep the seed and exact FX/dataset version fixed across releases. No credentials belong in YAML.
4. Build runs `npm ci --include=dev` (the compiler/import tools are development dependencies), imports public ECB reference rates, then compiles TypeScript. Startup validates the dataset. Runtime trades make no external market-data calls. Keep a private copy of the exact FX/dataset and its dataset ID: historical source revisions can change the ID even with the same seed. A mismatched world fails closed. If the ECB download fails, retry the build; do not silently replace real FX with generated numbers.
5. Put the real Firebase Web config and deployed API URL in the build environment for Expo. `EXPO_PUBLIC_USE_EMULATORS=false`. Public Firebase config is not an Admin credential.
6. Run `npx expo export --platform web` from `mobile`. The root Firebase configuration serves `mobile/dist` and rewrites SPA routes to index.html.
7. After the Firebase CLI is authenticated to the intended project, deploy the prepared rules/indexes and Hosting. First inspect the existing rules and confirm the project contains only this game's intended data; these rules deny every direct client read/write. Do not overwrite unrelated application access.
8. Check browser registration, token verification, initial money, an order, clock execution, reload at an internal URL, and a server restart. Test a regular account cannot call admin routes. Set up the reviewer's agreed administrator UID before handoff.

From `server`, Firebase CLI commands use `--config ../firebase.json --project stockyllix`; do not confuse this with emulator commands using `--project demo-stockyllix`. Firebase CLI login is interactive and should be completed by the account owner. A service-account key is needed for an externally hosted API, not for the browser or ordinary local emulator tests.

The static Firebase Hosting URL and Render API URL must be recorded only after successful deployment. If Render cannot be opened without billing, evaluate Vercel Hobby for this personal, noncommercial assignment and use the same API/service layer. Do not migrate data or create paid resources as an automatic fallback.

### Owner setup and future deployments

Render and Firebase Hosting were deployed on November 4. The API is `https://stockyllix-api.onrender.com/api` and the game is `https://stockyllix.web.app`. Cloud billing was checked and is disabled. The steps below describe initial setup and handover; the current owner CLI is already authenticated.

1. Sign up/sign in to Render yourself, selecting the free Hobby workspace and a **Free Web Service**. Do not add a payment method. Connect only the Stockyllix repository. The current source must first be reviewed and published to the intended branch; a local untracked file cannot be deployed from GitHub. Use the settings in `render.yaml`, with automatic deployment disabled.
2. In the Firebase console for `stockyllix`, open **Project settings → Service accounts**. The Admin SDK setup describes **Generate New Private Key**. Creating this JSON creates a persistent credential: complete it yourself, keep it outside the repository/OneDrive sharing, and never paste it into chat. Prefer a dedicated service account limited to the needed Firestore data access; do not grant project Owner/Editor merely to resolve an access error. Put the JSON only in the server's `FIREBASE_SERVICE_ACCOUNT` secret. The browser Web config is a different, public configuration.
3. In **Authentication → Users**, create the intended administrator account yourself and copy its UID into server-only `ADMIN_UIDS`. Local `demo-admin` and emulator passwords do not exist in the cloud. Keep Email/Password enabled. Verify **Authentication → Settings → Password policy** before launch: the current form requires 8+ characters, a letter and a number, but the cloud policy has not been inspected. Enforce supported length/numeric criteria there; any additional lowercase, uppercase or symbol requirement must also be stated in the form hint. Client validation alone is not a project-wide authentication policy.
4. Authenticate the existing CLI from PowerShell and verify that `stockyllix` appears. No global install or new Firebase project is needed:

   ```powershell
   Set-Location -LiteralPath "C:\Users\danch\OneDrive\Desktop\House of Finance Project\Stockyllix\server"
   npx firebase login
   npx firebase projects:list
   ```

   If the normal localhost callback is unavailable, the official CLI also supports `npx firebase login --no-localhost`. Complete account/authorization prompts yourself; do not share the resulting codes or credentials.
5. Deploy the API with the server settings above and verify `/health`. Use its actual HTTPS base URL plus `/api` for `EXPO_PUBLIC_API_URL` in the ignored production client settings. Set `CORS_ORIGINS` to the exact Hosting origins that will be used, such as `https://stockyllix.web.app` and `https://stockyllix.firebaseapp.com`; verify the actual site ID first.
6. After reviewing existing cloud rules/data, build the client, run the release gate, then deploy the already prepared Hosting/rules/index configuration from `server`:

   ```powershell
   Set-Location -LiteralPath "C:\Users\danch\OneDrive\Desktop\House of Finance Project\Stockyllix\mobile"
   npx expo export --platform web
   npm run check:release
   Set-Location -LiteralPath "C:\Users\danch\OneDrive\Desktop\House of Finance Project\Stockyllix\server"
   npx firebase deploy --only hosting,firestore:rules,firestore:indexes --config ../firebase.json --project stockyllix
   ```

7. Complete the authenticated cloud smoke in step 8 above, including a second phone/browser, an internal-route reload and Render wake-up. Only this establishes the public submission URL. Firebase Hosting serves the phone browser too; no App Store or Play Store install is required.

Official references checked November 4: [Firebase CLI login](https://firebase.google.com/docs/cli#sign-in-test-cli), [Admin SDK server credentials](https://firebase.google.com/docs/admin/setup#initialize_the_sdk_in_non-google_environments), [Render Node deployment](https://render.com/docs/deploy-node-express-app) and [Free limitations](https://render.com/docs/free). A working free plan in documentation does not verify the owner's signup/anti-abuse flow.

## Release procedure

- Use the existing checkout and preserve user changes. Review the diff and secret exclusions before any commit or push.
- CI runs unit/API tests, emulator integration, lint, TypeScript and web export. Pull-request jobs have no deployment secrets.
- From `mobile`, run `npm run check:release` with production settings. Production uses `https://stockyllix-api.onrender.com/api`; Hosting is live at `https://stockyllix.web.app`. Deploy with the owner's authenticated CLI, then repeat public-file, route and authenticated smoke checks.
- Deploy only a checked commit. Automatic Render deployment is disabled in the manifest so incomplete pushes do not become releases.
- Deploy server-compatible API changes before the client that needs them. Prefer additive DTO changes during the assignment.
- Record the commit, build result and smoke-test outcome. Roll back to a previously checked Render deployment and Firebase Hosting release if behaviour regresses. A code rollback does not reverse executed trades.

## Clock recovery

`idle` means all published state is coherent. `advancing` means accounts may be at different processing checkpoints and the API intentionally blocks game reads/writes. The world status endpoint remains available.

1. Open World controls and review the target, progress and last error. **Advance clock** starts automatic processing immediately; ordinary users do not need to copy internal IDs.
2. Let an active lease finish. If a request or worker died, wait for lease expiry and resume the same job.
3. Each player/event transaction saves results and its processed-event marker together. A cursor can lag after a crash, so replay is safe. Never manually increment a cursor to bypass an account.
4. An older worker cannot commit after a newer fencing token is issued. Do not remove lease checks to resolve a busy message.
5. A failed business rule rejects just that order with its reservation released. Missing data, quota or database failures leave work resumable instead.
6. Reset is allowed only when idle. It changes the active-world pointer, retains the old world, and requires users to initialize in the new world. It is a demo action, not trade cancellation.

Automatic processing is a client-driven loop of at most 200 bounded step requests. Pause stops future requests after the current step; leaving the page also stops the loop. If the loop reaches its limit, the screen explicitly asks the operator to resume. Reload and choose **Resume & process** for existing work, not a replacement advance. A newly signed-in administrator can open controls even while their portfolio initialization waits for the active job. Logs retain request/world/job identifiers for diagnosis, while the normal UI shows friendly status.

Game requests distinguish waiting, loading and failure. Clock polling must not continually cancel an in-flight portfolio request. A paused screen shows its last completed data or a neutral waiting message; actual network/authentication failures remain visible with retry. The compact header status opens source/clock details; How to play provides user instructions.

Render Free can sleep after15 minutes and may need about a minute to wake. Its filesystem is ephemeral. No job relies on process memory, a timer, or continued work after an HTTP response. Another authorized operator can resume work when the original owner is absent.

## Incident guide

| Symptom | Check and action |
| --- | --- |
| Cold API / timeout | Wake `/health`; keep the same idempotency key when retrying orders. Never create a new request to resolve an unknown outcome. |
| 401 | Check project ID, emulator settings and Firebase session. Sign in again; never disable token verification. |
| 403 | Check the authenticated UID against server `ADMIN_UIDS`, or browser origin against CORS. Rules denial for direct client access is expected. |
| WORLD_ADVANCING | Check the admin job and resume it. Do not render newly fetched partial account data. |
| DATASET_MISMATCH | Restore the correct seed/dataset version used by this world. Do not attach a new price world to existing portfolios. |
| Missing price/FX | Correct the private source data and restart with the same validated dataset. Do not use a future rate or zero. |
| Quota exhausted | Stop repeated retries; inspect usage and wait for reset. Spark has no automatic paid overflow. Record affected job for resumption. |
| Wrong balance report | Trace request ID → order → event valuation/marker. Do not manually add cash to compensate without understanding the transaction. |
| Failed ECB import | Check public API availability and retry. An explicit simulated-FX mode is possible only with corresponding public labelling. |
| BOI reference unavailable | The optional `/api/reference/fx` request is separate from execution. Check its stale marker/provider availability; do not change the active world's FX to repair this panel. |
| Stock import refuses to start | Confirm the provider key, all required listings, history, storage/display rights and no-card limits. Do not bypass the confirmation gate or claim a fixture test proves provider access. |

HTTP JSON logs include request ID, path, status and duration; clock logs include job ID. Tokens/passwords are never logged. Unexpected error details are not returned to the client. Provider log retention is not a backup strategy.

## Import staging

`import:boi` stages a separate private history file; the verified local import contains 21 observations. The active replay continues to use its existing ECB dataset. `import:market` is a prepared Twelve Data/BOI historical pipeline, not an exercised real-stock connection: no key/access was available. See [data sources](data-sources.md) for environment settings and the coverage/rights gate. Never overwrite the active file or switch an existing world to a different dataset. Preserve the exact current data and plan any approved activation as a new world.

## Capacity and free-tier limits

Checked in planning on2026-11-03: Firestore Spark has50k reads/20k writes per day and1GiB storage; Hosting has360MB/day transfer; Render Free has one instance, sleep and workspace quotas. Recheck provider dashboards before submission. Managed backups/PITR are not part of the no-billing setup.

One thousand portfolios ×5 valuation events ×2 writes already uses roughly10k writes before orders, ranking and review tracking. The emulator and memory benchmark are not evidence of cloud throughput. The serialized memory store is test-only and is never selected by production startup. Ranking is globally computed, so all-player reads and the shared clock remain known bottlenecks. Production at thousands would need measured quotas/capacity and a worker strategy; no Kubernetes claim is made.

The measured 1,000-player week scenario used 132,575 adapter reads and 58,223 writes, including initialization, two competing buy submissions per player, settlement, valuations and rankings. Completing that whole jump on one real day would exceed Spark's 50k/20k daily limits. Advance short intervals and monitor actual usage; resumable jobs protect correctness but cannot create more quota. Profile-photo reads, quiz answers and optional performance-ledger reports also consume quota. The performance report is loaded only on request and supports at most 1,000 orders. A production launch for thousands needs a separately funded capacity plan, outside this no-card demo.

The coarse IP guard allows 180 unsuccessful requests per minute and decrements successful responses. In-flight requests count until completion, so a large simultaneous burst behind a shared NAT can still receive429. After token verification, ordinary traffic has a separate 180/minute UID bucket. Only verified administrators using the exact POST clock-step route get a separate 3,000/minute bucket; clock processing does not consume their ordinary allowance. Counters are in memory and reset on restart. This guard protects one free API process; it is not a distributed traffic-control guarantee. Respect Retry-After and measure real traffic before changing these limits.

## Dependency audit

On 2026-11-03, server `npm audit --omit=dev` reported 4 moderate findings; full server audit reported 25 moderate. Client `--omit=dev` reported 8 moderate findings in the Expo/build dependency chain. No high/critical finding was reported. The server runtime-installed chain is Firestore API → google-gax 5 → rimraf 5 → glob 10 → minimatch 9. Compatible releases do not remove the findings. Major-version overrides and the audit's suggested old Expo/Firebase CLI downgrades were not applied.

The [glob advisory](https://github.com/isaacs/node-glob/security/advisories/GHSA-3g3m-2fjr-6pw4) and [minimatch advisory](https://github.com/isaacs/minimatch/security/advisories/GHSA-g3hv-75wg-m249) concern resource consumption. The application exposes no user-supplied glob-pattern feature; this is not proof that upstream dependencies are risk-free. Keep public APIs input-bounded, avoid passing request data into filesystem patterns, and recheck supported Firebase/Expo releases before public release. Updating dependencies requires the app checks and emulator tests again.

## Submission checklist

- Public GitHub repo includes source, lockfiles and docs; no `.env`, private FX/dataset or service-account JSON.
- Give `rotemyavne7` write access and verify the accepted permission separately; an invitation is not proof of accepted access.
- Verify the actual public browser URL without local services running.
- Provide the agreed reviewer admin access outside public docs and rehearse clock advancement.
- Capture measured checks in verification.md; distinguish local checks from cloud smoke tests.
