var allotype = document.getElementById('hidden-footer');
if (allotype.innerText == 'INDEX') {
	window.addEventListener('DOMContentLoaded', index);
} else {
	window.addEventListener('DOMContentLoaded', main);
}

async function main() {
	var allotype = document.getElementById('hidden-footer');
	allotype = allotype.innerText;
	const SOURCE =
		'https://sheets.googleapis.com/v4/spreadsheets/1EgZIN-4haNamkKY82lx15CQ1U9yzpyT7dmhx4hxu-bU/values/' + allotype + '!A1:J30?key=AIzaSyByDPPts30eSfIvDBheddnKhuxyqqmmdw4';

	const DATA = await separateRowFromJson(SOURCE);
	console.log(DATA)
	// DATA[0]은 ClassName
	// DATA[1]은 표 타이틀
	var ramarks = '';
	for (var i = 1; i < DATA.length; i++) {
		// console.log(i)
		// console.log(DATA.length)
		var lines = '';
		// i == 1 : 표 타이틀
		if (i == 1) {
			lines += '<tr>';

			for (var k = 0; k < DATA[i].length; k++) {
				if (k == DATA[i].length - 1) {
					ramarks += '';
				} else {
					lines += '<th>' + DATA[i][k] + '</th>';
				}
			}
			lines += '<th>배분수량<br>(주)</th>';
			lines += '</tr>';
			$('.titleTable').append(lines);
		} else {
			var alloFlag = 1;
			lines += '<tr>';
			if (i % 2 == 0) {
				for (var k = 0; k < DATA[i].length; k++) {
					if (k == DATA[i].length - 1) {
						ramarks += '<div class="remark">' + DATA[i][k] + '</div>';
					} else {
						if (DATA[i][k] != 'None') {
							lines +=
								'<td id="even" class="' +
								DATA[0][k].toLowerCase() +
								'">' +
								DATA[i][k] +
								'</td>';
						} else {
							alloFlag = 0;
						}
					}
				}
				if (alloFlag == 1) {
					lines += '<td class="stocks" id="even">0</td>';
				}
			} else {
				for (var k = 0; k < DATA[i].length; k++) {
					if (k == DATA[i].length - 1) {
						ramarks += '<div class="remark">' + DATA[i][k] + '</div>';
					} else {
						if (DATA[i][k] != 'None') {
							lines +=
								'<td class="' +
								DATA[0][k].toLowerCase() +
								'">' +
								DATA[i][k] +
								'</td>';
						} else {
							alloFlag = 0;
						}
					}
				}
				if (alloFlag == 1) {
					lines += '<td class="stocks">0</td>';
				}
			}
			lines += '</tr>';
			$('.contentTable').append(lines);
		}
	}
	$('.table-footnote').append(ramarks);
	$('.loading_space').empty();
}

async function index() {
	var allotype = document.getElementById('hidden-footer');
	allotype = allotype.innerText;
	const SOURCE =
		'https://sheets.googleapis.com/v4/spreadsheets/1EgZIN-4haNamkKY82lx15CQ1U9yzpyT7dmhx4hxu-bU/values/' +
		allotype +
		'?key=AIzaSyByDPPts30eSfIvDBheddnKhuxyqqmmdw4';

	const DATA = await separateRowFromJson(SOURCE);

	// DATA[0]은 ClassName
	// DATA[1]은 표 타이틀
	for (var i = 1; i < DATA.length; i++) {
		var lines = '';
		// i == 1 : 표 타이틀
		if (i == 1) {
			lines += '<tr>';

			for (var k = 0; k < DATA[i].length; k++) {
				lines += '<th>' + DATA[i][k] + '</th>';
			}
			lines += '</tr>';
			$('.titleTable').append(lines);
		} else {
			lines += '<tr>';
			if (i % 2 == 0) {
				for (var k = 0; k < DATA[i].length; k++) {
					lines +=
						'<td id="even" class="' +
						DATA[0][k].toLowerCase() +
						'">' +
						DATA[i][k] +
						'</td>';
				}
			} else {
				for (var k = 0; k < DATA[i].length; k++) {
					lines += '<td class="' + DATA[0][k].toLowerCase() + '">' + DATA[i][k] + '</td>';
				}
			}
			lines += '</tr>';
			$('.contentTable').append(lines);
		}
	}
	$('.loading_space').empty();
}

async function separateRowFromJson(SOURCE) {
	const FETCHED_SOURCE = await fetch(SOURCE);
	let _DATA = await FETCHED_SOURCE.json();
	_DATA = _DATA.values;

	return _DATA;
}

function allocation_calc() {
	var budget = document.getElementById('totalBudget');
	var stockfee = document.getElementById('buysellfee');
	var ticker = document.getElementsByClassName('ticker');
	var price = document.getElementsByClassName('price');
	var allocation = document.getElementsByClassName('allocation');

	if (isNum(Number(budget.value))) {
		let _TICKER = [];
		let _DATA = [];
		let _PRICE = [];
		let _ALLO = [];
		for (var i = 0; i < price.length; i++) {
			if (String(ticker[i].innerHTML) == 'USD') {
				_ALLO[i] = Number(allocation[i].innerHTML.replace('%', ''));
				_ALLO[i] = _ALLO[i] / 100;
				_DATA[i] = Number(budget.value) * _ALLO[i];
				_DATA[i] = Math.floor(_DATA[i]);
			} else {
				_PRICE[i] = Number(price[i].innerHTML);
				// _ALLO[i] = Number(allocation[i].innerHTML.replace("/%/g", ""));
				_ALLO[i] = Number(allocation[i].innerHTML.replace('%', ''));
				_ALLO[i] = _ALLO[i] / 100;
				_DATA[i] =
					(Number(budget.value) * _ALLO[i]) / (_PRICE[i] * (1 + stockfee.value / 100));
				_DATA[i] = Math.floor(_DATA[i]);
			}
		}

		const TARGET = {
			stocks: document.getElementsByClassName('stocks'),
		};

		for (let i = 0; i < _DATA.length; i++) {
			if (isNaN(_DATA[i])) {
				TARGET['stocks'][i].textContent = '-';
			} else {
				TARGET['stocks'][i].textContent = _DATA[i].toLocaleString();
			}
		}
	}
}

function isNum(s) {
	s += ''; // 문자열로 변환
	s = s.replace(/^\s*|\s*$/g, ''); // 좌우 공백 제거
	if (s == '' || isNaN(s)) return false;
	return true;
}