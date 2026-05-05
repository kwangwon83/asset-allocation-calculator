/**
 * Asset Allocation Calculator Engine
 * Calculates allocations from local price/economic data.
 */

class AllocationEngine {
    constructor(prices, economic) {
        this.prices = prices;
        this.economic = economic;
    }

    // ====== CORE UTILITIES ======

    getCurrentPrice(ticker) {
        if (ticker === 'USD') return 1;
        const arr = this.prices[ticker];
        if (!arr || arr.length === 0) return null;
        return arr[arr.length - 1];
    }

    getPriceNDaysAgo(ticker, n) {
        const arr = this.prices[ticker];
        if (!arr || arr.length < 2) return null;
        const index = Math.max(0, arr.length - 1 - n);
        return arr[index];
    }

    getReturn(ticker, days) {
        const current = this.getCurrentPrice(ticker);
        const past = this.getPriceNDaysAgo(ticker, days);
        if (!current || !past || past === 0) return null;
        return (current - past) / past;
    }

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

    getWeightedMomentumScore(ticker) {
        const parts = [
            { days: 21, weight: 12 },
            { days: 63, weight: 4 },
            { days: 126, weight: 2 },
            { days: 252, weight: 1 }
        ];
        let sum = 0;
        let weightSum = 0;
        for (const part of parts) {
            const ret = this.getReturn(ticker, part.days);
            if (ret !== null) {
                sum += ret * part.weight;
                weightSum += part.weight;
            }
        }
        return weightSum > 0 ? sum : null;
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
        if (!current || !sma) return null;
        return (current / sma) - 1;
    }

    getDailyReturns(ticker, days) {
        const arr = this.prices[ticker];
        if (!arr || arr.length < days + 1) return [];
        const slice = arr.slice(arr.length - days - 1);
        const returns = [];
        for (let i = 1; i < slice.length; i++) {
            if (slice[i - 1]) returns.push((slice[i] - slice[i - 1]) / slice[i - 1]);
        }
        return returns;
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
        if (av === 0 || bv === 0) return null;
        return cov / Math.sqrt(av * bv);
    }

    getAverageCorrelation(ticker, universe, days = 84) {
        const values = universe
            .filter(t => t !== ticker)
            .map(t => this.getCorrelation(ticker, t, days))
            .filter(v => v !== null);
        if (!values.length) return null;
        return values.reduce((a, b) => a + b, 0) / values.length;
    }

    getUnemploymentCurrentAndPast() {
        const u = this.economic.unemployment;
        if (!u || u.length < 13) return null;
        const current = u[u.length - 1].value;
        const past12m = u[u.length - 13].value;
        return { current, past12m };
    }

    isSP500Uptrend() {
        const signal = this.getSmaMomentum('SPY', 200);
        return signal !== null && signal > 0;
    }

    isUnemploymentAboveAverage() {
        const u = this.economic.unemployment;
        if (!u || u.length < 13) return false;
        const current = u[u.length - 1].value;
        const avg12m = u.slice(u.length - 13, u.length - 1)
            .reduce((s, x) => s + x.value, 0) / 12;
        return current > avg12m;
    }

    makeRow(ticker, allocation, category, sector, score = null) {
        return {
            category,
            sector: sector || this.getSector(ticker),
            ticker,
            price: this.getCurrentPrice(ticker),
            score,
            allocation,
            remark: this.getRemark(ticker)
        };
    }

    cashRow(allocation, ticker = 'USD') {
        return this.makeRow(ticker, allocation, '현금', ticker === 'USD' ? '현금' : this.getSector(ticker), null);
    }

    sortByScoreDesc(rows) {
        return rows.slice().sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return a.ticker.localeCompare(b.ticker);
        });
    }

    scoreTickers(tickers, scoreFn) {
        return tickers.map(ticker => ({
            ticker,
            score: scoreFn.call(this, ticker),
            price: this.getCurrentPrice(ticker)
        })).filter(x => x.score !== null && x.price !== null);
    }

    appendCash(result, allocation, ticker = 'USD') {
        if (allocation <= 0.000001) return result;
        const existing = result.find(r => r.ticker === ticker);
        if (existing) existing.allocation += allocation;
        else result.push(this.cashRow(allocation, ticker));
        return result;
    }

    // ====== STRATEGY CALCULATIONS ======

    calcPERM() {
        return [
            this.makeRow('SPY', 0.25, '주식', '미국 대형주'),
            this.makeRow('TLT', 0.25, '채권', '미국 장기채'),
            this.makeRow('GLD', 0.25, '금', '금'),
            this.makeRow('BIL', 0.25, '현금', '초단기채권')
        ];
    }

    calcLAA() {
        const cashTicker = (this.isSP500Uptrend() || this.isUnemploymentAboveAverage()) ? 'QQQ' : 'SHY';
        return [
            this.makeRow('SPY', 0.25, '주식', '미국 대형주'),
            this.makeRow('TLT', 0.25, '채권', '미국 장기채'),
            this.makeRow('GLD', 0.25, '금', '금'),
            this.makeRow(cashTicker, 0.25, cashTicker === 'QQQ' ? '주식' : '현금', this.getSector(cashTicker))
        ];
    }

    calcRAA() {
        const fixed = ['QQQ', 'IWN', 'IEF', 'TLT', 'GLD'];
        const unemployment = this.getUnemploymentCurrentAndPast();
        const expansion = unemployment ? unemployment.current < unemployment.past12m : false;

        if (expansion) {
            return fixed.map(t => this.makeRow(t, 0.20, this.getCategory(t), this.getSector(t), this.getWeightedMomentumScore(t)));
        }

        const canaryScores = [
            this.getWeightedMomentumScore('VWO'),
            this.getWeightedMomentumScore('BND')
        ].filter(s => s !== null);

        const canaryPositive = canaryScores.length === 2 && canaryScores.every(s => s > 0);
        if (canaryPositive) {
            return fixed.map(t => this.makeRow(t, 0.20, this.getCategory(t), this.getSector(t), this.getWeightedMomentumScore(t)));
        }

        return [
            this.makeRow('IEF', 0.50, '방어자산', '미국 중기채', this.getWeightedMomentumScore('IEF')),
            this.makeRow('TLT', 0.50, '방어자산', '미국 장기채', this.getWeightedMomentumScore('TLT'))
        ];
    }

    calcGTAA() {
        const assets = ['SPY', 'EFA', 'IEF', 'DBC', 'VNQ'];
        const result = [];
        let cash = 0;
        for (const ticker of assets) {
            const score = this.getSmaMomentum(ticker, 210);
            if (score !== null && score > 0) {
                result.push(this.makeRow(ticker, 0.20, '투자자산', this.getSector(ticker), score));
            } else {
                cash += 0.20;
            }
        }
        this.appendCash(result, cash);
        return result;
    }

    calcPAA() {
        const assets = ['SPY', 'IWM', 'QQQ', 'VGK', 'EWJ', 'EEM', 'VNQ', 'DBC', 'GLD', 'TLT', 'HYG', 'LQD'];
        const scored = this.sortByScoreDesc(this.scoreTickers(assets, ticker => this.getSmaMomentum(ticker, 252)));
        const positive = scored.filter(x => x.score > 0);

        if (positive.length <= 6) {
            return [this.cashRow(1.0, 'IEF')];
        }

        const selected = positive.slice(0, positive.length - 6);
        const result = selected.map(x => this.makeRow(x.ticker, 1 / 6, '투자자산', this.getSector(x.ticker), x.score));
        this.appendCash(result, 1 - (selected.length / 6), 'IEF');
        return result;
    }

    calcDAA() {
        const offensive = ['SPY', 'IWM', 'QQQ', 'VGK', 'EWJ', 'EEM', 'VNQ', 'DBC', 'GLD', 'TLT', 'HYG', 'LQD'];
        const defensive = ['SHY', 'IEF', 'LQD'];
        const canary = ['VWO', 'BND'];
        const canaryScored = this.scoreTickers(canary, this.getWeightedMomentumScore);
        const canaryPositive = canaryScored.length === canary.length && canaryScored.every(x => x.score >= 0);

        if (canaryPositive) {
            const selected = this.sortByScoreDesc(this.scoreTickers(offensive, this.getWeightedMomentumScore)).slice(0, 2);
            return selected.map(x => this.makeRow(x.ticker, 0.50, '공격자산', this.getSector(x.ticker), x.score));
        }

        const selected = this.sortByScoreDesc(this.scoreTickers(defensive, this.getWeightedMomentumScore))[0];
        return selected ? [this.makeRow(selected.ticker, 1.0, '수비자산', this.getSector(selected.ticker), selected.score)] : [this.cashRow(1.0)];
    }

    calcVAA() {
        const offensive = ['SPY', 'EFA', 'EEM', 'AGG'];
        const defensive = ['LQD', 'SHY', 'IEF'];
        const offensiveScored = this.scoreTickers(offensive, this.getWeightedMomentumScore);
        const allOffensivePositive = offensiveScored.length === offensive.length && offensiveScored.every(x => x.score >= 0);
        const universe = allOffensivePositive ? offensive : defensive;
        const selected = this.sortByScoreDesc(this.scoreTickers(universe, this.getWeightedMomentumScore))[0];
        return selected ? [this.makeRow(selected.ticker, 1.0, allOffensivePositive ? '공격자산' : '수비자산', this.getSector(selected.ticker), selected.score)] : [this.cashRow(1.0)];
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

        const withRank = this.addCompositeRanks(scored, [
            { key: 'momentum', descending: true, weight: 1 },
            { key: 'volatility', descending: false, weight: 0.5 },
            { key: 'correlation', descending: false, weight: 0.5 }
        ]);

        const selected = withRank.sort((a, b) => a.composite - b.composite).slice(0, 3);
        const result = [];
        let cash = 0;
        for (const x of selected) {
            if (x.momentum > 0) {
                result.push(this.makeRow(x.ticker, 1 / 3, '투자자산', this.getSector(x.ticker), x.momentum));
            } else {
                cash += 1 / 3;
            }
        }
        this.appendCash(result, cash);
        return result.length ? result : [this.cashRow(1.0)];
    }

    calcAAA() {
        const assets = ['SPY', 'VGK', 'EWJ', 'EEM', 'VNQ', 'RWX', 'IEF', 'TLT', 'GLD', 'DBC'];
        const candidates = this.scoreTickers(assets, ticker => this.getReturn(ticker, 126)).filter(x => x.score >= 0);
        if (!candidates.length) return [this.cashRow(1.0)];

        const selected = candidates.map(x => x.ticker);
        const weights = this.minimumVarianceWeights(selected, 126);
        return selected.map((ticker, idx) => this.makeRow(ticker, weights[idx], '투자자산', this.getSector(ticker), this.getReturn(ticker, 126)));
    }

    calcDUAL() {
        const spyScore = this.getReturn('SPY', 252);
        const efaScore = this.getReturn('EFA', 252);
        const bilScore = this.getReturn('BIL', 252);

        if (spyScore !== null && bilScore !== null && spyScore > bilScore) {
            const selected = this.sortByScoreDesc([
                { ticker: 'SPY', score: spyScore },
                { ticker: 'EFA', score: efaScore }
            ].filter(x => x.score !== null))[0];
            return [this.makeRow(selected.ticker, 1.0, '주식', this.getSector(selected.ticker), selected.score)];
        }

        return [this.makeRow('AGG', 1.0, '채권', '미국 혼합채권', this.getReturn('AGG', 252))];
    }

    calcCDM() {
        const groups = [
            ['SPY', 'EFA'],
            ['LQD', 'HYG'],
            ['VNQ', 'REM'],
            ['TLT', 'GLD']
        ];
        const bilScore = this.getReturn('BIL', 252);
        const result = [];
        let cash = 0;

        for (const group of groups) {
            const scored = this.sortByScoreDesc(this.scoreTickers(group, ticker => this.getReturn(ticker, 252)));
            const selected = scored[0];
            if (selected && bilScore !== null && selected.score > bilScore) {
                result.push(this.makeRow(selected.ticker, 0.25, '투자자산', this.getSector(selected.ticker), selected.score));
            } else {
                cash += 0.25;
            }
        }
        this.appendCash(result, cash, 'BIL');
        return result;
    }

    calcADM() {
        const stocks = this.sortByScoreDesc(this.scoreTickers(['SPY', 'SCZ'], ticker => this.getMomentumScore(ticker, [21, 63, 126])));
        const bestStock = stocks[0];
        if (bestStock && bestStock.score > 0) {
            return [this.makeRow(bestStock.ticker, 1.0, '주식자산', this.getSector(bestStock.ticker), bestStock.score)];
        }

        const bonds = this.sortByScoreDesc(this.scoreTickers(['TLT', 'TIP'], ticker => this.getMomentumScore(ticker, [21, 63, 126])));
        const bestBond = bonds[0];
        return bestBond ? [this.makeRow(bestBond.ticker, 1.0, '채권자산', this.getSector(bestBond.ticker), bestBond.score)] : [this.cashRow(1.0)];
    }

    calcDYNBOND() {
        const bonds = ['SHY', 'IEF', 'TLT', 'TIP', 'LQD', 'HYG', 'BWX', 'EMB'];
        const selected = this.sortByScoreDesc(this.scoreTickers(bonds, ticker => this.getReturn(ticker, 126))).slice(0, 3);
        const result = [];
        let cash = 0;
        for (const x of selected) {
            if (x.score > 0) {
                result.push(this.makeRow(x.ticker, 1 / 3, '채권자산', this.getSector(x.ticker), x.score));
            } else {
                cash += 1 / 3;
            }
        }
        this.appendCash(result, cash);
        return result.length ? result : [this.cashRow(1.0)];
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

    // ====== LABELS ======

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
            'IWN': 'IWN : iShares Russell 2000 Value ETF',
            'VWO': 'VWO : Vanguard Emerging Markets Stock Index Fund',
            'BND': 'BND : Vanguard Total Bond Market ETF',
            'EFA': 'EFA : iShares MSCI EAFE ETF',
            'PDBC': 'PDBC : Invesco Optimum Yield Diversified Commodity Strategy No K-1 ETF',
            'VNQ': 'VNQ : Vanguard Real Estate Index Fund',
            'VGK': 'VGK : Vanguard European Stock Index Fund',
            'EWJ': 'EWJ : iShares MSCI Japan ETF',
            'EEM': 'EEM : iShares MSCI Emerging Markets ETF',
            'DBC': 'DBC : Invesco DB Commodity Index Tracking Fund',
            'HYG': 'HYG : iShares iBoxx $ High Yield Corporate Bond ETF',
            'LQD': 'LQD : iShares iBoxx $ Investment Grade Corporate Bond ETF',
            'REM': 'REM : iShares Mortgage Real Estate Capped ETF',
            'TIP': 'TIP : iShares TIPS Bond ETF',
            'AGG': 'AGG : iShares Core U.S. Aggregate Bond ETF',
            'SCZ': 'SCZ : iShares MSCI EAFE Small-Cap ETF',
            'BWX': 'BWX : SPDR Bloomberg International Treasury Bond ETF',
            'EMB': 'EMB : iShares J.P. Morgan USD Emerging Markets Bond ETF',
            'RWX': 'RWX : SPDR Dow Jones International Real Estate ETF',
            'VTI': 'VTI : Vanguard Total Stock Market ETF',
            'VEA': 'VEA : Vanguard FTSE Developed Markets ETF',
            'GSG': 'GSG : iShares S&P GSCI Commodity-Indexed Trust',
            'USD': 'USD : US Dollar'
        };
        return remarks[ticker] || ticker;
    }

    getSector(ticker) {
        const sectors = {
            'SPY': '미국 대형주', 'IWD': '미국 대형가치주', 'QQQ': '나스닥', 'IWM': '미국 소형주',
            'IWN': '미국 소형가치주', 'SCZ': '전세계 소형주', 'VTI': '미국 주식',
            'VGK': '유럽 주식', 'EWJ': '일본 주식', 'EEM': '신흥국 주식', 'VWO': '신흥국 주식',
            'EFA': '선진국 주식', 'VEA': '선진국 주식', 'VNQ': '미국 리츠', 'REM': '모기지 리츠',
            'RWX': '국제 리츠', 'IEF': '미국 중기채', 'TLT': '미국 장기채', 'SHY': '미국 단기국채',
            'BND': '미국 종합채권', 'AGG': '미국 혼합채권', 'HYG': '미국 하이일드 채권',
            'LQD': '미국 회사채', 'TIP': '미국 물가연동채', 'BWX': '국제 채권', 'EMB': '신흥국 채권',
            'GLD': '금', 'PDBC': '원자재', 'DBC': '원자재', 'GSG': '원자재',
            'BIL': '초단기채권', 'USD': '현금'
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
        return calc.call(this).filter(row => row.allocation > 0.000001);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AllocationEngine;
}
