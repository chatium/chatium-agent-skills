# Rendering measurements

Use the bundled Lighthouse runner for repeatable public-page comparisons. It owns installation, URL construction, run ordering and aggregation; use the browser separately for visual and interaction checks.

## Prepare tools once

Resolve `SKILL_DIR` to this skill's installed directory. Run:

```sh
node "$SKILL_DIR/scripts/setup.mjs" check
# If tools are missing, install them within the environment's permissions:
node "$SKILL_DIR/scripts/setup.mjs" install
```

The installer uses the bundled lockfile in a versioned service cache outside the customer project. `CHATIUM_PERF_CACHE` selects a writable cache root; its default is `~/.cache/chatium-site-optimization`. Reuse this cache across tasks. `CHROME_PATH` selects an existing compatible Chrome/Chromium; otherwise setup downloads the browser pinned by Puppeteer into that cache. Installation does not alter the customer's dependencies or the system browser. Node must satisfy `scripts/package.json`; use an available compatible runtime if needed.

Done when `check` launches Chrome and reports tool versions. If installation, downloads or browser launch fail, retain the error and follow the fallback below. Respect sandbox restrictions; an available browser tool does not imply a browser executable is available to shell commands.

## Pin the comparison

Before editing, retain the starting commit on a baseline preview branch. At final measurement, pin the candidate branch to the final commit. Keep both deployed revisions and the underlying data unchanged during the series. Compare routes covering each changed shell/rendering path, with identical roles and states.

Create a task-local `measurement.json` using actual commit IDs, canonical route URLs and markers from the fetched HTML:

```json
{
  "runs": 3,
  "profiles": ["mobile", "desktop"],
  "baseline": {
    "revision": "BASELINE_COMMIT",
    "query": { "__chtmPreviewMode__": "account:perf-baseline" }
  },
  "candidate": {
    "revision": "CANDIDATE_COMMIT",
    "query": { "__chtmPreviewMode__": "account:perf-candidate" }
  },
  "routes": [{
    "name": "catalog",
    "url": "https://example.chatium.ru/site/catalog?category=classic",
    "baselineHtmlIncludes": ["BASELINE_RESOURCE_HASH", "Catalog"],
    "candidateHtmlIncludes": ["CANDIDATE_RESOURCE_HASH", "Catalog"]
  }]
}
```

Markers must distinguish the deployed versions, such as their generated resource URLs/hashes, as well as the intended page content. Revision strings are recorded labels, not automatic proof of deployment. Use decoded HTML source strings; marker matching is literal. The runner preserves route query parameters while applying each version's preview parameters and rejects unexpected redirects. Resolve canonical URLs before measuring.

Done when both previews independently load the expected version/content and the manifest describes the actual deployed revisions. This runner uses fresh anonymous browsers; for authenticated or session-dependent pages use the authorized-browser fallback instead of putting credentials into the manifest.

## Run and interpret

```sh
node "$SKILL_DIR/scripts/measure.mjs" measurement.json ./measurements-final
```

The output directory must be new. The runner alternates baseline/candidate order, runs audits sequentially in fresh browsers, and records Lighthouse settings, versions, warnings, initial HTML, JSON/HTML reports and per-metric medians/ranges. `summary.md` is the concise table; `summary.json` also includes scores, request counts and CSS/JS/font bytes. Missing metrics remain unavailable. TTFB comes from Lighthouse's `metrics.timeToFirstByte` under simulated throttling, labeled accordingly; observed server response time is recorded separately. Neither should be presented as a real user's measured TTFB. Report any missing TTFB evidence explicitly.

Use one run for diagnostics and at least three per version/profile for final evidence. With conflicting results, run a new series of five per side and keep both series. If the effect remains within the observed variability, report it as inconclusive. These small samples do not establish statistical significance. Avoid competing builds/audits during measurement. A cold browser cache does not imply a cold CDN/server cache; keep server warm-up conditions comparable and report known differences.

Inspect the report screenshots and resource URLs before accepting a series. Preflight HTML checks alone cannot prove the subsequent audit saw the same deployment. An error/warning produces an invalid run and prevents aggregation of that group; resolve the cause and rerun the complete affected comparison rather than selecting successful samples. Exit success means collection succeeded, not that the site became faster or passed functional checks.

After rendering changes, measure the final affected pages again with a new candidate revision/output directory. Build the final report from that series, keeping intermediate results as diagnostics. Compare the same metric and method on both versions; use Lighthouse's TBT rather than renaming a custom long-task sum. For browser scenarios, record the action and observed result; element presence alone establishes no interaction coverage.

## Fallback and external confirmation

If local Lighthouse is unavailable, use the [PageSpeed Insights web interface](https://pagespeed.web.dev/) for public baseline/candidate URLs. Keep full preview parameters: Google's audit does not inherit browser cookies. Retain report links/exports, verify final URLs, screenshots and version-specific resources, and collect repeated mobile/desktop lab results separately. Use PSI API only when access/quota are already configured; a quota error does not establish that the web interface is unavailable. PSI can also provide external confirmation of a local result; keep its numbers separate from local measurements.

For authenticated pages or failed PSI audits, use Lighthouse in an authorized browser or controlled browser measurements. Record why the bundled runner could not be used, the actual method/settings and missing evidence. Compare like-for-like runs; distinguish browser observations from Lighthouse simulated metrics. CrUX's preceding 28-day field data cannot establish this migration's immediate effect. Visual, hydration and interaction checks remain required with every measurement method.
