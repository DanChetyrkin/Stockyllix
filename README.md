# Stockyllix

An educational, noncommercial interview demo for the House of Finance portfolio-league assignment. Players receive **₪1,000,000** of virtual cash, trade twenty TA/US instruments and compete on weekly return and maximum drawdown (MDD).

**[Play in your browser](https://stockyllix.web.app)** · **[3–5 minute reviewer walkthrough](docs/reviewer-demo.md)** · **[How to play](https://stockyllix.web.app/help)**

Reviewer administrator: `admin@stockyllix.com`. Obtain the password privately from the owner. No administrator password or server credentials belong in this repository.

## What was built and why

One Expo / React Native / TypeScript client serves Web and mobile. An Express / Node API verifies Firebase ID tokens and enforces balances, orders, prices and time through Firestore transactions. Firebase Hosting serves the static app, Render **Free** runs the API, and Firebase Authentication / Firestore remain on **Spark**. No Cloud Functions, paid worker or payment card is required.

The shared league uses **real historical prices**: October 19–November 2, 2026, with twenty Yahoo daily series, an October 16 baseline and Bank of Israel USD/ILS. The period has two complete competition weeks plus an execution buffer, checked sessions and no reported corporate actions. ILA quotes are converted to ILS. Only observations reached by game time are visible. The clock stops when the actual data ends; a separate new world preserves earlier records.

An administrator-only **Simulation** test realm supports a selectable start date, including March 2027. Generated prices and FX are clearly labelled simulated and apply only to that separate test game. They never replace shared historical data or redate real observations. Use the shared historical league to inspect real-data trading.

**Current market** and **News & quiz** display official TradingView panels. Quotes may be delayed or from a closed session; news follows real publication time. These panels never supply execution prices. The Yahoo server feed is blocked by source permission and prior Render throttling; the Alpha Vantage free key did not obtain News access. The latest published BOI reference panel is separate from historical execution FX. See [sources and rights](docs/data-sources.md).

## Trade and clock decisions

| Topic | Decision and reason |
| --- | --- |
| Pending cash | A pending ₪50,000 buy reserves ₪50,000 and leaves ₪950,000 available. Total cash/value stay ₪1,000,000 until execution. |
| Execution | During a market session, execute at its close; otherwise at the next open. No cancellation, leverage, short selling or partial fills. |
| 20% limit | Check holdings plus pending buys at submission; recheck actual exposure at execution. Appreciation alone never forces a sale. |
| Consistency | Atomic portfolio/order updates, fixed request keys, reserved units and durable event markers prevent double spending/filling. |
| Weekly score | 85% return percentile + 15% stability percentile. MDD uses price/FX event samples. Ties share scores; a sole eligible player gets 100. |
| Week/late joining | Monday–Friday in Israel time. Assets carry forward; statistics restart. Midweek entrants are provisional until the next full week. |
| Missing data/end | Stop safely rather than invent a price. The clock stays within its dataset; old games are retained. |

The full [missing-rule table](docs/rules.md) covers precision, FIFO, FX availability, ties, holidays and tests.

**Clock controls:** sign in as a server-configured administrator and open **World controls**. Normal date/time inputs use Israel time, including DST. Pause/resume controls persisted **1× server-time** playback. Jump to a pending order's execution or the next market event, or choose a forward date. Every intermediate event is processed once. Backward experiments require a new test game; real-time trading remains unavailable without verified execution data. Recovery is in the [runbook](docs/runbook.md). Current Israel time and historical game time are always distinguished.

## Daily feature and deliberate omissions

The compact daily finance question above news explains a concept and changes with the **game's Israel calendar day**. Portfolio metrics remain on Portfolio, without a duplicate review page. Real-date return visits are measured separately: moving the game is not a real return visit, and improved retention has not been proven.

We omitted a second Web app, store builds, push, company fundamentals, annualized returns, paid feeds, Docker, microservices and corporate-action processing. They add little to the required demo or lack a verified free source. The real replay avoids reported dividends/splits; fees are explicitly omitted. A month's return is never presented as annual performance. Spark/Render limits mean thousands of users require measurement and a capacity plan.

## Run, verify and hand over

- [Windows setup, Expo Go, deployment, secrets and recovery](docs/runbook.md)
- [Measured verification and current release status](docs/verification.md)
- [1.4.0 deployment checklist](docs/finish-release.md)
- [Learning and interview questions](docs/learning.md)

Deployed release: **1.4.0 / demo-controls-v4**, server `b0b0c8e`, final Web client `7ad8335`. Cloud trading acceptance, service restart and manual public-browser buy/direct-fill/sell passed while preserving shared and previous test games. Public phone-width/calendar/theme/news checks passed; all **38/38** final Hosting files matched. All three final CI jobs, **47** client checks, Web/Android exports and HTTPS/CORS release checks passed. [Verification](docs/verification.md) distinguishes browser evidence from build/delivery checks. Physical Expo Go use remains unverified.

Submission still needs accepted **Write** access for `rotemyavne7`; the owner deferred this to final handover, and the last verified permission remains Read. Share the public link and reviewer password privately as agreed; only the administrator email is public. Physical Expo Go use remains distinct from browser/mobile-width checks and native bundle compilation.
