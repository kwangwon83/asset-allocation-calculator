/**
 * Data Loader - loads price and economic data.
 *
 * Default source is local ./data/*.json so local/dev still works.
 * To avoid Netlify production deploys on daily data updates, set
 * `window.AAC_DATA_BASE_URL` (for example to the same repo's GitHub
 * Pages URL on a data-only branch) and keep changing JSON out of main.
 */
class DataLoader {
    constructor() {
        this.prices = null;
        this.economic = null;
        this.cacheKey = 'aac_cache_v6';
        this.maxCacheAge = 3600000; // 1 hour in ms
    }

    async loadAll() {
        try {
            // Try memory first
            if (this.prices && this.economic) {
                return { prices: this.prices, economic: this.economic };
            }

            try {
                // Always ask for the latest JSON first. GitHub Actions can update
                // data files while the app is open, and stale localStorage would
                // otherwise hide the new prices for up to an hour.
                const version = Date.now();
                const dataBaseUrl = this.getDataBaseUrl();
                const sourceCandidates = dataBaseUrl ? [dataBaseUrl, './data'] : ['./data'];
                let loaded = null;
                let lastError = null;

                for (const sourceBase of sourceCandidates) {
                    try {
                        const [pricesRes, economicRes] = await Promise.all([
                            fetch(`${sourceBase}/prices.json?v=${version}`, { cache: 'no-store' }),
                            fetch(`${sourceBase}/economic.json?v=${version}`, { cache: 'no-store' })
                        ]);

                        if (!pricesRes.ok) throw new Error(`Failed to load prices.json from ${sourceBase}`);
                        if (!economicRes.ok) throw new Error(`Failed to load economic.json from ${sourceBase}`);

                        loaded = {
                            prices: await pricesRes.json(),
                            economic: await economicRes.json()
                        };
                        break;
                    } catch (err) {
                        lastError = err;
                    }
                }

                if (!loaded) throw lastError || new Error('Failed to load data sources');

                this.prices = loaded.prices;
                this.economic = loaded.economic;

                this.saveToCache();
                return { prices: this.prices, economic: this.economic };
            } catch (networkErr) {
                const cached = this.loadFromCache();
                if (cached) {
                    this.prices = cached.prices;
                    this.economic = cached.economic;
                    return cached;
                }
                throw networkErr;
            }
        } catch (err) {
            console.error('DataLoader error:', err);
            // Return minimal fallback data for demo
            return this.getFallbackData();
        }
    }

    getDataBaseUrl() {
        if (typeof window === 'undefined' || !window.AAC_DATA_BASE_URL) return null;
        return String(window.AAC_DATA_BASE_URL).replace(/\/$/, '');
    }

    loadFromCache() {
        try {
            const raw = localStorage.getItem(this.cacheKey);
            if (!raw) return null;
            const data = JSON.parse(raw);
            const age = Date.now() - data.timestamp;
            if (age > this.maxCacheAge) {
                localStorage.removeItem(this.cacheKey);
                return null;
            }
            return { prices: data.prices, economic: data.economic };
        } catch (e) {
            return null;
        }
    }

    saveToCache() {
        try {
            const payload = {
                timestamp: Date.now(),
                prices: this.prices,
                economic: this.economic
            };
            localStorage.setItem(this.cacheKey, JSON.stringify(payload));
        } catch (e) {
            // Storage full or private mode
        }
    }

    getFallbackData() {
        // Minimal fallback for demo when data files are missing
        return {
            prices: {
                SPY: [450.0], TLT: [95.0], GLD: [200.0], BIL: [91.5],
                IWD: [160.0], QQQ: [390.0], IEF: [96.0], SHY: [83.0],
                IWM: [200.0], VWO: [42.0], BND: [72.0], EFA: [70.0],
                PDBC: [18.0], VNQ: [85.0], VGK: [58.0], EWJ: [55.0],
                EEM: [42.0], DBC: [22.0], HYG: [78.0], LQD: [108.0],
                REM: [32.0], TIP: [110.0], SCHD: [80.0]
            },
            economic: {
                lastUpdated: new Date().toISOString().split('T')[0],
                unemployment: [
                    { date: '2024-01-01', value: 3.7 }, { date: '2024-02-01', value: 3.9 },
                    { date: '2024-03-01', value: 3.8 }, { date: '2024-04-01', value: 3.9 },
                    { date: '2024-05-01', value: 4.0 }, { date: '2024-06-01', value: 4.1 },
                    { date: '2024-07-01', value: 4.3 }, { date: '2024-08-01', value: 4.2 },
                    { date: '2024-09-01', value: 4.1 }, { date: '2024-10-01', value: 4.1 },
                    { date: '2024-11-01', value: 4.2 }, { date: '2024-12-01', value: 4.1 },
                    { date: '2025-01-01', value: 4.0 }
                ],
                sp500_ma200: 5600,
                sp500_dividend_yield: { date: '2025-01-01', value: 1.5, threshold: 1.6 },
                t10y3m_spread: { date: '2025-01-01', value: 0.0 }
            }
        };
    }

    getLastUpdated() {
        if (this.prices && this.prices.meta && this.prices.meta.lastUpdated) {
            return this.prices.meta.lastUpdated;
        }
        if (this.economic && this.economic.lastUpdated) {
            return this.economic.lastUpdated;
        }
        return null;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = DataLoader;
}
