'use strict';
/* Standalone dashboard (port 8080, no password, dashboard only):
   the second uhttpd instance serves only /www/netpath, the API is
   GET-only and read-only, and no LuCI page is reachable on that port.
   These tests run without a device: the API is run with a mock ubus
   in PATH, and the rest is static checks on the shipped files.
   Layout, learned from the 1.0.16 SDK build failure:
   - the frontend lives in htdocs/netpath/, not root/www/netpath/:
     luci.mk runs JsMin only on the htdocs copy (before root/ is
     copied), so a root/ .js file ships unminified while the verifier
     expects jsmin output, and the build fails;
   - there is no root/etc/uci-defaults/ file: a uci-defaults file
     shipped 0644 in git fails the verifier (it must ship 0755, and
     git mode 0755 does not survive the connector push). The setup
     lives in the Makefile postinst instead, which is a package
     script and is always executable. */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const ROOT = path.join(__dirname, '..');
const WEB = path.join(ROOT, 'luci-app-netpath/htdocs/netpath');
const API = path.join(ROOT, 'luci-app-netpath/root/www/netpath/cgi-bin/api.sh');
const MAKEFILE = path.join(ROOT, 'luci-app-netpath/Makefile');

function read(p) { return fs.readFileSync(p, 'utf8'); }

test('standalone: files exist, no LuCI links, no write in the API', () => {
	for (const p of [path.join(WEB, 'index.html'), path.join(WEB, 'app.js'), path.join(WEB, 'app.css'), API])
		assert.ok(fs.existsSync(p), p + ' exists');
	assert.ok(!fs.existsSync(path.join(ROOT, 'luci-app-netpath/root/etc/uci-defaults')),
		'no root/etc/uci-defaults/ file: it would ship 0644 and fail verify_built_apk');
	const html = read(path.join(WEB, 'index.html'));
	assert.ok(!/cgi-bin\/luci|\/ubus|sysauth|luci-static/.test(html), 'standalone page links no LuCI');
	const api = read(API);
	/* comments describe what is forbidden; check the code, not the comments */
	const code = api.split('\n').filter(function (l) { return !l.trim().startsWith('#'); }).join('\n');
	assert.ok(!/^\s*uci (set|commit|delete)|set_alias|^\s*rm |curl|wget/.test(code), 'API has no write path');
	assert.ok(/REQUEST_METHOD.*GET/.test(api), 'API only answers GET');
	assert.ok(/luci\.netpath|iwinfo|client-rates/.test(api), 'API calls the dashboard sources');
	assert.ok(!/jq|jsonfilter|python|node/.test(code), 'API uses only busybox tools');
	const js = read(path.join(WEB, 'app.js'));
	assert.ok(!/innerHTML|set_alias|fetch\(.*POST/.test(js), 'frontend never writes');
});

test('standalone: uhttpd.netpath is dashboard-only, set up by postinst', () => {
	const mk = read(MAKEFILE);
	const post = mk.slice(mk.indexOf('define Package/luci-app-netpath/postinst'), mk.indexOf('include $(TOPDIR)/feeds/luci/luci.mk'));
	assert.ok(/uhttpd\.netpath/.test(post), 'postinst creates uhttpd.netpath');
	assert.ok(/8080/.test(post), 'port 8080');
	assert.ok(/home='\/www\/netpath'/.test(post), 'home is /www/netpath only');
	assert.ok(!/lua_prefix|ubus_prefix/.test(post.replace(/No lua_prefix, no ubus_prefix/g, '')), 'no LuCI / ubus on this instance');
	assert.ok(/interpreter='.sh=\/bin\/sh'/.test(post), 'interpreter fallback for the 644 CGI script');
	assert.ok(/uci get uhttpd\.netpath/.test(post), 'idempotent: existing section is left alone');
	assert.ok(/IPKG_INSTROOT/.test(post), 'postinst does nothing while building an image');
});

test('standalone: Makefile postinst/postrm are before luci.mk', () => {
	const mk = read(MAKEFILE);
	assert.ok(/PKG_VERSION:=1\.0\.16/.test(mk), 'version is 1.0.16');
	const post = mk.indexOf('define Package/luci-app-netpath/postinst');
	const luci = mk.indexOf('include $(TOPDIR)/feeds/luci/luci.mk');
	assert.ok(post > 0 && post < luci, 'postinst is defined before luci.mk');
	assert.ok(mk.indexOf('define Package/luci-app-netpath/postrm') > 0, 'postrm removes the section');
});

test('standalone: shell syntax of the API script', () => {
	const r = spawnSync('sh', ['-n', API], { encoding: 'utf8' });
	assert.equal(r.status, 0, API + ' passes sh -n: ' + r.stderr);
});

test('standalone: API with a mock ubus returns valid JSON, read-only fields only', () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'netpath-standalone-'));
	const bin = path.join(dir, 'bin');
	fs.mkdirSync(bin);
	/* Mock ubus: answers the whitelisted calls with documentation
	   values only, and records every call it was asked to make. */
	const calls = path.join(dir, 'calls.log');
	fs.writeFileSync(path.join(bin, 'ubus'), [
		'#!/bin/sh',
		'echo "$@" >> "' + calls + '"',
		'case "$2 $3" in',
		'  "system board") echo \'{"model":"Example Router","hostname":"netpath-ap","board_name":"example,router","release":{"description":"OpenWrt 25.12"}}\';;',
		'  "system info") echo \'{"uptime":3600,"load":[0.1,0.2,0.3],"memory":{"total":1048576,"free":524288,"available":786432}}\';;',
		'  "network.interface dump") echo \'{"interface":[{"interface":"wan","up":true,"proto":"dhcp","l3_device":"eth0","ipv4-address":[{"address":"203.0.113.2","mask":24}],"route":[{"target":"0.0.0.0","mask":0,"nexthop":"203.0.113.1"}]}]}\';;',
		'  "network.device status") echo \'{"eth0":{"up":true,"statistics":{"rx_bytes":1000,"tx_bytes":2000}}}\';;',
		'  "luci.netpath wireless") echo \'{"radio0":{"up":true,"config":{"band":"5g","channel":36,"htmode":"HE80"},"interfaces":[{"ifname":"wlan0","config":{"ssid":"Harbor-5G","encryption":"psk2"}}]}}\';;',
		'  "luci.netpath thermal") echo \'{"zones":[{"zone":"thermal_zone0","type":"cpu","temp":45000}]}\';;',
		'  "luci.netpath wired") echo \'{"hosts":[{"mac":"02:00:5e:00:53:01","port":"lan1","bridge":"br-lan","seen":5}]}\';;',
		'  "luci-rpc getHostHints") echo \'{"02:00:5E:00:53:01":{"hostname":"phone","ipaddrs":["192.0.2.10"]}}\';;',
		'  "uci get") echo \'{"values":{}}\';;',
		'  "iwinfo assoclist") echo \'{"results":[{"mac":"02:00:5e:00:53:01","signal":-50,"rx":{"bytes":100000,"packets":10},"tx":{"bytes":200000,"packets":20}}]}\';;',
		'  "iwinfo info") echo \'{"ssid":"Harbor-5G","channel":36}\';;',
		'  "luci.client-rates get") echo \'{"rates":{"192.0.2.10":{"ready":true,"mac":"02:00:5E:00:53:01","upload":125,"download":1000}}}\';;',
		'  *) echo \'null\';;',
		'esac',
		''
	].join('\n'));
	fs.chmodSync(path.join(bin, 'ubus'), 0o755);
	const r = spawnSync('/bin/sh', [API], { encoding: 'utf8', env: { ...process.env, PATH: bin + ':/usr/bin:/bin', REQUEST_METHOD: 'GET' } });
	assert.equal(r.status, 0, 'API exits 0: ' + r.stderr);
	const body = r.stdout.split('\r\n\r\n').pop();
	const out = JSON.parse(body);
	assert.equal(out.board.model, 'Example Router');
	assert.equal(out.assoc.wlan0.results[0].mac, '02:00:5e:00:53:01');
	assert.equal(out.clientRates.rates['192.0.2.10'].ready, true);
	assert.equal(out.wired.hosts[0].port, 'lan1');
	const made = fs.readFileSync(calls, 'utf8');
	assert.ok(!/set_alias|uci set|reboot/.test(made), 'mock ubus saw no write call');
	assert.ok(!/192\.168|172\.16/.test(body), 'no real LAN address in the reply');
	fs.rmSync(dir, { recursive: true, force: true });
});

test('standalone: frontend JS parses and jsmin accepts it', () => {
	execFileSync('node', ['--check', path.join(WEB, 'app.js')], { encoding: 'utf8' });
	/* jsmin is LuCI's minifier; if the SDK's copy is available, the
	   packaged file must be its output, so the source must survive it */
	const jsmin = process.env.NETPATH_JSMIN;
	if (!jsmin) return;
	const r = spawnSync(jsmin, [], { input: read(path.join(WEB, 'app.js')), encoding: 'utf8', maxBuffer: 64 << 20 });
	assert.equal(r.status, 0, 'jsmin accepts app.js');
	execFileSync('node', ['--check', '-'], { input: r.stdout, encoding: 'utf8' });
});
