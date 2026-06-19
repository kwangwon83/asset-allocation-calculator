/**
 * Data Loader - loads price and economic data.
 *
 * Default remote source is the repository's data branch so production
 * does not read daily-changing JSON from main. Set `window.AAC_DATA_BASE_URL`
 * to override the remote base URL.
 */
class DataLoader {
    constructor() {
        this.prices = null;
        this.economic = null;
        this.defaultRemotePricesUrl = this.getConfiguredUrl('AAC_REMOTE_PRICES_URL', 'https://raw.githubusercontent.com/kwangwon83/asset-allocation-calculator/refs/heads/data/data/prices.json');
        this.defaultRemoteEconomicUrl = this.getConfiguredUrl('AAC_REMOTE_ECONOMIC_URL', 'https://raw.githubusercontent.com/kwangwon83/asset-allocation-calculator/refs/heads/data/data/economic.json');
    }


    getConfiguredUrl(key, fallback) {
        if (typeof window === 'undefined' || !window[key]) return fallback;
        return String(window[key]);
    }

    async loadAll() {
        try {
            // Try memory first
            if (this.prices && this.economic) {
                return { prices: this.prices, economic: this.economic };
            }

            // Always ask for the latest JSON. GitHub Actions can update data
            // files while the app is open, and stale browser caches would
            // otherwise hide the new prices.
            const version = Date.now();
            const source = this.getDataSource();
            const [pricesRes, economicRes] = await Promise.all([
                fetch(`${source.pricesUrl}?v=${version}`, { cache: 'no-store' }),
                fetch(`${source.economicUrl}?v=${version}`, { cache: 'no-store' })
            ]);

            if (!pricesRes.ok) throw new Error(`Failed to load prices.json from ${source.label}`);
            if (!economicRes.ok) throw new Error(`Failed to load economic.json from ${source.label}`);

            this.prices = await pricesRes.json();
            this.economic = await economicRes.json();

            return { prices: this.prices, economic: this.economic };
        } catch (err) {
            console.error('DataLoader error:', err);
            throw err;
        }
    }

    getDataSource() {
        const dataBaseUrl = this.getDataBaseUrl();

        if (dataBaseUrl) {
            return {
                label: dataBaseUrl,
                pricesUrl: `${dataBaseUrl}/prices.json`,
                economicUrl: `${dataBaseUrl}/economic.json`
            };
        }

        return {
            label: 'default-remote',
            pricesUrl: this.defaultRemotePricesUrl,
            economicUrl: this.defaultRemoteEconomicUrl
        };
    }

    getDataBaseUrl() {
        if (typeof window === 'undefined' || !window.AAC_DATA_BASE_URL) return null;
        return String(window.AAC_DATA_BASE_URL).replace(/\/$/, '');
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
