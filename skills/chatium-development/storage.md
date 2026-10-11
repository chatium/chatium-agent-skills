# Stored files: `@app/storage`

Use the platform module for file content, uploads, downloads, URLs and metadata. For **«Хранилище» / «Файловое хранилище»**, folders or registered files, use [Vault](vault.md). Uploading content alone does not create a file record in Vault.

## Identify the file

- A FileService **hash** is an opaque string returned by an upload or stored in an existing record. Keep it unchanged; it is not a local path, URL or a digest to calculate yourself.
- `Heap.File()`, `Heap.ImageFile()`, `Heap.VideoFile()` and `Heap.AudioFile()` accept hashes on create/update. Backend values are StorageFile objects with `.hash`; their JSON representation is the hash string. Preserve an existing string-based schema when that is what the project uses; see [Heap](heap.md).
- A numeric FileService listing ID and a string Vault record ID belong to different APIs. URL helpers below accept a hash or StorageFile object; Vault mutations accept the Vault record ID.

Persist the hash in the authorized application record. Build URLs when needed, rather than storing upload URLs or expiring download links. Obtain the hash from the user's attachment, an existing record, a completed upload or the relevant SDK; an arbitrary URL is not a hash.

## Display by hash

These helpers work in Vue and backend code and take `ctx` first.

| Need | API |
| --- | --- |
| Image thumbnail | `getThumbnailUrl(ctx, hash, width?, height?)`; omit a dimension for proportional sizing; choose dimensions for the rendered size and pixel density |
| Inline original, including a browser PDF preview | `getOriginalUrl(ctx, hash)` |
| Download with the original upload filename | `getDownloadUrl(ctx, hash)` |
| Image URL and dimensions | `getImageSrcFromHash(ctx, hash, width?, height?)` |

```vue
<template>
  <img :src="getThumbnailUrl(ctx, props.hash, 800)" :alt="props.alt" />
  <a :href="getDownloadUrl(ctx, props.hash)">Download</a>
</template>

<script setup lang="ts">
import { getDownloadUrl, getThumbnailUrl } from '@app/storage'

const props = defineProps<{ hash: string; alt: string }>()
</script>
```

For protected files, these helpers require a user auth session and produce session-bound URLs. Background jobs and completion callbacks often have no such session: use the shared URL methods below.

## Protected files and shared URLs

Choose the access mode required by the task; use `protected: true` for private documents. The shared methods are backend-only and let an external service or a background operation read a protected file without a browser session.

| Need | API |
| --- | --- |
| Original content | `await createSharedOriginalUrl(ctx, hash, options?)` |
| Download | `await createSharedDownloadUrl(ctx, hash, options?)` |
| Thumbnail | `await createSharedThumbnailUrl(ctx, hash, { width?, height?, expiresInSeconds?, allowNonProtected? })` |
| Audio file or a video's extracted audio track | `await createSharedAudioUrl(ctx, hash, options?)` |

`options` for original/download/audio contains `expiresInSeconds` and `allowNonProtected`. Protected shared URLs default to two minutes; choose a lifetime that covers the intended consumer's fetch. By default, these methods reject a public hash. Use `allowNonProtected: true` when either access mode is valid: a public file then returns its ordinary public URL, without an expiry.

Check access to the application's record or Vault file before issuing a link. A shared URL grants access to whoever receives it; keep it out of persistent records and logs. Sharing temporarily does not require making the original public. Permanent publication (`makeFilePublic` or `createPublicCopy`) changes access and requires an explicit task need and the plugin permission described below.

## Upload flow

Reuse an existing uploader when available. Otherwise, obtain a direct URL, transfer the file, check the response and save its returned hash.

| Environment | API and result |
| --- | --- |
| Browser | `await obtainStorageFilePutUrl(ctx, options?)` returns a direct file-service URL in a configured browser environment |
| Backend | `await createUploadPutUrl(ctx, options?)` returns a direct file-service URL |
| Existing platform upload component | `getUploadGetPutUrl(ctx, options?)` returns an authorization endpoint; POST to it to obtain the direct URL |

The direct URL has a short lifetime. Despite the `PutUrl` names, upload with **POST multipart/form-data**, using the **`Filedata`** field. Let the HTTP implementation set the multipart boundary. The response is a **plain-text hash**, not JSON.

Browser code uses the browser's `File`, `FormData` and `fetch`:

```ts
import { obtainStorageFilePutUrl } from '@app/storage'

export async function uploadFile(ctx: app.Ctx, file: File) {
  const url = await obtainStorageFilePutUrl(ctx, { protected: true })
  const body = new FormData()
  body.append('Filedata', file)
  const response = await fetch(url, { method: 'POST', body })
  if (!response.ok) throw new Error(`Upload failed: HTTP ${response.status}`)
  const hash = (await response.text()).trim()
  if (!hash) throw new Error('Empty upload hash')
  return hash
}
```

Persist through the application's authorized [record update](routing.md#editing-flow); a successful upload alone does not attach the file to a record. Profile image updates follow [auth.md](auth.md#profile-updates). For a Vault folder, register the hash with [`putVaultFile`](vault.md#upload-and-register-in-vault).

### Upload local files with the CLI

Run from the consuming account's Source Git checkout. The CLI uses its Chatium `origin` and CLI OAuth authorization.

```sh
chatium storage upload ./photo.jpg ./document.pdf
chatium storage upload --protected ./private.pdf
```

Files are public by default; `--protected` applies to all files in the command. Paths are relative to the current directory. Successful uploads print `file`, `file_hash`, `download_url`, `get_url` and `thumbnail_url` (800px wide where supported). Protected URLs printed by the CLI are unsigned: use the SDK helpers with `file_hash` to obtain working access URLs.

File errors go to stderr; remaining files continue and any failure sets exit code 1. Authorization failure or cancellation stops the command. Successful uploads remain stored, so retry only failed files. If the user asked to put local files into **«Хранилище»**, registration in Vault is also required.

## Read or download content

For a user's download, return `getDownloadUrl` in an authorized request, or create a shared download link when the recipient has no session. To process a text file on the backend, fetch its original URL explicitly as text:

```ts
import { request } from '@app/request'
import { createSharedOriginalUrl } from '@app/storage'

export async function readStoredText(ctx: app.Ctx, hash: string) {
  const url = await createSharedOriginalUrl(ctx, hash, {
    expiresInSeconds: 300,
    allowNonProtected: true,
  })
  const response = await request.get(url, { responseType: 'text' })
  return response.body
}
```

`@app/request` returns `{ body, statusCode, headers, ... }` and throws on non-2xx by default. A successful call with `responseType: 'text'` gives the text in `.body`; `getFileMeta` gives metadata, not file bytes. Parse CSV/JSON according to the file format after reading it. Limit fetched/returned content to what the task needs.

For binary PDFs, Office documents, images and media, preserve the format: use a supported format-specific processor or forward the stored file as described below. Backend `@app/request` can retrieve a base64 string with `{ responseType: 'text', encoding: 'base64' }`; that is not decoded document text. Local agent tools can download an authorized URL to a local file and use local processors. These local capabilities do not make Node filesystem, Buffer or streaming APIs available inside Chatium application code.

## Create a text file on the backend

Backend code has no filesystem. For CSV, JSON, Markdown or another text result, upload its content using `File` and `FormData` from **`@app/request`**:

```ts
import { File, FormData, request } from '@app/request'
import { createUploadPutUrl } from '@app/storage'

export async function saveTextFile(ctx: app.Ctx, text: string, name: string, mime: string) {
  const body = new FormData()
  body.append('Filedata', new File([text], name, { type: mime }))
  const url = await createUploadPutUrl(ctx, { protected: true })
  const response = await request.post(url, body, { responseType: 'text' })
  const hash = response.body.trim()
  if (!hash) throw new Error('Empty upload hash')
  return hash
}
```

The `File` implementation accepts text or string parts; use the transfer APIs for existing binary files. `request.post(url, data, options)` takes the body as its second argument and options as its third. For an options object containing `body`, use `request({ url, method: 'POST', body, responseType: 'text' })` instead.

For a large text export, append chunks sequentially using `startPartialStorageFileUpload(ctx, name, { protected? })`, `appendToPartialStorageFile(ctx, partialHash, stringChunk)`, then `finalizePartialStorageFileUpload(ctx, partialHash)`. Save only the final returned hash. Append is not idempotent: after an uncertain result, blindly repeating a chunk can duplicate it. For generated PDFs, follow [PDF](pdf.md).

## Import remote files and send stored files

- `await fetchUrlToStorage(ctx, sourceUrl, { protected?, headers? })` downloads a remote file directly into FileService and returns its hash. Keep source credentials in server-side headers. Reuse the imported hash when subsequently registering it in Vault.
- For a temporary remote import, `createFetchUrl(ctx, sourceUrl, { protected?, headers?, ttlSeconds? })` returns a file-service URL; GET it with `request.get(url, { responseType: 'text' })` and use the returned hash. `fetchUrlToStorage` itself does **not** accept `ttlSeconds`.
- For an external API accepting a URL, create a shared original/download/audio URL just before the call.
- For an external API accepting multipart uploads, `forwardStorageFilesToUrl` sends bytes directly from FileService; it returns an operation ID, not the API's response.

```ts
import { checkForwardStatus, forwardStorageFilesToUrl } from '@app/storage'

export async function sendAttachment(ctx: app.Ctx, hash: string, uploadToUrl: string) {
  const requestId = await forwardStorageFilesToUrl(ctx, {
    uploadToUrl,
    files: { attachment: hash },
    additionalFormFields: { description: 'Report' },
  })
  const status = await checkForwardStatus(ctx, requestId)
  return { requestId, status }
}
```

`files` maps the receiving API's multipart field names to hashes. Alternatively supply `fileFieldName` and `fileHash`. `headers` holds the receiving API's authorization headers. Status is `forwarding`, `success`, `failure` (with HTTP response fields), or `error` (with `reason`). If still forwarding, retain the request ID and check later using [jobs](jobs.md); a first status check is not proof of completion. Inspect an existing operation before resending after an uncertain result.

## Lifetime and metadata

`expiresInSeconds` controls the upload/access URL lifetime. **`ttlSeconds` controls the uploaded file's lifetime**, starting when upload completes. A file with no TTL is persistent. Use TTL for drafts or one-off exports; after expiry its URLs return 404 and the file disappears from listings/stats. Restoring does not extend an expired TTL. Temporary video stays a file, without the normal video-platform processing.

`createUploadPutUrl`, `getUploadGetPutUrl`, `obtainStorageFilePutUrl`, `createFetchUrl` and `createPartialUploadUrl` accept `ttlSeconds`. The high-level `fetchUrlToStorage` and `startPartialStorageFileUpload` wrappers currently do not. Use the lower-level API when that option is needed rather than adding an unsupported argument.

Use `createStorageFileFromHash(hash)` and `isImageFile` / `isVideoFile` / `isAudioFile` for file classes. `getFileTypeFromHash`, `getSizesFromHash` and `getDurationFromHash` inspect hash metadata; sizes and duration can be `undefined`. `getVideoInfo` / `getAudioInfo` are backend calls; video playback is covered in [Video](video.md) and [Vault](vault.md#file-picker-and-video).

`await getFileMeta(ctx, hash, key?)` returns attached metadata; validate its shape before use. `await updateFileMeta(ctx, hash, key, value)` writes it, with `null` removing the key. Neither operation changes the file content. Downloading with the original filename and renaming a Vault record are also separate operations.

## FileService catalog: plugin-only operations

For the user's Vault folders/files use [Vault SDK](vault.md). Low-level `listFiles` and aggregate calls are backend-only **plugin** APIs requiring `storage.listFiles`; account code, including account `chatium exec`, receives an access error. They are not a substitute for `listVaultFiles`.

`listFiles(ctx, { name?, hash?, userId?, type?, mediaType?, sizeMin?, sizeMax?, deleted?, sort?, dir?, limit?, offset? })` returns `{ count, rows }`. Rows expose numeric `id`, name, MIME type, size, protection and `expiresAt`, without hashes. `mediaType` is a category including `document`; `type` is the MIME filter. Listing is scoped to the plugin's files unless it has `storage.fullAccountAccess`. Use bounded pages, `getHashesByIds` for allowed hash resolution and `getDownloadUrlById` / `getThumbnailUrlById` for session-bound URLs.

`deleteFileById` / `restoreFileById` require `storage.manageFiles`. `deleteFileByHash` deletes only the caller's own files; plugin callers also need that permission. These are soft deletes. `makeFilePublic` permanently exposes the original hash; `createPublicCopy` returns a public copy hash. Both require `storage.manageFiles`. The copy shares the original's lifetime, and deleting the original also removes the copy. Use `getPublicFileUrl` / `getPublicThumbnailUrl` for unsigned URLs of a file intentionally made public.

## Completion

For an upload/import, keep the returned hash and verify its intended attachment or Vault registration. For a download, provide a usable URL with the requested access mode. For a background transfer, distinguish a started operation from a terminal result. After an uncertain write result, inspect what succeeded before retrying; uploads and app-record registration are separate writes.
