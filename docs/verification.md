# Verification record

Updated November 4, 2026. This file separates **source implementation**, **local checks**, **deployed HTTP/browser evidence** and **unverified work**. Earlier detailed chronology is archived in [verification through 1.3.0](archive/verification-through-v1.3.md); its old blockers and release instructions are not current setup instructions.

## Release 1.4.0 / demo-controls-v4: pending acceptance

This release is being prepared. Its new controls, receipt recovery and dated test simulation must not be described as deployed or verified until results are entered below from the actual checks.

| Gate | Status |
| --- | --- |
| Exact source commit and three CI jobs | Pending final release run |
| Local date/DST, next-order/event, new-game and receipt tests | Passed: server suites and 43 client checks; TypeScript/lint/build passed |
| Test-only 28-day simulation, restart rehydration and shared-world isolation | Passed actual local HTTP + Auth/Firestore emulators + stopped/recreated API process |
| Render health version/release/exact SHA | Pending 1.4.0 publication |
| Hosting exact-file comparison and public UI walkthrough | Pending 1.4.0 publication |
| Shared users, portfolios, orders, source and clock preservation | Pending final before/after comparison |
| Actual Render restart with new test descriptor | Pending |
| Phone-width browser and actual Expo Go | Browser recheck pending; physical native session unverified |

The [release checklist](finish-release.md) and [reviewer flow](reviewer-demo.md) define these gates. No test total or cloud result is inferred from source changes.

### Completed local 1.4 checks

- A March 1, 2027 test simulation completed a 50,000 ILS buy, identical-key retry, direct pending-execution fill, 5,000 ILS sale, another fill and a March 8 weekly transition. A later AAPL order remained pending. An actual API process restart restored the exact dataset, all price observations, portfolio/holdings/cash, orders, pending execution and accepted receipt. The independent shared fixture hash was unchanged.
- A legacy generator byte-hash regression matched the committed 1.3 build, so existing dataset identifiers and prices were not shifted by the optional simulation range.
- Manual local browser testing advanced directly to the pending AAPL execution, showed the no-pending state afterwards, and refreshed during a Resume request. On reload the UI checked the saved server receipt, displayed that it had already completed and unlocked controls without resubmitting. The currently deployed 1.3 shared admin page had no leftover unconfirmed request at the read-only inspection.
- Main header content scrolled out of the viewport on desktop and at 390px width; the phone document width remained 390. Native browser Date/Time controls and the explicit new-game/test-simulation confirmation were visible. Public 1.4 acceptance remains pending.

## Latest completed release evidence: 1.3.0

### Source, CI and deployment

- Final UI/evidence source commit: `20a593e05abfe906be9a44a40ce158c07aa8f8db`. [CI run 41895208330](https://github.com/DanChetyrkin/Stockyllix/actions/runs/41895208330) passed server, mobile and emulator jobs, with no failed steps.
- Actual Render server: `cd5ad5ae9db177b4a77f71633f938356ae197ab3`, version **1.3.0 / clock-trading-v3**. The later source commit changed phone feedback and documentation; server code was unchanged.
- Production client export contained the HTTPS Render URL and genuine Firebase project with emulators disabled. All **38** Hosting files matched local hashes. Internal routes/session restoration worked. Android/Hermes export passed separately; this is compilation evidence, not a physical native walkthrough.

### Reported AMZN issue and account preservation

The read-only incident audit found a **pending** ₪50,000 AMZN order before the historical US opening: total cash/value ₪1,000,000, reserved ₪50,000, available ₪950,000, holdings zero. No lost money or double debit was observed. The old phone table concealed status/time and the old cash label obscured reservation. No friend's order was placed or balance changed for diagnosis.

Local server/emulator regression covered the five balances, safe concurrent buys, concentration, same-key retry, reserved sale rejection and crash-after-commit recovery. The actual local API process was stopped/restarted; the saved anchor caught up, filled once at the source opening price/FX and retained its audit. These tests do not establish cloud capacity.

### Actual cloud trading and clock

- Render/Firestore acceptance on `8ce34af` made **103** authenticated requests and **55** bounded worker steps in an administrator-only test realm. It verified pending balances, automatic opening fill, identical-key retry, concurrent concentration protection, sale, rejection after price movement, next-event/forward controls, two weekly archives, rewind/realtime refusal and period-end blocking. Prices/FX matched the immutable real snapshot.
- After the owner deployed final server `cd5ad5a`, the frozen test world's money/orders fingerprint matched its pre-restart value. This was an actual service redeployment/restart check, separately from local killed-process recovery.
- A separate cloud quiz run made **29** requests. October 24→25 Israel midnight changed the question while processed price/event time stayed unchanged; a stale answer was rejected. Pause stability and October 25→26 after winter-time conversion passed. The previous frozen test world and shared-world/clock fingerprints were unchanged. A legitimate busy lease was resumed using the same saved job.

### Manual public-browser acceptance

- At 390×844, Orders had no horizontal scrolling container: asset, amount, status and execution time were visible. Header/clock scrolled away. Current Israel time and historical game time were separate.
- A new isolated-world AMZN buy of ₪50,000 was reviewed and sent through the UI. The pending message and portfolio showed ₪950,000 available, ₪50,000 reserved, ₪1,000,000 total cash/value. After UI advancement through TA then US opening, Orders showed **Executed**, October 26 15:30 Israel time, source price 249.47 USD and FX 3.112.
- Portfolio then showed ₪950,000 cash/available, zero reserved, ₪50,000 holdings and ₪1,000,000 total value. A final read-only Firestore hash at **2026-11-04 19:13:14 UTC** confirmed the shared world/clock and all shared portfolios/orders were unchanged. Testing did not submit trades for the friend.
- News retained TradingView attribution/links and readable Dark Mode headlines; supported Stocks filtering changed actual provider configuration. Earlier checks also exercised Light/Dark, asset/symbol selection and a provider empty state. External iframe content was neither scraped nor CSS-restyled.

## Historical price dataset

The private snapshot `historical-8c9e717c12d59090` covers **October 19–November 2, 2026**, with October 16 baseline, twenty listings, twenty-one market sessions and two complete competition weeks plus a buffer. All **420** normalized replay opening/closing prices were compared with the raw report. BOI FX availability, TASE calendar closure and absence of reported corporate actions in the selected window were checked.

Isolated memory and Auth/Firestore-emulator acceptance exercised twenty buys and twenty sells, fractional holdings/cash/P&L, source comparisons, two weekly results, no future observations and end bounds. Earlier actual 1.2.0 cloud/browser trades also passed. These are distinct from a current-price feed or a licence grant.

## Current market/news limits

- Yahoo returned twenty valid quotes locally with persistent cache reuse, but actual Render source requests received **HTTP429** and no prices. New automated requests are now blocked by **SOURCE_PERMISSION_REQUIRED**, with zero source attempts when permission is absent. This is not a working cloud quote API.
- Latest BOI published representative FX worked from Render and remains a separate reference panel; it does not reprice historical orders.
- The supplied free Alpha Vantage key returned a Premium requirement, not news articles. TradingView's official panels provide public current-market/news display, potentially delayed, outside the order engine.
- Rights for storing/displaying the previously acquired Yahoo snapshot remain unverified. Yahoo's explicit prior-permission requirement for new automated collection is a separate restriction. No approval is claimed.

## Capacity, security and submission limits

The dated serialized-memory 1,000-player full-week run took 84.9 seconds, 1,068 worker steps, 132,575 adapter reads and 58,223 writes. It is an engine benchmark, not cloud throughput; that whole jump in one day exceeds Spark quotas. Auth/Firestore-emulator tests establish real transaction/Rules behavior locally, not Render performance or current cloud quotas.

The last dependency audit found moderate advisories and no high/critical findings; counts and scope are in the runbook. It has not been rerun by this documentation update. The actual Firebase password policy is still unverified. Physical Expo Go and a second-device walkthrough remain separate owner/reviewer checks.

**Required handover still outstanding:** accepted GitHub **Write** for `rotemyavne7` (last verified Read), private administrator password delivery, and the final source/deployment/release checks above. Real-date retention instrumentation is tested; improved retention has not been established.
