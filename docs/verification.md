# Verification record

What was checked locally, what was checked in the cloud, and what is still open. Times are Israel time unless marked UTC.

## Current status

| Item | Status |
| --- | --- |
| Live web app | Built from `68d7a59` at https://stockyllix.web.app. After the deploy on November 5, `index.html`, all script bundles and the demo video matched the release build byte for byte |
| Live API | Server `68d7a59`. On November 7, `/health` returned 1.5.3 / market-list-v8 with that commit |
| Code on `main` | The same application code as `68d7a59`. Later commits change documentation only |
| CI | Server, app and emulator jobs run on every pull request and every push to `main` ([runs](https://github.com/DanChetyrkin/Stockyllix/actions/workflows/ci.yml)) |
| GitHub Write access for the reviewer | Owner handover |
| Physical Expo Go session | Android: the owner's 2:49 recording on November 5, 2026 (the demo video). iPhone: not verified |

## Local checks on the final code (November 7, 2026)

On Windows with Node 26.13.0, from a working copy whose code matches `68d7a59`:

- Server: typecheck, lint, 197 tests (3 more run only against the emulators) and the build passed.
- Firebase Auth and Firestore emulators (Java 21): all 3 tests passed. They cover conflicting transactions and rollback, two concurrent transactions competing for the same 20% limit, and direct browser access being denied.
- App: typecheck, lint, 50 unit checks and the web export passed.
- The 1,000-player load test passed its settlement and ranking checks ([below](#load-test-1000-players-for-one-simulated-week)).

## Live walkthrough of release 1.5.3 (November 5, 2026)

After both deploys, signed in as the reviewer administrator, with every change in the isolated test realm:

- An AMZN buy of ₪50,000 was pending with ₪950,000 available and ₪50,000 reserved. Two **Advance to market event** jumps (Tel Aviv opening, then US opening) took 51.3 s together and executed it once at $255.25 and USD/ILS 3.089.
- A ₪10,000 sale brought cash to ₪960,000, and the 20% rule held.
- A jump to October 29 took 245 s. Firestore is in `me-west1` (Tel Aviv) and the API in Render's Oregon region, so live clock processing takes about 6 seconds per event. The runbook explains the fix.
- A fresh, paused test game was left for the reviewer, and the shared league's world and revision were unchanged.

The earlier release 1.5.0 passed the same walkthrough on November 5. There, sending the same request key again returned the same order, and a ₪250,000 META buy was refused by the 20% rule.

## Failure and recovery checks

**Local acceptance run** (November 5, code `5754b1d`: a local API process with the Auth and Firestore emulators, the administrator's test realm, a simulated test game from March 1, 2027):

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

**In the cloud** (release 1.4.0, November 4):

- Render server `b0b0c8e` passed an authenticated run of 183 requests and 104 worker steps in the administrator's isolated test realm (22:08 UTC). A real historical test game executed at the snapshot's source price and FX and did not charge twice on retry.
- After a real Render **Restart service** (22:11 UTC), the simulated test game's dataset, clock, balances and orders matched their saved fingerprint, and the shared league was unchanged.
- A read-only audit of a reported "lost ₪50,000" found a correctly **pending** AMZN order: total ₪1,000,000 with ₪50,000 reserved. The phone layout hid the status column. Orders now shows status and execution time on phones, and the case became a [regression test](../server/tests/trade-regression.test.ts).

**Clock synchronization speed** (local, after the review on November 5): with 12 players and 10 of them polling every 3 seconds, a 40-event jump to October 29 took 71 seconds when each request processed at most 2 events, and 12 seconds after raising that to 40 events within the existing 8-second budget. No step failed.

## Data checks

The private snapshot `historical-8c9e717c12d59090` covers October 19–November 2, 2026, with 20 instruments and 21 sessions. All 420 replayed prices matched the raw download, and the BOI rates, the TASE closure on October 27 and the absence of corporate actions in the window were checked. Details are in [data sources](data-sources.md).

## Load test: 1,000 players for one simulated week

`npm run test:load -- 1000 week` (from `server`) runs the game engine on the in-memory store. 1,000 players each send two parallel ₪150,000 buys of the same asset, so one is accepted and the other is refused by the 20% rule. The clock then processes a full competition week, and the script checks balances and the ranking.

| Run | Clock steps | Document reads | Document writes | Time |
| --- | ---: | ---: | ---: | ---: |
| November 7, 2026, current code | 1,068 | 135,571 | 32,223 | 17–25 s in three runs on the owner's laptop |
| November 4, 2026, before removing the per-player valuation writes | 1,068 | 132,575 | 58,223 | 84.9 s |

- The counts are the same on every run of this scenario. The time depends on the machine, so the two times are not comparable.
- Removing a valuation document that was written for every player at every event and never read cut writes by 45%.
- The in-memory store runs one transaction at a time. These numbers measure the engine's work, not cloud throughput, Firestore contention or billing.
- One such week needs more than Spark's free daily quota of 50,000 reads and 20,000 writes.

## Demo video (November 5, 2026)

The owner recorded a 2:49 session in Expo Go on an Android phone: sign-in, a new game, a ₪500,000 Apple buy refused by the 20% rule, a ₪50,000 buy that stayed pending, the clock moved to the US opening, the executed order, and the TradingView news panel inside the app. The web copy is H.264 at 720 × 1560 and a constant 30 frames per second, 13.5 MB, with its index at the start so playback begins before the download ends. A chat notification that appeared for about four seconds is blurred. Hosting serves it as `video/mp4` with a one-day cache and answers range requests, which iPhone Safari needs for video.

## Not verified

- Load in the cloud: many players at once, billed Firestore operations, and how long due clock events take under that load.
- The right to show the previously downloaded Yahoo prices in a public app.
- That the Firebase console password policy matches the sign-up form (8+ characters with a letter and a number).
- A real iPhone session in Expo Go.
- Whether the daily question brings players back. Only the measurement is built.
