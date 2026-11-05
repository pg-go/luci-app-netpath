'use strict';
/* NetPath standalone dashboard: plain JS, no LuCI, read-only.
   Polls ./cgi-bin/api.sh every 5 s and renders device / uplink /
   WiFi stations / wired hosts. Rates are byte-counter deltas, with
   luci.client-rates as a fallback where a station counter stays 0
   (QWRT vendor firmware). No write is ever sent: no POST, no alias
   edit, no LuCI page is linked or loaded. */

var POLL_MS = 5000;
var MAX_BPS = 400e9;
var prevWifi = {};
var prevDev = {};
var prevAt = 0;

function el(tag, text, cls) {
	var n = document.createElement(tag);
	if (cls) n.className = cls;
	if (text != null) n.textContent = text;
	return n;
}
function num(v) { v = +v; return isFinite(v) ? v : 0; }
function fmtRate(bps) {
	if (!(bps > 0)) return '0 bit/s';
	if (bps >= 1e9) return (bps / 1e9).toFixed(2) + ' Gbit/s';
	if (bps >= 1e6) return (bps / 1e6).toFixed(2) + ' Mbit/s';
	if (bps >= 1e3) return (bps / 1e3).toFixed(1) + ' kbit/s';
	return Math.round(bps) + ' bit/s';
}
function fmtBytes(b) {
	if (!(b > 0)) return '0 B';
	if (b >= 1e9) return (b / 1e9).toFixed(2) + ' GB';
	if (b >= 1e6) return (b / 1e6).toFixed(1) + ' MB';
	if (b >= 1e3) return (b / 1e3).toFixed(1) + ' KB';
	return Math.round(b) + ' B';
}
function fmtUptime(s) {
	s = num(s); if (!(s > 0)) return '—';
	var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
	return h > 0 ? h + ' 小时 ' + m + ' 分' : m + ' 分';
}
function normMac(v) {
	if (typeof v !== 'string') return null;
	var h = v.trim().toLowerCase();
	if (/^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/.test(h)) return h;
	if (/^[0-9a-f]{2}(-[0-9a-f]{2}){5}$/.test(h)) return h.replace(/-/g, ':');
	if (/^[0-9a-f]{12}$/.test(h)) return h.replace(/(..)(?=..)/g, '$1:');
	return null;
}
function counterRate(prev, cur, at) {
	if (!prev || !cur) return null;
	var dt = (at - prev.at) / 1000;
	if (!(dt >= 1)) return null;
	var rx = (num(cur.rx) - num(prev.rx)) * 8 / dt;
	var tx = (num(cur.tx) - num(prev.tx)) * 8 / dt;
	if (!(rx >= 0 && tx >= 0 && rx <= MAX_BPS && tx <= MAX_BPS)) return null;
	return { rx: rx, tx: tx };
}
function collectAliases(node, out) {
	if (!node || typeof node !== 'object') return;
	if (typeof node.mac === 'string' && typeof node.name === 'string') {
		var m = normMac(node.mac);
		if (m) out[m] = node.name;
	}
	Object.keys(node).forEach(function (k) { collectAliases(node[k], out); });
}
function clientName(mac, hints, aliases) {
	if (aliases[mac]) return aliases[mac];
	var h = hints[mac.toUpperCase()] || hints[mac] || {};
	if (typeof h.hostname === 'string' && h.hostname) return h.hostname;
	if (typeof h.name === 'string' && h.name) return h.name;
	return mac;
}
function renderTable(body, headers, rows) {
	body.textContent = '';
	if (!rows.length) { body.appendChild(el('p', '暂无数据', 'mut')); return; }
	var t = el('table'), tr = el('tr');
	headers.forEach(function (h) { tr.appendChild(el('th', h)); });
	t.appendChild(tr);
	rows.forEach(function (r) {
		var row = el('tr');
		r.forEach(function (c) { row.appendChild(el('td', c)); });
		t.appendChild(row);
	});
	body.appendChild(t);
}

function render(data) {
	var now = Date.now();
	var board = data.board || {}, info = data.info || {};
	var deviceEl = document.getElementById('device');
	deviceEl.textContent = (board.model || board.board_name || 'OpenWrt 设备') +
		(board.hostname ? ' · ' + board.hostname : '');
	document.getElementById('updated').textContent = '更新于 ' + new Date().toLocaleTimeString();

	/* device */
	var hb = document.getElementById('health-body');
	hb.textContent = '';
	var mem = info.memory || {};
	var memLine = mem.total ? '内存：已用 ' + fmtBytes(num(mem.total) - num(mem.available)) + ' / ' + fmtBytes(num(mem.total)) : '内存：—';
	var temps = (data.thermal && data.thermal.zones) || [];
	var hot = null;
	temps.forEach(function (z) { var c = num(z.temp) / 1000; if (c >= -40 && c <= 150 && (hot == null || c > hot)) hot = c; });
	hb.appendChild(el('p', '固件：' + ((board.release && board.release.description) || '—')));
	hb.appendChild(el('p', '运行时间：' + fmtUptime(info.uptime) + ' · 负载：' + (Array.isArray(info.load) ? info.load.map(function (v) { return num(v).toFixed(2); }).join(' / ') : '—')));
	hb.appendChild(el('p', memLine + (hot != null ? ' · 温度最高：' + hot.toFixed(1) + ' °C' : '')));

	/* uplink: first interface with a default route, else wan, else first up */
	var ifaces = (data.interfaces && Array.isArray(data.interfaces.interface)) ? data.interfaces.interface : [];
	var up = ifaces.filter(function (i) { return i && i.up && i.interface !== 'loopback'; });
	function defRoute(i) {
		return (i.route || []).filter(function (r) { return r && +r.mask === 0 && (r.target === '0.0.0.0' || r.target === '::'); })[0] || null;
	}
	var pick = up.filter(function (i) { return defRoute(i); })[0] ||
		up.filter(function (i) { return /^wan/.test(i.interface); })[0] || up[0] || null;
	var ub = document.getElementById('uplink-body');
	ub.textContent = '';
	if (!pick) { ub.appendChild(el('p', '暂无上行', 'mut')); }
	else {
		var devName = pick.l3_device || pick.device || '';
		var stats = (data.devices && data.devices[devName] && data.devices[devName].statistics) || null;
		var rate = null;
		if (stats) {
			var cur = { at: now, rx: num(stats.rx_bytes), tx: num(stats.tx_bytes) };
			rate = counterRate(prevDev[devName], cur, now);
			prevDev[devName] = cur;
		}
		var gw = defRoute(pick);
		ub.appendChild(el('p', '接口：' + pick.interface + '（' + (pick.proto || '—') + '）· 设备：' + (devName || '—')));
		ub.appendChild(el('p', 'IPv4：' + ((pick['ipv4-address'] || []).map(function (a) { return a.address + '/' + a.mask; }).join(', ') || '—')));
		ub.appendChild(el('p', '网关：' + ((gw && gw.nexthop) || '—') + ' · 速率：' + (rate ? '↓ ' + fmtRate(rate.rx) + ' · ↑ ' + fmtRate(rate.tx) : '测量中…')));
	}

	/* wifi */
	var hints = data.hints || {};
	var aliases = {};
	collectAliases(data.aliases, aliases);
	var rates = {};
	if (data.clientRates && data.clientRates.rates) {
		Object.keys(data.clientRates.rates).forEach(function (ip) {
			var r = data.clientRates.rates[ip] || {};
			var m = normMac(r.mac);
			if (!m || r.ready !== true) return;
			rates[m] = rates[m] || { rx: 0, tx: 0 };
			rates[m].rx += num(r.upload) * 8;
			rates[m].tx += num(r.download) * 8;
		});
	}
	var wb = document.getElementById('wifi-body');
	wb.textContent = '';
	var wireless = data.wireless || {};
	var anyWifi = false;
	Object.keys(wireless).sort().forEach(function (rname) {
		var r = wireless[rname] || {};
		var cfg = r.config || {};
		wb.appendChild(el('h3', rname + ' · ' + (cfg.band || '') + ' · 信道 ' + (cfg.channel || '—') + ' · ' + (cfg.htmode || '')));
		(r.interfaces || []).forEach(function (iface) {
			var ifname = iface.ifname;
			if (!ifname) return;
			anyWifi = true;
			var ssid = (iface.config && iface.config.ssid) || '';
			wb.appendChild(el('p', 'SSID：' + (ssid || '—') + '（' + ifname + '）', 'mut'));
			var stations = (data.assoc && data.assoc[ifname] && data.assoc[ifname].results) || [];
			var rows = stations.map(function (s) {
				var mac = normMac(s.mac) || '';
				var cur = { at: now, rx: num(s.rx && s.rx.bytes), tx: num(s.tx && s.tx.bytes) };
				var rate = counterRate(prevWifi[mac], cur, now);
				prevWifi[mac] = cur;
				if ((!rate || (rate.rx === 0 && rate.tx === 0)) && rates[mac]) rate = rates[mac];
				return [
					clientName(mac, hints, aliases),
					mac,
					(typeof s.signal === 'number' ? s.signal + ' dBm' : '—'),
					rate ? '↓ ' + fmtRate(rate.rx) + ' · ↑ ' + fmtRate(rate.tx) : '测量中…',
					'累计 ↓ ' + fmtBytes(cur.rx) + ' · ↑ ' + fmtBytes(cur.tx)
				];
			});
			renderTable(wb, ['设备', 'MAC', '信号', '速率', '累计流量'], rows);
		});
	});
	if (!anyWifi) wb.appendChild(el('p', '暂无 WiFi', 'mut'));

	/* wired */
	var wiredHosts = (data.wired && Array.isArray(data.wired.hosts)) ? data.wired.hosts : [];
	var perPort = {};
	wiredHosts.forEach(function (h) { perPort[h.port] = (perPort[h.port] || 0) + 1; });
	var rows = wiredHosts.map(function (h) {
		var mac = normMac(h.mac) || '';
		var shared = (perPort[h.port] || 0) > 1;
		var rate = null;
		if (!shared && data.devices && data.devices[h.port] && data.devices[h.port].statistics) {
			var st = data.devices[h.port].statistics;
			var cur = { at: now, rx: num(st.rx_bytes), tx: num(st.tx_bytes) };
			rate = counterRate(prevDev['wired:' + h.port], cur, now);
			prevDev['wired:' + h.port] = cur;
		}
		return [
			clientName(mac, hints, aliases),
			mac,
			h.port + (h.vlan != null ? '.' + h.vlan : '') + (shared ? '（共用口）' : ''),
			rate ? '↓ ' + fmtRate(rate.rx) + ' · ↑ ' + fmtRate(rate.tx) : (shared ? '共用口不按设备统计' : '测量中…'),
			(h.seen != null ? h.seen + ' 秒前活跃' : '—')
		];
	});
	renderTable(document.getElementById('wired-body'), ['设备', 'MAC', '端口', '速率', '最后活跃'], rows);

	prevAt = now;
}

function poll() {
	fetch('cgi-bin/api.sh', { cache: 'no-store' }).then(function (r) {
		if (!r.ok) throw new Error('http ' + r.status);
		return r.json();
	}).then(function (data) { render(data || {}); }).catch(function () {
		document.getElementById('health-body').textContent = '取不到数据：请确认已装 1.0.16 且 uhttpd.netpath 在跑（见 docs/STANDALONE.md）。';
	});
}

poll();
setInterval(poll, POLL_MS);
