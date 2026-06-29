#!/usr/bin/env python3
"""
Daily Price Updater - Yahoo Finance Chart API Edition

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
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from html import unescape
from datetime import datetime, timedelta, timezone
from pathlib import Path

TICKERS = [
    "SPY", "TLT", "GLD", "BIL", "IWD", "QQQ", "IEF", "SHY",
    "IWM", "VWO", "BND", "EFA", "PDBC", "VNQ", "VGK", "EWJ",
    "EEM", "HYG", "LQD", "REM", "TIP", "AGG", "SCZ",
    "BWX", "EMB", "RWX", "VTI", "VEA", "IWN", "SCHD",
    "363580.KS", "360750.KS", "411060.KS", "365780.KS", "284430.KS", "272580.KS"
]

OUTPUT_PATH = "data/prices.json"
ECONOMIC_OUTPUT_PATH = "data/economic.json"
TRADING_DAYS = 252
LOOKBACK_DAYS = 370
USE_ADJUSTED_CLOSE = True

YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
BLS_TIMESERIES_URL = "https://api.bls.gov/publicAPI/v2/timeseries/data/"
BLS_UNRATE_SERIES_ID = "LNS14000000"
FRED_T10Y3M_CSV_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=T10Y3M"
SP500_DIVIDEND_YIELD_URL = "https://us500.com/tools/data/sp500-dividend-yield"


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


def _http_get_text(url, timeout=30):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/122.0 Safari/537.36"
            ),
            "Accept": "text/csv,text/plain,*/*",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8")


def _http_post_json(url, payload, timeout=30):
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/122.0 Safari/537.36"
            ),
            "Accept": "application/json,text/plain,*/*",
            "Content-Type": "application/json",
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
    print(f"  [{symbol}] {len(dates)} days, ${price_by_date[dates[0]]} -> ${price_by_date[dates[-1]]}")
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

    KST = timezone(timedelta(hours=9))
    today = datetime.now(KST).strftime("%Y-%m-%d")
  
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


def calculate_sma(values, period):
    if len(values) < period:
        return None
    return sum(values[-period:]) / period


def fetch_unemployment():
    current_year = datetime.now().year
    payload = {
        "seriesid": [BLS_UNRATE_SERIES_ID],
        "startyear": str(current_year - 5),
        "endyear": str(current_year),
    }
    data = _http_post_json(BLS_TIMESERIES_URL, payload, timeout=60)
    if data.get("status") != "REQUEST_SUCCEEDED":
        raise RuntimeError(f"BLS API request failed: {data.get('message')}")

    series = (data.get("Results", {}).get("series") or [{}])[0]
    rows = series.get("data") or []
    unemployment_by_date = {}
    for row in rows:
        period = row.get("period", "")
        value = row.get("value")
        if not period.startswith("M") or not value or value == "-":
            continue
        month = int(period[1:])
        date = f"{int(row['year']):04d}-{month:02d}-01"
        unemployment_by_date[date] = float(value)

    unemployment = [
        {"date": date, "value": unemployment_by_date[date]}
        for date in sorted(unemployment_by_date)
    ]
    if len(unemployment) < 13:
        raise RuntimeError("BLS unemployment series returned fewer than 13 observations.")

    return unemployment


def fetch_t10y3m_spread():
    try:
        start = (datetime.now() - timedelta(days=540)).strftime("%Y-%m-%d")
        url = f"{FRED_T10Y3M_CSV_URL}&cosd={start}"
        text = _http_get_text(url, timeout=30)
        latest = None
        for line in text.splitlines()[1:]:
            if not line.strip():
                continue
            date, value = line.split(",", 1)
            if value.strip() == ".":
                continue
            latest = {"date": date, "value": float(value), "source": "FRED T10Y3M"}
        if latest:
            return latest
    except Exception as e:
        print(f"  [T10Y3M] FRED fetch failed, using Yahoo yield proxy: {e}")

    tnx = fetch_latest_yahoo_close("^TNX")
    irx = fetch_latest_yahoo_close("^IRX")
    return {
        "date": tnx["date"],
        "value": round(tnx["value"] - irx["value"], 4),
        "source": "Yahoo Finance ^TNX - ^IRX proxy"
    }


def fetch_latest_yahoo_close(symbol):
    to_date = datetime.now().strftime("%Y-%m-%d")
    from_date = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
    prices = fetch_ticker(symbol, from_date, to_date)
    if not prices:
        raise RuntimeError(f"Could not fetch Yahoo proxy ticker {symbol}.")
    date = sorted(prices)[-1]
    return {"date": date, "value": prices[date]}


def fetch_sp500_dividend_yield():
    text = unescape(_http_get_text(SP500_DIVIDEND_YIELD_URL, timeout=30)).replace("<!-- -->", "")
    marker = "Current S&P 500 Dividend Yield"
    idx = text.find(marker)
    if idx < 0:
        raise RuntimeError("Could not find S&P 500 dividend yield marker.")
    snippet = text[idx:idx + 700]
    value_match = re.search(r"([0-9]+(?:\.[0-9]+)?)\s*%", snippet)
    if not value_match:
        raise RuntimeError("Could not parse S&P 500 dividend yield value.")
    date_match = re.search(r"Updated\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})", snippet)
    return {
        "date": date_match.group(1) if date_match else datetime.now().strftime("%Y-%m-%d"),
        "value": float(value_match.group(1)),
        "threshold": 1.6
    }


def build_economic_payload(prices_payload):
    unemployment = fetch_unemployment()
    t10y3m = fetch_t10y3m_spread()
    sp500_dividend_yield = fetch_sp500_dividend_yield()
    spy_prices = prices_payload.get("SPY") or []
    sp500_last = spy_prices[-1] if spy_prices else None
    sp500_ma200 = calculate_sma(spy_prices, 200)

    KST = timezone(timedelta(hours=9))
    today = datetime.now(KST).strftime("%Y-%m-%d")

    payload = {
        "lastUpdated": today,
        "source": "BLS (LNS14000000), Yahoo Finance (SPY proxy), FRED (T10Y3M), US500.com",
        "unemployment": unemployment,
        "sp500_ma200": round(sp500_ma200, 4) if sp500_ma200 is not None else None,
        "sp500_last": sp500_last,
        "sp500_dividend_yield": sp500_dividend_yield,
        "t10y3m_spread": t10y3m,
        "notes": {
            "unemployment_source": "BLS: LNS14000000 (Civilian Unemployment Rate)",
            "sp500_source": "Calculated from SPY daily adjusted closes",
            "sp500_dividend_yield_source": SP500_DIVIDEND_YIELD_URL,
            "t10y3m_source": "FRED: T10Y3M (fallback: Yahoo Finance ^TNX - ^IRX proxy)",
            "update_frequency": "Monthly for unemployment, Daily for SPY prices and DGA risk indicators"
        }
    }
    return payload


def main():
    print("=" * 60)
    print("Asset Allocation Calculator - Daily Price Updater (Yahoo)")
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
        print("\nERROR: No price data fetched. Yahoo may be blocked or unavailable.")
        sys.exit(1)

    if failed:
        print(f"\nWARNING: Failed tickers: {', '.join(failed)}")
        print("   The output will include only successfully fetched tickers.")

    try:
        payload = build_aligned_payload(price_maps)
    except Exception as e:
        print(f"\nERROR: Could not build aligned payload: {e}")
        sys.exit(1)

    output_path = Path(OUTPUT_PATH)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

    try:
        economic_payload = build_economic_payload(payload)
    except Exception as e:
        print(f"\nWARNING: Could not update {ECONOMIC_OUTPUT_PATH}: {e}")
        economic_payload = None

    if economic_payload:
        economic_path = Path(ECONOMIC_OUTPUT_PATH)
        economic_path.parent.mkdir(parents=True, exist_ok=True)
        economic_path.write_text(json.dumps(economic_payload, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"\nSaved {OUTPUT_PATH}")
    print(f"   Tickers: {len(price_maps)}/{len(TICKERS)}")
    print(f"   Trading days: {payload['meta']['tradingDays']}")
    print(f"   Date range: {payload['meta']['dateRange']['from']} ~ {payload['meta']['dateRange']['to']}")
    print(f"   Date: {payload['meta']['lastUpdated']}")
    if economic_payload:
        latest_unemployment = economic_payload["unemployment"][-1]
        print(f"\nSaved {ECONOMIC_OUTPUT_PATH}")
        print(f"   UNRATE: {latest_unemployment['date']} = {latest_unemployment['value']}%")
        print(f"   SPY last: {economic_payload['sp500_last']}")
        print(f"   SPY SMA200: {economic_payload['sp500_ma200']}")
        print(f"   S&P 500 dividend yield: {economic_payload['sp500_dividend_yield']['value']}%")
        print(f"   T10Y3M spread: {economic_payload['t10y3m_spread']['value']}%")


if __name__ == "__main__":
    main()
