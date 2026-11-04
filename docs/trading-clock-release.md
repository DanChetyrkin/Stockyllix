# Trading and shared-clock release — November 4, 2026

## Confirmed incident, before any production changes

A read-only Firestore audit found the reported AMZN buy of 50,000 ILS in **pending** status. The account had 1,000,000 total cash, 50,000 reserved cash, 950,000 available cash, zero holdings value and 1,000,000 total portfolio value. Its execution was scheduled for the October 19 US opening; the shared historical world was still at October 19 midnight Israel time, idle with no processing job. There was no missing money or double debit. The old cash metric and horizontally scrolled Orders table obscured the reservation and pending state on a phone. The other two active portfolios had 1,000,000 available and no orders; the owner clarified that the earlier inability to trade was clock-related. No transaction was submitted as either friend.

## Implemented behavior

- Portfolio separates total value, available cash, reserved cash, holdings value and total cash. Server Decimal calculations provide holdings value. Reservations remain owned cash; execution exchanges cash for fractional holdings, rather than reducing total value by the purchase amount.
- Mobile Orders uses vertical rows showing asset, side, amount, status and execution date without horizontal scrolling. Desktop retains a table. Accepted/pending, executed and rejected outcomes have distinct explanations.
- Malformed or older-world saved requests have a local-only recovery path. Accepted server orders are never cancelled by clearing a local draft. Unknown current-world responses retain the original idempotency key for a safe retry, including after the period ends. Missing execution events, synchronization, insufficient available cash and reserved sells have explicit explanations/actions.
- Order acceptance refreshes account and order resources; shared-world polling updates completed event generations. Background requests are single-flight, inactive apps stop polling, and foreground requests synchronize from the server. UI timers only interpolate server-supplied time for display.
- Each world has a persisted clock anchor under `worlds/<worldId>/clock/state`. Historical playback advances one game second per server second, with original source dates and an end cap. Legacy worlds start from their existing processed position on first synchronization, without resetting accounts or replacing prices.
- `world.clock.targetNow` is logical game time; `world.now` is the latest completed market-event position. The UI labels both game time and current Israel time (`Asia/Jerusalem`, including DST). No device timestamp sets an order's execution.
- API requests process a bounded part of due jobs. When Render sleeps there is no running worker; elapsed time is preserved by the anchor, and subsequent requests complete due events safely. No promise of immediate execution while the free service is asleep is made. Trading cannot cross an unprocessed due event.
- Administrator pause/resume, forward custom time, historical playback and next trading opening/closing are idempotent and audited. All intermediate FX/price/week events are processed once. Backward changes and data-window overruns are rejected. Current-price realtime mode is unavailable until suitable execution prices and FX are verified; attempting it cannot disable historical trading or relabel historical prices.
- Header `X-Stockyllix-Test: true` selects an administrator-only isolated test realm, stored under `testRealms/<authenticatedUid>/`. It has its own active pointer, portfolios, orders, clock and audit. The app's World controls switch between test and shared scopes; local state is scoped by user/realm/world. Ordinary users cannot select test scope or change clocks.

## Deployment

The server is **1.3.0 / clock-trading-v3**. Keep Render Free, existing Firebase credentials, administrator UIDs, dataset seed, FX and private historical file unchanged. No new account, paid worker, scheduler or billing upgrade is needed. `WORLD_CLOCK_AUTOSTART=true` is the default; it may be set false only for intentionally paused local test fixtures. Keep Yahoo automated access disabled unless the source grants permission.

Before production publication, run server/client checks and isolated-world HTTP/browser acceptance. Deploy the reviewed commit on `codex/render-free-deploy`, then verify the exact release/commit in `/health`. Publish the Web export to the existing Firebase Hosting sites. A read-only before/after audit must confirm the shared users, balances, orders and active pointer were preserved; natural automatic processing at due times is distinguished from test mutations.

## Evidence

Reports containing private account-level details stay under ignored `artifacts/trade-clock-review/`. Record local/actual-cloud/browser outcomes in `verification.md`; a compile or synthetic fixture alone is not a deployed acceptance result.
