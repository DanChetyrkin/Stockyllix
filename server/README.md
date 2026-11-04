# Stockyllix API

Node / Express / TypeScript enforces the game behind Firebase ID tokens. All game documents live in Firestore; the client cannot set balances, execution prices, FX or time. The existing public API is `https://stockyllix-api.onrender.com/api`.

Source release being prepared: **1.4.0 / demo-controls-v4**. Verify the deployed version, release and exact commit at `/health`; a package version or successful build does not prove deployment. Actual checks are in [verification](../docs/verification.md).

## Existing Render Free setup

Use branch `codex/render-free-deploy`, Blueprint Path `render.yaml`, root `server`, **Free**, auto-deploy off. The manifest creates one Node service with no database or persistent disk:

- Build: `npm ci --include=dev && npm run import:ecb && npm run build && npm prune --omit=dev`
- Start: `npm start`
- Health: `/health`

Keep the existing `stockyllix` Spark project, server credential, `ADMIN_UIDS`, exact HTTPS `CORS_ORIGINS` and private `DATASET_SEED`. `FIREBASE_SERVICE_ACCOUNT` contains the JSON **only as a secret**; a local Windows path is not a Render credential. Do not change the seed/FX/dataset to resolve a code deployment problem.

The installed historical snapshot remains a Render Secret File `yahoo-world.json`, with `HISTORICAL_DATASET_PATH=/etc/secrets/yahoo-world.json`. Shared game trades resolve its real October/November 2026 Yahoo prices and BOI FX. The build's ECB import preserves legacy dataset support; it does not replace that snapshot's execution FX. Ordinary trades make no external price requests.

### Reliable ECB preparation

The existing build command stays unchanged; no new Render setting, secret or service is required. `import:ecb` first validates an existing local FX file against the **original 22 observations**, their pinned canonical SHA-256 and the full legacy world's baseline/coverage. A valid file requires no network request. If `DATASET_PATH` points to a valid complete private default dataset, that dataset is validated instead and standalone FX preparation is skipped.

If the local file is absent, the importer checks the private immutable Firestore document `referenceData/ecb-2026-10-02_2026-11-02-v1`, using the server's existing Firebase credentials. It validates the same exact rows/hash/coverage before restoring the ignored local file. The cache worker has a hard **8-second** deadline, including SDK retries; it cannot keep the build hanging indefinitely.

When neither a valid local file nor an available cache can supply the observations, the importer makes at most **two official CSV attempts**, then **one official XML attempt**, each with a **12-second** deadline and **500ms / 1,000ms** backoff. A successful response must still match the immutable observations before it can be written or cached. An invalid present file/cache or changed source observations fail closed rather than being replaced with different rates. A missing/unreachable cache allows bounded official fallback; failure to save a cache does not invalidate an already validated local file.

No raw rates are committed. This reference cache does not change a game, world pointer, seed, price history or account balance. Optional `npm run import:ecb -- --refresh` explicitly rechecks the **same** immutable official observations; it is not a rate-update or dataset-rotation command. The real historical replay continues to use its own embedded BOI FX. For a failed build, restore the original valid private file/cache or retry bounded preparation; never change the seed or invent FX to make startup pass.

Keep Yahoo automated collection disabled without supplier permission. Current TradingView panels are separate source-owned displays. Do not set a licence-confirmation flag merely because technical requests work.

## Clocks and separate test games

1× historical playback uses persisted server/game anchors. Requests process bounded reached events after inactivity/restart; no always-on worker is assumed. Forward jumps, executions and weekly boundaries are durable and idempotent. Backward changes require a separate game.

The administrator-only test header selects storage scoped by verified UID. Its optional selectable-date 28-day simulation has explicit generated prices/FX and a private immutable persisted descriptor; it never modifies shared history or replaces a dataset under positions. Existing/previous worlds keep their original data. Read the [runbook](../docs/runbook.md) for recovery and source limits.

## Local commands

Use Node 26.13.0; Java 21 is needed for Firestore emulators. From this directory:

```powershell
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npx firebase emulators:exec --only auth,firestore --project demo-stockyllix --config ../firebase.json "npm run test:emulator"
```

Use `demo-stockyllix` and emulator settings for local work; never send a real service-account key there. The [Windows runbook](../docs/runbook.md) documents setup, seed accounts and safe Expo Go production configuration.

Publishing this Blueprint does not publish Hosting, Rules or the client. The existing Web app is separately deployed to Firebase Hosting. See [release procedure](../docs/finish-release.md); never commit `.env`, keys, private future prices, simulation seeds/descriptors, `node_modules` or emulator exports.
