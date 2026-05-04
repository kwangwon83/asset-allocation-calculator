/**
 * Renderer - renders allocation tables and handles budget calculations
 */
class Renderer {
    constructor(engine) {
        this.engine = engine;
    }

    async render(strategy) {
        // Get DOM refs fresh each render (DOM may not be ready at construct time)
        const tableBody = document.querySelector('.contentTable');
        const tableHead = document.querySelector('.titleTable');
        const footnote = document.querySelector('.table-footnote');

        if (!tableBody) {
            console.error('[Renderer] .contentTable not found');
            return;
        }

        // Clear
        tableHead.innerHTML = '';
        tableBody.innerHTML = '';
        if (footnote) footnote.innerHTML = '';

        // Calculate
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

        // Header
        this.renderHeader(tableHead);

        // Rows
        let prevCategory = '';
        data.forEach((row, idx) => {
            const tr = document.createElement('tr');
            if (idx % 2 === 0) tr.className = 'even';

            // Category
            const tdCat = document.createElement('td');
            tdCat.className = 'cell-category';
            if (row.category && row.category !== prevCategory) {
                tdCat.textContent = row.category;
                prevCategory = row.category;
            }
            tr.appendChild(tdCat);

            // Sector
            const tdSec = document.createElement('td');
            tdSec.className = 'cell-sector';
            tdSec.textContent = row.sector || '-';
            tr.appendChild(tdSec);

            // Ticker
            const tdTick = document.createElement('td');
            tdTick.className = 'cell-ticker';
            tdTick.textContent = row.ticker;
            tr.appendChild(tdTick);

            // Price
            const tdPrice = document.createElement('td');
            tdPrice.className = 'cell-price';
            tdPrice.textContent = row.price ? row.price.toFixed(1) : '-';
            tr.appendChild(tdPrice);

            // Allocation
            const tdAlloc = document.createElement('td');
            tdAlloc.className = 'cell-allocation';
            const pct = (row.allocation * 100).toFixed(1);
            tdAlloc.textContent = row.allocation > 0 ? pct + '%' : '-';
            tr.appendChild(tdAlloc);

            // Stocks
            const tdStocks = document.createElement('td');
            tdStocks.className = 'cell-stocks';
            tdStocks.textContent = '-';
            tr.appendChild(tdStocks);

            tableBody.appendChild(tr);

            // Footnote
            if (row.remark && footnote) {
                const div = document.createElement('div');
                div.className = 'remark';
                div.textContent = row.remark;
                footnote.appendChild(div);
            }
        });

        // Budget calc
        this.bindCalculation();
        this.updateTimestamp();
    }

    renderHeader(tableHead) {
        if (!tableHead) return;
        const headers = ['구분', '투자섹터', '티커', '주가(USD)', '배분비중(%)', '배분수량(주)'];
        const tr = document.createElement('tr');
        headers.forEach(h => {
            const th = document.createElement('th');
            th.textContent = h;
            tr.appendChild(th);
        });
        tableHead.appendChild(tr);
    }

    bindCalculation() {
        const budgetInput = document.getElementById('totalBudget');
        const feeInput = document.getElementById('buysellfee');
        if (!budgetInput) return;

        const calculate = () => {
            const budget = parseFloat(budgetInput.value.replace(/,/g, '')) || 0;
            const fee = parseFloat(feeInput?.value) || 0;

            const stocks = document.getElementsByClassName('cell-stocks');
            const prices = document.getElementsByClassName('cell-price');
            const allocs = document.getElementsByClassName('cell-allocation');
            const tickers = document.getElementsByClassName('cell-ticker');

            for (let i = 0; i < stocks.length; i++) {
                const ticker = tickers[i]?.textContent.trim();
                const priceText = prices[i]?.textContent.trim();
                const allocText = allocs[i]?.textContent.trim();

                if (!ticker || ticker === 'USD' || allocText === '-' || priceText === '-') {
                    stocks[i].textContent = '-'
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

        budgetInput.addEventListener('input', calculate);
        if (feeInput) feeInput.addEventListener('input', calculate);
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
