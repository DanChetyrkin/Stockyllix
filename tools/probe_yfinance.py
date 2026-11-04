"""Private history experiment; never activates data in the running game."""

import argparse
import json
import math
import re
import sys
import time
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path

import yfinance as yf


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "artifacts" / "yfinance-probe"


def catalog():
    # read the existing catalog instead of maintaining a second symbol list.
    source = (ROOT / "server/src/world/catalog.ts").read_text(encoding="utf-8")
    items = re.findall(r"id: '([^']+)'.*?market: '(TA|US)'", source)
    if len(items) != 20 or len(dict(items)) != 20:
        raise ValueError("Expected twenty unique instruments in the game catalog")
    return dict(items)


def inspect_symbol(symbol, market, start, end):
    ticker = yf.Ticker(symbol)
    history = ticker.history(
        start=start, end=end, interval="1d", auto_adjust=False,
        back_adjust=False, repair=False, actions=True, keepna=True,
        rounding=False, prepost=False, timeout=20,
    )
    if history.empty:
        raise ValueError("No daily observations returned")
    meta = ticker.get_history_metadata()
    currency = meta.get("currency")
    zone = meta.get("exchangeTimezoneName")
    allowed_currency = {"ILA", "ILS"} if market == "TA" else {"USD"}
    allowed_zone = {"Asia/Jerusalem", "Asia/Tel_Aviv"} if market == "TA" else {"America/New_York"}
    if currency not in allowed_currency or zone not in allowed_zone:
        raise ValueError(f"Unexpected listing metadata: currency={currency}, timezone={zone}")
    if meta.get("symbol") not in {None, symbol}:
        raise ValueError("Provider returned a different symbol")
    if history.index.tz is None:
        raise ValueError("Daily history is missing its exchange timezone")

    divisor = Decimal(100 if currency == "ILA" else 1)
    rows, actions, issues, seen = [], [], [], set()
    for timestamp, row in history.iterrows():
        # the exchange-local date is kept; a utc conversion can change its day.
        day = timestamp.tz_convert(zone).date().isoformat()
        if day in seen or not start <= day < end:
            issues.append(f"Duplicate or out-of-range date: {day}")
            continue
        seen.add(day)
        values = {field: row.get(field) for field in ("Open", "High", "Low", "Close")}
        if any(value is None or not math.isfinite(float(value)) or value <= 0 for value in values.values()):
            issues.append(f"Missing or invalid OHLC: {day}")
            continue
        if values["Low"] > min(values["Open"], values["Close"]) or values["High"] < max(values["Open"], values["Close"]):
            issues.append(f"Inconsistent high/low: {day}")
        normalized = {key.lower(): str(Decimal(str(value)) / divisor) for key, value in values.items()}
        rows.append({"date": day, "providerOpen": str(values["Open"]),
                     "providerClose": str(values["Close"]), **normalized})
        for field in ("Dividends", "Stock Splits", "Capital Gains"):
            value = row.get(field, 0)
            if math.isfinite(float(value)) and value != 0:
                actions.append({"date": day, "type": field, "providerValue": str(value)})
    return {
        "symbol": symbol, "market": market, "status": "ok" if rows and not issues else "invalid",
        "providerCurrency": currency, "normalizedCurrency": "ILS" if market == "TA" else "USD",
        "priceDivisor": str(divisor), "exchangeTimezone": zone,
        "exchangeName": meta.get("exchangeName"), "returnedRows": len(history),
        "validRows": len(rows), "issues": issues, "corporateActions": actions, "bars": rows,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--all", action="store_true", help="Check the existing twenty-symbol catalog")
    parser.add_argument("--start", default="2026-10-01", help="Inclusive exchange-local date")
    parser.add_argument("--end", default="2026-11-01", help="Exclusive exchange-local date")
    parser.add_argument("--output", default="pair-result.json", help="Filename under ignored artifacts/yfinance-probe")
    args = parser.parse_args()
    if date.fromisoformat(args.start) >= date.fromisoformat(args.end):
        parser.error("start must be before end")
    if not re.fullmatch(r"[a-zA-Z0-9_-]+\.json", args.output):
        parser.error("output must be a plain json filename")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    yf.set_tz_cache_location(str(OUTPUT / "cache"))
    yf.config.debug.hide_exceptions = False
    yf.config.network.retries = 0
    all_symbols = catalog()
    symbols = all_symbols if args.all else {key: all_symbols[key] for key in ("AAPL", "LUMI.TA")}
    results = []
    for index, (symbol, market) in enumerate(symbols.items()):
        try:
            result = inspect_symbol(symbol, market, args.start, args.end)
        except Exception as error:
            result = {"symbol": symbol, "market": market, "status": "failed", "error": str(error)[:500]}
        results.append(result)
        print(f"{symbol}: {result['status']}; rows={result.get('validRows', 0)}", flush=True)
        error_text = result.get("error", "").lower()
        blocked = re.search(r"(?<!\d)(401|403|429)(?!\d)", error_text) or any(
            word in error_text for word in ("rate limit", "unauthorized", "forbidden", "authentication", "consent")
        )
        if result["status"] == "failed" and blocked:
            print("Stopped after provider access/rate-limit failure; no bypass or automatic retry.", flush=True)
            break
        if index + 1 < len(symbols):
            time.sleep(1.5)

    # missing dates are relative to peers, not a guessed holiday calendar.
    for market in ("TA", "US"):
        peers = [item for item in results if item["market"] == market and "bars" in item]
        union = {bar["date"] for item in peers for bar in item["bars"]}
        for item in peers:
            item["missingComparedWithMarketPeers"] = sorted(union - {bar["date"] for bar in item["bars"]})
            if item["missingComparedWithMarketPeers"]:
                item["status"] = "invalid"
                item["issues"].append("Missing dates returned for other instruments in this market")
    report = {
        "checkedAt": datetime.now(timezone.utc).isoformat(), "library": "yfinance",
        "libraryVersion": yf.__version__, "startInclusive": args.start, "endExclusive": args.end,
        "autoAdjust": False, "backAdjust": False, "repair": False,
        "priceCaveat": "Yahoo OHLC can already be split-adjusted; not guaranteed as-traded prices.",
        "exchangeCalendarCompleteness": "not verified; only peer-relative gaps are checked",
        "publicDisplayPermission": "not verified", "activeGameChanged": False,
        "requestedSymbols": list(symbols), "results": results,
        "notAttempted": [symbol for symbol in symbols if symbol not in {item["symbol"] for item in results}],
    }
    destination = OUTPUT / args.output
    destination.write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(f"Private report: {destination}")
    return 0 if len(results) == len(symbols) and all(item["status"] == "ok" for item in results) else 1


if __name__ == "__main__":
    sys.exit(main())
