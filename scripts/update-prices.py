#!/usr/bin/env python3
"""
Daily Price Updater — Yahoo Finance Chart API Edition

Purpose
- Replaces the old Financial Modeling Prep (FMP) dependency.
- Creates data/prices.json in the same shape as the attached sample:

  {
    "meta": {...},
    "SPY": [590, 593.69, ...],
    "TLT": [95, 96.6, ...]
  }

Data source
- Yahoo Finance public chart endpoint, no API key required.
- Uses adjusted close prices by default when available.

Notes
- This endpoint is not an official paid API contract. If Yahoo changes or blocks
  the endpoint, the script may need to be updated.
- No external Python packages are required.
"""

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

TICKERS = [
    "SPY", "TLT", "GLD", "BIL", "IWD", "QQQ", "IEF", "SHY",
    "IWM", "VWO", "BND", "EFA", "PDBC", "VNQ", "VGK", "EWJ",
    "EEM", "DBC", "HYG", "LQD", "REM", "TIP"
]

OUTPUT_PATH = "data/prices.json"
TRADING_DAYS = 252
LOOKBACK_DAYS = 370
USE_ADJUSTED_CLOSE = True

YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"


def _http_get_json(url, timeout=30):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/122.0 Safari/537.36"
            ),
            "Accept": "application/json,text/plain,*/*",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_ticker(symbol, from_date, to_date):
    """Fetch daily prices from Yahoo Finance as {YYYY-MM-DD: close}."""
    period1 = int(datetime.strptime(from_date, "%Y-%m-%d").replace(tzinfo=timezone.utc).timestamp())
    # Yahoo period2 is effectively exclusive, so add one day to include to_date.
    period2 = int((datetime.strptime(to_date, "%Y-%m-%d") + timedelta(days=1)).replace(tzinfo=timezone.utc).timestamp())

    params = urllib.parse.urlencode({
        "period1": period1,
        "period2": period2,
        "interval": "1d",
        "events": "history",
        "includeAdjustedClose": "true",
    })
    url = f"{YAHOO_CHART_URL.format(symbol=urllib.parse.quote(symbol))}?{params}"

    try:
        data = _http_get_json(url)
    except urllib.error.HTTPError as e:
        print(f"  [{symbol}] HTTP {e.code}: {e.reason}")
        return None
    except Exception as e:
        print(f"  [{symbol}] Error: {e}")
        return None

    chart = data.get("chart", {})
    error = chart.get("error")
    if error:
        print(f"  [{symbol}] Yahoo error: {error}")
        return None

    results = chart.get("result") or []
    if not results:
        print(f"  [{symbol}] No result returned")
        return None

    result = results[0]
    timestamps = result.get("timestamp") or []
    indicators = result.get("indicators", {})
    quote = (indicators.get("quote") or [{}])[0]
    closes = quote.get("close") or []

    adjcloses = None
    if USE_ADJUSTED_CLOSE:
        adjclose_blocks = indicators.get("adjclose") or []
        if adjclose_blocks:
            adjcloses = adjclose_blocks[0].get("adjclose")

    selected_prices = adjcloses if adjcloses else closes
    if not timestamps or not selected_prices:
        print(f"  [{symbol}] Empty timestamp/price data")
        return None

    price_by_date = {}
    for ts, price in zip(timestamps, selected_prices):
        if price is None:
            continue
        date_str = datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")
        price_by_date[date_str] = round(float(price), 2)

    if len(price_by_date) < 10:
        print(f"  [{symbol}] Only {len(price_by_date)} days, skipping")
        return None

    dates = sorted(price_by_date)
    print(f"  [{symbol}] {len(dates)} days, ${price_by_date[dates[0]]} → ${price_by_date[dates[-1]]}")
    return price_by_date


def build_aligned_payload(price_maps):
    """
    Convert {ticker: {date: price}} into sample-compatible arrays.

    The sample file contains only arrays and no dates. To make arrays comparable
    across tickers, this function keeps only dates available for every fetched
    ticker, then takes the latest TRADING_DAYS rows.
    """
    common_dates = None
    for price_by_date in price_maps.values():
        dates = set(price_by_date.keys())
        common_dates = dates if common_dates is None else common_dates & dates

    if not common_dates:
        raise RuntimeError("No common trading dates across fetched tickers.")

    aligned_dates = sorted(common_dates)[-TRADING_DAYS:]
    if len(aligned_dates) < 10:
        raise RuntimeError(f"Only {len(aligned_dates)} common trading dates found.")

    today = datetime.now().strftime("%Y-%m-%d")
    payload = {
        "meta": {
            "lastUpdated": today,
            "source": "Yahoo Finance chart endpoint",
            "description": "Daily adjusted closing prices for asset allocation calculator",
            "tradingDays": len(aligned_dates),
            "dateRange": {
                "from": aligned_dates[0],
                "to": aligned_dates[-1],
            },
            "note": "Generated by scripts/update-prices.py without FMP_API_KEY",
        }
    }

    for symbol in TICKERS:
        if symbol in price_maps:
            payload[symbol] = [price_maps[symbol][d] for d in aligned_dates]

    return payload


def main():
    print("=" * 60)
    print("Asset Allocation Calculator — Daily Price Updater (Yahoo)")
    print("=" * 60)

    to_date = datetime.now().strftime("%Y-%m-%d")
    from_date = (datetime.now() - timedelta(days=LOOKBACK_DAYS)).strftime("%Y-%m-%d")

    print(f"\nConfig: {len(TICKERS)} tickers")
    print(f"Range: {from_date} ~ {to_date}")
    print(f"Target trading days: {TRADING_DAYS}")
    print("API key: not required\n")

    price_maps = {}
    failed = []

    for symbol in TICKERS:
        price_by_date = fetch_ticker(symbol, from_date, to_date)
        if price_by_date:
            price_maps[symbol] = price_by_date
        else:
            failed.append(symbol)
        time.sleep(0.25)

    if not price_maps:
        print("\n❌ No price data fetched. Yahoo may be blocked or unavailable.")
        sys.exit(1)

    if failed:
        print(f"\n⚠️ Failed tickers: {', '.join(failed)}")
        print("   The output will include only successfully fetched tickers.")

    try:
        payload = build_aligned_payload(price_maps)
    except Exception as e:
        print(f"\n❌ Could not build aligned payload: {e}")
        sys.exit(1)

    output_path = Path(OUTPUT_PATH)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"\n✅ Saved {OUTPUT_PATH}")
    print(f"   Tickers: {len(price_maps)}/{len(TICKERS)}")
    print(f"   Trading days: {payload['meta']['tradingDays']}")
    print(f"   Date range: {payload['meta']['dateRange']['from']} ~ {payload['meta']['dateRange']['to']}")
    print(f"   Date: {payload['meta']['lastUpdated']}")


if __name__ == "__main__":
    main()
