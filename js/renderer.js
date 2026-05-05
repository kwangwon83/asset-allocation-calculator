/**
 * Renderer - renders allocation tables, budget calculations, and price charts.
 */
class Renderer {
    constructor(engine) {
        this.engine = engine;
        this.calculateFn = null;
        this.boundInputs = { budget: null, fee: null };
        this.chart = { ticker: null };
    }

    async render(strategy) {
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

        this.renderHeader(tableHead);
        this.renderRows(tableBody, footnote, data);
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

    renderHeader(tableHead) {
        if (!tableHead) return;
        const headers = ['구분', '자산/섹터', '티커', '주가(USD)', '배분비중(%)', '배분수량(주)'];
        const tr = document.createElement('tr');
        headers.forEach(h => {
            const th = document.createElement('th');
            th.textContent = h;
            tr.appendChild(th);
        });
        tableHead.appendChild(tr);
    }

    renderRows(tableBody, footnote, data) {
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
            tickerButton.textContent = row.ticker;
            tickerButton.title = row.ticker + ' 1년 가격 그래프 보기';
            tickerButton.addEventListener('click', () => this.renderPriceChart(row.ticker));
            tdTick.appendChild(tickerButton);
            tr.appendChild(tdTick);

            const tdPrice = document.createElement('td');
            tdPrice.className = 'cell-price';
            tdPrice.textContent = row.price ? row.price.toFixed(1) : '-';
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

            if (row.remark && footnote) {
                const div = document.createElement('div');
                div.className = 'remark';
                div.textContent = row.remark;
                footnote.appendChild(div);
            }
        });
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

        meta.innerHTML = '<strong>' + ticker + '</strong> <span>' + last.toFixed(2) + ' USD</span> <span class="' +
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
            tooltip.innerHTML = '<strong>' + ticker + '</strong><span>' + point.price.toFixed(2) + ' USD</span><small>' + (point.idx + 1) + ' / ' + series.length + ' 거래일</small>';
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
                const budget = parseFloat(budgetInput.value.replace(/,/g, '')) || 0;
                const fee = parseFloat(feeInput?.value) || 0;
                const stocks = document.getElementsByClassName('cell-stocks');
                const prices = document.getElementsByClassName('cell-price');
                const allocs = document.getElementsByClassName('cell-allocation');
                const tickers = document.getElementsByClassName('ticker-button');

                for (let i = 0; i < stocks.length; i++) {
                    const ticker = tickers[i]?.textContent.trim();
                    const priceText = prices[i]?.textContent.trim();
                    const allocText = allocs[i]?.textContent.trim();

                    if (!ticker || ticker === 'USD' || allocText === '-' || priceText === '-') {
                        stocks[i].textContent = '-';
                        continue;
                    }

                    const price = parseFloat(priceText);
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
