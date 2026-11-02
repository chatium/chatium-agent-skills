import { createHash } from 'node:crypto';
import { existsSync, readFileSync, mkdirSync, copyFileSync, mkdtempSync, rmSync, accessSync, statSync, constants } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve, delimiter } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const source = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(source, 'package.json')));
const lock = readFileSync(join(source, 'package-lock.json'));
const key = createHash('sha256').update(lock).digest('hex').slice(0, 16);
export let cache;

export function selectCache(roots) {
  const errors = [];
  for (const root of roots) {
    const directory = join(resolve(root), key);
    try {
      mkdirSync(directory, { recursive: true });
      const probe = mkdtempSync(join(directory, '.write-check-'));
      rmSync(probe, { recursive: true });
      return directory;
    } catch (error) { errors.push(`${directory}: ${error.message}`); }
  }
  throw new Error(`No writable measurement cache. Set CHATIUM_PERF_CACHE.\n${errors.join('\n')}`);
}

function cacheDirectory() {
  return cache ||= selectCache(process.env.CHATIUM_PERF_CACHE ? [process.env.CHATIUM_PERF_CACHE] : [
    ...(existsSync('/data/external') ? ['/data/external/perf-cache'] : []),
    join(homedir(), '.cache', 'chatium-site-optimization'),
    join(tmpdir(), 'chatium-site-optimization'),
  ]);
}

export function findChrome(env = process.env, extraPaths = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
]) {
  const candidates = env.CHROME_PATH ? [env.CHROME_PATH] : [
    ...(env.PATH || '').split(delimiter).filter(Boolean).flatMap(dir =>
      ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable'].map(name => join(dir, name))),
    ...extraPaths,
  ];
  for (const path of candidates) {
    try { accessSync(path, constants.X_OK); if (statSync(path).isFile()) return path; } catch { /* Try the next installed browser. */ }
  }
  if (env.CHROME_PATH) throw new Error(`CHROME_PATH is not executable: ${env.CHROME_PATH}`);
  return undefined;
}

export function checkNode() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 19)) throw new Error('Node >=22.19 is required; use an available compatible runtime or the PSI fallback.');
}

export async function loadTools(installBrowser = false) {
  checkNode();
  cacheDirectory();
  const systemChrome = findChrome();
  for (const [name, version] of Object.entries(manifest.dependencies)) {
    const installed = JSON.parse(readFileSync(join(cache, 'node_modules', name, 'package.json')));
    if (installed.version !== version) throw new Error(`Run setup: expected ${name}@${version}`);
  }
  process.env.PUPPETEER_CACHE_DIR = join(cache, 'browsers');
  const require = createRequire(join(cache, 'package.json'));
  const { default: puppeteer } = await import(pathToFileURL(require.resolve('puppeteer')).href);
  const { default: lighthouse } = await import(pathToFileURL(require.resolve('lighthouse')).href);
  const { default: desktopConfig } = await import(pathToFileURL(require.resolve('lighthouse/core/config/desktop-config.js')).href);
  const executablePath = systemChrome || await puppeteer.executablePath();
  if (!existsSync(executablePath) && installBrowser) {
    const packageDir = join(cache, 'node_modules/puppeteer');
    const packageJson = JSON.parse(readFileSync(join(packageDir, 'package.json')));
    const bin = typeof packageJson.bin === 'string' ? packageJson.bin : packageJson.bin.puppeteer;
    execFileSync(process.execPath, [join(packageDir, bin), 'browsers', 'install', 'chrome'], {
      cwd: cache, stdio: 'inherit', timeout: 300_000,
      env: { ...process.env, PUPPETEER_CACHE_DIR: join(cache, 'browsers') },
    });
  }
  if (!existsSync(executablePath)) throw new Error('Chrome missing: set CHROME_PATH to an available browser or run setup.');
  return { puppeteer, lighthouse, desktopConfig, executablePath };
}

export async function prepare() {
  checkNode();
  cacheDirectory();
  findChrome(); // Validate an explicit override before installing packages.
  for (const name of ['package.json', 'package-lock.json']) copyFileSync(join(source, name), join(cache, name));
  let installed = false;
  try {
    installed = Object.entries(manifest.dependencies).every(([name, version]) =>
      JSON.parse(readFileSync(join(cache, 'node_modules', name, 'package.json'))).version === version);
  } catch { /* First installation. */ }
  if (!installed) execFileSync('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: cache, stdio: 'inherit', timeout: 300_000 });
  return loadTools(true);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const mode = process.argv[2];
    if (!['check', 'install'].includes(mode)) throw new Error('Usage: node setup.mjs check|install');
    const tools = mode === 'install' ? await prepare() : await loadTools();
    const browser = await tools.puppeteer.launch({ executablePath: tools.executablePath, headless: true });
    try { console.log(JSON.stringify({ cache, node: process.version, ...manifest.dependencies, chrome: await browser.version(), executablePath: tools.executablePath }, null, 2)); }
    finally { await browser.close(); }
  } catch (error) {
    console.error(error.message);
    console.error('If installation or browser launch is unavailable, record this reason and use PageSpeed Insights in the browser.');
    process.exitCode = 1;
  }
}
