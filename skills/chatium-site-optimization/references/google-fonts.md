# Google Fonts and render resources

Read [Google Fonts in coding.md](../../chatium-development/coding.md#google-fonts) for supported source forms. Bundling and CSS minification are platform features, not customer configuration switches.

## Migrate supported font requests

Inventory Google Fonts links/imports, dynamically created loaders, requested families/weights/italics and preconnects across the site's shells and styles. Check actual design use, including hidden states and content variants, before narrowing a font request.

Write eligible URLs directly in the supported static link or unconditional CSS import. Preserve meaningful media conditions, loading handlers, nonce/CSP and cascade semantics. If bundling would require removing such behavior, retain the include and report the exception or agree on an equivalent change. A warning alone is not permission to discard attributes.

Investigate `google-fonts.not-bundled` by checking the source form. For `google-fonts.unavailable`, inspect build diagnostics and URL validity: it may be a resolver/network/budget failure, not an unsupported family. Keep the working fallback and report unresolved infrastructure issues. A retry needs a changed-tree build; repeatedly pushing the identical tree does not rerun it.

Verify the generated font CSS, account-served font requests, requested weights/italics, glyph coverage and typography/layout against the baseline. Remove Google preconnects only after the waterfall confirms all relevant Google requests have disappeared. Proxy fallback can redirect upstream; do not promise complete Google independence.

Done when each include is bundled or a recorded exception, the request chain matches the output, and font rendering is preserved.

## Check resource competition

When SSR exposes images earlier, use `loading="lazy"` for below-fold images that need not start immediately. Preserve eager loading of the visible hero/LCP image. Compare the waterfall and FCP/LCP/TTFB with the shared baseline before claiming a gain; earlier content can increase bandwidth competition and server work.

Remove redundant resource loads only after tracing their consumers. Keep further optimization proportional to observed bottlenecks; substantial redesign or unrelated infrastructure work is a separate decision.
