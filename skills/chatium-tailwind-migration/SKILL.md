---
name: chatium-tailwind-migration
description: "Migrate Chatium pages from the Tailwind Play/browser script to build-time CSS. Use for the Chatium push warning about Tailwind browser scripts or requests to replace Play in a Chatium app."
---

# Tailwind browser script migration

Play builds CSS in the browser from the classes it finds in the DOM. The target is a build-time Tailwind entry: read [Tailwind in coding.md](../chatium-development/coding.md#tailwind) first; it defines the entry, the JSON config, the scanned modules and `safelist`. Play pages keep working until migrated. Migrate the supported pages and report verification and coverage separately.

## Scope

Migrate one app folder per run, the one the user names. When the user has not named one, show the folders that still load Play and ask which to migrate:

```bash
grep -rlE --include='*.tsx' --exclude-dir=node_modules 'static/lib/tailwind|cdn\.tailwindcss\.com' . | cut -d/ -f2 | sort | uniq -c | sort -rn
```

When the folder's pages get Play from a module outside the folder (a shared head), name that module and the folders importing it, and ask before editing it.

## 1. Inventory

```bash
grep -rnE --exclude-dir=node_modules 'tailwind' <folder>
```

Classify every hit:

- **Play script**: `<script src>` with `/s/static/lib/tailwind.*.min.js` or `cdn.tailwindcss.com`, including `src={ctx.account.url('…')}`.
- **Config**: `tailwind.config = {…}` in an inline `<script>`, or in a string constant rendered as `<script>{twConfig}</script>`.
- **Blocks**: `<style type="text/tailwindcss">`.
- **Global**: other uses of `tailwind` / `window.tailwind` (runtime config changes, `if (window.tailwind)` guards). Direct reads of `tailwind` can throw once the script is gone; guards may instead skip behavior that must be preserved.

The push summary counts only html-jsx `<script>` elements; the search also finds Play in HTML strings and `.html` files.

Assign each page or supporting file a disposition before editing:

- **Migrate**: its config and styles can be represented by the build-time entry.
- **Leave unchanged**: Play in HTML strings or `.html` files; CDN scripts with `?plugins=`; Vue `<style>` plugins such as `require('@tailwindcss/forms')`; service-worker precache lists referencing the script. Record the reason. Pages requiring unsupported plugins stay on Play.
- **Needs a decision**: configs using other plugin APIs such as `matchUtilities` or `addVariant`, request/data-dependent config values, or shared heads outside the selected folder. Resolve the decision with the user before changing affected pages; independent pages can proceed.

Record each page's config, Tailwind blocks and surrounding `<style>` / stylesheet order. Before editing, capture screenshots of the actual starting version at desktop and mobile widths, including parameterized URLs with real ids and affected interactive states (menus, dialogs, validation errors). Record the source revision, preview branch, URLs, data and viewport sizes so the comparison can be repeated. Use `main` only when it represents that starting version. If a baseline cannot be captured, record the verification gap.

Done when every hit has a kind and disposition, every affected page has its config and style dependencies accounted for, and the baseline or its gaps are recorded.

## 2. Risks

Play sees every class present in the DOM at runtime; the entry sees only complete class strings in the `.ts`/`.tsx`/`.vue` modules its pages import. Before editing, find the classes the entry would miss:

- Assembled names (`'bg-' + color`, `` `text-${size}` ``) → maps of complete class strings. Start with `grep -rnE "[a-z]-['\"] *\+|[a-z]-\\$\{" <folder>`.
- Classes from data (Heap records, API responses, HTML in `v-html`) → establish the finite set of allowed classes and put it in `safelist`. Current records alone do not establish that set. If arbitrary future content can introduce classes and no bounded set is available, leave the affected pages on Play and report the limitation.
- Classes written only in `.md`, `.json` or `.css` files, or in modules the pages import only for a RouteRef → complete strings in a scanned module, or `safelist`.

Done when every dynamic source on pages selected for migration has a bounded class set, covered by complete strings or `safelist`; pages with unresolved sources are marked to remain on Play.

## 3. Config

Convert each page's config to `tailwind.config.json` next to its entry:

- Object literal → JSON: double-quoted keys and strings, no comments or trailing commas. Drop `content`; the import graph defines the sources.
- Function plugins → equivalent CSS in the entry: `addUtilities` → `@layer utilities`, `addComponents` → `@layer components`, `addBase` → `@layer base`, camelCase properties in kebab-case. Then drop `plugins`.

  ```js
  plugins: [function ({ addUtilities }) {
    addUtilities({ '.text-balance': { textWrap: 'balance' } })
  }]
  ```

  ```css
  @layer utilities {
    .text-balance { text-wrap: balance; }
  }
  ```

  For plugin APIs flagged as needing a decision in Inventory, apply the agreed approach or leave the affected pages on Play.
- Interpolated, computed or runtime-changed configs (`${JSON.stringify(theme)}`, an IIFE, function values in `theme`, writes through the `tailwind` global) → the resolved static JSON when every value is a constant in source. For request/data-dependent values, apply the decision recorded in Inventory or leave the affected pages on Play.

Pages may share an entry when their configs match and sharing their styles preserves each page's behavior. Keep page-specific styles in separate entries unless their selectors are already scoped to the intended page: a rule present only on one page can affect another even without conflicting declarations. Each distinct config (including no config) gets its own entry, e.g. `app.css` + `tailwind.config.json` and `admin.css` + `admin.tailwind.config.json`. Each migrated page links exactly one Tailwind entry.

## 4. Edit

Create each entry in the folder: external `@import url(…)` lines first, then `@config`, the three `@tailwind` directives, then the plugin layers and the contents of the `text/tailwindcss` blocks verbatim, in page order. Keep one set of `@tailwind` directives and move local `@import` contents into the entry.

In each selected file, replace the Play script, config and block elements with one `<AppCss />` and import the entry by relative path. Position the link to preserve the recorded cascade relative to other stylesheets and ordinary `<style>` elements. If consolidating interleaved blocks changes precedence, adjust the CSS or keep the affected page on Play. Remove unused config constants and obsolete Tailwind setup while preserving unrelated behavior in wrappers. Keep the rest of each head, including heads repeated across pages.

```tsx
// before
<head>
  <title>Orders</title>
  <script src="/s/static/lib/tailwind.3.4.16.min.js"></script>
  <script>{`tailwind.config = { theme: { extend: { colors: { brand: '#f60' } } } }`}</script>
  <style type="text/tailwindcss">{`.btn { @apply rounded bg-brand px-4 py-2; }`}</style>
</head>
```

```tsx
// after
import AppCss from './app.css'
// …
<head>
  <title>Orders</title>
  <AppCss />
</head>
```

```css
/* app.css */
@config "./tailwind.config.json";
@tailwind base;
@tailwind components;
@tailwind utilities;

.btn { @apply rounded bg-brand px-4 py-2; }
```

Add the classes collected in step 2 to the `safelist`.

## 5. Verify

1. Repeat the inventory search. Every remaining hit is an entry/config, an expected reference, or an explicitly recorded exception. Migrated pages load the entry without also loading Play.
2. `chatium typecheck <folder>` passes.
3. Publish to a branch other than `main` ([Publishing and branch preview](../chatium-development/SKILL.md#publishing-and-branch-preview)). The build has no diagnostics for migrated files or their entries. None of the migrated paths remain in the Play summary; remaining paths in the selected folder match the recorded exceptions.
4. Compare each migrated page against its captured baseline at the same URLs, data, desktop/mobile sizes and interactive states. Use the migration branch preview, preserving existing URL parameters. Check the branch console for errors caused by the migration.

A page is verified when its build and typecheck pass, its baseline comparisons show no migration regressions, and its console has no migration errors. Fix regressions or restore the affected page to Play. If checks cannot be completed, report the page as unverified and name the missing evidence; describing a difference does not make it a successful verification.

## Report

State coverage (**complete** or **partial**, with pages left on Play and reasons) and verification (**verified** or **unverified**, with missing checks or unresolved differences). Full completion requires every scoped page to be migrated and verified.

List the entries and configs created, files changed, `safelist` additions, baseline revision, verification results and migration branch. Publishing to `main` publishes to production; leave that to the user.
