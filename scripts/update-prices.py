#!/usr/bin/env python3
"""
Daily Price Updater — Financial Modeling Prep (FMP) Edition

Endpoint: GET https://financialmodelingprep.com/api/v3/historical-price-eod/light/{symbol}
  ?from=YYYY-MM-DD&to=YYYY-MM-DD&apikey={FMP_API_KEY}

Free tier: 250 API calls / day
Our need: 22 tickers × 1 call = 22 calls / day ✅

Environment variable:
  FMP_API_KEY — register free at https://site.financialmodelingprep.com/register
"""

import json
import os
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
import urllib.request

TICKERS = [
    "SPY", "TLT", "GLD", "BIL", "IWD", "QQQ", "IEF", "SHY",
    "IWM", "VWO", "BND", "EFA", "PDBC", "VNQ", "VGK", "EWJ",
    "EEM", "DBC", "HYG", "LQD", "REM", "TIP"
]

OUTPUT_PATH = "data/prices.json"
BASE_URL = "https://financialmodelingprep.com/api/v3/historical-price-eod/light"


def fetch_ticker(symbol, api_key, from_date, to_date):
    """Fetch daily closing prices for a single ticker from FMP."""
    url = f"{BASE_URL}/{symbol}?from={from_date}&to={to_date}&apikey={api_key}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        print(f"  [{symbol}] HTTP {e.code}: {e.reason}")
        return None
    except Exception as e:
        print(f"  [{symbol}] Error: {e}")
        return None

    if not isinstance(data, list) or len(data) == 0:
        print(f"  [{symbol}] No data returned")
        return None

    # data is list of {symbol, date, price, volume}
    # Sort by date ascending
    data.sort(key=lambda x: x.get("date", ""))
    prices = [round(float(row["price"]), 2) for row in data if "price" in row]

    if len(prices) < 10:
        print(f"  [{symbol}] Only {len(prices)} days, skipping")
        return None

    print(f"  [{symbol}] {len(prices)} days, ${prices[0]} → ${prices[-1]}")
    return prices


def main():
    print("=" * 60)
    print("Asset Allocation Calculator — Daily Price Updater (FMP)")
    print("=" * 60)

    api_key = os.environ.get("FMP_API_KEY", "").strip()
    if not api_key:
        print("\n❌ FMP_API_KEY environment variable not set!")
        print("   Get a free key at: https://site.financialmodelingprep.com/register")
        print("   Then set it as a GitHub Secret or export FMP_API_KEY=your_key")
        sys.exit(1)

    # Date range: 1 year ago → today
    to_date = datetime.now().strftime("%Y-%m-%d")
    from_date = (datetime.now() - timedelta(days=370)).strftime("%Y-%m-%d")

    print(f"\nConfig: {len(TICKERS)} tickers")
    print(f"Range: {from_date} ~ {to_date}")
    print(f"API calls needed: {len(TICKERS)} (free tier: 250/day)\n")

    result = {}
    for symbol in TICKERS:
        prices = fetch_ticker(symbol, api_key, from_date, to_date)
        if prices:
            result[symbol] = prices
        time.sleep(0.25)  # ~4 req/sec — polite rate limiting

    if not result:
        print("\n❌ No price data fetched. Check API key and ticker symbols.")
        sys.exit(1)

    # Save
    today = datetime.now().strftime("%Y-%m-%d")
    payload = {
        "meta": {
            "lastUpdated": today,
            "source": "Financial Modeling Prep (FMP)",
            "description": "Daily closing prices for asset allocation calculator",
            "tradingDays": min(len(v) for v in result.values()),
        }
    }
    for sym, prices in result.items():
        payload[sym] = prices

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

    print(f"\n✅ Saved {OUTPUT_PATH}")
    print(f"   Tickers: {len(result)}/{len(TICKERS)}")
    print(f"   Trading days: {payload['meta']['tradingDays']}")
    print(f"   Date: {today}")


if __name__ == "__main__":
    main()
