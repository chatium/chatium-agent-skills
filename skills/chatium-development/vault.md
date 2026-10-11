# Vault: «Хранилище» / «Файловое хранилище»

Use **`@vault/sdk`** when the user refers to «Хранилище», «Файловое хранилище», «Мой диск» or Vault, or asks to work with its folders and registered files. It manages the application's file model. File bytes and URLs belong to [`@app/storage`](storage.md); a stored hash and a Vault record are separate entities.

## Availability and access

Work in the consuming account. The application slug is `vault`; an SDK declaration does not prove it is installed there. If installation is unknown and an Admin account-code caller can use `@store/sdk`, inspect `getPluginInstallInfo(ctx, 'vault')` before Vault calls, following [Store plugin installation](store-plugin-install.md). If absent, tell the user to connect **«Хранилище» (Vault / «Мой диск»)** and link to the returned `storeUrl`. Use the existing authorization when the user explicitly asks to install it; a request to inspect files alone does not authorize installation.

The server SDK applies the caller's Vault access rules. Creating folders, registering files and listing personal root files require a real user. `chatium exec` uses the CLI OAuth user; its role and folder access determine the result. It does not turn a personal-root list into all account files. Run one-off operations through [exec](exec.md) in the account's Source Git checkout, and keep persistent behavior in application modules.

Folder visibility and permission to manage a folder differ. An access error is not evidence of an absent application. Use the public SDK and report the inaccessible target; direct reads/writes of Vault's private Heap tables bypass its model and access logic.

Inspect the current exported `.d.ts` before use. Older installed typings may include widgets/PDF only: refresh the SDK declarations, and verify that the installed app version supports the server methods. Source exports tagged `@internal`, including knowledge-indexing helpers and `recognizePdf`, are not part of this public contract.

## Identifiers and results

| Value | Meaning and use |
| --- | --- |
| `VaultFolder.id` | String folder record ID; pass as `parentId` or `folderId` |
| `VaultFile.id` | String file record ID; use to get, rename, move or delete the Vault file |
| `VaultFile.hash` | FileService content hash; use with `@app/storage` for URLs or content |
| `VaultFile.publicCopyHash` | Optional existing public copy; it may be `null`. Do not publish a protected file merely to display or download it |

`VaultFolder.description` is plain text or `null`; get/list/create/update return it. `VaultFile` also contains `folderId`, `name`, `mediaType`, `size`, `source`, `userId`, `posterHash` and `createdAt`. `mediaType` in this model is the MIME value supplied at registration (for example `text/csv`), not a FileService category filter. Dates in these DTOs are strings. One hash can have several Vault records in different folders.

All methods below are server-side named exports from `@vault/sdk`, take `ctx` first and return Promises. They return DTOs/pages directly or throw; there is no `{ ok, result }` wrapper.

## Read folders and files

| Method | Arguments after `ctx` | Result |
| --- | --- | --- |
| `listVaultFolders` | Optional `{ parentId?, offset?, limit? }` | `VaultPage<VaultFolder>` |
| `getVaultFolder` | `id: string` | Visible `VaultFolder`; throws if missing/inaccessible |
| `listVaultFiles` | Optional `{ folderId?, offset?, limit? }` | `VaultPage<VaultFile>` |
| `getVaultFile` | `id: string` | Visible `VaultFile`; throws if missing/inaccessible |

A `VaultPage` is `{ items, offset, limit, total, hasMore }`, with a default limit of 100 and maximum 500. Continue at `page.offset + page.items.length` while `hasMore`, stopping on an unexpectedly empty page instead of looping indefinitely.

Omitting `parentId` (or passing `null`) lists **visible tree roots**, which can include a shared descendant whose parent is hidden. With a parent ID, only its immediate child folders are returned. Omitting `folderId` (or passing `null`) lists **the caller's personal root files**; with a folder ID, only files directly in that folder are returned. Neither method recursively lists the whole account. Traverse accessible folders explicitly only when the task needs descendants, retaining visited IDs because a visible root can be a descendant.

Resolve a named folder through the visible hierarchy and confirm the target when names are ambiguous. Reuse its ID. To download a registered file:

```ts
import { getVaultFile } from '@vault/sdk'
import { createSharedDownloadUrl } from '@app/storage'

export async function downloadVaultFile(ctx: app.Ctx, fileId: string) {
  const file = await getVaultFile(ctx, fileId)
  const url = await createSharedDownloadUrl(ctx, file.hash, {
    expiresInSeconds: 300,
    allowNonProtected: true,
  })
  return { id: file.id, name: file.name, hash: file.hash, url }
}
```

For inspection from CLI, start with a bounded read rather than dumping all documents:

```sh
chatium exec <<'EOF'
import { listVaultFolders, listVaultFiles } from '@vault/sdk'
const folders = await listVaultFolders(ctx, { limit: 20 })
const files = await listVaultFiles(ctx, { limit: 20 })
return { folders, files }
EOF
```

## Create and change folders

| Method | Arguments after `ctx` | Result |
| --- | --- | --- |
| `createVaultFolder` | `CreateVaultFolderParams`: `{ name: string, parentId?: string \| null, description?: string \| null }` | New `VaultFolder` |
| `updateVaultFolder` | `id: string, params: UpdateVaultFolderParams` | Fresh `VaultFolder`; see [metadata](#folder-metadata) |
| `ensureVaultFolders` | `paths: string[][]`, optional `parentId: string \| null` | `{ path: string[], id: string }[]` for every path prefix |
| `renameVaultFolder` | `id: string, name: string` | Updated `VaultFolder`; deprecated, prefer `updateVaultFolder(ctx, id, { name })` |
| `moveVaultFolder` | `id: string, parentId: string \| null` | Updated `VaultFolder`; `null` moves to root |
| `deleteVaultFolder` | `id: string` | `{ folders, files }` counts after recursive deletion |

`createVaultFolder` creates a new folder, including when a name is reused. For an existing target, read its hierarchy first. When creating an import tree, `ensureVaultFolders(ctx, [['Reports', '2026']], parentId)` reuses matching sibling names and creates missing prefixes. It returns both `['Reports']` and `['Reports', '2026']`, not one result per requested leaf. Pass nonempty path segments, at most ten segments per path and 500 paths per call; longer/larger inputs are truncated. Read before retrying after an uncertain result or if duplicate siblings already exist.

Folder rename/move/delete checks management rights. Move rejects the folder itself and its descendants as destinations. **Deleting a folder recursively deletes its descendants and file records.** Limit this to the user's requested subtree; it is not the storage service's soft-delete/restore API.

### Folder metadata

`updateVaultFolder` requires management rights. All `UpdateVaultFolderParams` fields are optional; omission/`undefined` preserves the field. Moving uses the separate `moveVaultFolder` method; `parentId` is not an update field.

| Field | Type and behavior |
| --- | --- |
| `name` | Nonempty trimmed string |
| `description` | Plain text, trimmed, at most 10,000 characters; `null` or an empty string clears it, returning `null`. Newlines remain; Vault and published folder pages display it as text |
| `access` | `'private'`, `'staff'`, `'admins'` or `'inherit'`; inheritance is valid only for a nested folder and uses the nearest ancestor setting. Changing it does not revoke public publications |
| `position` | Integer ≥ 0 for display order within the parent |
| `publicLinks` | Boolean controlling new uploads through Vault. Any ancestor's `true` enables public uploads in descendants; a child's `false` leaves that inheritance active. Existing hashes retain their access mode; an independent Storage upload uses its own `protected` option |
| `coverHash` | Existing public image hash or `null` to clear |
| `coverFileId` | Visible Vault image **record ID**, including one in another folder, or `null` to clear |

Pass only one of `coverHash` / `coverFileId`. Selecting `coverFileId` permanently makes the image public through `makeFilePublic`, with `createPublicCopy` as fallback. Choose a cover whose public use is authorized. Clearing the cover removes its assignment, without deleting or protecting the image again. Metadata is written before cover processing, so a cover failure may leave other fields updated: read `getVaultFolder` before retrying. `publicLinks` is an upload setting; manage public folder pages with the publication methods below.

## Publish a folder

Use these methods when the user asks to publish a Vault folder or manage its public link. Publishing exposes its current files and nested folders, including files added later, to anyone with the link. For a temporary download of one file, use [Storage shared URLs](storage.md#protected-files-and-shared-urls). All three methods require folder management rights; creating a publication also requires a real user.

| Method | Arguments after `ctx` | Result |
| --- | --- | --- |
| `publishVaultFolder` | `id: string`, optional `{ allowVideoDownload?: boolean }` | `VaultFolderPublication`: `{ token: string, url: string, allowVideoDownload: boolean }` |
| `getVaultFolderPublication` | `id: string` | `VaultFolderPublicationState`: `{ published: boolean, token: string \| null, url: string \| null, allowVideoDownload: boolean }` |
| `unpublishVaultFolder` | `id: string` | `void`; revokes the publication, preserving the folder/files |

Pass the **Vault folder ID**. `getVaultFolderPublication` reads state without creating a link; an unpublished folder returns `published: false`, null token/URL and `allowVideoDownload: false`. Missing/inaccessible folders throw. `VaultFolder.publicLinks` controls upload protection, not publication state.

```ts
import { publishVaultFolder } from '@vault/sdk'

export async function publishSelectedFolder(ctx: app.Ctx, folderId: string) {
  const publication = await publishVaultFolder(ctx, folderId)
  return { url: publication.url }
}
```

Return the SDK's `url` (`/app/vault/share~<token>` on the consuming account). It has no expiry and remains stable while published. Repeating publication reuses the same token/URL. A new publication hides the video download button by default (`allowVideoDownload: false`); other files remain downloadable. Explicit `true`/`false` updates this setting without changing the URL; omitting it preserves the existing setting. The option controls the download button, while video viewing remains available.

After publication, verify `published` and the returned URL through `getVaultFolderPublication`; inspect that state first after an uncertain write. After revocation, verify `published: false`. Revoking an unpublished folder is allowed; publishing again after revocation creates a new token. Revocation closes the publication page immediately, while previously issued signed file URLs remain valid until expiry and public originals remain public. Protected content uses temporary shared URLs. **The cover is an exception:** publication fixes a public cover, choosing an image directly in the folder if needed, and makes that image public or creates a public copy. Revocation does not protect the cover again. Independently published descendants/files retain their own links.

## Upload and register in Vault

| Method | Arguments after `ctx` | Result |
| --- | --- | --- |
| `putVaultFile` | `{ hash, name, folderId?, size?, mediaType? }` | New `VaultFile` |
| `putVaultFiles` | Array of the same objects | `VaultFile[]` |

First upload/import content using [Storage](storage.md#upload-flow). Then pass its returned hash to `putVaultFile`; it **registers existing content**, rather than uploading bytes. Use the desired folder ID, or `null` for the caller's root. Names are nonempty, size is bytes, and MIME goes in `mediaType`.

This helper assumes the upload has already completed and the caller has selected the intended folder:

```ts
import { putVaultFile } from '@vault/sdk'

export async function registerUploadedFile(
  ctx: app.Ctx,
  hash: string,
  folderId: string | null,
  name: string,
  mime: string,
) {
  const file = await putVaultFile(ctx, { hash, folderId, name, mediaType: mime })
  return { id: file.id, folderId: file.folderId, hash: file.hash, name: file.name }
}
```

After a CLI upload, use its `file_hash` in this same registration step through `chatium exec`. For a server-generated report, first obtain the stored hash from [text-file creation](storage.md#create-a-text-file-on-the-backend) or [PDF generation](pdf.md), then register it in the selected folder. Persist the resulting Vault ID when later mutations should affect that registration.

`putVaultFile` creates a new model each time; it is not an upsert. `putVaultFiles` processes at most 500 inputs and may have created earlier records before a later error. Split larger imports into bounded batches. After an uncertain result, list the destination and reconcile hashes/IDs before retrying registration. Retain successful upload hashes so failed registration does not cause another content upload.

## Change or delete files

| Method | Arguments after `ctx` | Result |
| --- | --- | --- |
| `renameVaultFile` | `id: string, name: string` | Updated `VaultFile` |
| `moveVaultFile` | `id: string, folderId: string \| null` | `void`; throws on failure |
| `moveVaultFiles` | `ids: string[], folderId: string \| null` | `{ completed: string[], failed: { id, reason }[] }` |
| `deleteVaultFile` | `id: string` | `void`; throws on failure |
| `deleteVaultFiles` | `ids: string[]` | Same batch result |

Mutations use **Vault record IDs**, not hashes or numeric FileService IDs. Renaming changes the Vault display name, not the original storage upload filename. Moving preserves the record ID/hash and checks the destination's access. A move to personal root (`null`) is allowed only for the caller's own file.

Batch move/delete deduplicates IDs and processes at most 500 per call. Inspect **both** `completed` and `failed`; a returned result may be partial success. Retry only failures after inspecting current state.

Delete removes the Vault model and attempts to soft-delete the underlying stored file when no other Vault record references its hash. Storage cleanup can fail independently, so success proves model deletion, not permanent removal of every byte or reference outside Vault. The public Vault SDK has no restore method.

## File picker and video

Use the existing widgets for editorial file selection instead of rebuilding the manager. Their file-manager endpoints require **Staff or higher** and still enforce Vault folder/file access; use the platform upload flow for a visitor's attachment form.

- Vue: `import StorageFilePicker from '@vault/sdk/StorageFilePicker.vue'`. Its `v-model` is `string | string[] | null` (hashes). Props include `multiple`, `kind`, `buttonTitle` and `requirePublic`; `change` emits selected file items.
- Shared JSX: `StorageFilePicker` from `@vault/sdk`, with `ctx`, `value`, `multiple`, `kind`, `name` and optional `formId`. The form receives a hash or hash array.
- Browser code: `await selectStorageFiles(ctx, { multiple?, kind?, selected?, folderId?, requirePublic?, onSelectionChange? })` returns `StorageFileItem[] | null`; `null` means cancelled. Items include hash/name and optional Vault IDs, folder IDs, size, protection and thumbnail URL. Preserve selected hashes when cancelled, and apply `onSelectionChange` when management removes a selected file.

`kind` is `any`, `image`, `video` or `audio`. The manager handles upload, folder browsing, rename, move, deletion and search through Vault. `requirePublic` defaults to **false**, preserving original hashes. Set it only when the intended consumer needs permanent public content: selecting protected files then prompts the user before creating public copies and returns their copy hashes.

For Vue video use `@vault/sdk/StorageVideoPlayer.vue`; for JSX use `StorageVideoPlayer` from `@vault/sdk`. Imperative browser `mountStorageVideoPlayer(element, { hash, ctx?, autoplay?, muted? })` returns player controls; call `destroy()` on unmount. For metadata/backend playback sources see [Video](video.md).

## Completion

An upload to «Хранилище» is complete when both its stored hash and its Vault record in the intended folder are verified. For rename/move, read the record back; for a delete, verify the requested IDs and report any partial failures. Report actual affected IDs/counts and distinguish local type checks from operations verified in the deployed account.
