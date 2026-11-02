# Font Awesome migration

Read [FontAwesome in coding.md](../../chatium-development/coding.md#fontawesome) for the tag, scan graph, supported versions and cross-account contract.

## Inventory and choose coverage

Find stylesheet links, CSS imports, kits/JS loaders, version/style prefixes and icon sources throughout the selected site's dependency graph. Record each page's version and stylesheet order. Preserve its supported major; investigate patch-version differences against the platform's pinned release. Kit/JS behavior, Pro and v4 require a separately agreed conversion or remain unchanged.

Inventory the source and allowed vocabulary of every icon name before applying the contract's subset/full rules:

- For apparently finite choices, establish the allowed set from source or validation rules; current database rows alone do not bound future values.
- Check CMS editors, settings and user inputs for the ability to introduce future names; preserve that capability when selecting the mode.
- Trace external components and JSON/Markdown content as well as local markup. A warning-free build does not prove these names are covered.

Done when every icon source has a complete coverage strategy or an explicit exception.

## Replace and verify

Replace compatible full stylesheet includes with the contract's tag and selected coverage mode, preserving cascade order. Keep attributes static so the intended subset can be built. Retain icon markup and intentional custom classes; remove redundant old includes on migrated pages.

For Font Awesome 6, existing `fas`, `far` and `fab` remain supported alongside `fa-solid`, `fa-regular` and `fa-brands`; the subset preserves their base styles. Change the stylesheet include first and keep these prefixes. Rename classes only to fix a demonstrated incompatibility with the selected version, not to normalize existing markup to the examples.

Resolve the contract's diagnostics for migrated pages and check style/version pairings, including regular/solid/brands variants and aliases. Verify icons in hidden and interactive states, CMS examples and external components, not just the initial viewport.

Inspect response and network: subset mode emits CSS in the HTML; full mode intentionally retains a cacheable full stylesheet. Both still use font files; this migration does not subset those files. Leave font preload decisions to measured evidence: adding Font Awesome preloads can delay the first paint by competing with CSS.

Done when coverage and rendered icons match the baseline, obsolete includes are gone, and emitted CSS/network behavior matches the selected mode. Use the main workflow to report compatibility choices separately from measured savings.
