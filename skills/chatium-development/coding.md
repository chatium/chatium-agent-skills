# Workspaces and Vue UI

## Workspace convention

Put a new independent feature in its own folder at the account root, using a Latin kebab-case slug. Change existing functionality in its current workspace and preserve its metadata. Create directories only for code the task needs.

For a new workspace, include `.dir.json` with its display name:

```json
{
  "name": "Items",
  "params": { "startWorkspaceAppearance": "ai" }
}
```

Include `.workspace.json` containing `{}` as the workspace boundary marker. Use two-space indentation, `.ts` for shared logic, relative imports for application files, and package imports for platform modules.

## UI convention

Use platform-provided Vue 3 single-file components. Put each major section and reusable element in its own component; TSX supplies the route and HTML shell. Import and render the components from TSX; Chatium handles their browser initialization. Use one file-based TSX route per page rather than a client-side router or pathname parsing. The root page presents the application's main content. Keep the requested pages consistent without adding unrelated navigation, profile, or administrative pages.

For new Vue code, use `<script setup lang="ts">` with typed macros where needed: `defineProps<{ title: string }>()`, `defineEmits<{ save: [id: string] }>()`, and `defineExpose<{ focus: () => void }>({ focus })` for an existing `focus` function. Do not rewrite existing components solely to adopt this convention. Create new UI in the task's language; preserve an existing interface's localization.

Page shells import the workspace's common `Styles` from `styles.tsx` and render it in `<head>`; create that module once if absent. Interactive code belongs in Vue. html-jsx cannot serialize functions in attributes or children; inline scripts in the shell's `<head>` are for trusted analytics/tracking snippets that need to run at page load.

```tsx
// styles.tsx
import { jsx } from '@app/html-jsx'

export function Styles() {
  return <>
    <script src="/s/static/lib/tailwind.3.4.16.min.js"></script>
    <link href="/s/static/lib/fontawesome/6.7.2/css/all.min.css" rel="stylesheet" />
  </>
}
```

The following UI assumes an existing GET `itemsListRoute` exported from `api/items/list.ts`, returning `{ id: string; title: string }[]`. Substitute the application's actual route and fields; the example does not require creating a table. API definitions and navigation use [RouteRefs](routing.md#route-references).

```tsx
// index.tsx
import { jsx } from '@app/html-jsx'
import { Styles } from './styles'
import ItemsPage from './pages/ItemsPage.vue'

export const indexPageRoute = app.get('/', async () => (
  <html>
    <head>
      <title>Items</title>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <Styles />
    </head>
    <body><ItemsPage /></body>
  </html>
))
```

```vue
<!-- pages/ItemsPage.vue -->
<template>
  <main>
    <h1>Items</h1>
    <ItemsList />
  </main>
</template>

<script setup lang="ts">
import ItemsList from '../components/ItemsList.vue'
</script>
```

```vue
<!-- components/ItemsList.vue -->
<template>
  <section aria-label="Items" :aria-busy="loading">
    <p v-if="loading" role="status">Loading...</p>
    <div v-else-if="error" role="alert">
      <p>{{ error }}</p>
      <button type="button" @click="load">Try again</button>
    </div>
    <p v-else-if="!items.length">No items yet.</p>
    <ul v-else><li v-for="item in items" :key="item.id">{{ item.title }}</li></ul>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { itemsListRoute } from '../api/items/list'

const items = ref<{ id: string; title: string }[]>([])
const loading = ref(true)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    items.value = await itemsListRoute.run(ctx)
  } catch {
    error.value = 'Could not load items.'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>
```

Server-loaded data can instead be passed as serializable props. For a bounded dataset, add pagination when needed using the application's API and [Heap query limits](heap-filter.md#filters-and-pagination).

## QR codes

Display a QR image with `<img :src="qrUrl" alt="QR code">`, computing its URL from the current text:

```ts
const qrUrl = 'https://app.msk.chatium.io/api/1.0/qr?text=' + encodeURIComponent(text)
```

The text is sent to that external service. Do not use this endpoint for secrets or other data that must not leave the application.
