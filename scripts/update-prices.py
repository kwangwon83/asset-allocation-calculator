#!/usr/bin/env python3
"""
Daily Price Updater for Asset Allocation Calculator
Fetches closing prices from Yahoo Finance and updates data/prices.json
Run via: python scripts/update-prices.py
Or via GitHub Actions scheduled workflow
"""

import json
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

try:
    import yfinance as yf
except ImportError:
    print("Installing yfinance...")
    os.system(f"{sys.executable} -m pip install yfinance -q")
    import yfinance as yf

# Tickers used across all strategies
TICKERS = [
    "SPY", "TLT", "GLD", "BIL", "IWD", "QQQ", "IEF", "SHY",
    "IWM", "VWO", "BND", "EFA", "PDBC", "VNQ", "VGK", "EWJ",
    "EEM", "DBC", "HYG", "LQD", "REM", "TIP"
]

def fetch_prices(tickers, period="1y"):
    """Fetch daily closing prices for all tickers."""
    all_data = {}
    print(f"Fetching prices for {len(tickers)} tickers...")
    
    for ticker in tickers:
        try:
            stock = yf.Ticker(ticker)
            hist = stock.history(period=period, auto_adjust=False)
            if hist.empty:
                print(f"  Warning: No data for {ticker}")
                continue
            
            # Get closing prices (not adjusted for splits to match original logic)
            closes = hist["Close"].dropna().tolist()
            
            if len(closes) < 10:
                print(f"  Warning: Insufficient data for {ticker} ({len(closes)} days)")
                continue
                
            all_data[ticker] = [round(p, 2) for p in closes]
            print(f"  {ticker}: {len(closes)} days, latest=${closes[-1]:.2f}")
        except Exception as e:
            print(f"  Error fetching {ticker}: {e}")
    
    return all_data

def update_prices_json(prices_data, output_path="data/prices.json"):
    """Update the prices.json file with new data."""
    today = datetime.now().strftime("%Y-%m-%d")
    
    payload = {
        "meta": {
            "lastUpdated": today,
            "source": "Yahoo Finance",
            "description": "Daily closing prices for asset allocation calculator",
            "tradingDays": min(len(v) for v in prices_data.values()) if prices_data else 0
        }
    }
    
    # Merge all ticker data
    for ticker, prices in prices_data.items():
        payload[ticker] = prices
    
    # Write to file
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
    
    print(f"\nUpdated {output_path} with {len(prices_data)} tickers ({today})")

def main():
    print("=" * 60)
    print("Asset Allocation Calculator - Daily Price Update")
    print("=" * 60)
    
    # Fetch prices
    prices = fetch_prices(TICKERS, period="1y")
    
    if not prices:
        print("ERROR: No price data fetched. Aborting.")
        sys.exit(1)
    
    # Update JSON
    update_prices_json(prices)
    
    print("\nDone!")

if __name__ == "__main__":
    main()
