'use strict';
/* The app reads a theme only through --v-* custom properties,
   each with a fallback (it must also work under Bootstrap). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const appCss = fs.readFileSync(path.join(root, 'luci-app-netpath/htdocs/luci-static/resources/netpath/app.css'), 'utf8');

const uses = [ ...appCss.matchAll(/var\(\s*(--v-[a-z0-9-]+)\s*([,)])/g) ].map(m => ({ name: m[1], fallback: m[2] === ',' }));
test('the app reads theme tokens only with a fallback', () => {
	assert.ok(uses.length > 30, 'found the token reads');
	assert.deepEqual(uses.filter(u => !u.fallback).map(u => u.name), []);
});


test('controls share one height: the app takes the theme\'s, on touch too', () => {
	assert.match(appCss, /--np-ctl: var\(--v-ctl-h, 36px\);/);
	assert.match(appCss, /@media \(pointer: coarse\) \{\s*\.np-app \{ --np-ctl: var\(--v-ctl-h, 44px\); \}/);
	/* no control in the app keeps a fixed height of its own: rules whose
	   selector ends at the control (states allowed, descendants not) */
	const rules = [ ...appCss.matchAll(/([^{}]+)\{([^{}]*)\}/g) ].map(m => ({ sel: m[1].split(','), body: m[2] }));
	for (const cls of [ 'np-btn', 'np-layout-btn', 'np-filter', 'np-filter-input', 'np-fchip', 'np-sort', 'np-fold-btn',
		'np-icon-action', 'np-ov-grip', 'np-ov-btn', 'np-drawer-close', 'np-icon-pick', 'np-rename-input' ]) {
		const self = new RegExp('\\.' + cls + '(?![\\w-])[^\\s]*\\s*$');
		const own = rules.filter(r => r.sel.some(s => self.test(s.trim())));
		assert.ok(own.length, 'found ' + cls);
		for (const r of own)
			assert.doesNotMatch(r.body, /(^|[\s;])height:\s*\d+px/, cls + ' has a fixed height: ' + r.sel.join(',').trim());
	}
});
