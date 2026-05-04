/**
 * Asset Allocation Calculator Engine
 * Calculates momentum scores and allocations for 14 strategies
 * No external spreadsheet dependency - pure JavaScript calculation
 */

class AllocationEngine {
    constructor(prices, economic) {
        this.prices = prices;        // { ticker: [daily prices], meta: { lastUpdated, source } }
        this.economic = economic;    // { unemployment: [...], sp500_ma200: value, lastUpdated }
    }

    // ====== CORE UTILITIES ======

    getCurrentPrice(ticker) {
        const arr = this.prices[ticker];
        if (!arr || arr.length === 0) return null;
        return arr[arr.length - 1];
    }

    getPriceNDaysAgo(ticker, n) {
        const arr = this.prices[ticker];
        if (!arr || arr.length <= n) return null;
        return arr[arr.length - 1 - n];
    }

    // n-days return (can be used for 1mo ~21days, 3mo ~63, 6mo ~126, 12mo ~252)
    getReturn(ticker, days) {
        const current = this.getCurrentPrice(ticker);
        const past = this.getPriceNDaysAgo(ticker, days);
        if (!current || !past || past === 0) return null;
        return (current - past) / past;
    }

    // Multi-period momentum score (equal-weighted average of returns)
    getMomentumScore(ticker, periods = [21, 63, 126, 252]) {
        let sum = 0;
        let count = 0;
        for (const days of periods) {
            const ret = this.getReturn(ticker, days);
            if (ret !== null) {
                sum += ret;
                count++;
            }
        }
        return count > 0 ? sum / count : null;
    }

    // Simple moving average
    getSMA(ticker, period) {
        const arr = this.prices[ticker];
        if (!arr || arr.length < period) return null;
        const slice = arr.slice(arr.length - period);
        const sum = slice.reduce((a, b) => a + b, 0);
        return sum / period;
    }

    // ====== ECONOMIC INDICATORS ======

    getUnemploymentMomentum() {
        const u = this.economic.unemployment;
        if (!u || u.length < 13) return null; // need 13 months
        const current = u[u.length - 1].value;
        const avg12m = u.slice(u.length - 13, u.length - 1)
            .reduce((s, x) => s + x.value, 0) / 12;
        return { current, avg12m, signal: current >= avg12m ? 'recession' : 'expansion' };
    }

    getSP500Momentum() {
        const spx = this.prices['SPY']; // proxy with SPY
        if (!spx || spx.length < 200) return null;
        const current = this.getCurrentPrice('SPY');
        const ma200 = this.getSMA('SPY', 200);
        return { current, ma200, signal: current >= ma200 ? 'uptrend' : 'downtrend' };
    }

    // ====== STRATEGY CALCULATIONS ======

    /**
     * PERM - Permanent Portfolio (static 25% x 4)
     */
    calcPERM() {
        const assets = [
            { category: '주식', sector: '미국 대형주', ticker: 'SPY', allocation: 0.25 },
            { category: '채권', sector: '미국 장기채', ticker: 'TLT', allocation: 0.25 },
            { category: '원자재', sector: '금', ticker: 'GLD', allocation: 0.25 },
            { category: '현금', sector: '초단기채권', ticker: 'BIL', allocation: 0.25 },
        ];
        return assets.map(a => ({
            ...a,
            price: this.getCurrentPrice(a.ticker),
            score: null,
            remark: this.getRemark(a.ticker)
        }));
    }

    /**
     * LAA - Lethargic Asset Allocation
     * Double momentum: Unemployment + S&P 500 200-day MA
     */
    calcLAA() {
        const um = this.getUnemploymentMomentum();
        const spm = this.getSP500Momentum();

        // Default defensive
        let alloc = [
            { category: '주식', sector: '미국 대형가치주', ticker: 'IWD', allocation: 0 },
            { category: '주식', sector: '나스닥', ticker: 'QQQ', allocation: 0 },
            { category: '중장기채권', sector: '미국 중기채', ticker: 'IEF', allocation: 0 },
            { category: '금', sector: '금', ticker: 'GLD', allocation: 0 },
            { category: '현금/단기채권', sector: '미국 단기국채', ticker: 'SHY', allocation: 1.0 },
        ];

        // Both positive = invest in risk assets
        if (um && spm && um.signal === 'expansion' && spm.signal === 'uptrend') {
            alloc = [
                { category: '주식', sector: '미국 대형가치주', ticker: 'IWD', allocation: 0.25 },
                { category: '주식', sector: '나스닥', ticker: 'QQQ', allocation: 0.25 },
                { category: '중장기채권', sector: '미국 중기채', ticker: 'IEF', allocation: 0.25 },
                { category: '금', sector: '금', ticker: 'GLD', allocation: 0.25 },
                { category: '현금/단기채권', sector: '미국 단기국채', ticker: 'SHY', allocation: 0 },
            ];
        }
        // One negative = partial cash
        else if (um && spm) {
            const recession = um.signal === 'recession';
            const downtrend = spm.signal === 'downtrend';
            if (recession && !downtrend) {
                // Recession but market up -> reduce equity, increase gold/bonds
                alloc = [
                    { category: '주식', sector: '미국 대형가치주', ticker: 'IWD', allocation: 0.15 },
                    { category: '주식', sector: '나스닥', ticker: 'QQQ', allocation: 0.10 },
                    { category: '중장기채권', sector: '미국 중기채', ticker: 'IEF', allocation: 0.30 },
                    { category: '금', sector: '금', ticker: 'GLD', allocation: 0.25 },
                    { category: '현금/단기채권', sector: '미국 단기국채', ticker: 'SHY', allocation: 0.20 },
                ];
            } else if (!recession && downtrend) {
                // Expansion but market down -> cash heavy
                alloc = [
                    { category: '주식', sector: '미국 대형가치주', ticker: 'IWD', allocation: 0.10 },
                    { category: '주식', sector: '나스닥', ticker: 'QQQ', allocation: 0.10 },
                    { category: '중장기채권', sector: '미국 중기채', ticker: 'IEF', allocation: 0.30 },
                    { category: '금', sector: '금', ticker: 'GLD', allocation: 0.20 },
                    { category: '현금/단기채권', sector: '미국 단기국채', ticker: 'SHY', allocation: 0.30 },
                ];
            }
        }

        return alloc.map(a => ({
            ...a,
            price: this.getCurrentPrice(a.ticker),
            score: a.ticker === 'SHY' ? null : this.getMomentumScore(a.ticker),
            remark: this.getRemark(a.ticker)
        }));
    }

    /**
     * RAA - Robust Asset Allocation
     * Momentum + unemployment weighting
     */
    calcRAA() {
        const tickers = [
            { t: 'QQQ', cat: '주식', sec: '나스닥' },
            { t: 'IWM', cat: '주식', sec: '미국 소형가치주' },
            { t: 'IEF', cat: '채권', sec: '미국 중기채' },
            { t: 'TLT', cat: '채권', sec: '미국 장기채' },
            { t: 'GLD', cat: '원자재', sec: '금' },
            { t: 'VWO', cat: '신흥국', sec: '신흥국 주식' },
            { t: 'BND', cat: '채권', sec: '미국 혼합채권' },
        ];

        // Calculate momentum scores
        const scored = tickers.map(x => ({
            ...x,
            score: this.getMomentumScore(x.t, [21, 63, 126, 252]),
            price: this.getCurrentPrice(x.t)
        })).filter(x => x.score !== null);

        // Sort by score descending
        scored.sort((a, b) => b.score - a.score);

        // Unemployment adjustment
        const um = this.getUnemploymentMomentum();
        const isRecession = um && um.signal === 'recession';

        // Allocate: top 3-4 get higher weight, bonds get boost in recession
        let totalScore = scored.reduce((s, x) => s + Math.max(0, x.score), 0);
        if (totalScore <= 0) totalScore = 1;

        const result = scored.map(x => {
            let alloc = Math.max(0, x.score) / totalScore;
            // Boost bonds in recession, reduce in expansion
            if (isRecession && (x.t === 'IEF' || x.t === 'TLT' || x.t === 'BND')) {
                alloc *= 1.3;
            }
            return {
                category: x.cat,
                sector: x.sec,
                ticker: x.t,
                price: x.price,
                score: x.score,
                allocation: alloc,
                remark: this.getRemark(x.t)
            };
        });

        // Normalize to 100%
        const totalAlloc = result.reduce((s, x) => s + x.allocation, 0);
        result.forEach(x => { x.allocation = totalAlloc > 0 ? x.allocation / totalAlloc : 0; });

        return result;
    }

    /**
     * GTAA - Global Tactical Asset Allocation
     * Binary: momentum > 0 => invest 20%, else cash
     */
    calcGTAA() {
        const assets = [
            { cat: '미국 대형주', t: 'SPY' },
            { cat: '선진국 주식', t: 'EFA' },
            { cat: '미국 중기채', t: 'IEF' },
            { cat: '원자재', t: 'PDBC' },
            { cat: '미국 리츠', t: 'VNQ' },
            { cat: '현금', t: 'USD' },
        ];

        const result = [];
        let cashPct = 0;

        for (const a of assets) {
            if (a.t === 'USD') continue;
            const score = this.getMomentumScore(a.t, [252]); // 12mo only for GTAA
            const isPositive = score !== null && score > 0;
            const alloc = isPositive ? 0.20 : 0;
            if (!isPositive) cashPct += 0.20;
            result.push({
                category: isPositive ? '투자자산' : '현금',
                sector: a.cat,
                ticker: a.t,
                price: this.getCurrentPrice(a.t),
                score: score,
                allocation: alloc,
                remark: this.getRemark(a.t)
            });
        }

        // Add USD cash position
        if (cashPct > 0) {
            result.push({
                category: '현금',
                sector: '현금',
                ticker: 'USD',
                price: 1,
                score: null,
                allocation: cashPct,
                remark: 'US Dollar'
            });
        }

        return result.filter(x => x.allocation > 0);
    }

    /**
     * PAA - Protective Asset Allocation
     * Top 4 positive momentum assets get 16.7% each, rest goes to cash
     */
    calcPAA() {
        const tickers = [
            'SPY', 'IWM', 'QQQ', 'VGK', 'EWJ', 'EEM', 'VNQ',
            'PDBC', 'GLD', 'TLT', 'HYG', 'LQD'
        ];

        const scored = tickers.map(t => ({
            ticker: t,
            score: this.getMomentumScore(t, [252]), // 12mo momentum
            price: this.getCurrentPrice(t)
        })).filter(x => x.score !== null);

        // Sort by score descending
        scored.sort((a, b) => b.score - a.score);

        // Top 4 positive get 16.7% each = 66.8%, rest 33.2% to IEF (cash proxy)
        const top4 = scored.filter(x => x.score > 0).slice(0, 4);
        const hasDefense = scored.some(x => x.score <= 0) || scored.length > 4;

        const result = [];
        top4.forEach(x => {
            result.push({
                category: '투자자산',
                sector: this.getSector(x.ticker),
                ticker: x.ticker,
                price: x.price,
                score: x.score,
                allocation: 1/6, // 16.67%
                remark: this.getRemark(x.ticker)
            });
        });

        // Remaining to IEF
        const remaining = 1 - (top4.length / 6);
        if (remaining > 0) {
            result.push({
                category: '현금성 자산',
                sector: '미국 중기채',
                ticker: 'IEF',
                price: this.getCurrentPrice('IEF'),
                score: null,
                allocation: remaining,
                remark: this.getRemark('IEF')
            });
        }

        return result;
    }

    /**
     * DAA - Defensive Asset Allocation
     * All-or-Nothing: ALL assets must have positive momentum
     */
    calcDAA() {
        const offensive = [
            'SPY', 'IWM', 'QQQ', 'VGK', 'EWJ', 'EEM', 'VNQ',
            'DBC', 'GLD', 'TLT', 'HYG', 'LQD'
        ];

        const scored = offensive.map(t => ({
            ticker: t,
            score: this.getMomentumScore(t, [252]),
            price: this.getCurrentPrice(t)
        })).filter(x => x.score !== null);

        // Check if ALL are positive
        const allPositive = scored.every(x => x.score > 0);

        if (allPositive && scored.length > 0) {
            // Equal weight among positive
            const weight = 1 / scored.length;
            return scored.map(x => ({
                category: '공격자산',
                sector: this.getSector(x.ticker),
                ticker: x.ticker,
                price: x.price,
                score: x.score,
                allocation: weight,
                remark: this.getRemark(x.ticker)
            }));
        } else {
            // Full defense
            return [{
                category: '수비자산',
                sector: '미국 단기국채',
                ticker: 'SHY',
                price: this.getCurrentPrice('SHY'),
                score: null,
                allocation: 1.0,
                remark: this.getRemark('SHY')
            }];
        }
    }

    /**
     * VAA - Vigilant Asset Allocation
     */
    calcVAA() {
        // VAA typically holds SHY (100%) as ultra-defensive cash proxy
        // Or selects top 1-2 from a universe
        const tickers = ['SPY', 'IWM', 'QQQ', 'VGK', 'EEM', 'VNQ', 'PDBC', 'GLD', 'TLT'];
        const scored = tickers.map(t => ({
            ticker: t,
            score: this.getMomentumScore(t, [21, 63, 126, 252]),
            price: this.getCurrentPrice(t)
        })).filter(x => x.score !== null);

        scored.sort((a, b) => b.score - a.score);
        const top = scored[0];

        if (top && top.score > 0) {
            return [{
                category: '투자자산',
                sector: this.getSector(top.ticker),
                ticker: top.ticker,
                price: top.price,
                score: top.score,
                allocation: 1.0,
                remark: this.getRemark(top.ticker)
            }];
        }
        return [{
            category: '현금',
            sector: '미국 단기국채',
            ticker: 'SHY',
            price: this.getCurrentPrice('SHY'),
            score: null,
            allocation: 1.0,
            remark: this.getRemark('SHY')
        }];
    }

    /**
     * FAA - Flexible Asset Allocation
     */
    calcFAA() {
        const tickers = [
            { t: 'PDBC', cat: '원자재' },
            { t: 'VNQ', cat: '리츠' },
            { t: 'USD', cat: '현금' }
        ];

        const result = [];
        let cashPct = 0;

        for (const x of tickers) {
            if (x.t === 'USD') continue;
            const score = this.getMomentumScore(x.t, [252]);
            const isPos = score !== null && score > 0;
            const alloc = isPos ? 0.333 : 0;
            if (!isPos) cashPct += 0.333;
            result.push({
                category: x.cat,
                sector: x.cat,
                ticker: x.t,
                price: this.getCurrentPrice(x.t),
                score: score,
                allocation: alloc,
                remark: this.getRemark(x.t)
            });
        }

        if (cashPct > 0) {
            result.push({
                category: '현금',
                sector: '현금',
                ticker: 'USD',
                price: 1,
                score: null,
                allocation: cashPct,
                remark: 'US Dollar'
            });
        }

        return result.filter(x => x.allocation > 0);
    }

    /**
     * AAA - Adaptive Asset Allocation
     */
    calcAAA() {
        const tickers = [
            { t: 'VGK', w: 0.10 },
            { t: 'EEM', w: 0.04 },
            { t: 'VNQ', w: 0.50 },
            { t: 'PDBC', w: 0.36 },
        ];

        // Adjust weights by momentum (adaptive)
        const scored = tickers.map(x => ({
            ...x,
            score: this.getMomentumScore(x.t, [21, 63, 126, 252]),
            price: this.getCurrentPrice(x.t)
        })).filter(x => x.price !== null);

        // Momentum-weighted allocation
        let totalScore = scored.reduce((s, x) => s + Math.max(0, x.score || 0), 0);
        if (totalScore <= 0) totalScore = 1;

        const result = scored.map(x => {
            const momentumWeight = Math.max(0, x.score || 0) / totalScore;
            const finalAlloc = (x.w * 0.5) + (momentumWeight * 0.5); // blend base + momentum
            return {
                category: '투자자산',
                sector: this.getSector(x.t),
                ticker: x.t,
                price: x.price,
                score: x.score,
                allocation: finalAlloc,
                remark: this.getRemark(x.t)
            };
        });

        // Normalize
        const total = result.reduce((s, x) => s + x.allocation, 0);
        result.forEach(x => { x.allocation = total > 0 ? x.allocation / total : 0; });
        return result;
    }

    /**
     * DUAL - Dual Momentum (Traditional)
     */
    calcDUAL() {
        const spyScore = this.getMomentumScore('SPY', [252]);
        const tltScore = this.getMomentumScore('TLT', [252]);

        if (spyScore !== null && tltScore !== null && spyScore > tltScore && spyScore > 0) {
            return [{
                category: '주식',
                sector: '미국 대형주',
                ticker: 'SPY',
                price: this.getCurrentPrice('SPY'),
                score: spyScore,
                allocation: 1.0,
                remark: this.getRemark('SPY')
            }];
        } else if (tltScore !== null && tltScore > 0) {
            return [{
                category: '채권',
                sector: '미국 장기채',
                ticker: 'TLT',
                price: this.getCurrentPrice('TLT'),
                score: tltScore,
                allocation: 1.0,
                remark: this.getRemark('TLT')
            }];
        }
        return [{
            category: '현금',
            sector: '단기채권',
            ticker: 'SHY',
            price: this.getCurrentPrice('SHY'),
            score: null,
            allocation: 1.0,
            remark: this.getRemark('SHY')
        }];
    }

    /**
     * CDM - Composite Dual Momentum
     */
    calcCDM() {
        const assets = [
            { t: 'SPY', s: '미국 대형주' },
            { t: 'HYG', s: '하이일드' },
            { t: 'REM', s: '리츠' },
            { t: 'GLD', s: '금' }
        ];

        const scored = assets.map(a => ({
            ...a,
            score: this.getMomentumScore(a.t, [21, 63, 126, 252]),
            price: this.getCurrentPrice(a.t)
        })).filter(x => x.score !== null);

        // All must be positive for full investment
        const allPos = scored.every(x => x.score > 0);

        if (allPos) {
            return scored.map(x => ({
                category: '투자자산',
                sector: x.s,
                ticker: x.t,
                price: x.price,
                score: x.score,
                allocation: 0.25,
                remark: this.getRemark(x.t)
            }));
        }

        // Partial: only positive ones, rest to cash
        const positive = scored.filter(x => x.score > 0);
        if (positive.length > 0) {
            const w = 1 / (positive.length + 1); // +1 for cash reserve
            const result = positive.map(x => ({
                category: '투자자산',
                sector: x.s,
                ticker: x.t,
                price: x.price,
                score: x.score,
                allocation: w,
                remark: this.getRemark(x.t)
            }));
            result.push({
                category: '현금',
                sector: '현금',
                ticker: 'SHY',
                price: this.getCurrentPrice('SHY'),
                score: null,
                allocation: w,
                remark: this.getRemark('SHY')
            });
            return result;
        }

        return [{
            category: '현금',
            sector: '단기채권',
            ticker: 'SHY',
            price: this.getCurrentPrice('SHY'),
            score: null,
            allocation: 1.0,
            remark: this.getRemark('SHY')
        }];
    }

    /**
     * ADM - Accelerating Dual Momentum
     */
    calcADM() {
        const spyScore = this.getMomentumScore('SPY', [21, 63, 126, 252]);
        const price = this.getCurrentPrice('SPY');

        if (spyScore !== null && spyScore > 0) {
            return [{
                category: '주식',
                sector: '미국 대형주',
                ticker: 'SPY',
                price: price,
                score: spyScore,
                allocation: 1.0,
                remark: this.getRemark('SPY')
            }];
        }
        return [{
            category: '현금',
            sector: '단기채권',
            ticker: 'SHY',
            price: this.getCurrentPrice('SHY'),
            score: null,
            allocation: 1.0,
            remark: this.getRemark('SHY')
        }];
    }

    /**
     * DYNBOND - Dynamic Bond Allocation
     */
    calcDYNBOND() {
        const tipScore = this.getMomentumScore('TIP', [252]);
        const tltScore = this.getMomentumScore('TLT', [252]);

        // If rates falling (TLT positive), extend duration with TIP
        // If rates rising, hold cash
        let tipAlloc = 0.33;
        let cashAlloc = 0.67;

        if (tltScore !== null && tltScore > 0) {
            tipAlloc = 0.50;
            cashAlloc = 0.50;
        }
        if (tltScore !== null && tltScore < -0.05) {
            tipAlloc = 0.20;
            cashAlloc = 0.80;
        }

        return [
            {
                category: '채권',
                sector: '물가연동채',
                ticker: 'TIP',
                price: this.getCurrentPrice('TIP'),
                score: tipScore,
                allocation: tipAlloc,
                remark: this.getRemark('TIP')
            },
            {
                category: '현금',
                sector: '현금',
                ticker: 'USD',
                price: 1,
                score: null,
                allocation: cashAlloc,
                remark: 'US Dollar'
            }
        ];
    }

    // ====== HELPERS ======

    getRemark(ticker) {
        const remarks = {
            'SPY': 'SPY : SPDR S&P 500 ETF Trust',
            'TLT': 'TLT : iShares 20+ Year Treasury Bond ETF',
            'GLD': 'GLD : SPDR Gold Trust',
            'BIL': 'BIL : SPDR Bloomberg 1-3 Month T-Bill ETF',
            'IWD': 'IWD : iShares Russell 1000 Value ETF',
            'QQQ': 'QQQ : Invesco QQQ Trust',
            'IEF': 'IEF : iShares 7-10 Year Treasury Bond ETF',
            'SHY': 'SHY : iShares 1-3 Year Treasury Bond ETF',
            'IWM': 'IWM : iShares Russell 2000 ETF',
            'VWO': 'VWO : Vanguard Emerging Markets Stock Index Fund',
            'BND': 'BND : Vanguard Total Bond Market Index Fund ETF Shares',
            'EFA': 'EFA : iShares MSCI EAFE ETF',
            'PDBC': 'PDBC : Invesco Optimum Yield Diversified Commodity Strategy No K-1 ETF',
            'VNQ': 'VNQ : Vanguard Real Estate Index Fund',
            'VGK': 'VGK : Vanguard European Stock Index Fund',
            'EWJ': 'EWJ : iShares MSCI Japan ETF',
            'EEM': 'EEM : iShares MSCI Emerging Markets ETF',
            'DBC': 'DBC : Invesco DB Commodity Index Tracking Fund',
            'HYG': 'HYG : iShares iBoxx $ High Yield Corporate Bond ETF',
            'LQD': 'LQD : iShares Trust - iShares iBoxx $ Investment Grade Corporate Bond ETF',
            'REM': 'REM : iShares Mortgage Real Estate Capped ETF',
            'TIP': 'TIP : iShares TIPS Bond ETF',
            'USD': 'USD : US Dollar'
        };
        return remarks[ticker] || ticker;
    }

    getSector(ticker) {
        const sectors = {
            'SPY': '미국 대형주', 'IWD': '미국 대형가치주', 'QQQ': '나스닥', 'IWM': '미국 소형주',
            'VGK': '유럽 주식', 'EWJ': '일본 주식', 'EEM': '신흥국 주식', 'VWO': '신흥국 주식',
            'EFA': '선진국 주식', 'VNQ': '미국 리츠',
            'IEF': '미국 중기채', 'TLT': '미국 장기채', 'SHY': '미국 단기채', 'BND': '미국 혼합채권',
            'HYG': '하이일드 채권', 'LQD': '투자등급 채권', 'TIP': '물가연동채',
            'GLD': '금', 'PDBC': '원자재', 'DBC': '원자재',
            'REM': '리츠', 'BIL': '초단기채권', 'USD': '현금'
        };
        return sectors[ticker] || '기타';
    }

    // ====== MAIN API ======

    calculate(strategy) {
        const calculators = {
            'PERM': this.calcPERM,
            'LAA': this.calcLAA,
            'RAA': this.calcRAA,
            'GTAA': this.calcGTAA,
            'PAA': this.calcPAA,
            'DAA': this.calcDAA,
            'VAA': this.calcVAA,
            'FAA': this.calcFAA,
            'AAA': this.calcAAA,
            'DUAL': this.calcDUAL,
            'CDM': this.calcCDM,
            'ADM': this.calcADM,
            'DYNBOND': this.calcDYNBOND
        };

        const calc = calculators[strategy];
        if (!calc) return [];
        return calc.call(this);
    }
}

// Export for both module and browser usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AllocationEngine;
}
