# Market data decisions

Provider research and local import status were checked on 2026-11-04. The company prefers real, current data and explicitly permits a sensible simulation if real data becomes too difficult. These checks do not claim a working paid account or a licence that was not granted.

## Current-market implementation

The custom Node service now fetches current regular-session Yahoo chart observations for the existing twenty listings. A real local run returned twenty valid quotes; a recreated service using the same store reused them with no extra provider calls. This is separate from the daily-history experiment. Public display permission remains unverified, so `/api/market/current` defaults to a server-authorized administrator preview. It is not used by the trading engine.

The shared cache persists last good observations, refresh eligibility, lease and fencing version in Firestore. An in-process single flight and short L1 cache reduce duplicate work/reads. Refreshes occur within bounded HTTP requests, at most once every ten minutes, with limited concurrency, timeout and provider backoff. No always-on worker or local disk is required. Each quote retains its own `priceAt` and `fetchedAt`; a failed partial refresh preserves the old quote and marks it stale. The previous session close comes from dated bars, not a five-day baseline incorrectly labelled yesterday. Unknown delay remains unknown; extended sessions are not included.

For public display the browser uses the [official free TradingView widgets](https://www.tradingview.com/widget/) with attribution intact. Their [market list](https://www.tradingview.com/widget-docs/markets/mea/) includes delayed TASE stocks. The widget is an independent hosted display, not a source we may scrape into our API. TradingView explicitly [does not offer widget data export/API access](https://www.tradingview.com/widget-docs/faq/data/). Its quotes are not copied into Firestore or used for game fills. Browser rendering and exact twenty-symbol availability must still be checked after publication.

Other requested candidates were screened without adding services:

| Candidate | Material finding |
| --- | --- |
| [OpenBB](https://docs.openbb.co/odp/python/faqs/data_providers) | An integration layer dependent on provider access; it is not an independent data licence or feed. Adds no benefit to this Node deployment. |
| [Massive](https://massive.com/knowledge-base/article/which-plan-do-i-need-to-show-massive-data-in-my-app) | Free individual EOD access is not public application display rights; even externally reachable demos require a business arrangement. TASE coverage was not established. |
| [Marketstack](https://marketstack.com/product) | Free EOD quota is 100 requests/month, with symbol-based consumption. Five full twenty-symbol refreshes/month cannot support this market view. |
| [Interactive Brokers](https://www.interactivebrokers.com/campus/ibkr-api-page/twsapi-doc/) | TWS/IB Gateway needs an authenticated broker session and running desktop/gateway software. Delayed-data availability depends on exchange/account/entity; it is not a stand-alone free Render feed. |

## Current news

The supplied Alpha Vantage free key was exercised once without logging it. `NEWS_SENTIMENT` returned HTTP 200 with a Premium requirement and zero articles, matching the [current endpoint documentation](https://www.alphavantage.co/documentation/#news-sentiment). The implemented adapter stores only title, source, publication time, related catalog IDs and HTTPS article URL. It strips bodies/images/sentiment, uses a six-hour shared cache and persistent request budget, and reports entitlement/quota failures without leaking provider URLs or secrets.

[EODHD News](https://eodhd.com/financial-apis/stock-market-financial-news-api) offers a free allowance, but its [personal-use terms](https://eodhd.com/financial-apis/terms-conditions) do not permit displaying the data to others. No second news API was connected. Reddit requires approved/OAuth access and represents community posts, while new StockTwits API registration is currently closed; neither is presented as verified news. The public News page instead embeds the official TradingView feed. It follows real publication time, independently of demo time.

| Source | Verified capability | Why it is not the default stock feed |
| --- | --- | --- |
| [Twelve Data](https://twelvedata.com/pricing) | Basic is free without a card, 8 credits/minute and 800/day; US equities are included. [XTAE](https://twelvedata.com/exchanges/xtae) is end-of-day in a paid tier. | Basic is internal non-display. [External display and redistribution](https://twelvedata.com/terms) require appropriate rights. A trial symbol does not establish access to twenty instruments or public-display rights. |
| [Alpha Vantage](https://www.alphavantage.co/support/) | Free key and 25 requests/day; [daily OHLC compact](https://www.alphavantage.co/documentation/) gives 100 observations. | TASE coverage was not established. The [licence](https://www.alphavantage.co/terms_of_service/) is personal/non-commercial, and public demo redistribution was not established. Intraday and real-time US data are paid. |
| [TASE Data Hub](https://content.tase.co.il/media/4imn13pz/2001_api_pricelist_2026_eng.pdf) | Free Securities Basic exists for internal use. EOD and historical securities products are separately priced. | The Basic product's open/close fields could not be verified from the public portal. Do not infer either full OHLC coverage or its absence from the product name. Public redistribution rights were not established. |
| [Finnhub](https://finnhub.io/pricing) | Free: 60 API calls/minute, US coverage, WebSocket up to 50 symbols, no card required. OHLC history is not included in Free's comparison table. | US quote streaming does not supply the required historical replay. Free TASE coverage is not listed. [Sharing data or derived results](https://finnhub.io/terms-of-service) requires written approval, even for a personal-plan demo. |
| [Financial Modeling Prep](https://site.financialmodelingprep.com/pricing-plans) | Basic: $0, 250 calls/day, end-of-day history and company profile/reference data; 500MB over 30 days. Global coverage is listed in paid Ultimate. | Free TASE coverage, rating access and no-card signup were not verified. The pricing page explicitly requires a separate Data Display and Licensing Agreement for displaying or redistributing FMP data. [Terms](https://site.financialmodelingprep.com/terms-of-service) do not establish public-demo permission. |

No source passed all of: both markets, required open/close history, no card, free, and permission to display and retain data for this public demo. The game therefore uses real instrument names and a clearly labelled, deterministic simulation of stock prices. A source provider can replace the private dataset later without changing trade rules.

Among the three newly compared candidates, Twelve Data remains the best technical fit for a unified daily-history importer, conditional on access and display rights. It already has a prepared adapter. Its [US feed explanation](https://support.twelvedata.com/en/articles/9935903-us-equities-market-data) distinguishes listed-symbol coverage from volume coverage: the default real-time feed represents about 5% of market volume, while completed EOD/history covers all US exchanges. Basic's 800 daily allowance is credits, not an unlimited multi-symbol request count. This does not grant TASE access or external-display permission.

WebSocket is not needed to execute an accelerated replay. A live stream cannot supply a future closing price when the administrator advances the game. Daily open/close history is the relevant starting point. Finnhub's larger minute quota does not resolve that difference.

## Sorting and optional research metrics

The market list supports name and daily-price-change sorting in both directions. Each asset's percentage is measured in its quote currency against the previous known trading-session close; closed days keep the last trading day's change. A missing comparison remains unavailable and sorts last. The market response computes all twenty values from the private in-memory dataset, sharing the same rule as asset history, with no additional provider requests or database reads.

There is no invented annual return from the four-week replay. A later feature must distinguish calendar-year return (YTD) from trailing twelve months (1Y), and price return from dividend-inclusive total return. It needs sufficient historical data available as of game time.

Company ratings are not a universal measure. Finnhub lists US analyst recommendation trends; FMP's [Ratings Snapshot](https://site.financialmodelingprep.com/developer/docs/stable/ratings-snapshot) is a calculated financial-ratio score, distinct from analyst consensus or a credit rating. Its [FAQ](https://site.financialmodelingprep.com/faqs?code=company) says the score is not normalized for sector peers. No rating feed or its public-display entitlement was tested or activated. Source, method and observation date must be defined before adding a rating sort.

## Simulation

- Twenty instruments: ten on TASE and ten US listings, including SPY. All generated prices are in ILS or USD, never agorot.
- Baseline prices represent a simulated October 2 close; they are illustrative values, not quotes copied from a source.
- Sessions run October 5 through October 30, with November 2 as an execution buffer. The buffer is a partial fifth competition week; it is not a fifth complete weekly result.
- Opening gaps, shared market moves, sector moves and individual moves produce both gains and losses. A private seed makes replay reproducible. The dataset contains no seed.
- The assignment's weekday hours are authoritative. Weekends have no sessions; the simulated calendar does not model real exchange holidays or early holiday closes. Timezone conversion uses IANA zones for Israel and New York, including their different daylight saving transitions.
- Prices update only on market open/close events. Daily high/low and intraday paths are not used. MDD is measured on the actual world event samples, not inferred from a daily candle's high and low.
- No fees, dividends or splits are simulated. This is an explicit simplification; do not relabel these generated prices as a historical return series.

## Real exchange rates

`npm run import:ecb` downloads a fixed October 2 through November 2 window from the [official ECB SDMX API](https://data.ecb.europa.eu/help/api/data), using the `D.USD+ILS.EUR.SP00.A` series and CSV format. A fixed historical query remains usable after October leaves a rolling 90-day feed. The importer calculates USD/ILS as ILS-per-EUR divided by USD-per-EUR. The private JSON contains attribution, source URL, import time, source observation dates and availability times. It rejects missing currencies and never creates a replacement rate.

[ECB reference rates](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html) update daily, not continuously. [ECB reuse terms](https://www.ecb.europa.eu/services/using-our-site/disclaimer/html/index.en.html) permit accurate reuse with source attribution and disclosure of calculations. This is a virtual educational game, not a real currency execution feed.

For conservative historical replay, a daily rate is made available at 00:00 Israel time on the following calendar day. Until then the latest available rate is carried forward. This intentionally delays observations beyond their normal publication, so no same-day value is used before publication. Friday US executions can consequently use Thursday's reference rate. An observation more than seven calendar days old causes dataset validation to fail.

### Bank of Israel: connected reference data, staged history

The [Bank of Israel API](https://www.boi.org.il/information/bank-paymnts/guide/api-guide/) supplies daily representative rates, not stock prices. Its [latest USD endpoint](https://www.boi.org.il/PublicApi/GetExchangeRate?key=USD) is now connected through authenticated `GET /api/reference/fx` and was verified against the real provider locally. The response identifies the observation date/publication time, fetch time and source. It is the latest **published representative rate**, not a real-time dealing quote.

The server caches this separate reference request and deduplicates concurrent refreshes. A failed refresh returns an explicitly stale cached result when available, or an unavailable error; it never invents a rate. This optional panel does not drive trades or replace the active world's FX.

`npm run import:boi` was run successfully and staged **21** historical observations for October 2–November 2 in ignored `server/data/boi-fx.json`. The importer validates the official series/currency/units, dates, positive rates and baseline. Historical availability is conservatively the following Israel midnight. `BOI_FX_DATA_PATH` must differ from active `FX_DATA_PATH`. The running game retains its existing **ECB** FX file and dataset ID; downloading BOI history does not migrate it.

A broad redistribution/storage licence was not established by the earlier research. A functioning public endpoint is not evidence of permission to redistribute a historical dataset. Keep attribution and review applicable terms before publishing imported data.

If the real FX file is unavailable, server startup fails. Only the explicit `ALLOW_SIMULATED_FX=true` setting permits a labelled simulated FX fallback. It never silently labels generated numbers as ECB observations.

## Private imports and future data

### Yahoo/yfinance: successful local experiment, not activated

On November 4, 2026, a private two-symbol experiment with yfinance 1.8.0 downloaded October daily history for AAPL and LUMI.TA. A subsequent run covered all twenty existing catalog symbols: 420 daily observations, with twenty per TASE symbol and twenty-two per US symbol. All TASE listings reported ILA and were normalized to ILS by dividing by 100. Original quotes remain in the ignored local report. No invalid OHLC, duplicate dates or missing dates relative to same-market peers were found.

All TASE listings omitted October 2 and October 27. This is an observation, not an exchange-calendar verification; dates missing for every peer cannot be detected by peer comparison alone. The provider returned dividend events for ESLT.TA and JPM during the period. Corporate-action handling must be decided before using this period for portfolio scoring.

The separate [Python probe](../tools/README.md) runs locally and writes only ignored artifacts. It is not a Python server or a Render dependency. `auto_adjust=False`, `back_adjust=False` and `repair=False` prevent additional automatic adjustments/repairs by the library. Yahoo OHLC can still be split-adjusted and is not guaranteed as-traded history. See the [parameter documentation](https://ranaroussi.github.io/yfinance/reference/api/yfinance.download.html) and [maintainer explanation](https://github.com/ranaroussi/yfinance/discussions/1682).

The [library notice](https://pypi.org/project/yfinance/) says it is unofficial, intended for research/education, and directs users to Yahoo's data terms. Its open-source license is not a data licence. Yahoo's [terms](https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html) do not establish permission for this public game's data storage/display; that permission remains unverified. Download success does not resolve it. No Yahoo data was committed, uploaded or activated, and the public game still uses simulated stocks and historical ECB FX.

### Twelve Data importer: prepared, not a working stock connection

`npm run import:market` is preparation for an authorized historical import. No Twelve Data key/provider access was available, so no real stock import or full 20-instrument connection has been verified. Parser/fixture tests establish input validation, not account entitlements, actual TASE coverage or display rights.

Before using it, confirm all twenty listings, daily open/close history, storage and public-demo display permission, free usage and no-card access. Only then supply server-only `TWELVE_DATA_API_KEY` and set `MARKET_DATA_USE_CONFIRMED=true`. The flag records an operator decision; it cannot grant rights or verify them automatically.

Optional `MARKET_FROM_DATE`/`MARKET_TO_DATE` select a Monday start and a fully completed end date. Defaults select a recent completed period. `MARKET_OUTPUT_PATH` stages private output, normally `server/data/market-world.json`; it must be separate from active `DATASET_PATH`. The importer checks listing/exchange/timezone/currency, normalizes Israeli agorot to ILS, combines opening/closing bars with BOI history, and validates the resulting world. It fails on missing dates rather than guessing holidays. Choose a complete period or supply a separately verified calendar; avoid unhandled splits/dividends. Request spacing is not proof of entitlement or sufficient quota.

Do not point an existing world's portfolios at newly imported prices. Keep the staged file private, review its provenance and coverage, back up the current exact dataset, and plan activation for a **new** game world. A source/configuration change must not silently replace the active dataset; mismatches fail closed. Nothing in this importer enables live future prices for an accelerated game clock.

`DATASET_PATH` can point to a private JSON matching the `Dataset` interface. Startup validates identifiers, all twenty prices per snapshot, positive decimal values, chronological events, timezone-bearing timestamps, session boundaries, and market events. Imported historical datasets may omit exchange holidays; they must supply the corresponding complete sessions and event snapshots themselves.

Future events, the generator seed, private JSON and raw future prices are server-only. They must not appear in a client bundle, public API response or public Git repository. Public historical data can still be looked up elsewhere; replay is not a claim of protection against external knowledge. An exhausted dataset stops advancement and order acceptance rather than looping to the beginning.
