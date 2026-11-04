<p align="center"><img src="mobile/assets/branding/stockyllix-wordmark.png" alt="Stockyllix" width="320"></p>

# Stockyllix

A weekly portfolio league: each player gets ₪1,000,000 in virtual cash, trades 20 Tel Aviv and US stocks and funds on replayed real historical prices, and is ranked every week on return and stability.

**Play in the browser: [stockyllix.web.app](https://stockyllix.web.app)** (no installation). Reviewer administrator: `admin@stockyllix.com`. The password is sent privately.

## Try it in 3–5 minutes

1. Open the link and sign in as the administrator. A new player can also register; every player starts with ₪1,000,000 once per game.
2. Open **Menu → World controls → Open isolated test game**. Everything below now happens in your own test game. Other players and the shared league are not affected.
3. Choose **Start a new game → Real historical prices**, type `NEW GAME` and choose **Create new test game**. You get a fresh portfolio with ₪1,000,000.
4. Open **Demo trading → AMZN → Buy**, enter `50000`, choose **Review** and **Confirm & send order**. The order is **pending**. Portfolio shows ₪950,000 available, ₪50,000 reserved, and ₪1,000,000 total cash and total value.
5. Open **World controls → Advance to pending execution**. **Orders** now shows **Executed**, the units, the dollar price and the USD/ILS rate. Portfolio shows ₪950,000 cash, ₪0 reserved and about ₪50,000 of AMZN.
6. Optional: sell ₪10,000 of AMZN and advance again, open **The league**, and answer the daily question on **News**.
7. Choose **Return to shared league** when you finish.

## What I built and why

| Assignment | How it works in Stockyllix |
| --- | --- |
| Register, buy and sell, see the table | Firebase sign-up, **Demo trading**, **Orders**, **Portfolio** and **The league** (weekly table) |
| ₪1,000,000 start, amounts in shekels, fractions | The server creates the portfolio once in a transaction. Amounts are whole agorot; units keep 18 decimals |
| Execution at close or next open, no cancellation | Each order gets a fixed execution event when it is accepted. There is no cancel endpoint |
| No shorts or leverage, 20% per asset | Buys reserve cash, sells reserve units, and the 20% limit is checked when the order is sent and again when it runs |
| US assets in dollars at the execution rate | Dollar price × the USD/ILS rate that was published before the execution event |
| Score = 0.85 × return rank + 0.15 × stability rank | Percentiles over eligible players, with MDD sampled at every price and FX event |
| 20 instruments in both markets, prices and FX over time | 10 TASE and 10 US listings (including SPY) with real daily prices and Bank of Israel rates |
| One shared clock that can be advanced | A saved game clock that runs at 1× real time, with administrator jumps that process every event in between |
| One feature that brings players back | A daily finance question, with real-date return visits recorded on the server |
| Ready for real users | Server-side rules, transactions, retry-safe requests, an isolated test realm, CI and a recovery runbook |

**Stack.** One Expo / React Native / TypeScript app serves the web and phones. An Express / Node API on Render (free plan) checks every Firebase ID token and runs all game rules. Firebase Authentication and Firestore stay on the free Spark plan. Firestore rules deny all direct client access, so balances, prices and time change only in API transactions.

**Why this shape.** Cloud Functions needs the paid Blaze plan, which needs a payment card, and the assignment asks not to add one. A small always-on API also keeps every rule in one place that can be tested end to end.

## How the world was built

The game separates three kinds of prices, and each screen says which one it shows:

- **Real historical prices: the shared league.** 20 listings with daily open and close prices from October 19 to November 2, 2026, plus an October 16 baseline. That gives two full competition weeks and one extra day for executions. The prices come from a private Yahoo/yfinance snapshot. TASE quotes in agorot are divided by 100. USD/ILS is the Bank of Israel representative rate, and each day's rate becomes usable only at 00:00 Israel time on the next day. I chose this window because it has no reported dividends or splits, and the TASE closure on October 27 is confirmed. The snapshot is not in Git. Render loads it as a secret file, and the API never returns prices from after the current game time.
- **Simulated prices: separate test games only.** An administrator can create a 28-day game with generated prices and FX from any start date, for example March 2027, inside their isolated test realm. It is labelled "Simulated" everywhere and can never replace the shared league's data.
- **TradingView: market display only.** **Current market** and **News** embed TradingView widgets. These may be delayed and are never used to price an order.

An older simulated world based on ECB rates is still loaded, so games created with it stay readable. Sources, research and data rights are in [docs/data-sources.md](docs/data-sources.md).

## The game clock and how to advance it

- Every game has one saved clock. While it runs, game time moves one second per real second from the historical date. Phones only display it; they never decide execution.
- Render's free plan sleeps, so there is no background worker. Each API request lets the server process reached events in small, saved steps. Trading pauses with a clear message until every reached event has been applied to all portfolios.
- **To advance:** sign in as an administrator and open **World controls**. You can **Pause / Resume**, **Advance to pending execution**, **Advance to market event**, or pick a date and time in Israel time and choose **Apply time and pause**. Every jump goes forward only, stays inside the price period, and processes every event in between, in order, once.
- **Permission:** the API allows these actions only for Firebase user IDs listed in its `ADMIN_UIDS` setting. Reviewers use the administrator account above. In a local setup, add your own user ID to `ADMIN_UIDS`. Administrators can also open an isolated test realm, so experiments never touch the shared league.
- A game cannot move backwards and does not loop at the end of its data. To start again, create a new game. Old games and their results stay saved.

## Rules I completed

| Rule | My decision | Why |
| --- | --- | --- |
| Starting money | ₪1,000,000 once per player per game, created in a transaction | Signing in again or a retry cannot add money |
| Order amount | A positive shekel amount with up to 2 decimals, stored as whole agorot | Exact money math with no rounding drift |
| Pending buy | The full amount is reserved. Available cash = cash − reserved | No leverage, and two pending buys cannot spend the same cash |
| Pending sell | One pending sell per asset, which reserves the units held at that time | No short selling |
| Execution time | Sent during the session: that day's close. Otherwise: the next open. Exactly at the close counts as closed | Follows the assignment and gives every order one exact event |
| 20% when sending | Current holding + pending buys + the new buy ≤ 20% of portfolio value | Parallel buys cannot get around the limit |
| 20% when executing | Checked again at the execution price, oldest order first | Prices can move before execution |
| Asset grows above 20% | No forced sale | The rule applies at the moment of buying |
| Sell after a price drop | Units are calculated at execution. The whole order is rejected if the holding no longer covers it | No negative holdings and no silent change to the amount |
| Rejected or partial orders | No partial fills. A rejection shows its reason and releases the reservation | Simple, explainable results |
| Repeated request | The same request key returns the same order. A different amount with the same key is rejected | A retry after a network timeout cannot buy twice |
| Pending orders | At most 20 per player | Keeps each update small |
| USD/ILS rate | The latest Bank of Israel rate published before the event | No rate from the future |
| Trading hours | The assignment's TA and US hours, using the Israel and New York time zones (including daylight saving). Holidays come from the data | One calendar for both markets |
| Competition week | Monday 00:00 to Saturday 00:00, Israel time | Includes Friday's US close |
| New week | Cash and holdings carry over. Start value, peak and MDD restart | No weekly cash bonus |
| Late joiners | Ranked only if they joined on Monday before TASE opens. Otherwise they practice until next week | Every ranked player has the same window |
| Weekly return | End value ÷ start value − 1 | There are no deposits or withdrawals |
| MDD | The largest fall from a peak, sampled at every price and FX event | Daily high/low prices do not say which came first |
| Percentile | rank = 1 + number of players strictly better; percentile = 100 × (N − rank) ÷ (N − 1); one player gets 100; ties share | 100 means best, as the assignment defines |
| Holding only cash | Allowed: return 0% and MDD 0% | Cash is a valid choice |
| Missing price or rate | Processing stops and can resume. Nothing is invented | A wrong price is worse than a short pause |
| End of data | The clock stops. Orders with no execution event left are rejected | No looping and no made-up prices |
| Fees, dividends, splits | Not simulated. The replay window has none reported | A clear simplification |

**Rules that can be exploited:** stability rewards holding cash (MDD 0%), so a player can sit in cash for 15% of the score. Replayed historical prices can be looked up online, so a real competition would need live data or hidden dates. An asset can grow above 20% after it is bought.

## The daily feature: a question of the day

The **News** page shows one short finance question per game day. Everyone gets the same question, the first answer is final, and the explanation teaches one concept such as drawdown, FX exposure or diversification. It does not change cash or score. The question changes at midnight in the game's Israel time.

**Why this feature:** it takes under a minute, gives a reason to open the app every day even without trading, and fits an education app. It also needs no paid data.

**How I'll know it works:** each visit to News records one review per real Israel date on the server (`reviews/{date}` and `activity/current` with `distinctRealDays` and `returnedOnLaterRealDay`). Moving the game clock does not count as a return visit. The success measure is the share of players who come back on a later real day (day 1 and day 7), compared with players who never answered. This is measured, but it is not proven yet, because there are no real users.

## Running in production

- All rules run on the server. Order, portfolio and event updates commit together in Firestore transactions. Per-player event markers mean a retried step never fills an order twice.
- Clock jobs use leases with a fence number, so a stale worker cannot overwrite newer work. After a crash or a Render restart, the next request continues from the saved job.
- Each player has a rate limit. `/health` reports the version and the deployed commit. Logs carry a request ID, status and duration, without tokens.
- CI runs on every pull request: server typecheck, lint, tests and build; app typecheck, lint, unit checks and a web export; and Firestore and Auth emulator tests.
- Known limits: Spark quotas and one sleeping Render instance. A local 1,000-player week took about 85 seconds and about 132k reads, which is more than Spark allows in a day. Thousands of players arriving at once would need a paid plan, a background worker and load tests in the cloud first. Operations and recovery are in [docs/runbook.md](docs/runbook.md).

## What I added beyond the assignment

Isolated administrator test games (real or simulated, from any date), asset charts and daily change sorting, watchlist price targets, a performance report (realized and unrealized profit, compared with SPY), profile name and photo, light and dark themes, and the latest Bank of Israel reference rate.

## What I left out, and why

- **Trading at today's prices.** No free source offered both markets, open and close history, and permission to display it in a public app. The game replays verified history instead.
- **Server-side live quote and news feeds.** Yahoo requires prior permission for automated collection, and the free Alpha Vantage key needs a Premium plan for news. Those adapters were removed. TradingView widgets show the real market instead.
- **Cancellation**, which the assignment forbids, plus partial fills, fees, dividends and splits.
- **Push notifications, app-store builds and Cloud Functions**, which would need paid plans or store accounts and are not needed for the web demo.

## Run it locally

Use Node 26.13.0. Java 21 is needed only for the Firebase emulators.

```bash
cd server && npm ci && npm run typecheck && npm run lint && npm test
```

```bash
cd mobile && npm ci && npm run typecheck && npm run lint && node --test scripts/*.test.mjs
```

The full local setup (emulators, seed accounts and the Expo dev server), deployment and recovery steps are in [docs/runbook.md](docs/runbook.md).

## More documents

- [docs/runbook.md](docs/runbook.md): local setup, deployment, configuration and recovery
- [docs/data-sources.md](docs/data-sources.md): how the price world was built, and data rights
- [docs/verification.md](docs/verification.md): what was tested, where, and what is still open
- [docs/learning.md](docs/learning.md): how to walk through the code, with interview questions
- [server/README.md](server/README.md), [mobile/README.md](mobile/README.md), [tools/README.md](tools/README.md): what each folder contains
