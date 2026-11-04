# Private historical data probe

`probe_yfinance.py` is the one-time local experiment that downloaded the daily prices behind the shared league's historical replay. It is not a service, a Render dependency or a live feed, and the game never runs it.

## What it does

It reads the TypeScript instrument catalogue, downloads daily OHLC with yfinance (`auto_adjust=False`, `back_adjust=False`, `repair=False`), and checks prices, timestamps, units (ILA vs ILS), corporate actions and missing dates compared with peers in the same market. Reports, the Python environment and caches go to the ignored `artifacts/yfinance-probe` folder and are never committed. It stops on an access or rate-limit error and does not try to bypass it.

On November 4, 2026 it returned 420 valid daily bars: 20 per TASE listing (in agorot, divided by 100) and 22 per US listing. Every TASE listing skipped October 27 (a confirmed holiday). The October download included dividends for ESLT.TA and JPM, so the replay uses October 19–November 2 instead. `npm run import:yahoo` in `server` then turns the private report into the dataset.

## Do not rerun it to deploy or test

Yahoo's [Terms of Service](https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html) (section 2, item 9) require prior permission for automated collection. No permission is claimed. The yfinance open-source licence covers its code, not the data. Details are in [data sources](../docs/data-sources.md).

```bash
python -m pip install -r requirements-yfinance.txt
python probe_yfinance.py --help
```
