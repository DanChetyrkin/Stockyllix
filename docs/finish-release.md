# Release checklist: 1.4.0 / demo-controls-v4

The **1.4.0 / demo-controls-v4 API is deployed**, exact server commit `b0b0c8eab717eabf64b614a4de8032a8f5ba21b5`. Actual Render/Firestore acceptance passed historical trades, receipts and the separate dated simulation, with public/prior-game preservation verified. An actual subsequent Render restart preserved the exact test descriptor, clock, money and orders, plus the public baseline. Final client `7ad8335c54a9cab08b9dfca3f817cdff1d1a9003` was published at **2026-11-04 22:35:30 UTC** with **38/38** files matching. Its three CI jobs, 47 local checks, Web/Android exports and HTTPS/CORS release gate passed. Manual browser trading and the unchanged calendar component's phone/theme checks are separately recorded in [verification](verification.md). Previous 1.2/1.3 instructions are [archived](archive/historical-news-v1.2.md).

No repeat account setup, secret-file upload or environment change is required. The instructions below are the normal future-release/recovery procedure, not a request to redo completed setup.

## Preserve the existing deployment

- Render service `stockyllix-api`, **Free**, branch `codex/render-free-deploy`, Blueprint `render.yaml`, root `server`, auto-deploy off.
- Keep Firebase `stockyllix` on **Spark**; no card, Blaze, Cloud Functions, App Hosting, paid worker or database migration.
- Keep existing Firebase credential, admin UIDs, CORS, dataset seed, `DATASET_PATH`/`FX_DATA_PATH` if set and `/etc/secrets/yahoo-world.json` unchanged. `HISTORICAL_DATASET_PATH` continues to reference that Secret File. No repeat upload is required for an ordinary source-only deploy.
- Shared real replay remains `historical-8c9e717c12d59090` with original October/November 2026 dates and BOI FX. The legacy simulated file/seed still keeps old worlds readable. No balances, completed trades or active datasets are rewritten.
- Keep new Yahoo collection disabled without supplier permission. No flag can assert a licence, and copying an Alpha Vantage key does not resolve the tested Premium requirement.

## Implemented behavior and future regression checks

1. A clickable date calendar and normal time entry in **Israel time**, including invalid/ambiguous DST input; no raw ISO field for players. Public Light/Dark, month navigation, date limits, Cancel and selection-without-clock-application passed.
2. One explicit pause/resume action, clear game time and available period. The persistent clock still runs at 1× server time and catches up after sleep/restart.
3. **Advance to pending execution** identifies the scheduled order event; **Advance to market event** is a distinct opening/closing action. Both traverse all intermediate events once.
4. Creating a new game has one clear confirmation, preserves prior worlds and gives fresh portfolios once per new game. It is never a rewind or a transfer of old positions.
5. A **Simulated test prices** option is restricted to an administrator's separate test scope, uses a selected start date and 28 calendar days, and discloses generated stock prices and FX. It cannot replace/relabel shared real history. Its immutable private descriptor must survive restart.
6. Accepted uncertain-order receipts are resolved with the same saved request key. No second order/debit is produced; absent/unknown outcomes still allow a safe retry.
7. Routine UI hides worker/cursor/internal IDs. Critical errors remain visible; advanced diagnostics retains recovery/audit without making it the normal flow.
8. Help, README and the [reviewer guide](reviewer-demo.md) match the actual controls. Current market/news remain real-world provider displays, possibly delayed, and never execute game orders.

## Future publication procedure

1. Run server/client typecheck, lint, meaningful tests, emulator integration and exports. Inspect all three CI jobs on the **exact** published SHA.
2. Review staged changes and exclusions: no `.env`, keys, private descriptors/seeds, price files, future snapshots or `node_modules`.
3. **Only if server runtime code, dependencies or build configuration changed**, manually deploy the reviewed server SHA in the existing Render service and verify health's version/release/exact SHA. **Client-only or documentation-only commits do not require a Render deploy.** Keep the healthy `b0b0c8e` server for the current client follow-up and record client/server commits separately.
4. If client code changed, export from `mobile` with the existing ignored production config, real Render `/api` URL and emulators false; run `npm run check:release`. Markdown-only documentation changes need no app export.
5. When the app or provider wrapper changed, publish the relevant existing Hosting sites from `server`:

```powershell
npx firebase deploy --only hosting --config ../firebase.json --project stockyllix
```

6. Compare delivered files with the export; check internal-route refresh, CORS and ordinary Firebase sign-in. Test trades/time only in the separate test realm and preserve the shared baseline.
7. Exercise the affected [reviewer flow](reviewer-demo.md) through the public UI. A server/clock/data change also needs trading, week/end-bound and actual-restart persistence checks; do not restart an unchanged server for a documentation-only release. A successful local compile is insufficient.
8. Check phone width without horizontal Orders scrolling, Light/Dark and source-widget filters. Test actual Expo Go separately; native bundling is not a device test.
9. Update verification with source SHA, server SHA, Hosting delivery and observed results only. Keep account-level reports/screenshots under ignored artifacts.

## Remaining external handover

- Accepted GitHub **Write** for `rotemyavne7` remains required for submission. The owner explicitly deferred it to final handover; the latest recheck still returned Read. No additional account/setup action is needed to keep the already deployed game running.
- Send the administrator password privately; public docs contain email only.
- Inspect Firebase's actual password policy and match its requirements to the form. This console policy has not been independently verified.
- Complete any physical-device test not recorded in verification.

A source-restriction or entitlement failure in an optional current feed is a documented limitation, not permission to replace historical game data or delay unrelated correctness work.
