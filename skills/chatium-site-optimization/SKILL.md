---
name: chatium-site-optimization
description: "Optimize rendering of existing Chatium sites: migrate Tailwind browser scripts and Font Awesome, enable Vue SSR, and bundle Google Fonts. Use for slow first render or related Source Build push warnings."
---

# Site rendering optimization

Improve the requested site's first render while preserving its design and behavior. Use the platform contracts in the linked `chatium-development` references; this skill supplies the migration and verification workflow.

## 1. Establish scope and baseline

For a general request to speed up a site, assess all four optimization branches. For a specific migration, limit the work to that branch and changes necessary to preserve its behavior; report independent opportunities without implementing them.

Identify the requested site's routes, page shells, Vue islands and shared dependencies in the available checkout. If the target is ambiguous, show the candidate sites and ask which one. Include shared components within the site; identify consumers outside it and resolve that scope before changing them. Continue independent work while a decision is pending.

Inventory all scoped pages, including HTML strings, legacy files, dynamic content and external components. For each in-scope optimization record the affected pages and whether to migrate, retain with a reason, or resolve a decision. Push warnings are clues, not a complete inventory.

Capture the actual starting revision on a preview, its URLs (including real ids/query parameters), user roles, data, desktop/mobile viewports and interactive states. Take screenshots and record console/network behavior. Measure TTFB, FCP, LCP and transferred CSS/JS/font bytes and requests using repeated runs with the same browser, network/CPU profile and cache state; record the profile and compare medians, preferably with alternating before/after runs. Include cold loads; keep warm results separate. Choose performance routes covering each distinct shell and changed rendering path. Record missing access or instrumentation as verification gaps.

Done when every scoped page has an optimization disposition and the baseline or its gaps are recorded.

## 2. Apply relevant migrations

Read only the references for applicable branches within the agreed scope:

- Tailwind Play/browser script, inline configuration or `text/tailwindcss`: [Tailwind migration](references/tailwind.md).
- Font Awesome stylesheet/kit or names assembled or loaded from data: [Font Awesome migration](references/fontawesome.md).
- Vue content absent from the first response: [SSR adaptation](references/ssr.md).
- Google Fonts request chains, unused font styles or resource competition after SSR: [Fonts and resources](references/google-fonts.md).

When both are in scope, resolve blocking stylesheet work before evaluating SSR's benefit. Apply compatible changes in the user's scope; ask about substantial data-loading/architecture rewrites rather than silently expanding the migration. Preserve unsupported cases as explicit exceptions. Automatic minification and resource bundling need no invented customer flags.

## 3. Verify on preview

Follow [Publishing and branch preview](../chatium-development/SKILL.md#publishing-and-branch-preview). Publish the changes to a non-production branch. Production publication requires a separate user request.

Run `chatium typecheck` for the affected application paths and inspect build diagnostics. Confirm the expected generated HTML, CSS and network behavior on the target preview: local backend commits or a successful build alone do not prove that the customer's environment supports a feature. If the platform cannot supply it, retain the working behavior and report that branch as blocked.

Compare every changed page with the baseline at the same URLs, data, roles, viewport sizes and affected states: menus, dialogs, validation, navigation and lazy content. Check icons, typography, cascade, layout shifts and the console. For SSR, apply the response/hydration checks in its reference. Fix or revert regressions before calling a page verified; missing browser access leaves it unverified.

Repeat the performance measurements with the baseline conditions. Investigate regressions and resource competition; an enabled feature is not evidence of faster rendering. When measurements are noisy, missing or conflicting across pages, report that limit instead of claiming a speedup.

For a repeatable slowdown attributable to a change, fix it or revert that change. If retaining it offers a useful tradeoff, present the measured cost and benefit and wait for the user's explicit acceptance before treating it as resolved. Pending that decision, leave it on preview and mark the optimization incomplete. Missing or inconclusive measurements remain an evidence gap, not an accepted regression.

## 4. Report

Report separately:

- **Coverage:** complete or partial, with changes and retained/blocked pages and reasons. Intentional full Font Awesome is a compatibility choice, not a subset optimization.
- **Functional verification:** verified or unverified, with checked routes/states, baseline revision, preview branch and missing evidence.
- **Performance:** measured improvement, regression, inconclusive or not measured; include before/after medians, run counts and conditions, request/byte changes and remaining bottlenecks.

List material entries/configs, dynamic class/icon coverage and remaining decisions. Claim full completion only when all scoped pages have a disposition, all migrated pages pass their checks, and confirmed slowdowns are fixed, reverted or explicitly accepted. Distinguish a fully reviewed site from fully migrated coverage. Promise no fixed percentage gain.
