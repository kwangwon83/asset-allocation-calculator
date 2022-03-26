window.addEventListener('DOMContentLoaded', main);

async function main() {
	const TARGET = {
		category: document.getElementsByClassName('category'),
		ticker: document.getElementsByClassName('ticker'),
		price: document.getElementsByClassName('price'),
		allocation: document.getElementsByClassName('allocation'),
		remark: document.getElementsByClassName('remark'),
	};
	
	var allotype = document.getElementById("hidden-footer")
	allotype = allotype.innerText
	console.log(allotype)
	const SOURCE =
		'https://sheets.googleapis.com/v4/spreadsheets/1EgZIN-4haNamkKY82lx15CQ1U9yzpyT7dmhx4hxu-bU/values/'+allotype+'?key=AIzaSyByDPPts30eSfIvDBheddnKhuxyqqmmdw4';
	// const COLUMNS = ['TICKER', 'PRICE', 'ALLO'];

	const DATA = await separateRowFromJson(SOURCE);
	// console.log(DATA);

	// var tc = new Array();
	// var html = '';

	// for (key in DATA) {
	// 	console.log(Object.keys(DATA[key])[0])
	// 	html += '<tr>';
	// 	html += '<td>' + DATA[key].CATEGORY + '</td>';
	// 	html += '<td>' + DATA[key].TICKER + '</td>';
	// 	html += '<td>' + DATA[key].PRICE + '</td>';
	// 	html += '<td>' + DATA[key].ALLO + '</td>';
	// 	html += '<td>' + DATA[key].REMARK + '</td>';
	// 	html += '</tr>';
	// }
	
	// console.log(DATA)
	// console.log(html)
	// document.getElementById('dynamicTbody').remove();
	// document.getElementById('dynamicTbody').innerHTML = "서광원"
	// 	elem.innerTEXT = html

	for (let i = 0; i < DATA.length; i++) {
		if (i == 0) {
			TARGET['category'][i].textContent = DATA[i][Object.keys(DATA[i])[0]];
		} else {
			if (DATA[i][Object.keys(DATA[i])[0]] != DATA[i-1][Object.keys(DATA[i-1])[0]]) {
				TARGET['category'][i].textContent = DATA[i][Object.keys(DATA[i])[0]];
			} else {
				TARGET['category'][i].textContent = ""
			}
		}
		
		TARGET['ticker'][i].textContent = DATA[i][Object.keys(DATA[i])[1]];
		TARGET['price'][i].textContent = DATA[i][Object.keys(DATA[i])[2]];
		TARGET['allocation'][i].textContent = DATA[i][Object.keys(DATA[i])[3]];
		TARGET['remark'][i].textContent = DATA[i][Object.keys(DATA[i])[4]];
		console.log(Object.keys(DATA[3])[0]);
	}
}

async function separateRowFromJson(SOURCE) {
	const FETCHED_SOURCE = await fetch(SOURCE);
	let _temp = await FETCHED_SOURCE.json();
	COLUMNS = _temp['values'].slice(0, 1);
	temp = _temp['values'].slice(1);
	// temp = temp['values']['entry'];

	// let _DATA = temp;
	let _DATA = [];
	for (var i = 0; i < Object.keys(temp).length; i++) {
		_DATA[i] = {};
		for (var k = 0; k < Object.keys(COLUMNS[0]).length; k++) {
			_DATA[i][COLUMNS[0][k]] = temp[i][k];
			// _DATA[i][COLUMNS[k]] = temp[i]['gsx$' + COLUMNS[k]]['$t'];
		}
	}
	// console.log(_DATA)
	return _DATA;
}