# Private historical import tools

These tools support an already completed local Yahoo/yfinance experiment. They are **not** a Python service, Render dependency, current quote feed or routine deployment step. The public game loads its existing private immutable snapshot through the TypeScript server.

## Current restriction

Yahoo's [Terms of Service, section 2, conduct item 9](https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html) requires prior permission for automated collection. No such permission is claimed. Do not rerun the probe/download simply to deploy or test the game. A Python package's open-source licence and technical success do not grant data rights.

Reuse/display permission for previously downloaded observations remains **unverified**, a separate issue from the explicit restriction on new acquisition. Educational/noncommercial intent is disclosed, not presented as supplier approval. Full source evidence is in [data sources](../docs/data-sources.md).

## What was observed on November 4, 2026

The original two-symbol AAPL/LUMI.TA probe and later twenty-symbol run succeeded with yfinance 1.8.0. Ten TASE listings returned twenty October observations each in ILA, normalized by 100; ten US listings returned twenty-two each in USD, for 420 daily bars. No invalid OHLC, duplicates or peer-relative gaps were detected. Peer coverage alone did not prove a calendar.

All TASE listings omitted October 2/27; a subsequent official-calendar review confirmed closures. The broader October series included reported ESLT.TA/JPM dividends. The game therefore uses a narrower reviewed October 19–November 2 replay with October 16 baseline, no reported corporate actions inside that selected window and a real BOI FX history. Historical imports never fill a missing price or automatically invent a holiday.

`auto_adjust=False`, `back_adjust=False` and `repair=False` disabled additional library adjustments; Yahoo OHLC can nevertheless be split-adjusted and is not guaranteed as-traded data. See [parameters](https://ranaroussi.github.io/yfinance/reference/api/yfinance.download.html) and [library notice](https://pypi.org/project/yfinance/).

## Files and reproducibility

`probe_yfinance.py` checks the existing TypeScript catalogue, OHLC, timestamps, units, actions and peer dates. Raw reports, Python environment and caches stay under ignored `artifacts/yfinance-probe`. They are never committed or served. The tool stops on access/rate-limit failure without bypasses.

`server`'s `import:yahoo` consumes an existing private report, verified calendar and BOI history to stage `server/data/yahoo-world.json`; it does not itself authorize a new source acquisition. An existing world must retain its exact dataset. Only a separate new-world action selects another validated dataset. See [the runbook](../docs/runbook.md) for private paths and preservation.

A raw probe report is not a game Dataset, a cloud-feed acceptance result or a licence. Python is unnecessary for ordinary game use, clock processing, Hosting publication and the new administrator-only generated test simulations.
