import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compare, samePage, summarize, targetUrl, validate } from './measure.mjs';

const config = url => ({
  runs: 1, profiles: ['mobile', 'desktop'],
  baseline: { revision: 'fixture-a', query: { '__chtmPreviewMode__': 'account:baseline' } },
  candidate: { revision: 'fixture-b', query: { '__chtmPreviewMode__': 'account:candidate' } },
  routes: [{ name: 'home', url, baselineHtmlIncludes: ['build-baseline'], candidateHtmlIncludes: ['build-candidate'] }],
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
