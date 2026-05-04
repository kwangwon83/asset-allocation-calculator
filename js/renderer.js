/**
 * Renderer - renders allocation tables and handles budget calculations
 * Replaces GShRead.js / GShReadAuto.js spreadsheet dependency
 */
class Renderer {
    constructor(engine) {
        this.engine = engine;
        this.budgetInput = document.getElementById('totalBudget');
        this.feeInput = document.getElementById('buysellfee');
        this.tableBody = document.querySelector('.contentTable');
        this.tableHead = document.querySelector('.titleTable');
        this.footnote = document.querySelector('.table-footnote');
    }

    async render(strategy) {
        const data = this.engine.calculate(strategy);
        if (!data || data.length === 0) {
            this.showError('계산 데이터를 불러올 수 없습니다.');
            return;
        }

        // Clear tables
        if (this.tableHead) this.tableHead.innerHTML = '';
        if (this.tableBody) this.tableBody.innerHTML = '';
        if (this.footnote) this.footnote.innerHTML = '';

        // Render header
        this.renderHeader(strategy);

        // Render rows
        let prevCategory = '';
        data.forEach((row, idx) => {
            const isEven = idx % 2 === 0;
            const tr = document.createElement('tr');
            if (isEven) tr.id = 'even';

            // Category (merge same categories)
            const tdCat = document.createElement('td');
            tdCat.className = 'category';
            if (row.category && row.category !== prevCategory && row.category !== 'None') {
                tdCat.textContent = row.category;
                prevCategory = row.category;
            }
            tr.appendChild(tdCat);

            // Sector
            const tdSec = document.createElement('td');
            tdSec.className = 'sector';
            tdSec.textContent = row.sector || '-';
            tr.appendChild(tdSec);

            // Ticker
            const tdTick = document.createElement('td');
            tdTick.className = 'ticker';
            tdTick.textContent = row.ticker;
            tr.appendChild(tdTick);

            // Price
            const tdPrice = document.createElement('td');
            tdPrice.className = 'price';
            tdPrice.textContent = row.price ? row.price.toFixed(1) : '-';
            tr.appendChild(tdPrice);

            // Allocation
            const tdAlloc = document.createElement('td');
            tdAlloc.className = 'allocation';
            const pct = (row.allocation * 100).toFixed(1);
            tdAlloc.textContent = row.allocation > 0 ? pct + '%' : '-';
            tr.appendChild(tdAlloc);

            // Stocks (calculated on input)
            const tdStocks = document.createElement('td');
            tdStocks.className = 'stocks';
            tdStocks.textContent = '0';
            tr.appendChild(tdStocks);

            this.tableBody.appendChild(tr);

            // Remark footnote
            if (row.remark && this.footnote) {
                const div = document.createElement('div');
                div.className = 'remark';
                div.textContent = row.remark;
                this.footnote.appendChild(div);
            }
        });

        // Bind budget calculation
        this.bindCalculation();

        // Update last updated info
        this.updateTimestamp();
    }

    renderHeader(strategy) {
        if (!this.tableHead) return;
        const headers = ['구분', '투자섹터', '티커', '주가(USD)', '배분비중(%)', '배분수량(주)'];
        const tr = document.createElement('tr');
        headers.forEach(h => {
            const th = document.createElement('th');
            th.innerHTML = h;
            tr.appendChild(th);
        });
        this.tableHead.appendChild(tr);
    }

    bindCalculation() {
        const budgetInput = document.getElementById('totalBudget');
        const feeInput = document.getElementById('buysellfee');
        if (!budgetInput) return;

        const calculate = () => {
            const budget = parseFloat(budgetInput.value) || 0;
            const fee = parseFloat(feeInput?.value) || 0;
            if (budget <= 0) return;

            const tickers = document.getElementsByClassName('ticker');
            const prices = document.getElementsByClassName('price');
            const allocs = document.getElementsByClassName('allocation');
            const stocks = document.getElementsByClassName('stocks');

            for (let i = 0; i < tickers.length; i++) {
                const ticker = tickers[i].textContent.trim();
                const priceText = prices[i].textContent.trim();
                const allocText = allocs[i].textContent.trim();

                if (ticker === 'USD' || allocText === '-' || priceText === '-') {
                    stocks[i].textContent = ticker === 'USD' ? '-' : '0';
                    continue;
                }

                const price = parseFloat(priceText);
                const alloc = parseFloat(allocText.replace('%', '')) / 100;

                if (isNaN(price) || isNaN(alloc) || price <= 0) {
                    stocks[i].textContent = '-';
                    continue;
                }

                const amount = budget * alloc;
                const qty = Math.floor(amount / (price * (1 + fee / 100)));
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

    showError(msg) {
        if (this.tableBody) {
            this.tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:red;padding:20px;">${msg}</td></tr>`;
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Renderer;
}
