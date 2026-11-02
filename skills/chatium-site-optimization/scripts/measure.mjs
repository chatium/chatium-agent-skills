import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTools } from './setup.mjs';

const metricIds = { fcpMs: 'first-contentful-paint', lcpMs: 'largest-contentful-paint', tbtMs: 'total-blocking-time', cls: 'cumulative-layout-shift', speedIndexMs: 'speed-index', bytes: 'total-byte-weight' };

export function saveScreenshot(data, out, prefix) {
  if (!data) return null;
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=\s]+)$/.exec(data);
  if (!match) throw new Error('Unsupported Lighthouse screenshot data URL.');
  const file = `${prefix}.${match[1] === 'jpeg' ? 'jpg' : match[1]}`;
  writeFileSync(join(out, file), Buffer.from(match[2], 'base64'));
  return file;
}

export function targetUrl(route, version) {
  const url = new URL(route.url);
  for (const [key, value] of Object.entries(version.query || {})) url.searchParams.set(key, value);
  return url.href;
}

export function samePage(actual, expected) {
  const normalize = value => {
    const url = new URL(value);
    url.hash = '';
    url.pathname = url.pathname.replace(/\/$/, '') || '/';
    url.searchParams.sort();
    return url.href;
  };
  return normalize(actual) === normalize(expected);
}

export function validate(config) {
  if (!Number.isInteger(config.runs) || config.runs < 1 || config.runs > 5) throw new Error('runs must be an integer from 1 to 5 (1 is diagnostic only).');
  if (!Array.isArray(config.profiles) || !config.profiles.length || new Set(config.profiles).size !== config.profiles.length || config.profiles.some(x => !['mobile', 'desktop'].includes(x))) throw new Error('profiles must contain mobile and/or desktop, without duplicates.');
  for (const side of ['baseline', 'candidate']) {
    if (!config[side]?.revision?.trim()) throw new Error(`${side}.revision must identify the deployed commit.`);
    if (Object.values(config[side].query || {}).some(x => typeof x !== 'string')) throw new Error(`${side}.query values must be strings.`);
  }
  if (!Array.isArray(config.routes) || !config.routes.length) throw new Error('routes must be a nonempty array.');
  const names = new Set();
  for (const route of config.routes) {
    if (!/^[a-z0-9_-]+$/.test(route.name) || names.has(route.name)) throw new Error('Each route needs a unique filename-safe name.');
    names.add(route.name);
    for (const side of ['baseline', 'candidate']) {
      const url = new URL(targetUrl(route, config[side]));
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) throw new Error('Use HTTP(S) URLs without credentials or fragments.');
      const markers = route[`${side}HtmlIncludes`];
      if (!Array.isArray(markers) || !markers.length || markers.some(x => typeof x !== 'string' || !x.trim())) throw new Error(`${route.name}: provide ${side}HtmlIncludes with content/build markers.`);
    }
    if (targetUrl(route, config.baseline) === targetUrl(route, config.candidate)) throw new Error('Baseline and candidate must use distinct URLs pinned to their revisions.');
  }
}

export function summarize(records, expectedRuns) {
  const groups = {};
  for (const record of records) {
    const key = `${record.route}/${record.profile}/${record.side}`;
    (groups[key] ||= []).push(record);
  }
  return Object.fromEntries(Object.entries(groups).map(([key, rows]) => {
    const valid = rows.filter(x => x.valid);
    const complete = rows.length === expectedRuns && valid.length === expectedRuns;
    const stats = {};
    if (complete) for (const metric of Object.keys(valid[0].metrics)) {
      const values = valid.map(x => x.metrics[metric]);
      if (!values.every(Number.isFinite)) { stats[metric] = null; continue; }
      values.sort((a, b) => a - b);
      const mid = Math.floor(values.length / 2);
      stats[metric] = { median: values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2, min: values[0], max: values.at(-1) };
    }
    return [key, { complete, validRuns: valid.length, attemptedRuns: rows.length, expectedRuns, stats }];
  }));
}

async function audit(tools, config, route, profile, side, index, out) {
  const url = targetUrl(route, config[side]);
  const prefix = `${route.name}-${profile}-${side}-${index}`;
  const record = { route: route.name, profile, side, index, revision: config[side].revision, url, startedAt: new Date().toISOString(), valid: false };
  let browser;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    const html = await response.text();
    if (!response.ok || !samePage(response.url, url)) throw new Error(`Preflight returned ${response.status} at ${response.url}; check canonical URL and preview access.`);
    for (const marker of route[`${side}HtmlIncludes`]) if (!html.includes(marker)) throw new Error(`Preflight missing expected HTML/build marker: ${marker}`);
    writeFileSync(join(out, `${prefix}.html-response`), html);
    browser = await tools.puppeteer.launch({ executablePath: tools.executablePath, headless: true });
    record.chrome = await browser.version();
    const port = Number(new URL(browser.wsEndpoint()).port);
    const result = await tools.lighthouse(url, {
      port, logLevel: 'error', output: ['json', 'html'], onlyCategories: ['performance'],
      throttlingMethod: 'simulate', maxWaitForLoad: 45_000,
    }, profile === 'desktop' ? tools.desktopConfig : undefined);
    const { lhr } = result;
    writeFileSync(join(out, `${prefix}.json`), JSON.stringify(lhr, null, 2));
    writeFileSync(join(out, `${prefix}.html`), result.report[1]);
    record.report = `${prefix}.html`;
    record.screenshot = saveScreenshot(lhr.audits['final-screenshot']?.details?.data, out, prefix);
    record.finalUrl = lhr.finalDisplayedUrl || lhr.finalUrl;
    record.lighthouseVersion = lhr.lighthouseVersion;
    record.settings = lhr.configSettings;
    record.environment = lhr.environment;
    record.warnings = lhr.runWarnings;
    if (lhr.configSettings.formFactor !== profile) throw new Error(`Requested ${profile}, got ${lhr.configSettings.formFactor}`);
    if (lhr.runtimeError) throw new Error(lhr.runtimeError.message);
    if (!samePage(record.finalUrl, url)) throw new Error(`Audit reached a different URL: ${record.finalUrl}`);
    if (lhr.runWarnings?.length) throw new Error(`Audit warnings require review: ${lhr.runWarnings.join('; ')}`);
    record.metrics = Object.fromEntries(Object.entries(metricIds).map(([name, id]) => [name, lhr.audits[id]?.numericValue ?? null]));
    record.metrics.simulatedTtfbMs = lhr.audits.metrics?.details?.items?.[0]?.timeToFirstByte ?? null;
    record.metrics.performance = lhr.categories.performance.score === null ? null : lhr.categories.performance.score * 100;
    const requests = lhr.audits['network-requests']?.details?.items;
    record.resources = requests ? `${prefix}.resources.json` : null;
    if (requests) writeFileSync(join(out, record.resources), JSON.stringify(requests.map(x => ({
      url: x.url, type: x.resourceType, transferBytes: x.transferSize ?? null,
      status: x.statusCode, cache: x.cache,
    })).sort((a, b) => (b.transferBytes || 0) - (a.transferBytes || 0)), null, 2));
    record.metrics.requests = requests?.length ?? null;
    for (const [name, type] of [['cssBytes', 'Stylesheet'], ['jsBytes', 'Script'], ['fontBytes', 'Font'], ['imageBytes', 'Image']]) {
      record.metrics[name] = requests ? requests.filter(x => x.resourceType === type).reduce((sum, x) => sum + (x.transferSize || 0), 0) : null;
    }
    // Observed server response time is kept separate from simulated paint metrics.
    record.metrics.serverResponseMs = lhr.audits['server-response-time']?.numericValue ?? null;
    for (const name of ['fcpMs', 'lcpMs', 'tbtMs', 'cls']) if (!Number.isFinite(record.metrics[name])) throw new Error(`Missing Lighthouse metric: ${name}`);
    record.valid = true;
  } catch (error) { record.error = error.message; }
  finally { if (browser) await browser.close(); }
  return record;
}

export async function compare(config, out) {
  validate(config);
  const tools = await loadTools();
  mkdirSync(out); // Refuse to overwrite evidence from an earlier revision.
  writeFileSync(join(out, 'manifest.json'), JSON.stringify({ config, node: process.version, platform: process.platform, arch: process.arch, executablePath: tools.executablePath, createdAt: new Date().toISOString() }, null, 2));
  const records = [];
  for (const route of config.routes) for (const profile of config.profiles) for (let i = 1; i <= config.runs; i++) {
    for (const side of i % 2 ? ['baseline', 'candidate'] : ['candidate', 'baseline']) {
      const record = await audit(tools, config, route, profile, side, i, out);
      records.push(record);
      writeFileSync(join(out, 'runs.json'), JSON.stringify(records, null, 2));
      console.log(`${route.name} ${profile} ${side} ${i}: ${record.valid ? 'ok' : record.error}`);
    }
  }
  const summary = summarize(records, config.runs);
  writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 2));
  const lines = ['# Lighthouse comparison', '', config.runs < 3 ? 'Diagnostic only: fewer than three runs per version.' : 'Medians and ranges; inspect screenshots, warnings and version evidence before claiming improvement.', '', '| Route/profile/version | Valid runs | Simulated TTFB ms | FCP ms | LCP ms | TBT ms | CLS |', '|---|---:|---:|---:|---:|---:|---:|'];
  for (const [key, value] of Object.entries(summary)) {
    const cell = name => { const s = value.stats[name]; return s ? `${s.median.toFixed(2)} [${s.min.toFixed(2)}–${s.max.toFixed(2)}]` : 'unavailable'; };
    lines.push(`| ${key} | ${value.validRuns}/${value.expectedRuns} | ${['simulatedTtfbMs', 'fcpMs', 'lcpMs', 'tbtMs', 'cls'].map(cell).join(' | ')} |`);
  }
  lines.push('', '## Resources', '', 'Per-group medians; bytes are transferred bytes, including compressed resources. Inline CSS/JS is part of the HTML, not the external CSS/JS columns.', '', '| Route/profile/version | Requests | Total bytes | CSS bytes | JS bytes | Font bytes | Image bytes | Performance |', '|---|---:|---:|---:|---:|---:|---:|---:|');
  for (const [key, value] of Object.entries(summary)) {
    const cell = name => value.stats[name] ? Math.round(value.stats[name].median) : 'unavailable';
    lines.push(`| ${key} | ${['requests', 'bytes', 'cssBytes', 'jsBytes', 'fontBytes', 'imageBytes', 'performance'].map(cell).join(' | ')} |`);
  }
  lines.push('', '## Run artifacts', '', '| Run | Status | Report | Screenshot | Resources by transfer size |', '|---|---|---|---|---|');
  for (const record of records) {
    const link = (label, file) => file ? `[${label}](${file})` : 'unavailable';
    const status = record.valid ? 'valid' : `invalid: ${(record.error || '').replace(/[|\r\n]/g, ' ')}`;
    lines.push(`| ${record.route}/${record.profile}/${record.side}/${record.index} | ${status} | ${link('HTML', record.report)} | ${link('Image', record.screenshot)} | ${link('JSON', record.resources)} |`);
  }
  writeFileSync(join(out, 'summary.md'), lines.join('\n') + '\n');
  return records.every(x => x.valid);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [, , configPath, out] = process.argv;
    if (!configPath || !out) throw new Error('Usage: node measure.mjs measurement.json NEW_OUTPUT_DIRECTORY');
    if (!await compare(JSON.parse(readFileSync(configPath, 'utf8')), resolve(out))) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
