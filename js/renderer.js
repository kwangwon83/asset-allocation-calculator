/**
 * Renderer - renders allocation tables, budget calculations, and price charts.
 */
class Renderer {
    constructor(engine) {
        this.engine = engine;
        this.calculateFn = null;
        this.boundInputs = { budget: null, fee: null };
        this.chart = { ticker: null };
        this.currentStrategy = '';
    }

    getCurrency(ticker) {
        return ticker && ticker.endsWith('.KS') ? 'KRW' : 'USD';
    }

    getPortfolioCurrency(data) {
        return data.some(row => this.getCurrency(row.ticker) === 'KRW') ? 'KRW' : 'USD';
    }

    async render(strategy) {
        this.currentStrategy = String(strategy || '').toUpperCase();
        this.enhanceDescription();

        const tableBody = document.querySelector('.contentTable');
        const tableHead = document.querySelector('.titleTable');
        const footnote = document.querySelector('.table-footnote');

        if (!tableBody) {
            console.error('[Renderer] .contentTable not found');
            return;
        }

        if (tableHead) tableHead.innerHTML = '';
        tableBody.innerHTML = '';
        if (footnote) footnote.innerHTML = '';

        let data;
        try {
            data = this.engine.calculate(strategy);
        } catch (e) {
            console.error('[Renderer] calculate error:', e);
            this.showError(tableBody, '계산 중 오류가 발생했습니다.');
            return;
        }

        if (!data || data.length === 0) {
            this.showError(tableBody, '전략 "' + strategy + '"의 계산 결과가 없습니다.');
            return;
        }

        this.renderHeader(tableHead, this.getPortfolioCurrency(data), this.currentStrategy);
        this.renderRows(tableBody, footnote, data, this.currentStrategy);
        this.prepareFootnoteToggle(footnote);
        this.renderDecisionExplanation(strategy, data);
        this.bindCalculation();
        this.updateTimestamp();
        this.preparePriceChart(data);
    }

    enhanceDescription() {
        const desc = document.querySelector('.page-desc');
        if (!desc || desc.dataset.enhanced === 'true') return;

        desc.querySelectorAll('.desc-line').forEach((line, idx) => {
            const text = line.textContent.trim();
            if (idx === 0) line.classList.add('desc-summary');
            if (/=|\*|<|>|▶|평균|이동평균|수익률|스코어|standard deviation|correlation/i.test(text)) {
                line.classList.add('desc-formula');
            }
            if (/자산군|투자자산군|공격자산|수비자산|카나리아|고정자산|방어자산|현금성자산|채권자산|주식자산/.test(text)) {
                line.classList.add('desc-important');
            }
        });

        desc.dataset.enhanced = 'true';
    }

    isKoreaEtfStrategy(strategy = this.currentStrategy) {
        return String(strategy || '').toUpperCase().startsWith('KORETF');
    }

    getAssetLabel(row) {
        return this.isKoreaEtfStrategy() && row.displayName ? row.displayName : row.ticker;
    }

    renderHeader(tableHead, currency = 'USD', strategy = this.currentStrategy) {
        if (!tableHead) return;
        const tickerHeader = this.isKoreaEtfStrategy(strategy) ? '종목명' : '티커';
        const headers = ['구분', '자산/섹터', tickerHeader, `주가(${currency})`, '배분비중(%)', '배분수량(주)'];
        const tr = document.createElement('tr');
        headers.forEach(h => {
            const th = document.createElement('th');
            th.textContent = h;
            tr.appendChild(th);
        });
        tableHead.appendChild(tr);
    }

    formatPrice(price, currency = 'USD') {
        if (!price) return '-';
        return currency === 'KRW'
            ? Math.round(price).toLocaleString()
            : price.toFixed(1);
    }

    renderRows(tableBody, footnote, data, strategy = this.currentStrategy) {
        let prevCategory = '';
        data.forEach((row, idx) => {
            const tr = document.createElement('tr');
            if (idx % 2 === 0) tr.className = 'even';

            const tdCat = document.createElement('td');
            tdCat.className = 'cell-category';
            if (row.category && row.category !== prevCategory) {
                tdCat.textContent = row.category;
                prevCategory = row.category;
            }
            tr.appendChild(tdCat);

            const tdSec = document.createElement('td');
            tdSec.className = 'cell-sector';
            tdSec.textContent = row.sector || '-';
            tr.appendChild(tdSec);

            const tdTick = document.createElement('td');
            tdTick.className = 'cell-ticker';
            const tickerButton = document.createElement('button');
            tickerButton.type = 'button';
            tickerButton.className = 'ticker-button';
            const assetLabel = this.isKoreaEtfStrategy(strategy) && row.displayName ? row.displayName : row.ticker;
            tickerButton.textContent = assetLabel;
            tickerButton.dataset.ticker = row.ticker;
            tickerButton.title = assetLabel + ' 1년 가격 그래프 보기';
            tickerButton.addEventListener('click', () => this.renderPriceChart(row.ticker));
            tdTick.appendChild(tickerButton);
            tr.appendChild(tdTick);

            const tdPrice = document.createElement('td');
            tdPrice.className = 'cell-price';
            tdPrice.textContent = row.price ? this.formatPrice(row.price, this.getCurrency(row.ticker)) : '-';
            tr.appendChild(tdPrice);

            const tdAlloc = document.createElement('td');
            tdAlloc.className = 'cell-allocation';
            const pct = (row.allocation * 100).toFixed(1);
            tdAlloc.textContent = row.allocation > 0 ? pct + '%' : '-';
            tr.appendChild(tdAlloc);

            const tdStocks = document.createElement('td');
            tdStocks.className = 'cell-stocks';
            tdStocks.textContent = '-';
            tr.appendChild(tdStocks);

            tableBody.appendChild(tr);

            if (row.remark && footnote && !footnote.querySelector(`[data-ticker="${row.ticker}"]`)) {
                const div = document.createElement('div');
                div.className = 'remark';
                div.dataset.ticker = row.ticker;
                const ticker = document.createElement('strong');
                ticker.textContent = row.ticker;
                div.appendChild(ticker);
                const remark = String(row.remark || '').replace(new RegExp('^' + row.ticker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:\\s*'), '');
                div.appendChild(document.createTextNode(' : ' + remark));
                footnote.appendChild(div);
            }
        });
    }

    prepareFootnoteToggle(footnote) {
        if (!footnote) return;

        let wrapper = document.querySelector('.footnote-wrap');
        let toggle = document.querySelector('.footnote-toggle');
        const tableSection = document.querySelector('.table-section');

        if (!wrapper) {
            wrapper = document.createElement('div');
            wrapper.className = 'footnote-wrap';
            tableSection.insertBefore(wrapper, footnote);
            wrapper.appendChild(footnote);
        }

        if (!toggle) {
            toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'footnote-toggle';
            wrapper.insertBefore(toggle, footnote);
        }

        const hasRemarks = footnote.children.length > 0;
        wrapper.style.display = hasRemarks ? '' : 'none';
        footnote.hidden = true;
        toggle.textContent = '종목 설명 보기';
        toggle.setAttribute('aria-expanded', 'false');

        if (toggle.dataset.bound !== 'true') {
            toggle.addEventListener('click', () => {
                const isHidden = footnote.hidden;
                footnote.hidden = !isHidden;
                toggle.textContent = isHidden ? '종목 설명 숨기기' : '종목 설명 보기';
                toggle.setAttribute('aria-expanded', String(isHidden));
            });
            toggle.dataset.bound = 'true';
        }
    }

    renderDecisionExplanation(strategy, data) {
        const panel = this.ensureDecisionPanel();
        const explanation = this.buildDecisionExplanation(String(strategy || '').toUpperCase(), data);
        if (!explanation) {
            panel.style.display = 'none';
            return;
        }

        panel.style.display = '';
        panel.innerHTML = '';

        const title = document.createElement('div');
        title.className = 'decision-title';
        title.textContent = '선정 근거';
        panel.appendChild(title);

        const summary = document.createElement('div');
        summary.className = 'decision-summary';
        summary.textContent = explanation.summary;
        panel.appendChild(summary);

        const grid = document.createElement('div');
        grid.className = 'decision-grid';
        explanation.items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'decision-item' + (item.selected ? ' selected' : '');

            const head = document.createElement('div');
            head.className = 'decision-item-head';

            const name = document.createElement('strong');
            if (item.ticker && this.hasPriceSeries(item.ticker)) {
                name.appendChild(this.createTickerButton(item.title, item.ticker));
            } else {
                this.appendTextWithTickerButtons(name, item.title);
            }
            head.appendChild(name);

            if (item.badge) {
                const badge = document.createElement('span');
                badge.className = 'decision-badge';
                badge.textContent = item.badge;
                head.appendChild(badge);
            }

            const body = document.createElement('div');
            body.className = 'decision-item-body';
            this.appendTextWithTickerButtons(body, item.body);

            card.appendChild(head);
            card.appendChild(body);
            grid.appendChild(card);
        });
        panel.appendChild(grid);
    }

    ensureDecisionPanel() {
        let panel = document.querySelector('.decision-panel');
        if (panel) return panel;

        const tableSection = document.querySelector('.table-section');
        panel = document.createElement('div');
        panel.className = 'decision-panel';

        const chartPanel = document.querySelector('.price-chart-panel');
        if (chartPanel) tableSection.insertBefore(panel, chartPanel);
        else tableSection.appendChild(panel);
        return panel;
    }

    buildDecisionExplanation(strategy, data) {
        const builders = {
            PERM: () => this.explainPermanentPortfolio(data),
            LAA: () => this.explainLAA(data),
            RAA: () => this.explainRAA(data),
            GTAA: () => this.explainGTAA(data),
            PAA: () => this.explainPAA(data),
            DAA: () => this.explainDAA(data),
            VAA: () => this.explainVAA(data),
            FAA: () => this.explainFAA(data),
            AAA: () => this.explainAAA(data),
            DUAL: () => this.explainDual(data),
            CDM: () => this.explainCDM(data),
            ADM: () => this.explainADM(data),
            DGA: () => this.explainDGA(data),
            DYNBOND: () => this.explainDynamicBond(data),
            KORETF: () => this.explainKoreaEtf(data),
            KORETF_STABLE: () => this.explainKoreaEtf(data),
            KORETF_NEUTRAL: () => this.explainKoreaEtf(data),
            KORETF_GROWTH: () => this.explainKoreaEtf(data)
        };
        return builders[strategy] ? builders[strategy]() : this.explainGeneric(data);
    }

    explainPermanentPortfolio(data) {
        return {
            summary: '영구 포트폴리오는 시장 신호로 자산을 고르는 전략이 아니라, 네 자산을 항상 같은 비중으로 보유합니다.',
            items: data.map(row => this.decisionItem(
                row.ticker,
                row.allocation > 0,
                `${this.fmtAlloc(row.allocation)} 고정 배분입니다.`,
                row.allocation > 0 ? '선정' : '제외'
            ))
        };
    }

    explainLAA(data) {
        const spy = this.engine.getCurrentPrice('SPY');
        const spySma = this.engine.getSMA('SPY', 200);
        const uptrend = this.engine.isSP500Uptrend();
        const unemployment = this.engine.economic?.unemployment || [];
        const current = unemployment.length ? unemployment[unemployment.length - 1].value : null;
        const avg12m = unemployment.length >= 13
            ? unemployment.slice(unemployment.length - 13, unemployment.length - 1).reduce((s, x) => s + x.value, 0) / 12
            : null;
        const unemploymentHigh = current !== null && avg12m !== null && current > avg12m;
        const selected = this.selectedTickers(data).join(', ') || '없음';
        const flexible = data.find(row => ['QQQ', 'SHY'].includes(row.ticker) && row.allocation > 0)?.ticker || 'SHY';

        return {
            summary: `S&P500과 실업률 조건을 확인한 뒤 고정자산 IWD, IEF, GLD에 25.0%씩 배분하고, 유연자산은 ${flexible}로 선택했습니다. 현재 선정 자산은 ${selected}입니다.`,
            items: [
                this.decisionItem('S&P500 추세', uptrend, `SPY 현재가 ${this.fmtPrice(spy)}, 200일 이동평균 ${this.fmtPrice(spySma)}로 ${uptrend ? '상승장' : '하락장'}으로 판단했습니다.`, uptrend ? '상승장' : '하락장'),
                this.decisionItem('실업률 조건', unemploymentHigh, `현재 실업률 ${this.fmtPlain(current)}%, 최근 12개월 평균 ${this.fmtPlain(avg12m)}%로 ${unemploymentHigh ? '실업률 조건이 충족되었습니다' : '실업률 조건이 충족되지 않았습니다'}.`, unemploymentHigh ? '조건 충족' : '조건 미충족'),
                this.decisionItem(flexible, true, `${uptrend || unemploymentHigh ? '상승장 또는 실업률 조건이 충족되어' : '두 조건이 모두 충족되지 않아'} 유연자산 25.0%를 ${flexible}에 배분했습니다.`, '선정')
            ]
        };
    }

    explainRAA(data) {
        const unemployment = this.engine.getUnemploymentCurrentAndPast();
        const expansion = unemployment ? unemployment.current < unemployment.past12m : false;
        const canary = this.sortedScores(['VWO', 'BND'], ticker => this.engine.getWeightedMomentumScore(ticker));
        const canaryPositive = canary.length === 2 && canary.every(x => x.score > 0);
        const selected = this.selectedTickers(data).join(', ') || '없음';
        const signal = expansion || canaryPositive;

        return {
            summary: `${signal ? '위험자산 보유 조건' : '방어 조건'}으로 판단해 ${selected}에 배분했습니다.`,
            items: [
                this.decisionItem('실업률 사이클', expansion, `현재 실업률 ${this.fmtPlain(unemployment?.current)}%, 12개월 전 ${this.fmtPlain(unemployment?.past12m)}%로 ${expansion ? '확장 국면' : '확장 국면이 아님'}으로 보았습니다.`, expansion ? '확장' : '방어'),
                ...canary.map(x => this.decisionItem(x.ticker, x.score > 0, `카나리아 모멘텀 스코어는 ${this.fmtPct(x.score)}입니다.`, x.score > 0 ? '양호' : '주의')),
                ...this.selectedRows(data).map(row => this.decisionItem(row.ticker, true, `최종 배분비중은 ${this.fmtAlloc(row.allocation)}입니다.`, '선정'))
            ]
        };
    }

    explainGTAA(data) {
        const assets = ['SPY', 'EFA', 'IEF', 'PDBC', 'VNQ'];
        const scores = this.scoreItems(assets, ticker => this.engine.getSmaMomentum(ticker, 210));
        const cash = data.find(row => row.ticker === 'USD')?.allocation || 0;
        return {
            summary: '각 자산의 10개월 이동평균 대비 위치를 확인해 양수인 자산에는 20.0%씩, 음수인 몫은 현금으로 배분했습니다.',
            items: [
                ...scores.map(x => this.decisionItem(x.ticker, x.score > 0, `10개월 SMA 모멘텀은 ${this.fmtPct(x.score)}이고 최종 배분은 ${this.fmtAlloc(this.allocOf(data, x.ticker))}입니다.`, x.score > 0 ? '선정' : '현금 전환')),
                this.decisionItem('USD', cash > 0, `모멘텀이 음수인 자산 몫이 ${this.fmtAlloc(cash)}만큼 현금으로 이동했습니다.`, cash > 0 ? '보유' : '없음')
            ]
        };
    }

    explainPAA(data) {
        const assets = ['SPY', 'IWM', 'QQQ', 'VGK', 'EWJ', 'EEM', 'VNQ', 'PDBC', 'GLD', 'TLT', 'HYG', 'LQD'];
        const scored = this.engine.sortByScoreDesc(this.scoreItems(assets, ticker => this.engine.getSmaMomentum(ticker, 252)));
        const positive = scored.filter(x => x.score > 0);
        const selected = this.selectedTickers(data).join(', ') || '없음';
        return {
            summary: `12개월 이동평균 기준 양수 자산은 ${positive.length}개입니다. 규칙에 따라 최종 선정 자산은 ${selected}입니다.`,
            items: [
                this.decisionItem('양수 자산 수', positive.length > 6, `${positive.length}개가 양수입니다. ${positive.length <= 6 ? '6개 이하라 IEF 100.0%로 방어 배분했습니다.' : `상위 ${positive.length - 6}개 위험자산을 선택했습니다.`}`, positive.length > 6 ? '공격' : '방어'),
                ...scored.slice(0, 8).map(x => this.decisionItem(x.ticker, this.allocOf(data, x.ticker) > 0, `12개월 SMA 모멘텀은 ${this.fmtPct(x.score)}, 최종 배분은 ${this.fmtAlloc(this.allocOf(data, x.ticker))}입니다.`, this.allocOf(data, x.ticker) > 0 ? '선정' : '제외')),
                this.decisionItem('IEF', this.allocOf(data, 'IEF') > 0, `방어 배분으로 IEF에 ${this.fmtAlloc(this.allocOf(data, 'IEF'))}가 배정되었습니다.`, this.allocOf(data, 'IEF') > 0 ? '선정' : '없음')
            ]
        };
    }

    explainDAA(data) {
        const offensive = ['SPY', 'IWM', 'QQQ', 'VGK', 'EWJ', 'EEM', 'VNQ', 'PDBC', 'GLD', 'TLT', 'HYG', 'LQD'];
        const defensive = ['SHY', 'IEF', 'LQD'];
        const canary = this.scoreItems(['VWO', 'BND'], ticker => this.engine.getWeightedMomentumScore(ticker));
        const canaryPositive = canary.length === 2 && canary.every(x => x.score >= 0);
        const pool = canaryPositive ? offensive : defensive;
        const ranked = this.engine.sortByScoreDesc(this.scoreItems(pool, ticker => this.engine.getWeightedMomentumScore(ticker)));
        return {
            summary: `카나리아 자산 ${canary.map(x => `${x.ticker} ${this.fmtPct(x.score)}`).join(', ')} 기준으로 ${canaryPositive ? '공격 모드' : '방어 모드'}를 선택했습니다.`,
            items: [
                ...canary.map(x => this.decisionItem(x.ticker, x.score >= 0, `카나리아 모멘텀 스코어는 ${this.fmtPct(x.score)}입니다.`, x.score >= 0 ? '양호' : '주의')),
                ...ranked.slice(0, 4).map(x => this.decisionItem(x.ticker, this.allocOf(data, x.ticker) > 0, `선택 후보 내 모멘텀 스코어는 ${this.fmtPct(x.score)}, 최종 배분은 ${this.fmtAlloc(this.allocOf(data, x.ticker))}입니다.`, this.allocOf(data, x.ticker) > 0 ? '선정' : '후보'))
            ]
        };
    }

    explainVAA(data) {
        const offensive = ['SPY', 'EFA', 'EEM', 'AGG'];
        const defensive = ['LQD', 'SHY', 'IEF'];
        const offensiveScores = this.scoreItems(offensive, ticker => this.engine.getWeightedMomentumScore(ticker));
        const allPositive = offensiveScores.length === offensive.length && offensiveScores.every(x => x.score >= 0);
        const pool = allPositive ? offensive : defensive;
        const ranked = this.engine.sortByScoreDesc(this.scoreItems(pool, ticker => this.engine.getWeightedMomentumScore(ticker)));
        const selected = this.selectedTickers(data).join(', ') || '없음';
        return {
            summary: `공격자산 모멘텀이 모두 양수인지 확인한 뒤 ${allPositive ? '공격자산' : '방어자산'} 중 최고 점수인 ${selected}에 100.0% 배분했습니다.`,
            items: [
                ...offensiveScores.map(x => this.decisionItem(x.ticker, x.score >= 0, `공격자산 모멘텀 스코어는 ${this.fmtPct(x.score)}입니다.`, x.score >= 0 ? '양수' : '음수')),
                ...ranked.slice(0, 3).map(x => this.decisionItem(x.ticker, this.allocOf(data, x.ticker) > 0, `선택 풀에서의 모멘텀 스코어는 ${this.fmtPct(x.score)}입니다.`, this.allocOf(data, x.ticker) > 0 ? '선정' : '후보'))
            ]
        };
    }

    explainFAA(data) {
        const assets = ['VTI', 'VEA', 'VWO', 'SHY', 'BND', 'PDBC', 'VNQ'];
        const scored = assets.map(ticker => ({
            ticker,
            momentum: this.engine.getReturn(ticker, 84),
            volatility: this.engine.getVolatility(ticker, 84),
            correlation: this.engine.getAverageCorrelation(ticker, assets, 84),
            price: this.engine.getCurrentPrice(ticker)
        })).filter(x => x.momentum !== null && x.volatility !== null && x.correlation !== null && x.price !== null);
        const ranked = this.engine.addCompositeRanks(scored, [
            { key: 'momentum', descending: true, weight: 1 },
            { key: 'volatility', descending: false, weight: 0.5 },
            { key: 'correlation', descending: false, weight: 0.5 }
        ]).sort((a, b) => a.composite - b.composite);
        return {
            summary: '4개월 모멘텀, 변동성, 상관관계를 함께 평가했습니다. 종합순위 점수가 낮을수록 우수하며, 상위 3개 중 모멘텀이 양수인 자산만 편입했습니다.',
            items: ranked.slice(0, 5).map(x => this.decisionItem(
                x.ticker,
                this.allocOf(data, x.ticker) > 0,
                `4개월 모멘텀 ${this.fmtPct(x.momentum)}, 변동성 ${this.fmtPct(x.volatility)}, 평균상관 ${this.fmtPlain(x.correlation)}, 종합순위 ${this.fmtPlain(x.composite)}점입니다. 최종 배분은 ${this.fmtAlloc(this.allocOf(data, x.ticker))}입니다.`,
                this.allocOf(data, x.ticker) > 0 ? '선정' : (x.momentum > 0 ? '후보' : '현금 전환')
            ))
        };
    }

    explainAAA(data) {
        const assets = ['SPY', 'VGK', 'EWJ', 'EEM', 'VNQ', 'RWX', 'IEF', 'TLT', 'GLD', 'PDBC'];
        const scored = this.engine.sortByScoreDesc(this.scoreItems(assets, ticker => this.engine.getReturn(ticker, 126)));
        const candidates = scored.filter(x => x.score >= 0);
        return {
            summary: `6개월 모멘텀이 0.0% 이상인 후보 ${candidates.length}개를 먼저 고르고, 그 후보 안에서 롱온리 최소분산 포트폴리오 비중을 계산했습니다.`,
            items: scored.map(x => this.decisionItem(
                x.ticker,
                this.allocOf(data, x.ticker) > 0,
                `6개월 수익률은 ${this.fmtPct(x.score)}, 최소분산 계산 후 최종 배분은 ${this.fmtAlloc(this.allocOf(data, x.ticker))}입니다.`,
                this.allocOf(data, x.ticker) > 0 ? '선정' : (x.score >= 0 ? '후보' : '제외')
            ))
        };
    }

    explainDual(data) {
        const spy = this.engine.getReturn('SPY', 252);
        const efa = this.engine.getReturn('EFA', 252);
        const bil = this.engine.getReturn('BIL', 252);
        const selected = this.selectedTickers(data).join(', ') || '없음';
        const riskOn = spy !== null && bil !== null && spy > bil;
        return {
            summary: `SPY 12개월 수익률 ${this.fmtPct(spy)}와 BIL ${this.fmtPct(bil)}를 비교해 ${riskOn ? '위험자산 구간' : '채권 방어 구간'}으로 판단했고, 최종적으로 ${selected}에 100.0% 배분했습니다.`,
            items: [
                this.decisionItem('SPY', riskOn && spy >= efa, `12개월 모멘텀 스코어는 ${this.fmtPct(spy)}입니다.`, this.allocOf(data, 'SPY') > 0 ? '선정' : '비교'),
                this.decisionItem('EFA', riskOn && efa > spy, `12개월 모멘텀 스코어는 ${this.fmtPct(efa)}입니다.`, this.allocOf(data, 'EFA') > 0 ? '선정' : '비교'),
                this.decisionItem('BIL', false, `현금성 기준자산의 12개월 모멘텀 스코어는 ${this.fmtPct(bil)}입니다.`, '기준'),
                this.decisionItem('AGG', this.allocOf(data, 'AGG') > 0, `${riskOn ? 'SPY가 BIL보다 높아 AGG는 선택하지 않았습니다.' : 'SPY가 BIL보다 높지 않아 AGG를 선택했습니다.'}`, this.allocOf(data, 'AGG') > 0 ? '선정' : '제외')
            ]
        };
    }

    explainCDM(data) {
        const groups = [['SPY', 'EFA'], ['LQD', 'HYG'], ['VNQ', 'REM'], ['TLT', 'GLD']];
        const bil = this.engine.getReturn('BIL', 252);
        const items = groups.map(group => {
            const ranked = this.engine.sortByScoreDesc(this.scoreItems(group, ticker => this.engine.getReturn(ticker, 252)));
            const best = ranked[0];
            const selected = best && best.score > bil ? best.ticker : 'BIL';
            return this.decisionItem(
                group.join('/'),
                selected !== 'BIL',
                `${group.map(t => `${t} ${this.fmtPct(this.engine.getReturn(t, 252))}`).join(', ')}이고 BIL은 ${this.fmtPct(bil)}입니다. 그래서 ${selected}에 25.0%를 배정했습니다.`,
                selected
            );
        });
        return {
            summary: '각 자산군 쌍에서 12개월 모멘텀이 가장 높은 자산을 고르고, 그 값이 BIL보다 낮으면 BIL로 방어 배분했습니다.',
            items
        };
    }

    explainADM(data) {
        const stocks = this.engine.sortByScoreDesc(this.scoreItems(['SPY', 'SCZ'], ticker => this.engine.getMomentumScore(ticker, [21, 63, 126])));
        const bonds = this.engine.sortByScoreDesc(this.scoreItems(['TLT', 'TIP'], ticker => this.engine.getMomentumScore(ticker, [21, 63, 126])));
        const bestStock = stocks[0];
        const selected = this.selectedTickers(data).join(', ') || '없음';
        return {
            summary: `주식 후보의 1/3/6개월 평균 모멘텀을 먼저 확인했습니다. 최고 주식 점수가 ${this.fmtPct(bestStock?.score)}라서 최종적으로 ${selected}에 100.0% 배분했습니다.`,
            items: [
                ...stocks.map(x => this.decisionItem(x.ticker, this.allocOf(data, x.ticker) > 0, `1/3/6개월 평균 모멘텀은 ${this.fmtPct(x.score)}입니다.`, this.allocOf(data, x.ticker) > 0 ? '선정' : '주식 후보')),
                ...bonds.map(x => this.decisionItem(x.ticker, this.allocOf(data, x.ticker) > 0, `주식 최고 점수가 양수가 아닐 때 사용할 채권 후보이며 모멘텀은 ${this.fmtPct(x.score)}입니다.`, this.allocOf(data, x.ticker) > 0 ? '선정' : '채권 후보'))
            ]
        };
    }

    explainDynamicBond(data) {
        const bonds = ['SHY', 'IEF', 'TLT', 'TIP', 'LQD', 'HYG', 'BWX', 'EMB'];
        const scored = this.engine.sortByScoreDesc(this.scoreItems(bonds, ticker => this.engine.getReturn(ticker, 126)));
        const top3 = scored.slice(0, 3);
        return {
            summary: '채권 ETF의 6개월 수익률을 비교해 상위 3개를 고르고, 수익률이 양수인 경우에만 33.3%씩 배분했습니다.',
            items: [
                ...top3.map(x => this.decisionItem(x.ticker, this.allocOf(data, x.ticker) > 0, `6개월 수익률은 ${this.fmtPct(x.score)}, 최종 배분은 ${this.fmtAlloc(this.allocOf(data, x.ticker))}입니다.`, this.allocOf(data, x.ticker) > 0 ? '선정' : '현금 전환')),
                this.decisionItem('USD', this.allocOf(data, 'USD') > 0, `상위 3개 중 음수 모멘텀 몫은 ${this.fmtAlloc(this.allocOf(data, 'USD'))}만큼 현금으로 이동했습니다.`, this.allocOf(data, 'USD') > 0 ? '보유' : '없음')
            ]
        };
    }

    explainDGA(data) {
        const offensive = this.engine.sortByScoreDesc(this.scoreItems(['QQQ', 'SCHD'], ticker => this.engine.getMomentumScore(ticker, [21, 63, 126, 189, 252])));
        const defensive = this.engine.sortByScoreDesc(this.scoreItems(['BIL', 'TLT', 'PDBC'], ticker => this.engine.getSmaMomentum(ticker, 126)));
        const tipScore = this.engine.getSmaMomentum('TIP', 252);
        const dividendYield = this.engine.economic?.sp500_dividend_yield?.value;
        const yieldSpread = this.engine.economic?.t10y3m_spread?.value;
        const riskSignals = [
            { name: 'TIP 12개월 평균', active: tipScore !== null && tipScore < 0, text: `TIP 12개월 평균 대비 모멘텀은 ${this.fmtPct(tipScore)}입니다.` },
            { name: 'S&P500 배당수익률', active: typeof dividendYield === 'number' && dividendYield < 1.6, text: `S&P500 배당수익률은 ${this.fmtPlain(dividendYield)}%이고 기준은 1.6%입니다.` },
            { name: '10년-3개월 금리차', active: typeof yieldSpread === 'number' && yieldSpread < -0.5, text: `10년-3개월 금리차는 ${this.fmtPlain(yieldSpread)}%p이고 기준은 -0.5%p입니다.` }
        ];
        const riskOff = riskSignals.some(x => x.active);
        const selected = this.selectedTickers(data).join(', ') || '없음';
        return {
            summary: `${riskOff ? '위험회피 조건이 충족되어 방어자산' : '위험회피 조건이 충족되지 않아 공격자산'} 중 ${selected}에 100.0% 배분했습니다.`,
            items: [
                ...riskSignals.map(x => this.decisionItem(x.name, x.active, x.text, x.active ? '위험 신호' : '통과')),
                ...(riskOff ? defensive : offensive).map(x => this.decisionItem(
                    x.ticker,
                    this.allocOf(data, x.ticker) > 0,
                    `${riskOff ? '6개월 평균가격 대비 점수' : '1/3/6/9/12개월 평균 모멘텀'}은 ${this.fmtPct(x.score)}이고 최종 배분은 ${this.fmtAlloc(this.allocOf(data, x.ticker))}입니다.`,
                    this.allocOf(data, x.ticker) > 0 ? '선정' : '후보'
                ))
            ]
        };
    }

    explainKoreaEtf(data) {
        const selected = this.selectedRows(data);
        return {
            summary: `한국 ETF 정적배분은 시장 신호로 종목을 고르지 않고, 투자성향별 목표 비중대로 ${selected.map(row => row.displayName || row.ticker).join(', ')}에 고정 배분합니다.`,
            items: data.map(row => this.decisionItem(
                row.displayName || row.ticker,
                row.allocation > 0,
                `${row.sector} 자산에 ${this.fmtAlloc(row.allocation)} 고정 배분입니다.`,
                row.allocation > 0 ? '선정' : '제외',
                row.ticker
            ))
        };
    }

    explainGeneric(data) {
        const selected = this.selectedRows(data);
        return {
            summary: `현재 계산 결과 기준으로 ${selected.map(row => row.ticker).join(', ') || '선정 자산 없음'}에 배분했습니다.`,
            items: data.map(row => this.decisionItem(row.ticker, row.allocation > 0, `최종 배분비중은 ${this.fmtAlloc(row.allocation)}입니다.`, row.allocation > 0 ? '선정' : '제외'))
        };
    }

    decisionItem(title, selected, body, badge, ticker = null) {
        return { title, selected: Boolean(selected), body, badge, ticker };
    }

    appendTextWithTickerButtons(target, text) {
        const source = String(text || '');
        const tickerPattern = /\b[A-Z]{2,5}\b/g;
        let lastIndex = 0;
        let match;

        while ((match = tickerPattern.exec(source)) !== null) {
            const ticker = match[0];
            if (!this.hasPriceSeries(ticker)) continue;

            if (match.index > lastIndex) {
                target.appendChild(document.createTextNode(source.slice(lastIndex, match.index)));
            }

            target.appendChild(this.createTickerButton(ticker, ticker));
            lastIndex = match.index + ticker.length;
        }

        if (lastIndex < source.length) {
            target.appendChild(document.createTextNode(source.slice(lastIndex)));
        }
    }

    createTickerButton(label, ticker) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'decision-ticker-button';
        button.textContent = label;
        button.title = label + ' 1년 가격 추이 보기';
        button.addEventListener('click', () => this.renderPriceChart(ticker));
        return button;
    }

    scoreItems(tickers, scoreFn) {
        return tickers.map(ticker => ({
            ticker,
            score: scoreFn(ticker)
        })).filter(x => x.score !== null && x.score !== undefined && !Number.isNaN(x.score));
    }

    sortedScores(tickers, scoreFn) {
        return this.engine.sortByScoreDesc(this.scoreItems(tickers, scoreFn));
    }

    selectedRows(data) {
        return data.filter(row => row.allocation > 0);
    }

    selectedTickers(data) {
        return this.selectedRows(data).map(row => row.ticker);
    }

    allocOf(data, ticker) {
        return data.find(row => row.ticker === ticker)?.allocation || 0;
    }

    fmtAlloc(value) {
        return this.fmtPct(value || 0);
    }

    fmtPct(value) {
        if (value === null || value === undefined || Number.isNaN(value)) return '-';
        return (value * 100).toFixed(1) + '%';
    }

    fmtPlain(value) {
        if (value === null || value === undefined || Number.isNaN(value)) return '-';
        return Number(value).toFixed(1);
    }

    fmtPrice(value) {
        if (value === null || value === undefined || Number.isNaN(value)) return '-';
        return Number(value).toFixed(1);
    }

    preparePriceChart(data) {
        const panel = this.ensureChartPanel();
        const defaultTicker = data.find(row => row.ticker !== 'USD' && this.hasPriceSeries(row.ticker))?.ticker;
        if (!defaultTicker) {
            panel.style.display = 'none';
            return;
        }

        panel.style.display = '';
        this.renderPriceChart(this.chart.ticker && this.hasPriceSeries(this.chart.ticker) ? this.chart.ticker : defaultTicker);
    }

    ensureChartPanel() {
        let panel = document.querySelector('.price-chart-panel');
        if (panel) return panel;

        const tableSection = document.querySelector('.table-section');
        panel = document.createElement('div');
        panel.className = 'price-chart-panel';
        panel.innerHTML = [
            '<div class="price-chart-header">',
            '  <div>',
            '    <div class="price-chart-title">1년 가격 추이</div>',
            '    <div class="price-chart-subtitle">표의 티커를 클릭하면 그래프가 바뀝니다.</div>',
            '  </div>',
            '  <div class="price-chart-meta"></div>',
            '</div>',
            '<div class="price-chart-canvas" role="img" aria-label="1년 가격 그래프"></div>'
        ].join('');
        tableSection.appendChild(panel);
        return panel;
    }

    hasPriceSeries(ticker) {
        const series = this.engine.prices?.[ticker];
        return Array.isArray(series) && series.length > 1;
    }

    renderPriceChart(ticker) {
        if (!this.hasPriceSeries(ticker)) return;

        this.chart.ticker = ticker;
        const panel = this.ensureChartPanel();
        const canvas = panel.querySelector('.price-chart-canvas');
        const meta = panel.querySelector('.price-chart-meta');
        const series = this.engine.prices[ticker].slice(-252);
        const min = Math.min(...series);
        const max = Math.max(...series);
        const first = series[0];
        const last = series[series.length - 1];
        const change = first ? (last - first) / first : 0;
        const width = 920;
        const height = 320;
        const pad = { top: 24, right: 34, bottom: 36, left: 58 };
        const innerW = width - pad.left - pad.right;
        const innerH = height - pad.top - pad.bottom;
        const range = max - min || 1;

        const points = series.map((price, idx) => {
            const x = pad.left + (idx / Math.max(1, series.length - 1)) * innerW;
            const y = pad.top + (1 - (price - min) / range) * innerH;
            return { x, y, price, idx };
        });

        const line = points.map(p => p.x.toFixed(2) + ',' + p.y.toFixed(2)).join(' ');
        const area = [pad.left + ',' + (height - pad.bottom), line, (width - pad.right) + ',' + (height - pad.bottom)].join(' ');
        const stroke = change >= 0 ? '#059669' : '#dc2626';
        const fill = change >= 0 ? 'rgba(5,150,105,0.12)' : 'rgba(220,38,38,0.12)';
        const dateRange = this.engine.prices?.meta?.dateRange;
        const rangeText = dateRange ? dateRange.from + ' ~ ' + dateRange.to : '최근 ' + series.length + '거래일';

        const currency = this.getCurrency(ticker);
        meta.innerHTML = '<strong>' + ticker + '</strong> <span>' + last.toFixed(2) + ' ' + currency + '</span> <span class="' +
            (change >= 0 ? 'chart-up' : 'chart-down') + '">' + (change >= 0 ? '+' : '') + (change * 100).toFixed(2) + '%</span>';

        const grid = [];
        for (let i = 0; i <= 4; i++) {
            const y = pad.top + (i / 4) * innerH;
            const value = max - (i / 4) * range;
            grid.push('<line class="chart-grid" x1="' + pad.left + '" y1="' + y + '" x2="' + (width - pad.right) + '" y2="' + y + '"></line>');
            grid.push('<text class="chart-axis" x="' + (pad.left - 10) + '" y="' + (y + 4) + '" text-anchor="end">' + value.toFixed(1) + '</text>');
        }

        canvas.innerHTML = [
            '<svg class="price-chart-svg" viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none">',
            grid.join(''),
            '<text class="chart-axis" x="' + pad.left + '" y="' + (height - 10) + '">' + rangeText + '</text>',
            '<polygon points="' + area + '" fill="' + fill + '"></polygon>',
            '<polyline points="' + line + '" fill="none" stroke="' + stroke + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>',
            '<circle class="chart-end-dot" cx="' + points[points.length - 1].x + '" cy="' + points[points.length - 1].y + '" r="5" fill="' + stroke + '"></circle>',
            '<line class="chart-hover-line" x1="0" y1="' + pad.top + '" x2="0" y2="' + (height - pad.bottom) + '"></line>',
            '<circle class="chart-hover-dot" cx="0" cy="0" r="5"></circle>',
            '</svg>',
            '<div class="chart-tooltip"></div>'
        ].join('');

        const svg = canvas.querySelector('svg');
        const hoverLine = canvas.querySelector('.chart-hover-line');
        const hoverDot = canvas.querySelector('.chart-hover-dot');
        const tooltip = canvas.querySelector('.chart-tooltip');

        const showPoint = event => {
            const rect = svg.getBoundingClientRect();
            const relX = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
            const idx = Math.round((relX / rect.width) * (series.length - 1));
            const point = points[Math.min(Math.max(idx, 0), points.length - 1)];
            const screenX = (point.x / width) * rect.width;
            const screenY = (point.y / height) * rect.height;

            hoverLine.setAttribute('x1', point.x);
            hoverLine.setAttribute('x2', point.x);
            hoverDot.setAttribute('cx', point.x);
            hoverDot.setAttribute('cy', point.y);
            hoverLine.style.opacity = '1';
            hoverDot.style.opacity = '1';

            tooltip.style.opacity = '1';
            tooltip.style.left = Math.min(Math.max(screenX, 72), rect.width - 72) + 'px';
            tooltip.style.top = Math.max(screenY - 48, 12) + 'px';
            tooltip.innerHTML = '<strong>' + ticker + '</strong><span>' + point.price.toFixed(2) + ' ' + currency + '</span><small>' + (point.idx + 1) + ' / ' + series.length + ' 거래일</small>';
        };

        canvas.onmousemove = showPoint;
        canvas.onmouseleave = () => {
            hoverLine.style.opacity = '0';
            hoverDot.style.opacity = '0';
            tooltip.style.opacity = '0';
        };
    }

    bindCalculation() {
        const budgetInput = document.getElementById('totalBudget');
        const feeInput = document.getElementById('buysellfee');
        if (!budgetInput) return;

        if (!this.calculateFn) {
            this.calculateFn = () => {
                this.formatBudgetInput(budgetInput);
                const budget = parseFloat(budgetInput.value.replace(/,/g, '')) || 0;
                const fee = parseFloat(feeInput?.value) || 0;
                const stocks = document.getElementsByClassName('cell-stocks');
                const prices = document.getElementsByClassName('cell-price');
                const allocs = document.getElementsByClassName('cell-allocation');
                const tickers = document.getElementsByClassName('ticker-button');

                for (let i = 0; i < stocks.length; i++) {
                    const ticker = tickers[i]?.dataset.ticker || tickers[i]?.textContent.trim();
                    const priceText = prices[i]?.textContent.trim();
                    const allocText = allocs[i]?.textContent.trim();

                    if (!ticker || ticker === 'USD' || allocText === '-' || priceText === '-') {
                        stocks[i].textContent = '-';
                        continue;
                    }

                    const price = parseFloat(priceText.replace(/,/g, ''));
                    const alloc = parseFloat(allocText.replace('%', '')) / 100;
                    if (isNaN(price) || isNaN(alloc) || price <= 0 || budget <= 0) {
                        stocks[i].textContent = '-';
                        continue;
                    }

                    const qty = Math.floor(budget * alloc / (price * (1 + fee / 100)));
                    stocks[i].textContent = qty.toLocaleString();
                }
            };
        }

        if (this.boundInputs.budget !== budgetInput) {
            if (this.boundInputs.budget && this.calculateFn) this.boundInputs.budget.removeEventListener('input', this.calculateFn);
            budgetInput.addEventListener('input', this.calculateFn);
            this.boundInputs.budget = budgetInput;
        }

        if (this.boundInputs.fee !== feeInput) {
            if (this.boundInputs.fee && this.calculateFn) this.boundInputs.fee.removeEventListener('input', this.calculateFn);
            if (feeInput) feeInput.addEventListener('input', this.calculateFn);
            this.boundInputs.fee = feeInput;
        }

        this.calculateFn();
    }

    formatBudgetInput(input) {
        if (!input) return;
        const raw = input.value.replace(/,/g, '').replace(/[^0-9.]/g, '');
        if (!raw) {
            input.value = '';
            return;
        }
        const parts = raw.split('.');
        const intPart = parts[0] || '0';
        const decimalPart = parts.length > 1 ? '.' + parts.slice(1).join('') : '';
        input.value = Number(intPart).toLocaleString() + decimalPart;
    }

    updateTimestamp() {
        const el = document.getElementById('lastUpdated');
        if (el && this.engine.prices && this.engine.prices.meta) {
            el.textContent = 'Updated: ' + (this.engine.prices.meta.lastUpdated || 'N/A');
        }
    }

    showError(tableBody, msg) {
        tableBody.innerHTML = '<tr><td colspan="6" class="error-msg">' + msg + '</td></tr>';
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Renderer;
}
