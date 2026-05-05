/**
 * Asset Allocation Calculator Engine
 * Returns every strategy candidate row and applies allocation only to selected assets.
 */

class AllocationEngine {
    constructor(prices, economic) {
        this.prices = prices;
        this.economic = economic;
    }

    getCurrentPrice(ticker) {
        if (ticker === 'USD') return 1;
        const arr = this.prices[ticker];
        return arr && arr.length ? arr[arr.length - 1] : null;
    }

    getPriceNDaysAgo(ticker, n) {
        const arr = this.prices[ticker];
        if (!arr || arr.length < 2) return null;
        return arr[Math.max(0, arr.length - 1 - n)];
    }

    getReturn(ticker, days) {
        const current = this.getCurrentPrice(ticker);
        const past = this.getPriceNDaysAgo(ticker, days);
        if (!current || !past || past === 0) return null;
        return (current - past) / past;
    }

    getMomentumScore(ticker, periods = [21, 63, 126, 252]) {
        const values = periods.map(days => this.getReturn(ticker, days)).filter(v => v !== null);
        return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    }

    getWeightedMomentumScore(ticker) {
        const parts = [
            { days: 21, weight: 12 },
            { days: 63, weight: 4 },
            { days: 126, weight: 2 },
            { days: 252, weight: 1 }
        ];
        let score = 0;
        let found = false;
        for (const part of parts) {
            const ret = this.getReturn(ticker, part.days);
            if (ret !== null) {
                score += ret * part.weight;
                found = true;
            }
        }
        return found ? score : null;
    }

    getSMA(ticker, period) {
        const arr = this.prices[ticker];
        if (!arr || arr.length < period) return null;
        const slice = arr.slice(arr.length - period);
        return slice.reduce((a, b) => a + b, 0) / period;
    }

    getSmaMomentum(ticker, period) {
        const current = this.getCurrentPrice(ticker);
        const sma = this.getSMA(ticker, period);
        return current && sma ? (current / sma) - 1 : null;
    }

    getDailyReturns(ticker, days) {
        const arr = this.prices[ticker];
        if (!arr || arr.length < days + 1) return [];
        const slice = arr.slice(arr.length - days - 1);
        const result = [];
        for (let i = 1; i < slice.length; i++) {
            if (slice[i - 1]) result.push((slice[i] - slice[i - 1]) / slice[i - 1]);
        }
        return result;
    }

    getVolatility(ticker, days = 84) {
        const returns = this.getDailyReturns(ticker, days);
        if (returns.length < 2) return null;
        const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((s, r) => s + Math.pow(r - avg, 2), 0) / (returns.length - 1);
        return Math.sqrt(variance);
    }

    getCorrelation(a, b, days = 84) {
        const ar = this.getDailyReturns(a, days);
        const br = this.getDailyReturns(b, days);
        const n = Math.min(ar.length, br.length);
        if (n < 2) return null;
        const ax = ar.slice(ar.length - n);
        const bx = br.slice(br.length - n);
        const am = ax.reduce((s, r) => s + r, 0) / n;
        const bm = bx.reduce((s, r) => s + r, 0) / n;
        let cov = 0;
        let av = 0;
        let bv = 0;
        for (let i = 0; i < n; i++) {
            const ad = ax[i] - am;
            const bd = bx[i] - bm;
            cov += ad * bd;
            av += ad * ad;
            bv += bd * bd;
        }
        return av && bv ? cov / Math.sqrt(av * bv) : null;
    }

    getAverageCorrelation(ticker, universe, days = 84) {
        const values = universe
            .filter(t => t !== ticker)
            .map(t => this.getCorrelation(ticker, t, days))
            .filter(v => v !== null);
        return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    }

    getUnemploymentCurrentAndPast() {
        const u = this.economic.unemployment;
        if (!u || u.length < 13) return null;
        return { current: u[u.length - 1].value, past12m: u[u.length - 13].value };
    }

    isSP500Uptrend() {
        const signal = this.getSmaMomentum('SPY', 200);
        return signal !== null && signal > 0;
    }

    isUnemploymentAboveAverage() {
        const u = this.economic.unemployment;
        if (!u || u.length < 13) return false;
        const current = u[u.length - 1].value;
        const avg12m = u.slice(u.length - 13, u.length - 1).reduce((s, x) => s + x.value, 0) / 12;
        return current > avg12m;
    }

    scoreTickers(tickers, scoreFn) {
        return tickers.map(ticker => ({
            ticker,
            score: scoreFn.call(this, ticker),
            price: this.getCurrentPrice(ticker)
        })).filter(x => x.score !== null && x.price !== null);
    }

    sortByScoreDesc(rows) {
        return rows.slice().sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return a.ticker.localeCompare(b.ticker);
        });
    }

    makeRow(ticker, allocation, category = null, sector = null, score = null) {
        return {
            category: category || this.getCategory(ticker),
            sector: sector || this.getSector(ticker),
            ticker,
            price: this.getCurrentPrice(ticker),
            score,
            allocation,
            remark: this.getRemark(ticker)
        };
    }

    rowsForUniverse(tickers, allocations = {}, scoreFn = null, categoryFn = null) {
        const seen = new Set();
        return tickers.filter(ticker => {
            if (seen.has(ticker)) return false;
            seen.add(ticker);
            return true;
        }).map(ticker => this.makeRow(
            ticker,
            allocations[ticker] || 0,
            categoryFn ? categoryFn(ticker) : this.getCategory(ticker),
            this.getSector(ticker),
            scoreFn ? scoreFn.call(this, ticker) : null
        ));
    }

    // ====== STRATEGIES ======

    calcPERM() {
        return this.rowsForUniverse(
            ['SPY', 'TLT', 'GLD', 'BIL'],
            { SPY: 0.25, TLT: 0.25, GLD: 0.25, BIL: 0.25 }
        );
    }

    calcLAA() {
        const flexible = (this.isSP500Uptrend() || this.isUnemploymentAboveAverage()) ? 'QQQ' : 'SHY';
        return this.rowsForUniverse(
            ['SPY', 'TLT', 'GLD', 'QQQ', 'SHY'],
            { SPY: 0.25, TLT: 0.25, GLD: 0.25, [flexible]: 0.25 },
            ticker => ['QQQ', 'SHY'].includes(ticker) ? null : this.getMomentumScore(ticker)
        );
    }

    calcRAA() {
        const universe = ['QQQ', 'IWN', 'IEF', 'TLT', 'GLD', 'VWO', 'BND'];
        const fixed = { QQQ: 0.20, IWN: 0.20, IEF: 0.20, TLT: 0.20, GLD: 0.20 };
        const unemployment = this.getUnemploymentCurrentAndPast();
        const expansion = unemployment ? unemployment.current < unemployment.past12m : false;
        const canary = this.scoreTickers(['VWO', 'BND'], this.getWeightedMomentumScore);
        const canaryPositive = canary.length === 2 && canary.every(x => x.score > 0);
        const allocations = (expansion || canaryPositive) ? fixed : { IEF: 0.50, TLT: 0.50 };
        return this.rowsForUniverse(universe, allocations, this.getWeightedMomentumScore);
    }

    calcGTAA() {
        const assets = ['SPY', 'EFA', 'IEF', 'DBC', 'VNQ'];
        const allocations = {};
        let cash = 0;
        for (const ticker of assets) {
            const score = this.getSmaMomentum(ticker, 210);
            if (score !== null && score > 0) allocations[ticker] = 0.20;
            else cash += 0.20;
        }
        allocations.USD = cash;
        return this.rowsForUniverse([...assets, 'USD'], allocations, ticker => ticker === 'USD' ? null : this.getSmaMomentum(ticker, 210));
    }

    calcPAA() {
        const assets = ['SPY', 'IWM', 'QQQ', 'VGK', 'EWJ', 'EEM', 'VNQ', 'DBC', 'GLD', 'TLT', 'HYG', 'LQD'];
        const scored = this.sortByScoreDesc(this.scoreTickers(assets, ticker => this.getSmaMomentum(ticker, 252)));
        const positive = scored.filter(x => x.score > 0);
        const allocations = {};
        if (positive.length <= 6) {
            allocations.IEF = 1.0;
        } else {
            const selected = positive.slice(0, positive.length - 6);
            selected.forEach(x => { allocations[x.ticker] = 1 / 6; });
            allocations.IEF = 1 - (selected.length / 6);
        }
        return this.rowsForUniverse([...assets, 'IEF'], allocations, ticker => ticker === 'IEF' ? null : this.getSmaMomentum(ticker, 252));
    }

    calcDAA() {
        const offensive = ['SPY', 'IWM', 'QQQ', 'VGK', 'EWJ', 'EEM', 'VNQ', 'DBC', 'GLD', 'TLT', 'HYG', 'LQD'];
        const defensive = ['SHY', 'IEF', 'LQD'];
        const canary = ['VWO', 'BND'];
        const canaryScored = this.scoreTickers(canary, this.getWeightedMomentumScore);
        const canaryPositive = canaryScored.length === canary.length && canaryScored.every(x => x.score >= 0);
        const allocations = {};
        if (canaryPositive) {
            this.sortByScoreDesc(this.scoreTickers(offensive, this.getWeightedMomentumScore)).slice(0, 2)
                .forEach(x => { allocations[x.ticker] = 0.50; });
        } else {
            const selected = this.sortByScoreDesc(this.scoreTickers(defensive, this.getWeightedMomentumScore))[0];
            if (selected) allocations[selected.ticker] = 1.0;
            else allocations.USD = 1.0;
        }
        const universe = [...offensive, ...defensive, ...canary];
        if (allocations.USD) universe.push('USD');
        return this.rowsForUniverse(universe, allocations, ticker => ticker === 'USD' ? null : this.getWeightedMomentumScore(ticker));
    }

    calcVAA() {
        const offensive = ['SPY', 'EFA', 'EEM', 'AGG'];
        const defensive = ['LQD', 'SHY', 'IEF'];
        const offensiveScored = this.scoreTickers(offensive, this.getWeightedMomentumScore);
        const allOffensivePositive = offensiveScored.length === offensive.length && offensiveScored.every(x => x.score >= 0);
        const selectedUniverse = allOffensivePositive ? offensive : defensive;
        const selected = this.sortByScoreDesc(this.scoreTickers(selectedUniverse, this.getWeightedMomentumScore))[0];
        const allocations = selected ? { [selected.ticker]: 1.0 } : { USD: 1.0 };
        const universe = [...offensive, ...defensive];
        if (allocations.USD) universe.push('USD');
        return this.rowsForUniverse(universe, allocations, ticker => ticker === 'USD' ? null : this.getWeightedMomentumScore(ticker));
    }

    calcFAA() {
        const assets = ['VTI', 'VEA', 'VWO', 'SHY', 'BND', 'GSG', 'VNQ'];
        const scored = assets.map(ticker => ({
            ticker,
            momentum: this.getReturn(ticker, 84),
            volatility: this.getVolatility(ticker, 84),
            correlation: this.getAverageCorrelation(ticker, assets, 84),
            price: this.getCurrentPrice(ticker)
        })).filter(x => x.momentum !== null && x.volatility !== null && x.correlation !== null && x.price !== null);
        const ranked = this.addCompositeRanks(scored, [
            { key: 'momentum', descending: true, weight: 1 },
            { key: 'volatility', descending: false, weight: 0.5 },
            { key: 'correlation', descending: false, weight: 0.5 }
        ]);
        const allocations = {};
        ranked.sort((a, b) => a.composite - b.composite).slice(0, 3).forEach(x => {
            if (x.momentum > 0) allocations[x.ticker] = 1 / 3;
            else allocations.USD = (allocations.USD || 0) + (1 / 3);
        });
        return this.rowsForUniverse([...assets, 'USD'], allocations, ticker => ticker === 'USD' ? null : this.getReturn(ticker, 84));
    }

    calcAAA() {
        const assets = ['SPY', 'VGK', 'EWJ', 'EEM', 'VNQ', 'RWX', 'IEF', 'TLT', 'GLD', 'DBC'];
        const candidates = this.scoreTickers(assets, ticker => this.getReturn(ticker, 126)).filter(x => x.score >= 0);
        const allocations = {};
        if (candidates.length) {
            const selected = candidates.map(x => x.ticker);
            const weights = this.minimumVarianceWeights(selected, 126);
            selected.forEach((ticker, idx) => { allocations[ticker] = weights[idx]; });
        } else {
            allocations.USD = 1.0;
        }
        const universe = allocations.USD ? [...assets, 'USD'] : assets;
        return this.rowsForUniverse(universe, allocations, ticker => ticker === 'USD' ? null : this.getReturn(ticker, 126));
    }

    calcDUAL() {
        const spyScore = this.getReturn('SPY', 252);
        const efaScore = this.getReturn('EFA', 252);
        const bilScore = this.getReturn('BIL', 252);
        const allocations = { SPY: 0, EFA: 0, AGG: 0 };
        if (spyScore !== null && bilScore !== null && spyScore > bilScore) {
            const selected = this.sortByScoreDesc([
                { ticker: 'SPY', score: spyScore },
                { ticker: 'EFA', score: efaScore }
            ].filter(x => x.score !== null))[0];
            if (selected) allocations[selected.ticker] = 1.0;
        } else {
            allocations.AGG = 1.0;
        }
        return this.rowsForUniverse(['SPY', 'EFA', 'AGG'], allocations, ticker => this.getReturn(ticker, 252));
    }

    calcCDM() {
        const groups = [['SPY', 'EFA'], ['LQD', 'HYG'], ['VNQ', 'REM'], ['TLT', 'GLD']];
        const bilScore = this.getReturn('BIL', 252);
        const allocations = {};
        let cash = 0;
        for (const group of groups) {
            const selected = this.sortByScoreDesc(this.scoreTickers(group, ticker => this.getReturn(ticker, 252)))[0];
            if (selected && bilScore !== null && selected.score > bilScore) allocations[selected.ticker] = 0.25;
            else cash += 0.25;
        }
        allocations.BIL = cash;
        return this.rowsForUniverse([...groups.flat(), 'BIL'], allocations, ticker => ticker === 'BIL' ? this.getReturn('BIL', 252) : this.getReturn(ticker, 252));
    }

    calcADM() {
        const stocks = ['SPY', 'SCZ'];
        const bonds = ['TLT', 'TIP'];
        const allocations = {};
        const bestStock = this.sortByScoreDesc(this.scoreTickers(stocks, ticker => this.getMomentumScore(ticker, [21, 63, 126])))[0];
        if (bestStock && bestStock.score > 0) {
            allocations[bestStock.ticker] = 1.0;
        } else {
            const bestBond = this.sortByScoreDesc(this.scoreTickers(bonds, ticker => this.getMomentumScore(ticker, [21, 63, 126])))[0];
            if (bestBond) allocations[bestBond.ticker] = 1.0;
            else allocations.USD = 1.0;
        }
        const universe = allocations.USD ? [...stocks, ...bonds, 'USD'] : [...stocks, ...bonds];
        return this.rowsForUniverse(universe, allocations, ticker => ticker === 'USD' ? null : this.getMomentumScore(ticker, [21, 63, 126]));
    }

    calcDYNBOND() {
        const bonds = ['SHY', 'IEF', 'TLT', 'TIP', 'LQD', 'HYG', 'BWX', 'EMB'];
        const selected = this.sortByScoreDesc(this.scoreTickers(bonds, ticker => this.getReturn(ticker, 126))).slice(0, 3);
        const allocations = {};
        selected.forEach(x => {
            if (x.score > 0) allocations[x.ticker] = 1 / 3;
            else allocations.USD = (allocations.USD || 0) + (1 / 3);
        });
        return this.rowsForUniverse([...bonds, 'USD'], allocations, ticker => ticker === 'USD' ? null : this.getReturn(ticker, 126));
    }

    // ====== PORTFOLIO HELPERS ======

    addCompositeRanks(items, specs) {
        const output = items.map(x => ({ ...x, composite: 0 }));
        for (const spec of specs) {
            const ranked = output.slice().sort((a, b) => {
                const diff = spec.descending ? b[spec.key] - a[spec.key] : a[spec.key] - b[spec.key];
                return diff || a.ticker.localeCompare(b.ticker);
            });
            ranked.forEach((item, idx) => {
                const target = output.find(x => x.ticker === item.ticker);
                target.composite += (idx + 1) * spec.weight;
            });
        }
        return output;
    }

    minimumVarianceWeights(tickers, days = 126) {
        if (tickers.length === 1) return [1];
        const returns = tickers.map(t => this.getDailyReturns(t, days));
        const nDays = Math.min(...returns.map(r => r.length));
        if (nDays < 2) return tickers.map(() => 1 / tickers.length);
        const aligned = returns.map(r => r.slice(r.length - nDays));
        const covariance = this.covarianceMatrix(aligned);
        let weights = tickers.map(() => 1 / tickers.length);
        let step = 0.5;
        for (let iter = 0; iter < 600; iter++) {
            const gradient = covariance.map(row => 2 * row.reduce((s, v, idx) => s + v * weights[idx], 0));
            const next = this.projectToSimplex(weights.map((w, idx) => w - step * gradient[idx]));
            if (this.portfolioVariance(next, covariance) <= this.portfolioVariance(weights, covariance)) {
                weights = next;
                step *= 1.01;
            } else {
                step *= 0.5;
            }
            if (step < 1e-10) break;
        }
        return weights;
    }

    covarianceMatrix(returns) {
        const n = returns.length;
        const len = returns[0].length;
        const means = returns.map(row => row.reduce((a, b) => a + b, 0) / len);
        const matrix = Array.from({ length: n }, () => Array(n).fill(0));
        for (let i = 0; i < n; i++) {
            for (let j = i; j < n; j++) {
                let cov = 0;
                for (let k = 0; k < len; k++) cov += (returns[i][k] - means[i]) * (returns[j][k] - means[j]);
                cov /= (len - 1);
                matrix[i][j] = cov;
                matrix[j][i] = cov;
            }
        }
        return matrix;
    }

    portfolioVariance(weights, covariance) {
        let variance = 0;
        for (let i = 0; i < weights.length; i++) {
            for (let j = 0; j < weights.length; j++) {
                variance += weights[i] * weights[j] * covariance[i][j];
            }
        }
        return variance;
    }

    projectToSimplex(values) {
        const sorted = values.slice().sort((a, b) => b - a);
        let sum = 0;
        let rho = 0;
        for (let i = 0; i < sorted.length; i++) {
            sum += sorted[i];
            const theta = (sum - 1) / (i + 1);
            if (sorted[i] - theta > 0) rho = i + 1;
        }
        const theta = (sorted.slice(0, rho).reduce((a, b) => a + b, 0) - 1) / rho;
        return values.map(v => Math.max(v - theta, 0));
    }

    getRemark(ticker) {
        const remarks = {
            SPY: 'SPY : SPDR S&P 500 ETF Trust',
            TLT: 'TLT : iShares 20+ Year Treasury Bond ETF',
            GLD: 'GLD : SPDR Gold Trust',
            BIL: 'BIL : SPDR Bloomberg 1-3 Month T-Bill ETF',
            IWD: 'IWD : iShares Russell 1000 Value ETF',
            QQQ: 'QQQ : Invesco QQQ Trust',
            IEF: 'IEF : iShares 7-10 Year Treasury Bond ETF',
            SHY: 'SHY : iShares 1-3 Year Treasury Bond ETF',
            IWM: 'IWM : iShares Russell 2000 ETF',
            IWN: 'IWN : iShares Russell 2000 Value ETF',
            VWO: 'VWO : Vanguard Emerging Markets Stock Index Fund',
            BND: 'BND : Vanguard Total Bond Market ETF',
            EFA: 'EFA : iShares MSCI EAFE ETF',
            PDBC: 'PDBC : Invesco Optimum Yield Diversified Commodity Strategy No K-1 ETF',
            VNQ: 'VNQ : Vanguard Real Estate Index Fund',
            VGK: 'VGK : Vanguard European Stock Index Fund',
            EWJ: 'EWJ : iShares MSCI Japan ETF',
            EEM: 'EEM : iShares MSCI Emerging Markets ETF',
            DBC: 'DBC : Invesco DB Commodity Index Tracking Fund',
            HYG: 'HYG : iShares iBoxx $ High Yield Corporate Bond ETF',
            LQD: 'LQD : iShares iBoxx $ Investment Grade Corporate Bond ETF',
            REM: 'REM : iShares Mortgage Real Estate Capped ETF',
            TIP: 'TIP : iShares TIPS Bond ETF',
            AGG: 'AGG : iShares Core U.S. Aggregate Bond ETF',
            SCZ: 'SCZ : iShares MSCI EAFE Small-Cap ETF',
            BWX: 'BWX : SPDR Bloomberg International Treasury Bond ETF',
            EMB: 'EMB : iShares J.P. Morgan USD Emerging Markets Bond ETF',
            RWX: 'RWX : SPDR Dow Jones International Real Estate ETF',
            VTI: 'VTI : Vanguard Total Stock Market ETF',
            VEA: 'VEA : Vanguard FTSE Developed Markets ETF',
            GSG: 'GSG : iShares S&P GSCI Commodity-Indexed Trust',
            USD: 'USD : US Dollar'
        };
        return remarks[ticker] || ticker;
    }

    getSector(ticker) {
        const sectors = {
            SPY: '미국 대형주', IWD: '미국 대형가치주', QQQ: '나스닥', IWM: '미국 소형주',
            IWN: '미국 소형가치주', SCZ: '전세계 소형주', VTI: '미국 주식',
            VGK: '유럽 주식', EWJ: '일본 주식', EEM: '신흥국 주식', VWO: '신흥국 주식',
            EFA: '선진국 주식', VEA: '선진국 주식', VNQ: '미국 리츠', REM: '모기지 리츠',
            RWX: '국제 리츠', IEF: '미국 중기채', TLT: '미국 장기채', SHY: '미국 단기국채',
            BND: '미국 종합채권', AGG: '미국 혼합채권', HYG: '미국 하이일드 채권',
            LQD: '미국 회사채', TIP: '미국 물가연동채', BWX: '국제 채권', EMB: '신흥국 채권',
            GLD: '금', PDBC: '원자재', DBC: '원자재', GSG: '원자재',
            BIL: '초단기채권', USD: '현금'
        };
        return sectors[ticker] || '기타';
    }

    getCategory(ticker) {
        if (['SPY', 'IWD', 'QQQ', 'IWM', 'IWN', 'SCZ', 'VTI', 'VGK', 'EWJ', 'EEM', 'VWO', 'EFA', 'VEA'].includes(ticker)) return '주식';
        if (['VNQ', 'REM', 'RWX'].includes(ticker)) return '리츠';
        if (['IEF', 'TLT', 'SHY', 'BND', 'AGG', 'HYG', 'LQD', 'TIP', 'BWX', 'EMB', 'BIL'].includes(ticker)) return '채권';
        if (['GLD', 'PDBC', 'DBC', 'GSG'].includes(ticker)) return '원자재';
        if (ticker === 'USD') return '현금';
        return '기타';
    }

    calculate(strategy) {
        const calculators = {
            PERM: this.calcPERM,
            LAA: this.calcLAA,
            RAA: this.calcRAA,
            GTAA: this.calcGTAA,
            PAA: this.calcPAA,
            DAA: this.calcDAA,
            VAA: this.calcVAA,
            FAA: this.calcFAA,
            AAA: this.calcAAA,
            DUAL: this.calcDUAL,
            CDM: this.calcCDM,
            ADM: this.calcADM,
            DYNBOND: this.calcDYNBOND
        };
        const calc = calculators[strategy];
        return calc ? calc.call(this) : [];
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AllocationEngine;
}
