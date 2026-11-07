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

## Try it in 3–5 minutes

**Or watch it first (2:49).** Recorded in Expo Go on an Android phone, not in a browser: signing in as the administrator, starting a new game, a buy blocked by the 20% rule, a ₪50,000 Apple buy that waits for the US opening, moving the game clock to execute it, and the news feed. The same video is on the app's **How to play** page.

[![Stockyllix in Expo Go on Android: the market, a pending buy, the executed order and the news feed](docs/demo-preview.jpg)](https://stockyllix.web.app/demo/stockyllix-demo.mp4)

The first API request after idle can take about a minute while the free server wakes. Moving the game clock takes from about 30 seconds to a few minutes, and World controls shows the progress. [Hosting and operations](#hosting-and-operations)

1. Open the link and sign in with the reviewer account. Every player starts with ₪1,000,000 once per game.
2. Open **Menu → World controls → Open isolated test game**. Run the walkthrough in that game to keep your trades and clock changes separate from the shared league.
3. Choose **Start a new game → Real historical prices**, type `NEW GAME` and choose **Create new test game**. You get a fresh portfolio with ₪1,000,000.
4. Open **Demo trading → AMZN → Buy**, enter `50000`, choose **Review** and **Confirm & send order**. The order is **pending**. Portfolio shows ₪950,000 available, ₪50,000 reserved, and ₪1,000,000 total cash and total value.
5. Open **World controls → Advance to market event**. The first jump reaches the Tel Aviv opening; choose it once more to reach the US opening, where the AMZN order executes. **Orders** now shows **Executed**, the units, the dollar price and the USD/ILS rate. Portfolio shows ₪950,000 cash, ₪0 reserved and about ₪50,000 of AMZN.
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
| 20 instruments in both markets, prices and FX over time | 10 TASE and 10 US listings (including SPY) with replayed daily prices and Bank of Israel rates. The assignment leaves the price method open |
| One shared clock that can be advanced | A saved game clock that runs at 1× real time, with administrator jumps that process every event in between |
| One feature that brings players back | A daily finance question, with real-date return visits recorded on the server |
| Consider operation with real users | Server-side rules, transactions, retry-safe requests, an isolated test realm, CI and a recovery runbook |

**Stack.** One Expo / React Native / TypeScript app serves the web and phones. An Express / Node API on Render (free plan) checks every Firebase ID token and runs all game rules. Firebase Authentication and Firestore stay on the free Spark plan. Firestore rules deny all direct client access, so balances, prices and time change only in API transactions.

**Why this shape.** Cloud Functions deployment requires the Blaze plan, and the assignment rules out adding a payment card. A small API keeps one set of trading rules for web and mobile. On the free host, incoming requests drive the saved clock work.

### Design risks and evidence

| Risk | Decision | Evidence | Limit |
| --- | --- | --- | --- |
| Parallel orders reserve the same cash | Validate against the latest portfolio and commit the order and reservation together | With ₪100,000 available, one of two simultaneous ₪75,000 buys was accepted and ₪25,000 remained. A separate emulator test checked concurrent enforcement of the 20% cap. [Cash regression](server/tests/trade-regression.test.ts#L80) · [Firestore emulator](server/tests/firestore.integration.test.ts#L40) | These tests cover correctness under contention in specific scenarios. Cloud throughput remains open |
| The process fails after an order fills | Save the per-player event marker in the same transaction as the fill and keep a saved clock cursor | After an injected failure following a ₪50,000 fill, recovery left one executed order, ₪950,000 cash and zero reserved. [Recovery regression](server/tests/trade-regression.test.ts#L122) | With request-driven processing, trading waits for due events to finish |
| A fill uses a price or rate the player could not yet know | Replay a fixed dataset and reveal only observations available at the game time | All 420 opening and closing prices were checked against the raw download. Tests cover publication boundaries and future quotes. [Data checks](docs/data-sources.md#shared-league-real-historical-replay) · [Price visibility test](server/tests/market-insights.test.ts#L33) | Replay dates can be looked up elsewhere. Daily open and close data miss intraday moves |
| A large clock jump runs out of time or database quota | Process portfolios in pages and save progress between steps | An earlier in-memory run of a 1,000-player week took 84.9 s and counted 132,575 reads and 58,223 writes in the adapter. [Benchmark context](docs/runbook.md#capacity-and-limits) | The run gives a local workload baseline. Hosted capacity and actual Firestore billing need separate measurement |

## How the world was built

The game separates three kinds of prices, and each screen says which one it shows:

- **Real historical prices: the shared league.** 20 listings with daily open and close prices from October 19 to November 2, 2026, plus an October 16 baseline. That gives two full competition weeks and one extra day for executions. The prices come from a private Yahoo/yfinance snapshot. TASE quotes in agorot are divided by 100. USD/ILS is the Bank of Israel representative rate, and each day's rate becomes usable only at 00:00 Israel time on the next day. I chose this window because it has no reported dividends or splits, and the TASE closure on October 27 is confirmed. The snapshot is not in Git. Render loads it as a secret file, and the API never returns prices from after the current game time.
- **Simulated prices in isolated test games.** A reviewer or operator can choose a start date, for example March 2027, for a 28-day game with generated prices and FX. Its screens label the data "Simulated".
- **TradingView: market display only.** **Current market** and **News** embed TradingView widgets. These may be delayed and are never used to price an order.

An older simulated world based on ECB rates is still loaded, so games created with it stay readable. Sources, research and data rights are in [docs/data-sources.md](docs/data-sources.md).

## The game clock and how to advance it

- Every game has one saved clock. While it runs, game time moves one second per real second from the historical date. Phones only display it; they never decide execution.
- Render's free plan sleeps, so there is no background worker. Each API request lets the server process reached events in small, saved steps. Trading pauses with a clear message until every reached event has been applied to all portfolios.
- **To advance.** Open **World controls** in a game you can manage. Choose **Pause / Resume**, **Advance to market event** for the next opening or closing, or choose an Israel date and time and select **Apply time and pause**. Jumps move forward within the price period and process each event in order. An order fills at its own scheduled event.
- **Permission.** The API in this repository separates shared-league administrators (`ADMIN_UIDS`) from reviewer accounts (`REVIEWER_UIDS`), which use isolated test games. See the [runbook](docs/runbook.md#reviewer-access) for the account setup and release check.
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

**How I'd evaluate it.** News records one review per real calendar day in Israel. Moving the game clock adds no real-day visit. I'd compare day 1 and day 7 return rates for players who answered and players who did not. That comparison is observational. Retention with real users still needs validation.

## Hosting and operations

- All rules run on the server. Order, portfolio and event updates commit together in Firestore transactions. Per-player event markers mean a retried step never fills an order twice.
- Clock jobs use leases with a fence number, so a stale worker cannot overwrite newer work. After a crash or a Render restart, the next request continues from the saved job.
- Each player has a rate limit. `/health` reports the version and the deployed commit. Logs carry a request ID, status and duration, without tokens.
- CI runs on every pull request: server typecheck, lint, tests and build; app typecheck, lint, unit checks and a web export; and Firestore and Auth emulator tests.
- The free Render API sleeps after 15 minutes without incoming traffic. Firebase Hosting's transfer allowance affects static files such as the video. Firestore's daily read and write limits constrain clock processing. [Capacity and recovery](docs/runbook.md#capacity-and-limits)
- A live clock jump to October 29 took 245 seconds. The API in Oregon makes sequential database calls to Firestore in Tel Aviv. At higher load I'd first measure time from event due to completion, API latency and Firestore usage in a cloud test, then compare a closer API region and fewer database round trips. If clock work must progress without traffic, it needs a background worker. [Live verification](docs/verification.md#market-list-fix-and-price-watch-removal-release-153-november-5-2026)

## What I added beyond the assignment

Isolated test games with the historical replay or a dated simulation, asset charts and daily change sorting, a performance report (realized and unrealized profit, compared with SPY), profile name and photo, and the latest Bank of Israel reference rate.

## What I left out, and why

- **Live-price execution.** The assignment allows an accelerated game and leaves the price method open. A live feed cannot supply an actual close before it happens. Replay gives known open and close prices for an accelerated game. The sources I checked did not meet all of the coverage, cost and public display requirements. Public display rights for the downloaded snapshot remain unverified. [Sources considered](docs/data-sources.md#sources-considered-for-live-or-current-data)
- **Server-side live quote and news feeds.** TradingView widgets provide a separate market display. The app executes trades using its own game dataset. [Market data sources](docs/data-sources.md#current-market-and-news)
- **Partial fills, fees, dividends and splits.** The game fills or rejects the whole order and uses a replay window with no reported corporate actions.
- **Price alerts and push notifications.** I chose the daily question as the return feature because it fits an education app and works in the browser demo.
- **App-store releases and Cloud Functions.** The browser is the required entry point. Deploying Cloud Functions would require the Blaze plan.

## Run it locally

Use Node 26.13.0 and run each block from the repository root.

**On a phone with Expo Go (iOS or Android).** The app connects to the live game, so no server setup is needed. Install Expo Go on the phone (it must support Expo SDK 58), then:

```bash
cd mobile
npm ci
cp .env.example .env.local
npx expo start
```

On Windows, use `copy .env.example .env.local`. Scan the QR code with the iPhone Camera app, or from inside Expo Go on Android. The phone and the computer must be on the same Wi-Fi; otherwise run `npx expo start --tunnel`. A simulator also works: press `i` for the iOS Simulator (macOS) or `a` for an Android emulator. On a phone, Current market and News show the same TradingView panels inside the app, and their links open in the phone's browser.

**Checks.** Java 21 is needed only for the Firebase emulator tests.

```bash
cd server && npm ci && npm run typecheck && npm run lint && npm test
```

```bash
cd mobile && npm ci && npm run typecheck && npm run lint && npm test
```

See the [runbook](docs/runbook.md) for full setup and deployment, and the [verification record](docs/verification.md) for test results and open items.
[server/README.md](server/README.md), [mobile/README.md](mobile/README.md), [tools/README.md](tools/README.md): what each folder contains
