# Image optimization with Sharp

For a general site optimization, inspect image bytes in `resources.md` and the LCP element before choosing images to change. Record source dimensions, actual `currentSrc`, displayed size, viewport and DPR. Prioritize heavy images and unnecessarily large variants; retain images already efficient at acceptable quality.

## Reuse or install Sharp

Check whether Sharp is already installed in the project, globally, or in an existing service directory. Verify it by loading the module and encoding a small image: loading JavaScript alone does not prove the native encoder works. Reuse a working installation. If missing, install Sharp using the environment's package manager and permissions in a writable service directory outside customer dependencies.

Resolve the module from its actual installation path for task-local scripts; a globally installed npm package is not normally resolvable with a bare `require('sharp')`. Record the selected Sharp/libvips versions. Resolve a broken installation's error before retrying rather than repeatedly installing copies.

## Generate responsive variants

Use Sharp to resize and encode from the original image into a separate task output directory. Preserve the originals. Choose widths from the actual layout and target DPR, capped at the source dimensions after orientation; deduplicate widths. Preserve framing, transparency, orientation and color appearance. Keep SVGs as vectors when appropriate; animated inputs need an explicit animation-preserving workflow or remain unchanged.

For photographic raster content, WebP quality 80 is a starting point, not an acceptance criterion. A typical pipeline is `sharp(source).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 80 }).toFile(output)`. Inspect the returned width/height/size, compare details at intended display sizes, and adjust quality when necessary. Use lossless output for content that needs it. Do not flatten alpha or crop merely to reduce bytes. See [Sharp output options](https://sharp.pixelplumbing.com/api-output/) for encoding choices.

Keep a reproducible task-local recipe: source path/hash, Sharp version, widths, encoding settings and output paths. Record actual output dimensions and bytes; use actual widths in `srcset` descriptors, not unclamped requested widths. Retain an existing efficient asset when the new file is larger or visibly worse. Stop encoding before running Lighthouse.

## Upload and integrate

Use [Storage](../../chatium-development/storage.md) for upload commands, protection and URL helpers. Run `chatium storage upload` from the consuming checkout with absolute output paths; retry only failed files. Preserve the source's access policy. Keep a mapping of variant files to returned hashes so later updates are reproducible.

For pre-sized variants, use the appropriate original-file URL helper. Verify the actual response MIME type, dimensions and bytes: a thumbnail endpoint can re-encode an already compressed WebP and make it larger. Do not infer delivered quality or size from the `.webp` suffix. Preserve separate social-preview assets where required.

Build `srcset` from the variants and set `sizes` from the actual CSS layout. Preserve aspect ratio with dimensions, existing alt text and framing. Keep the LCP image eager and preserve its priority; use lazy loading for eligible below-fold images. If a preload exists, align its responsive candidates with the image and check that it does not download an unused extra variant.

## Verify

Open fresh browser contexts at the target desktop/mobile viewports and DPRs. Record the selected `currentSrc`, rendered dimensions, network bytes and successful decoding; scroll to check lazy images. Compare quality, transparency, typography overlap, framing and layout shifts with the baseline. Resizing an already loaded desktop page alone does not establish mobile resource selection.

Run the final baseline/candidate measurement through [Rendering measurements](measurement.md). Report image-byte reduction separately from LCP improvement. Done when every changed image has a reproducible source-to-variant mapping, verified delivery and acceptable appearance, and performance is measured or explicitly marked unverified.
