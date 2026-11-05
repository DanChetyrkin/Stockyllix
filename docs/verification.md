# Verification record

This file separates what was checked locally, what was checked in the cloud, and what is still open. Times are Israel time unless marked UTC.

## Current status

| Item | Status |
| --- | --- |
| Live web app | Built from `8299242` at https://stockyllix.web.app. `index.html` and all three script bundles match the release build byte for byte |
| Live API | Server `8299242`, `/health` = 1.5.2 / readability-v7 |
| CI | All three jobs passed for `d780399`; see GitHub Actions for later commits |
| GitHub Write access for the reviewer | Owner handover |
| Physical Expo Go session | Not verified. Browser phone-width checks and the Android bundle build are not a device test |

## Market list fix and price watch removal, release 1.5.3 (November 5, 2026)

A manual run found that the order panel always opened on LUMI, the first asset in the catalogue, even when the market filter showed only US assets. The panel now follows the visible list, and a saved or reviewed request keeps its asset. The price watch was removed: the assignment does not ask for it, and without notifications it could only show a badge inside the app. Existing `users/<uid>/watchlist/current` documents are no longer read. Locally: 197 server tests (the 6 removed tests covered only the watchlist), 50 app checks (1 new for the order panel), typecheck, lint, the server build and the web export passed.

## Readability pass, release 1.5.2 (November 5, 2026)

The source was formatted once with Prettier (120 characters per line, layout only), the 20% rule got a named constant, and the redundant `seed` script, two unused packages (`expo-device`, `expo-web-browser`) and the Expo template file `mobile/AGENTS.md` were removed. Locally: 203 server tests, 49 app checks, typecheck, lint, the web export and the Android export passed.

After both deploys, the live walkthrough passed again in the isolated test realm: the AMZN buy reserved ₪50,000 and executed once after two **Advance to market event** jumps (52.2 s), the sale, the 20% rule and the refusal of the removed action held, and the shared league was unchanged. `mobile/.env.example` now holds the live game's public settings, so the README's Expo Go steps need no editing.

## Review pass and release 1.5.1 (November 5, 2026)

A second review of the deployed code removed what nothing used: the "Advance to pending execution" control and its scan of every player's orders (every order executes at a market opening or closing, so "Advance to market event" reaches it), the old `/admin/clock/advance` route, the `valuations` document written for every player at every event but never read, the review fields nothing displayed, a dead `import:market` script and six partial `test:*` scripts. The Hosting quota in the runbook was corrected to 10 GB per month. Locally: 203 server tests, 49 app checks, typecheck, lint, the web export and `check:release` passed.

The same walkthrough as below then ran against the live 1.5.1 API, in the isolated test realm: the pending AMZN buy reserved ₪50,000; two **Advance to market event** jumps (Tel Aviv opening, then US opening) took 51.8 s and executed it once at $255.25 and USD/ILS 3.089; a ₪10,000 sale brought cash to ₪960,000; the removed `next_order` action was refused; the 20% rule held; a jump to October 29 took 236 s. A fresh, paused test game was left for the reviewer, and the shared league's world and revision were unchanged.

## Live checks of release 1.5.0 (November 5, 2026)

The release was built from a clean clone of `48ad777` on the owner's Windows machine: 204 server tests, 49 app checks, typecheck, lint, the web export and `check:release` passed there. The site was deployed to Hosting first, then the API on Render.

The walkthrough then ran against the live API, signed in as the reviewer administrator, with every change made in the isolated test realm:

- A new real-historical test game (`historical-8c9e717c12d59090`) started with ₪1,000,000.
- An AMZN buy of ₪50,000 was pending, with ₪950,000 available, ₪50,000 reserved and ₪1,000,000 total. Sending the same request key again returned the same order.
- Advancing to the order's execution event took 33.5 s. The order executed once at the US opening on October 19 (16:30 Israel) at $255.25 and USD/ILS 3.089, the same source price and rate as the November 4 browser run. Cash was ₪950,000, reserved ₪0 and the AMZN holding ₪50,000.
- A ₪10,000 sell executed and cash became ₪960,000. A ₪250,000 META buy was refused by the 20% rule. The daily question and the league loaded.
- A jump to October 29 00:01 took 234 s. The next market event was correctly shown as the TA opening at 10:00.
- A fresh, paused test game was left at the start of the period for the reviewer.
- The shared league's world and revision were the same before and after the run.

Firestore is in `me-west1` (Tel Aviv) and the API in Render's `us-west1` (Oregon), so live clock processing takes about 6 seconds per event. The runbook explains the fix.

## Final cleanup checks (November 5, 2026)

The cleanup started from the deployed submission commit `fc77646` on `codex/render-free-deploy` and was made on a separate branch. The rows below were rerun on the final code commit `5754b1d`.

| Check | Before (`fc77646`) | After |
| --- | --- | --- |
| Server typecheck, lint, build | Passed | Passed |
| Server tests | 266 passed, 3 emulator-only skipped | 204 passed, 3 skipped. The 61 removed tests covered only the deleted live-feed and Twelve Data modules, and one tested the removed `realtime` clock action |
| Firestore + Auth emulator suite | 3 passed | 3 passed |
| App typecheck, lint | Passed | Passed |
| App unit checks (`node --test`) | 47 passed | 49 passed (2 new: order amount, starting name) |
| Web export, Android export | Passed | Passed |
| Fresh clone of `5754b1d` (no `node_modules`, `.env` or data files) | — | Every row above passed again: install, typecheck, lint, 204 server tests, emulator suite, build, 49 app checks, web and Android export |

**Render build:** in a fresh clone, `npm ci --include=dev`, `npm run build` and `npm prune --omit=dev` passed, and the pruned API started and reported 1.5.0 / final-cleanup-v5 on `/health`. `npm run import:ecb` could not be checked here: the sandbox cannot reach ECB and has no access to the private rate cache, and the step correctly stopped with `ECB_UNAVAILABLE`. That code did not change; Render restores the rates from the private cache.

**Acceptance scenario (local API process + Auth/Firestore emulators, administrator test realm, simulated test game from March 1, 2027):**

- Permissions: no token → 401, a player using the test-realm header → 403, a player changing the clock → 403.
- New test game: ₪1,000,000 total cash and value.
- AMZN buy of ₪50,000: pending, with ₪950,000 available, ₪50,000 reserved, ₪1,000,000 total cash and value, and ₪0 holdings. The same request key returned the same order with no second reservation; the same key with a different amount was rejected.
- Advancing to the execution event: executed once at the US opening (16:30 Israel). Dollar price × USD/ILS × units = ₪50,000.00. Cash ₪950,000, reserved ₪0. Repeating the same clock request did not execute or charge again.
- A ₪10,000 sell reserved all AMZN units, a second sell was refused while it was pending, and after execution cash was ₪960,000. Refreshing gave the same balances.
- Two parallel buys on different assets were both accepted (₪200,000 reserved). Two parallel ₪150,000 GOOGL buys gave one acceptance and one `CONCENTRATION_LIMIT`. A single ₪250,000 buy was refused by the 20% rule. Four parallel ₪190,000 buys with ₪610,000 available gave 3 acceptances and one `INSUFFICIENT_CASH`.
- A jump to Monday March 8 archived week 2027-03-01 (rank 1, score 100 as the only eligible player) and restarted weekly return and MDD.
- **Restart:** the API process was stopped and started again. The same test game, generated dataset, balances, holdings and orders were returned, and the pending AAPL order then executed once.
- **End of period:** the clock stopped at the final instant. New orders and "next event" returned `DATASET_FINISHED`, and moving backwards returned `CLOCK_BACKWARD`.
- The shared league's world, revision and player balances were unchanged by all of the above.

**Clock synchronization speed (after the review):** with a dataset on the real calendar, 12 players and 10 of them polling every 3 seconds, a 40-event jump to October 29 took 71 seconds when each request processed at most 2 events, and 12 seconds after raising that to 40 events within the existing 8-second budget. There were no failed steps. While synchronizing, World controls now says the next events will be shown after it finishes, instead of wrongly saying none remain.

**Phone width (390 × 844, local web build, Playwright):** a ₪50,000 AMZN buy placed through the UI showed "Pending execution" and the expected execution time in Orders without horizontal scrolling (page width 390). Portfolio showed ₪950,000 available and ₪50,000 reserved. The header scrolled out of view with the page. The game-information and navigation dialogs opened and closed by tapping outside. No page errors.

## Earlier cloud evidence (release 1.4.0, November 4, 2026)

These checks ran on the live services before the cleanup.

- Render server `b0b0c8e` passed an authenticated run of 183 requests and 104 worker steps in the administrator's isolated test realm (22:08 UTC). A real historical test game showed the pending ₪50,000 AMZN balances, executed at the snapshot's source price and FX, and did not charge twice on retry. A March 2027 simulated game passed buy, sell, the March 8 week change, DST validation and the end-of-period refusal.
- After a real Render **Restart service** (22:11 UTC), the simulated test game's dataset, clock, balances and orders matched their saved fingerprint, and the shared league was unchanged.
- Through the public UI at 390px: a fresh real-historical test game, an AMZN ₪50,000 buy (pending balances correct), **Advance to pending execution** (filled at 255.25 USD, FX 3.089), then a ₪10,000 sell that filled at the US close. A read-only check found exactly two executed orders, ₪960,000 cash and nothing reserved, and the shared league, its players and earlier test games were unchanged.
- Hosting: all 38 files of client `7ad8335` matched the local export, and `check:release` passed the HTTPS and CORS check. CI passed all three jobs for [b0b0c8e](https://github.com/DanChetyrkin/Stockyllix/actions/runs/41917171437) and [7ad8335](https://github.com/DanChetyrkin/Stockyllix/actions/runs/41926097768).
- An earlier read-only audit of a reported "lost ₪50,000" found a correctly **pending** AMZN order: total ₪1,000,000 with ₪50,000 reserved. The old phone layout hid the status column; Orders now shows status and execution time on phones.

## Data checks

The private snapshot `historical-8c9e717c12d59090` covers October 19–November 2, 2026, with 20 instruments and 21 sessions. All 420 replayed prices matched the raw download, and the BOI rates, the TASE closure on October 27 and the absence of corporate actions in the window were checked. Details are in [data sources](data-sources.md).

## Not verified

- Load at real scale. The 1,000-player local week is engine timing only. Spark quotas and a sleeping Render instance limit real capacity.
- The data rights to show the previously downloaded Yahoo prices.
- The Firebase console password policy and the sign-up form rules (8+ characters with a letter and a number).
- A real phone session in Expo Go.
