# Release checklist: 1.4.0 / demo-controls-v4

This page describes the new source release and its deployment gate. **Do not read it as a claim that 1.4.0 has been deployed or passed acceptance.** The [verification record](verification.md) is authoritative for actual results. Previous 1.2/1.3 releases are [archived](archive/historical-news-v1.2.md).

## Preserve the existing deployment

- Render service `stockyllix-api`, **Free**, branch `codex/render-free-deploy`, Blueprint `render.yaml`, root `server`, auto-deploy off.
- Keep Firebase `stockyllix` on **Spark**; no card, Blaze, Cloud Functions, App Hosting, paid worker or database migration.
- Keep existing Firebase credential, admin UIDs, CORS, dataset seed, `DATASET_PATH`/`FX_DATA_PATH` if set and `/etc/secrets/yahoo-world.json` unchanged. `HISTORICAL_DATASET_PATH` continues to reference that Secret File. No repeat upload is required for an ordinary source-only deploy.
- Shared real replay remains `historical-8c9e717c12d59090` with original October/November 2026 dates and BOI FX. The legacy simulated file/seed still keeps old worlds readable. No balances, completed trades or active datasets are rewritten.
- Keep new Yahoo collection disabled without supplier permission. No flag can assert a licence, and copying an Alpha Vantage key does not resolve the tested Premium requirement.

## New behavior to validate

1. Normal date/time entry in **Israel time**, including invalid/ambiguous DST input; no raw ISO field for players.
2. One explicit pause/resume action, clear game time and available period. The persistent clock still runs at 1× server time and catches up after sleep/restart.
3. **Advance to pending execution** identifies the scheduled order event; **Advance to market event** is a distinct opening/closing action. Both traverse all intermediate events once.
4. Creating a new game has one clear confirmation, preserves prior worlds and gives fresh portfolios once per new game. It is never a rewind or a transfer of old positions.
5. A **Simulated test prices** option is restricted to an administrator's separate test scope, uses a selected start date and 28 calendar days, and discloses generated stock prices and FX. It cannot replace/relabel shared real history. Its immutable private descriptor must survive restart.
6. Accepted uncertain-order receipts are resolved with the same saved request key. No second order/debit is produced; absent/unknown outcomes still allow a safe retry.
7. Routine UI hides worker/cursor/internal IDs. Critical errors remain visible; advanced diagnostics retains recovery/audit without making it the normal flow.
8. Help, README and the [reviewer guide](reviewer-demo.md) match the actual controls. Current market/news remain real-world provider displays, possibly delayed, and never execute game orders.

## Publish and prove

1. Run server/client typecheck, lint, meaningful tests, emulator integration and exports. Inspect all three CI jobs on the **exact** published SHA.
2. Review staged changes and exclusions: no `.env`, keys, private descriptors/seeds, price files, future snapshots or `node_modules`.
3. Manually deploy that SHA in the existing Render service. Verify `/health` gives **1.4.0 / demo-controls-v4** and the exact SHA. The server's actual commit may differ from a later documentation-only commit; record both accurately.
4. From `mobile`, export with the existing ignored production config, real Render `/api` URL and emulators false; run `npm run check:release`.
5. From `server`, deploy only the existing Hosting sites:

```powershell
npx firebase deploy --only hosting --config ../firebase.json --project stockyllix
```

6. Compare delivered files with the export; check internal-route refresh, CORS and ordinary Firebase sign-in. Test trades/time only in the separate test realm and preserve the shared baseline.
7. Exercise the [reviewer flow](reviewer-demo.md) through the public UI; verify pending cash, execution, sell, concentration, identical-key retry, week crossing and end bounds. Restart Render and confirm the same data/descriptor rehydrates. A successful local compile is insufficient.
8. Check phone width without horizontal Orders scrolling, Light/Dark and source-widget filters. Test actual Expo Go separately; native bundling is not a device test.
9. Update verification with source SHA, server SHA, Hosting delivery and observed results only. Keep account-level reports/screenshots under ignored artifacts.

## Remaining external handover

- Owner gives `rotemyavne7` **accepted Write** access in GitHub; last confirmed permission was Read.
- Send the administrator password privately; public docs contain email only.
- Inspect Firebase's actual password policy and match its requirements to the form. This console policy has not been independently verified.
- Complete any physical-device test not recorded in verification.

A source-restriction or entitlement failure in an optional current feed is a documented limitation, not permission to replace historical game data or delay unrelated correctness work.
