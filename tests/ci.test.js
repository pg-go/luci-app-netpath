'use strict';
/* This split has no signed repository or release publishing yet: CI is
   checks plus an unsigned SDK build, and no job may name a signing key
   or a release-signing environment. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const CI = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'ci.yml'), 'utf8');

/* the text of one top-level job, up to the next one */
const job = name => {
	const start = CI.indexOf('\n  ' + name + ':\n');
	assert.ok(start >= 0, 'job ' + name);
	const next = CI.slice(start + 1).search(/\n  [a-z][a-z-]*:\n/);
	return next < 0 ? CI.slice(start) : CI.slice(start, start + 1 + next);
};

test('ci: checks plus an unsigned build, plus a tag-only release job', () => {
	const checks = job('checks');
	const build = job('build');
	const release = job('release');
	assert.match(checks, /node --test tests\//);
	assert.match(checks, /dev\/i18n\/update\.sh --check/);
	assert.match(build, /dev\/build\/sdk-build\.sh/);
	assert.match(release, /needs: build/);
	assert.match(release, /startsWith\(github\.ref, 'refs\/tags\/v'\)/);
	assert.match(release, /contents: write/);
	assert.match(release, /gh release (create|upload)/);
	assert.match(release, /netpath-25\.12\.4/);
	assert.match(release, /netpath-24\.10\.8/);
	assert.doesNotMatch(CI, /NETPATH_SIGN_KEY|NETPATH_USIGN_KEY|release-signing/);
	assert.doesNotMatch(CI, /\n  repository:\n/);
});
