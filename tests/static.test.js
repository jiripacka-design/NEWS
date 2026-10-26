import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
test('logging implementation and download API are present',()=>{const s=fs.readFileSync('lib/scanner.js','utf8');assert.match(s,/source\.start/);assert.match(s,/source\.complete/);assert.match(s,/persist\.articles/);assert.match(s,/lock\.release/);assert.match(fs.readFileSync('app/api/logs/route.js','utf8'),/content-disposition/)});
test('required validation sources remain configured',()=>{const s=fs.readFileSync('lib/store.js','utf8');assert.match(s,/bbc-world/);assert.match(s,/validation-feed/)});
test('admin UI exposes log download',()=>assert.match(fs.readFileSync('public/admin.html','utf8'),/downloadlog/));
