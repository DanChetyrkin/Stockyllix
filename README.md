<p align="center"><img src="mobile/assets/branding/stockyllix-wordmark.png" alt="Stockyllix" width="320"></p>

# Stockyllix

A weekly portfolio league: each player gets ₪1,000,000 in virtual cash, trades 20 Tel Aviv and US stocks and funds on replayed real historical prices, and is ranked every week on return and stability.

**Play in the browser: [stockyllix.web.app](https://stockyllix.web.app)** (no installation).

To try everything, including the game clock controls, sign in with:
>
> - Email: `admin@stockyllix.com`
> - Password: `Watermelon2001@Mango!`
>
If anything doesn't work as expected, I'd be happy to help. Thank you for your time!

## Try the demo

**[Watch the 2:49 Android walkthrough](https://stockyllix.web.app/demo/stockyllix-demo.mp4).** It shows the 20% cap, a pending buy and execution at the US opening.

[![Stockyllix demo on Android](docs/demo-preview.jpg)](https://stockyllix.web.app/demo/stockyllix-demo.mp4)

1. Sign in with the demo account above. Open **Menu → World controls → Open isolated test game**.
2. Choose **Start a new game → Real historical prices**, type `NEW GAME` and select **Create new test game**.
3. In **Demo trading**, buy ₪50,000 of AMZN. Confirm the order. **Orders** shows **Pending**, with ₪50,000 reserved and ₪950,000 available in **Portfolio**.
4. In **World controls**, choose **Advance to market event** until the US opening. **Orders** shows **Executed** with the fill price and FX rate. Try **The league** and the daily question on **News**, then choose **Return to shared league**.

The API may take about a minute to wake after idle. World controls shows progress during clock jumps.

## What I built and why

Players can register, trade and view the weekly standings in one Expo / React Native app for web and mobile. Firebase Hosting serves the website. An Express API on Render verifies Firebase Auth tokens and owns the trading rules and clock. Firestore stores the state, with direct client access blocked. This keeps the rules in one place and fits the assignment's no-card constraint.

The shared league replays daily opens and closes for 10 Tel Aviv and 10 US listings from October 19 to November 2, 2026, with an October 16 baseline. The window provides two competition weeks and an extra execution day, with no reported splits or dividends. Bank of Israel reference rates become available at midnight Israel time the following day. A fixed replay makes accelerated clock jumps repeatable. [Dataset preparation](docs/runbook.md#historical-dataset)

Each game has one saved clock. In **World controls** a demo administrator can pause, resume at 1×, advance to the next market event, or pick a later Israel date and time. In an isolated game, **Simulated test prices** creates a labelled 28-day scenario from a chosen date. TradingView panels show market data separately from order pricing. [Clock access](docs/runbook.md#reviewer-access)

**The league → Archived week** shows earlier standings within the selected game. Starting a new game keeps the old game's records in storage. The app has no past-game picker.

## What I tested

| Risk | Decision | Evidence | Limit |
| --- | --- | --- | --- |
| Two buys compete for the same cash | Commit the order and reservation together | With ₪100,000 available, one of two ₪75,000 buys was accepted and ₪25,000 remained. The emulator separately checked contention at the 20% cap. [Cash test](server/tests/trade-regression.test.ts#L80) · [Emulator test](server/tests/firestore.integration.test.ts#L40) | Correctness in tested scenarios |
| A process fails after a fill | Save the event marker with the fill and resume from a saved cursor | Injected failure after a ₪50,000 fill. Recovery left one executed order and zero reserved cash. [Recovery test](server/tests/trade-regression.test.ts#L122) | Catch-up depends on game requests |
| Future quotes or FX leak into play | Reveal prices and rates according to game time | Checked 420 open and close prices against the source snapshot. [Quote visibility test](server/tests/market-insights.test.ts#L33) · [FX boundary test](server/tests/historical-import.test.ts#L56) | Players can look up historical prices |
| A clock jump updates many portfolios | Process in pages and persist progress | A local week for 1,000 players took 6.6 s and counted 135,571 reads and 32,223 writes in memory. [Benchmark](docs/runbook.md#local-workload-benchmark) | Cloud capacity remains untested |

**Hosted demo.** An AMZN buy filled once after two clock jumps. A ₪10,000 sale left ₪960,000 cash, and an over-limit buy was rejected. A separate Render restart preserved a test game's state. **Local checks.** 199 server tests, 3 Firebase emulator tests and 50 app tests passed, along with type checks, lint and the web build.

**GitHub Actions.** CI checks the server and app with type checks, lint, tests and builds, plus a separate Firebase Auth and Firestore emulator job. The emulator suite covers concurrent writes, rollback and direct-client access rules. All three jobs passed in the linked run. [Successful CI run](https://github.com/DanChetyrkin/Stockyllix/actions/runs/41917171437) · [Workflow](.github/workflows/ci.yml)

## Limits and next steps

- **Market model.** The league stops when its historical window runs out. Players can look up past prices, and drawdown sampled at price and FX events can miss intraday losses. A cash-only portfolio can earn the full 15-point stability component. Orders fill in full or are rejected. The simulation omits fees and corporate actions.
- **Hosting and scale.** Render Free sleeps after 15 idle minutes. Trading waits while game requests process due events. In one hosted test, a jump to October 29 took 245 seconds with the API in Oregon and Firestore in Tel Aviv. I'd measure event completion lag, API latency and Firestore usage under concurrent load. [Render cold starts](https://render.com/docs/free#spinning-down-on-idle) · [Capacity and quotas](docs/runbook.md#capacity-and-limits)
- **Coverage.** The walkthrough was recorded on Android. Physical iPhone testing and the hosted rollout of the sandbox-only reviewer role remain open.

## Rules I completed

| Rule | My decision | Why |
| --- | --- | --- |
| Starting balance and order amounts | Give ₪1,000,000 once per player per game. Store shekel amounts in agorot and units to 18 decimals | Exact money amounts and safe retries |
| Order timing | Orders sent during a session fill at its close. Other orders fill at the next open. The exact close counts as closed. Accepted orders cannot be cancelled | Each order gets one execution event |
| Pending orders and rejections | Reserve cash for buys and units for sells. Allow one pending sell per asset and up to 20 pending orders per player. Release the reservation on rejection | Avoid leverage and shorts, and bound each portfolio update |
| Concentration | Check the 20% cap at submission and execution, counting pending buys at submission and processing oldest orders first. Allow holdings to rise through appreciation | Concurrent orders and price changes can affect the cap |
| FX and sessions | Use market-local hours, daylight saving and recorded holidays. Convert US fills at the latest available USD/ILS rate for the execution event | Both markets follow the same server clock |
| Weekly eligibility | Monday 00:00 to Saturday 00:00 Israel time. Join before Monday's Tel Aviv opening to qualify. Cash and holdings carry over | Include Friday's US close and give ranked players the same window |
| Weekly scoring | 85% return percentile and 15% stability percentile. Return is end value ÷ start value − 1. Smaller maximum drawdowns rank higher for stability. Ties share rank and a sole player gets 100 | Rank both performance and downside |
| Retries and missing data | A matching request key returns the original order. Missing price data pauses processing until restored | Avoid duplicate orders and preserve recorded fill prices |

## The daily question

**News** offers a short finance question each game day, so players have a reason to open the app between trades. I chose it over alerts and push notifications because it fits the educational demo. Visits are recorded by real calendar day. I'd compare day 1 and day 7 return rates for players who answered and players who did not. The feature's effect on retention remains untested.

## Setup and commands

[Operations runbook](docs/runbook.md) · [Server checks](server/README.md#commands) · [App checks](mobile/README.md#commands)
