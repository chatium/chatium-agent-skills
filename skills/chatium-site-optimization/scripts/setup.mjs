import { createHash } from 'node:crypto';
import { existsSync, readFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const source = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(source, 'package.json')));
const lock = readFileSync(join(source, 'package-lock.json'));
const key = createHash('sha256').update(lock).digest('hex').slice(0, 16);
export const cache = join(resolve(process.env.CHATIUM_PERF_CACHE || join(homedir(), '.cache', 'chatium-site-optimization')), key);

export function checkNode() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 19)) throw new Error('Node >=22.19 is required; use an available compatible runtime or the PSI fallback.');
}

export async function loadTools() {
  checkNode();
  for (const [name, version] of Object.entries(manifest.dependencies)) {
    const installed = JSON.parse(readFileSync(join(cache, 'node_modules', name, 'package.json')));
    if (installed.version !== version) throw new Error(`Run setup: expected ${name}@${version}`);
  }
  process.env.PUPPETEER_CACHE_DIR = join(cache, 'browsers');
  const require = createRequire(join(cache, 'package.json'));
  const { default: puppeteer } = await import(pathToFileURL(require.resolve('puppeteer')).href);
  const { default: lighthouse } = await import(pathToFileURL(require.resolve('lighthouse')).href);
  const { default: desktopConfig } = await import(pathToFileURL(require.resolve('lighthouse/core/config/desktop-config.js')).href);
  const executablePath = process.env.CHROME_PATH || await puppeteer.executablePath();
  if (!existsSync(executablePath)) throw new Error('Chrome missing: set CHROME_PATH to an available browser or run setup.');
  return { puppeteer, lighthouse, desktopConfig, executablePath };
}

export async function prepare() {
  checkNode();
  mkdirSync(cache, { recursive: true });
  for (const name of ['package.json', 'package-lock.json']) copyFileSync(join(source, name), join(cache, name));
  let installed = false;
  try {
    installed = Object.entries(manifest.dependencies).every(([name, version]) =>
      JSON.parse(readFileSync(join(cache, 'node_modules', name, 'package.json'))).version === version);
  } catch { /* First installation. */ }
  if (!installed) execFileSync('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: cache, stdio: 'inherit', timeout: 300_000 });
  if (!process.env.CHROME_PATH) {
    const packageDir = join(cache, 'node_modules/puppeteer');
    const packageJson = JSON.parse(readFileSync(join(packageDir, 'package.json')));
    const bin = typeof packageJson.bin === 'string' ? packageJson.bin : packageJson.bin.puppeteer;
    execFileSync(process.execPath, [join(packageDir, bin), 'browsers', 'install', 'chrome'], {
      cwd: cache, stdio: 'inherit', timeout: 300_000,
      env: { ...process.env, PUPPETEER_CACHE_DIR: join(cache, 'browsers') },
    });
  }
  return loadTools();
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
