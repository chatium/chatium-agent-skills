# Stored files

## Display by hash

Use these `@app/storage` helpers in Vue or backend code. Each takes `ctx` first and handles the current account and protected-file URLs.

| Need | API |
| --- | --- |
| Image thumbnail | `getThumbnailUrl(ctx, hash, width?, height?)`; omit a dimension for proportional sizing; choose dimensions for the rendered size and pixel density |
| Inline original | `getOriginalUrl(ctx, hash)` |
| Download with original filename | `getDownloadUrl(ctx, hash)` |

```vue
<!-- components/StoredImage.vue -->
<template>
  <img :src="getThumbnailUrl(ctx, props.hash, 800)" :alt="props.alt" />
</template>

<script setup lang="ts">
import { getThumbnailUrl } from '@app/storage'

const props = defineProps<{ hash: string; alt: string }>()
</script>
```

## Upload flow

Reuse an existing file component or uploader when available. Otherwise, obtain a direct URL, transfer the file, and persist the returned hash:

| Step / environment | API and result |
| --- | --- |
| Browser: obtain a direct URL | `await obtainStorageFilePutUrl(ctx, options?)` returns a short-lived file-service URL in a configured browser environment |
| Backend: create a direct URL | `await createUploadPutUrl(ctx, options?)` returns a short-lived file-service URL |
| Existing platform uploader: obtain its authorization endpoint | `getUploadGetPutUrl(ctx, options?)` returns an endpoint; POST to it to obtain the direct file-service URL |

POST a browser `FormData` containing the file as `Filedata` to the **direct file-service URL**. Let the browser set the multipart content type. Check the HTTP status, then read the response as plain text: trim it and reject an empty hash.

Persist that hash in the authorized application record, not the temporary URL. Use the display helpers to render it. Keep access checks on record changes and preserve protected-file settings; a temporary access URL does not make a protected file permanently public.

For backend ingestion of a known remote file, `await fetchUrlToStorage(ctx, sourceUrl, options?)` returns a stored hash. Application API calls still use [RouteRefs](routing.md#route-references); profile image updates follow [auth.md](auth.md#profile-updates).


## Upload local files with the CLI

For local assets, run the CLI from the target account's synchronized Source Git checkout, including
its subdirectories. It selects the account from `origin` and reuses CLI OAuth authorization.

```sh
chatium storage upload ./photo.jpg ./document.pdf
chatium storage upload --protected ./private.pdf
```

Files are public by default; `--protected` applies to all files in the command. Paths are relative to
the current directory. Each successful upload prints `file`, `file_hash`, `download_url`, `get_url`,
and `thumbnail_url` (800px wide where supported) as a text block. Protected URLs are unsigned.
Persist `file_hash` in the application and use the display helpers above for URLs, including protected access.

File errors go to stderr; remaining files continue and any failure sets exit code 1. Authorization
failure or cancellation stops the command. Successful uploads remain stored, so retry only failed files.
