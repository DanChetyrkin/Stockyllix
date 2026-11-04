# Private Yahoo history probe

This optional Python tool checks whether Yahoo daily history is technically usable for the existing stock catalog. It is not part of the Expo client, Node server, Render build or public game.

From the repository root in PowerShell, using the Python installation found on this computer:

```powershell
$probePython = "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe"
& $probePython -m venv ".\artifacts\yfinance-probe\.venv"
& ".\artifacts\yfinance-probe\.venv\Scripts\python.exe" -m pip install -r ".\tools\requirements-yfinance.txt"
& ".\artifacts\yfinance-probe\.venv\Scripts\python.exe" ".\tools\probe_yfinance.py"
# only after the two-symbol probe succeeds
& ".\artifacts\yfinance-probe\.venv\Scripts\python.exe" ".\tools\probe_yfinance.py" --all --output all-result.json
```

The default period is October 2026: `2026-10-01` inclusive to `2026-11-01` exclusive. The first run checks AAPL and LUMI.TA. `--all` reads all twenty symbols from the existing TypeScript catalog. There is no provider key or Yahoo account login.

Reports, downloaded observations, timezone/cookie cache and Python environment stay under the ignored `artifacts/yfinance-probe` directory. They are not committed, served or activated. Python is not required to run the game.

The report checks OHLC values, duplicate dates, listing currency/timezone, corporate actions and missing dates relative to other symbols in the same market. Peer coverage is not proof of a complete exchange holiday calendar. It divides prices by 100 only when the provider identifies the currency as ILA; original prices are retained for audit.

`auto_adjust`, `back_adjust` and `repair` are explicitly false. Yahoo OHLC may nevertheless already reflect splits, so this is not guaranteed as-traded data. The tool stops on a provider access/rate-limit failure without retries or access workarounds. It never fills a missing price.

Technical success does not establish storage or public-display rights. The open-source license covers the library, not Yahoo's market data. See [yfinance](https://pypi.org/project/yfinance/), [price parameters](https://ranaroussi.github.io/yfinance/reference/api/yfinance.download.html) and [Yahoo terms](https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html). Public use remains unverified; no game activation is included in this experiment.

## Observed on November 4, 2026

The two-symbol probe succeeded, followed by a successful twenty-symbol run with yfinance 1.8.0. All ten TASE instruments returned twenty daily observations in ILA, normalized to ILS; all ten US instruments returned twenty-two in USD. The complete report contains 420 daily observations with open/close prices. No invalid OHLC, duplicate dates or peer-relative gaps were found.

All TASE symbols omitted October 2 and October 27, which appear in the US series. These omissions are not filled or automatically classified as holidays by the script. A later manual check of the official TASE 2026 calendar confirmed both as non-trading days. Dividend observations were returned for ESLT.TA on October 13 and JPM on October 6; no split observations were returned for this period. This is a provider report, not an independently audited corporate-action record.

The ignored `all-result.json` is a probe report, not a ready-to-activate game `Dataset`. Activation still requires verified sessions, the extra execution buffer, a corporate-action decision, correct provenance, applicable data rights and a new world. The current public game, Firestore and ECB execution FX were not changed.
