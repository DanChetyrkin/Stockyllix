# Verification record

Updated November 5, 2026 (Israel time). This file separates **source implementation**, **local checks**, **deployed HTTP/browser evidence** and **unverified work**. UTC timestamps are identified explicitly. Earlier detailed chronology is archived in [verification through 1.3.0](archive/verification-through-v1.3.md); its old blockers and release instructions are not current setup instructions.

## Release 1.4.0 / demo-controls-v4: deployed API, cloud acceptance passed

Render is running exact server commit `b0b0c8eab717eabf64b614a4de8032a8f5ba21b5`, verified by health as **1.4.0 / demo-controls-v4**. Authenticated cloud acceptance, an actual subsequent Render restart and a manual public-browser buy/direct-fill/sell passed. Final client `7ad8335c54a9cab08b9dfca3f817cdff1d1a9003` is published with exact-file verification. Public trading observations were made on the preceding `7fe945d` client; the final follow-up changes only the suggested-time bound and sale copy. Its Help/calendar and restored shared Portfolio were also checked after final publication. The server and calendar component remain unchanged.

| Gate | Status |
| --- | --- |
| Exact source commit and three CI jobs | Passed all three jobs for server `b0b0c8e` and final client `7ad8335`; exact links below |
| Local date/DST, next-order/event, new-game and receipt tests | Passed: server suites and final 47 client checks; final `7ad8335` Web and Android/Hermes exports passed |
| Complete clean Render build command and original ECB restoration | Isolated Windows command passed with private cache and no ECB download; subsequent actual Render deployment/health succeeded |
| Test-only 28-day simulation and shared-world isolation | Passed real Render/Firestore transactions; local killed/recreated-process rehydration also passed |
| Render health version/release/exact SHA | Passed: 1.4.0 / demo-controls-v4 / exact `b0b0c8e` SHA |
| Initial 1.4 Hosting exact-file comparison | Passed: all 38 delivered files matched |
| Calendar-client Hosting/public UI | Passed `7fe945d`: 38/38 files, calendar limits/selection, Light/Dark, phone width/header and News checks |
| Shared users, portfolios, orders, source and clock preservation | Passed cloud and final manual-UI before/after hashes, including three previous paused test worlds |
| Actual Render restart with new test descriptor | Passed at 2026-11-04 22:11:58 UTC; exact test and public fingerprints preserved |
| Manual 1.4 public-browser buy/direct-fill/sell | Passed; final read-only ledger/preservation check at 2026-11-04 22:28:29 UTC |
| Final client `7ad8335` publication | Passed at 2026-11-04 22:35:30 UTC: 38/38 files, 2,212,352 bytes; HTTPS/CORS gate passed |
| Phone-width browser and actual Expo Go | 390px browser checks passed; physical native session remains unverified |

The [release checklist](finish-release.md) and [reviewer flow](reviewer-demo.md) define the remaining gates. No test total or cloud result is inferred from source changes.

### Completed cloud 1.4 acceptance

- The real Render/Firestore run completed at **2026-11-04 22:08:11 UTC** (November 5 in Israel), with **183 authenticated requests** and **104 bounded worker steps**. Every game mutation used the administrator-only isolated test realm; no shared game reset or friend's trade was submitted.
- A new **real historical** test game verified a pending ₪50,000 AMZN buy: ₪1,000,000 total cash/value, ₪50,000 reserved, ₪950,000 available and zero holdings. Direct `next_order` processing filled it at the snapshot's actual source price/FX. Same-key retry did not debit twice. A sale, explicit pending/market targets, accepted receipt and absent receipt were checked.
- A second new test game started **March 1, 2027**, with **28 calendar days of explicitly generated prices and FX**. It began with fresh cash and no transferred orders/holdings; all twenty current observations were positive with correct currencies. Buy/sell, same-key retry, direct pending execution, normal Israel date/time to March 8, the prior weekly ranking, rejection of a nonexistent Israel DST minute and period-end order refusal passed.
- Hash comparisons confirmed the shared pointer, world, stored clock, **all** existing shared player/order documents and **two prior paused test worlds** were unchanged. The new simulation was left paused at its period end for the separate actual restart check below.
- One connection failure recovered using the same saved request keys/job. An initial harness comparison was corrected to compare equal ISO instants (`Z` and `.000Z`); that correction did not change application code, prices or accounting.
- All three CI jobs passed for [server commit b0b0c8e, run 41917171437](https://github.com/DanChetyrkin/Stockyllix/actions/runs/41917171437) and [calendar client 7fe945d, run 41922200066](https://github.com/DanChetyrkin/Stockyllix/actions/runs/41922200066). The server runtime remains `b0b0c8e`; the later client/calendar SHA is not a new deployed server version.

### Actual restart and final calendar-client browser checks

- After the owner's real **Restart service**, verification completed at **2026-11-04 22:11:58 UTC** on exact server `b0b0c8e`. The March simulation's private descriptor rehydrated and its world, stored clock, ledger and all orders matched the frozen fingerprint exactly. The public world and all shared player/order records also matched the preserved baseline. No test-realm trade/time change was made between the before/after checks.
- Calendar client `7fe945d` was published to Hosting; all **38/38** files matched local bytes at **2026-11-04 22:09:30 UTC**. The configured client remains connected to the deployed Render API with emulators disabled. This is a client release; no additional server deployment was needed.
- Manual public browser at **390px** confirmed the entire header scrolls out and returns when scrolling to the top, with document width still 390. The calendar worked in Light and Dark, allowed a selected day and November navigation, and enforced the historical October 19–November 2 bounds: November 3 and the previous September were disabled. Cancel and day selection changed only the input/apply state, without moving the game clock. The calendar also opened at the normal **1280px** desktop viewport.
- The existing Firebase Auth session restored after reload. News kept the compact question above the provider panel, real headlines, Light/Dark configuration and Stocks filtering that changed the provider-frame URL. No iframe content was scraped or injected into fills.
- The final calendar client passed **46 local checks** and Android/Hermes export. These are not a physical Expo Go/device test.

### Final manual 1.4 public-browser trade walkthrough

- Through the actual public UI, a fresh isolated **real historical** test game was created using **NEW GAME**, then paused. AMZN Buy ₪50,000 was reviewed, showing ₪950,000 after reservation, and submitted as accepted/pending.
- At 390px, Orders exposed status and scheduled execution without horizontal scrolling. Portfolio showed all five pending balances: total cash ₪1,000,000, available ₪950,000, reserved ₪50,000, holdings zero and total value ₪1,000,000.
- **Advance to pending execution** selected the US opening at **16:30 Israel game time** and filled at **255.25 USD**, execution FX **3.089**, displayed quantity **63.414175**. A subsequent ₪10,000 sell submitted while the US market was open was scheduled for **23:00**. Its direct pending-execution action processed the intervening Tel Aviv 17:30 event and then filled at the US close: **262.45 USD**, FX **3.089**, displayed quantity **12.334896**. Both executed statuses were visible in phone Orders at 390px.
- A final read-only Firestore check at **2026-11-04 22:28:29 UTC** found exactly **two executed orders**, cash **₪960,000** and reserved cash **zero**. The shared pointer/world/stored clock, **all** shared player/order records and **three prior paused test worlds** retained their original hashes. No friend's transaction or main-world reset was used for this check.

### Final client follow-up and publication

- The suggested custom time is clamped to the covered period, including the final minute, instead of proposing a date beyond the end. A focused boundary regression brings the local client total to **47 passing checks**.
- Sell confirmation now explains that a pending sell reserves existing units and adds cash only on execution; the duplicate pending-sell notice was removed. This is UI feedback, without a change to server reservations or fills.
- These small client follow-ups are committed as `7ad8335c54a9cab08b9dfca3f817cdff1d1a9003`. All three [final CI jobs, run 41926097768](https://github.com/DanChetyrkin/Stockyllix/actions/runs/41926097768) passed. The frozen source also passed all **47 client checks**, Web export and Android/Hermes export. A local OneDrive/sandbox output-permission failure was resolved by rerunning the same frozen export with appropriate workspace access; it was not a source or assertion change.
- Final Hosting publication was verified at **2026-11-04 22:35:30 UTC**: **38/38 files**, **2,212,352 bytes**, matched the local export. Its audit identified the correct Render API, emulators disabled and no server-secret content. `check:release` passed the real HTTPS/API/CORS gate. No additional Render deployment was performed or needed.
- The manual browser trades remain tied to `7fe945d` and server `b0b0c8e`. After final `7ad8335` publication, the Help calendar instructions appeared, the clickable calendar opened again at 390px, and the shared Portfolio fully loaded with the existing session. The temporary viewport was reset and the app was left in the shared league, without changing its clock or orders. Physical Expo Go remains unverified despite successful native bundle compilation.

### Completed local 1.4 checks

- A March 1, 2027 test simulation completed a 50,000 ILS buy, identical-key retry, direct pending-execution fill, 5,000 ILS sale, another fill and a March 8 weekly transition. A later AAPL order remained pending. An actual API process restart restored the exact dataset, all price observations, portfolio/holdings/cash, orders, pending execution and accepted receipt. The independent shared fixture hash was unchanged.
- A legacy generator byte-hash regression matched the committed 1.3 build, so existing dataset identifiers and prices were not shifted by the optional simulation range.
- Manual local browser testing advanced directly to the pending AAPL execution, showed the no-pending state afterwards, and refreshed during a Resume request. On reload the UI checked the saved server receipt, displayed that it had already completed and unlocked controls without resubmitting. At the earlier pre-release read-only inspection, the then-deployed 1.3 shared admin page had no leftover unconfirmed request.
- Main header content scrolled out of the viewport on desktop and at 390px width; the phone document width remained 390. Browser Date/Time controls and the explicit new-game/test-simulation confirmation were visible. These local observations preceded the final public calendar checks above.

### ECB build reliability correction

The owner reported that deploying `07d3863` failed at `npm run import:ecb` with an ECB timeout. That importer always downloaded the fixed historical period with a single 20-second attempt. Loading the server's registry still requires the original ECB file for legacy worlds, even though the shared real historical replay carries its own BOI FX; skipping the import or substituting rates would therefore be unsafe.

The corrected preparation first validates an existing original FX file, then restores the same immutable observations from the private `referenceData/ecb-2026-10-02_2026-11-02-v1` document using existing Firebase credentials. Only absent/unreachable inputs trigger bounded official downloads. Invalid present inputs and changed observations fail closed. No raw rates, private keys or new environment settings were committed, and the existing Render build command was retained.

- The private cache was created/read back using the existing dedicated credential: **22 original ECB rows**, canonical SHA-256 `dd8937b9ac7fd1a3f0da18d88525dcbf722897ec5acf93571403d9883114d9d3`, complete baseline/legacy-world coverage validated. This operation touched only reference data, not game documents.
- In an ignored isolated copy with no `.env` or FX file, the exact command `npm ci --include=dev && npm run import:ecb && npm run build && npm prune --omit=dev` exited **0** in about **308 seconds**. The real `tsx` child-process adapter restored the private cache; no ECB download was needed. Normal source/development dependencies were not pruned.
- After pruning, the built runtime loaded both existing datasets and matched their complete content hashes: legacy `demo-oct2026-8b445066b3e2` and real historical `historical-8c9e717c12d59090`. The original local FX file was unchanged.
- The full server suite passed **266 tests**, with three emulator-only tests skipped in that run; TypeScript and ESLint passed. New regressions cover cache restoration, corrupted inputs, immutable-rate rejection, bounded retries, sanitized failure messages, request/body deadlines and oversized responses. These local tests are separate from the subsequent exact-commit Render health and authenticated acceptance recorded above.

## Previous completed release evidence: 1.3.0

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

**Required handover still outstanding:** accepted GitHub **Write** for `rotemyavne7` (latest recheck Read; explicitly deferred by the owner until final handover) and private administrator password delivery. The deployed release gates above are complete. Physical Expo Go and the actual Firebase console password-policy check remain unverified. Real-date retention instrumentation is tested; improved retention has not been established.
