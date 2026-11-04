# Reviewer walkthrough: 3–5 minutes

**Open [stockyllix.web.app](https://stockyllix.web.app)** on a browser or phone. All money is virtual. This guide matches the 1.4.0 controls; consult [verification](verification.md) to see which exact version is currently deployed and checked.

Sign in with `admin@stockyllix.com`; obtain its password privately. No installation is required. Use the isolated test game for actions below so other players' time and balances remain untouched.

## 1. See the account and source

Open Portfolio. It separates **total portfolio value**, **available cash**, **reserved cash**, **holdings value** and **total cash**. A new player in a new game receives ₪1,000,000 once; signing in again never adds money.

Read the header's two clocks: **Israel time now** is the real server-derived date; **Game time** is the active replay date. The real historical game uses October 19–November 2, 2026 and BOI execution FX. Current market/news are a separate real-world TradingView display, potentially delayed, and do not price orders.

## 2. Open a safe game

In World controls, choose **Open isolated test game**. Check the **Isolated test game** scope before changing time or money. For the exact cash example below, **always create a fresh test game**, even if the current test period has not ended: open **Start a new game**, select **Real historical prices**, type **NEW GAME**, then choose **Create new test game**. Previous games/orders remain saved; this new game starts with its own fresh portfolio. An existing test game may already contain trades and different balances.

For this real-data walkthrough, keep the real historical source. The optional **Simulated test prices** mode is a separate, explicitly generated 28-calendar-day sandbox; it is not historical evidence.

## 3. Send one ₪50,000 AMZN buy

Open Demo trading, choose **AMZN → Buy**, enter **50000**, then review. Confirm the scheduled execution in Israel time and the available-after-reservation amount before sending.

An accepted message means **pending**, not filled. Open Portfolio/Orders: a fresh account should show:

| Item | While pending |
| --- | ---: |
| Total cash | ₪1,000,000 |
| Reserved cash | ₪50,000 |
| Available cash | ₪950,000 |
| Holdings value | ₪0 |
| Total portfolio value | ₪1,000,000 |

Orders shows asset, side, amount, status and execution time without scrolling sideways on a phone. An uncertain network response is resolved by checking/retrying the saved request; repeatedly tapping must not create another order.

## 4. Reach its execution

Return to World controls. **Next pending execution** shows its exact market, opening/closing time and order count. Choose **Advance to pending execution** and allow processing to finish. This traverses every reached event; it does not send the trade again.

Orders should now show **Executed**, quantity, source price and execution FX. Portfolio should show ₪950,000 cash, zero reserved and about ₪50,000 holdings immediately after the fill; total value remains about ₪1,000,000. Later price/FX changes can change that value.

Optional: submit a ₪10,000 sell, repeat the pending-execution action, and see cash increase and the holding shrink. A rule failure instead shows **Rejected** with a reason and releases its reservation.

## 5. Explain one decision

- A buy cannot push one security above 20% of portfolio value; existing holdings and pending buys count. No leverage, short selling or user cancellation.
- Orders sent while their market is open fill at that close; otherwise at the next open. The displayed quote is not a promised fill price.
- A running historical clock advances at **1× server time**. Render can sleep; the next request catches up safely from Firestore. **Advance to market event** is a separate shortcut when no order is waiting.
- The league combines **85% return percentile + 15% stability percentile**. MDD is a peak-to-later-trough decline over observed game events, not a daily high/low reconstruction.

Open News & quiz for the daily finance question. Its day follows the game in Israel time; news headlines follow actual publication time. Its educational value does not require another trade.

## Additional checks when time permits

- **Custom date:** use Date and Time · Israel (24h), then **Apply time and pause**. Pick a forward time inside the available period; no ISO string is needed. Moving to an earlier date requires a new game.
- **Weekly transition:** choose a later Monday within coverage, allow intermediate events/weekly summaries to complete, then inspect The league. Cash/holdings carry forward; weekly statistics restart.
- **End of period:** jump only to the displayed final boundary. Further orders without an execution event are blocked with a reason. Use a new game to restart; no automatic account reset or invented future price occurs.
- **March 2027 test:** in the isolated realm create a **Simulated test prices** game with the selected March date. Check the visible source/range; these stock prices and FX are generated for testing, while shared real history stays unchanged.
- **Reload/retry:** refresh Orders, check session and balances, and retry the same saved request if its outcome was uncertain. Do not create another request key to solve a timeout.
- **Return safely:** choose **Return to shared league**. Do not change the shared game's time merely to repeat this walkthrough.

Provider panels can show no stories for an uncovered company. A cold Render start, source delay or no-news state is explained separately from trade failure. Advanced recovery is in the [runbook](runbook.md); ask the owner for help rather than resetting a processing game.
