import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compare, samePage, summarize, targetUrl, validate, saveScreenshot, resourceReport } from './measure.mjs';
import { selectCache, findChrome } from './setup.mjs';

test('cache selection skips unusable roots and respects an explicit unavailable root', () => {
  const dir = mkdtempSync(join(tmpdir(), 'perf-cache-selection-'));
  const blocked = join(dir, 'not-a-directory');
  writeFileSync(blocked, 'blocked');
  const writable = join(dir, 'external-cache');
  const selected = selectCache([blocked, writable]);
  assert(selected.startsWith(writable));
  assert.equal(selectCache([blocked, writable]), selected);
  assert.throws(() => selectCache([blocked]), /No writable measurement cache/);
});

test('installed Chromium is discovered without CHROME_PATH and explicit overrides are honored', () => {
  const dir = mkdtempSync(join(tmpdir(), 'perf-browser-discovery-'));
  const chromium = join(dir, 'chromium');
  writeFileSync(chromium, '#!/bin/sh\nexit 0\n');
  chmodSync(chromium, 0o755);
  assert.equal(findChrome({ PATH: dir }, []), chromium);
  assert.equal(findChrome({ CHROME_PATH: chromium, PATH: '' }, []), chromium);
  assert.throws(() => findChrome({ CHROME_PATH: join(dir, 'absent'), PATH: dir }, []), /not executable/);
  chmodSync(chromium, 0o644);
  mkdirSync(join(dir, 'google-chrome'));
  assert.equal(findChrome({ PATH: dir }, []), undefined);
});

test('screenshots retain MIME extension and exact decoded bytes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'perf-screenshots-'));
  for (const [mime, extension, hex] of [['jpeg', 'jpg', 'ffd8ffe00010'], ['png', 'png', '89504e470d0a1a0a'], ['webp', 'webp', '52494646']]) {
    const bytes = Buffer.from(hex, 'hex');
    const file = saveScreenshot(`data:image/${mime};base64,${bytes.toString('base64')}`, dir, mime);
    assert.equal(file, `${mime}.${extension}`);
    assert.deepEqual(readFileSync(join(dir, file)), bytes);
  }
  assert.equal(saveScreenshot(undefined, dir, 'missing'), null);
  assert.throws(() => saveScreenshot('data:text/html;base64,AAAA', dir, 'bad'), /Unsupported/);
});

const config = url => ({
  runs: 1, profiles: ['mobile', 'desktop'],
  baseline: { revision: 'fixture-a', query: { '__chtmPreviewMode__': 'account:baseline' } },
  candidate: { revision: 'fixture-b', query: { '__chtmPreviewMode__': 'account:candidate' } },
  routes: [{ name: 'home', url, baselineHtmlIncludes: ['build-baseline'], candidateHtmlIncludes: ['build-candidate'] }],
});

test('resource report ranks top ten per run, preserves missing data and escapes table cells', () => {
  const dir = mkdtempSync(join(tmpdir(), 'perf-resource-report-'));
  const items = Array.from({ length: 12 }, (_, i) => ({ url: `https://example.test/file-${i}`, type: 'Script', transferBytes: i, status: 200, cache: 'none' }));
  items.push({ url: 'https://example.test/a|b<script>\nnext', type: 'Image', transferBytes: 100 });
  writeFileSync(join(dir, 'resources.json'), JSON.stringify(items));
  const report = resourceReport([
    { route: 'home', profile: 'mobile', side: 'baseline', index: 1, revision: 'abc', valid: true, resources: 'resources.json' },
    { route: 'home', profile: 'mobile', side: 'candidate', index: 1, revision: 'def', valid: false, error: 'Wrong page' },
  ], dir);
  assert(report.indexOf('a\\|b&lt;script&gt; next') < report.indexOf('file-11'));
  assert(!report.includes('file-2 |'));
  assert.equal(report.split('\n').filter(line => line.startsWith('| https://')).length, 10);
  assert(report.includes('| Image | 100 | unavailable | unavailable |'));
  assert(report.includes('invalid — Wrong page'));
  assert(report.includes('Resource data unavailable.'));
  assert(report.includes('not medians'));
});

test('preview parameters preserve categories and replace an existing preview', () => {
  const route = { url: 'https://example.test/catalog?category=a%26b&__chtmPreviewMode__=old' };
  const result = new URL(targetUrl(route, { query: { '__chtmPreviewMode__': 'account:optimize/site' } }));
  assert.equal(result.searchParams.get('category'), 'a&b');
  assert.deepEqual(result.searchParams.getAll('__chtmPreviewMode__'), ['account:optimize/site']);
  assert(samePage('https://example.test/catalog/?b=2&a=1', 'https://example.test/catalog?a=1&b=2'));
  assert(!samePage(result.href, 'https://example.test/catalog?category=a%26b'));
});

test('invalid and incomplete series cannot yield a favorable median', () => {
  const row = value => ({ route: 'home', profile: 'mobile', side: 'baseline', valid: true, metrics: { lcpMs: value } });
  assert.equal(summarize([row(100), row(900), row(200)], 3)['home/mobile/baseline'].stats.lcpMs.median, 200);
  assert.deepEqual(summarize([row(100), { ...row(0), valid: false }], 2)['home/mobile/baseline'].stats, {});
  assert.deepEqual(summarize([row(100)], 3)['home/mobile/baseline'].stats, {});
});

test('reject ambiguous targets, absent evidence and invalid run counts', () => {
  const c = config('https://example.test/');
  validate(c);
  assert.throws(() => validate({ ...c, runs: 0 }));
  assert.throws(() => validate({ ...c, candidate: c.baseline }));
  assert.throws(() => validate({ ...c, routes: [{ ...c.routes[0], candidateHtmlIncludes: [] }] }));
});

test('real Lighthouse reports and wrong-version rejection', { skip: process.env.PERF_SMOKE !== '1', timeout: 300_000 }, async () => {
  const server = createServer((req, res) => {
    const candidate = new URL(req.url, 'http://localhost').searchParams.get('__chtmPreviewMode__') === 'account:candidate';
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Measurement fixture</title><style>body{font:24px system-ui;margin:40px}</style></head><body><h1>Measurement fixture</h1><p>build-${candidate ? 'candidate' : 'baseline'}</p></body></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const c = config(`http://127.0.0.1:${server.address().port}/`);
    const dir = mkdtempSync(join(tmpdir(), 'chatium-perf-smoke-'));
    const out = join(dir, 'valid');
    assert.equal(await compare(c, out), true);
    const runs = JSON.parse(readFileSync(join(out, 'runs.json')));
    assert.equal(runs.length, 4);
    assert(runs.every(x => x.valid && x.metrics.lcpMs > 0 && x.lighthouseVersion));
    assert(runs.every(x => x.metrics.simulatedTtfbMs > 0));
    assert(runs.every(x => x.settings.formFactor === x.profile));
    const mobile = runs.find(x => x.profile === 'mobile').settings;
    const desktop = runs.find(x => x.profile === 'desktop').settings;
    assert(mobile.screenEmulation.width < desktop.screenEmulation.width);
    assert(mobile.throttling.cpuSlowdownMultiplier > desktop.throttling.cpuSlowdownMultiplier);
    assert(runs.every(x => readFileSync(join(out, x.report), 'utf8').includes('lighthouse')));
    for (const run of runs) {
      assert.match(run.screenshot, /\.(jpg|png|webp)$/);
      assert(readFileSync(join(out, run.screenshot)).length > 100);
      const resources = JSON.parse(readFileSync(join(out, run.resources)));
      assert(resources.some(x => x.type === 'Document' && x.transferBytes > 0));
      assert(resources.every((x, i) => i === 0 || resources[i - 1].transferBytes >= x.transferBytes));
    }
    const summaryText = readFileSync(join(out, 'summary.md'), 'utf8');
    assert(summaryText.includes('CSS bytes | JS bytes | Font bytes | Image bytes'));
    assert(summaryText.includes(`](${runs[0].screenshot})`));
    assert(summaryText.includes(`](${runs[0].resources})`));
    assert(summaryText.includes('](resources.md)'));
    const resourceText = readFileSync(join(out, 'resources.md'), 'utf8');
    for (const run of runs) assert(resourceText.includes(`## ${run.route}/${run.profile}/${run.side}/${run.index}`));
    assert(resourceText.includes('| Document |'));
    await assert.rejects(compare(c, out), /EEXIST/);
    c.profiles = ['mobile'];
    c.routes[0].candidateHtmlIncludes = ['wrong-build'];
    assert.equal(await compare(c, join(dir, 'invalid')), false);
    const invalid = JSON.parse(readFileSync(join(dir, 'invalid', 'summary.json')));
    assert.equal(invalid['home/mobile/candidate'].complete, false);
    assert.deepEqual(invalid['home/mobile/candidate'].stats, {});
    console.log(`Smoke artifacts: ${dir}`);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
