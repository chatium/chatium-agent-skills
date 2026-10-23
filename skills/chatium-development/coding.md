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

Use platform-provided Vue 3 single-file components. Put each major section and reusable element in its own component; TSX supplies the route and HTML shell. Import and render the components from TSX; Chatium handles their browser initialization. Use one file-based TSX route per page rather than a client-side router or pathname parsing. The root page presents the application's main content. To make a workspace folder the homepage of one or more account domains, use [`.chatiumrc` `indexPath`](routing.md#domain-homepages-with-chatiumrc). Keep the requested pages consistent without adding unrelated navigation, profile, or administrative pages.

For new Vue code, use `<script setup lang="ts">` with typed macros where needed: `defineProps<{ title: string }>()`, `defineEmits<{ save: [id: string] }>()`, and `defineExpose<{ focus: () => void }>({ focus })` for an existing `focus` function. Do not rewrite existing components solely to adopt this convention. Create new UI in the task's language; preserve an existing interface's localization.

Page shells import the workspace's common `Styles` from `styles.tsx` and render it in `<head>`; create that module once if absent, with the workspace's [Tailwind entry](#tailwind). Interactive code belongs in Vue. html-jsx cannot serialize functions in attributes or children; inline scripts in the shell's `<head>` are for trusted analytics/tracking snippets that need to run at page load.

```tsx
// styles.tsx
import { jsx } from '@app/html-jsx'
import AppCss from './app.css'

export function Styles() {
  return <>
    <AppCss />
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

Vue components render on the server, then hydrate in the browser, so the first render must be the same in both. Read browser globals (`window`, `document`, `localStorage`, `navigator`, `location`, timers) only in `onMounted`, event handlers and `watch` callbacks without `immediate`, into refs that start from a value the server can render; a `typeof window` check does not make setup code server-safe. Keep `Math.random()` and the current date out of rendered output. A component whose setup, computed values or template-called functions reach a browser global renders in the browser only, and the push names it with a `vue.ssr-excluded` warning and the code to move. Mount a deliberately browser-only component as `<Comp client:only />`.

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue'

const path = ref('')
onMounted(() => {
  path.value = window.location.pathname
})
</script>
```

## Tailwind

The build generates Tailwind CSS v3: any `.css` file with a top-level `@tailwind` directive is an entry, and `<AppCss />` links the generated stylesheet like any CSS module.

```css
/* app.css */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap');
@config "./tailwind.config.json";
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer components {
  .btn-primary {
    @apply rounded-lg bg-primary px-4 py-2 text-white;
  }
}
```

`tailwind.config.json`:

```json
{
  "theme": {
    "extend": {
      "colors": { "primary": "#2563eb" },
      "fontFamily": { "sans": ["Inter", "sans-serif"] }
    }
  },
  "safelist": ["bg-green-100", "bg-red-100"]
}
```

- The CSS gets the classes written as complete strings in the `.ts`, `.tsx` and `.vue` modules that pages linking the entry import, directly or transitively. Importing a module only for a RouteRef (`.url()`, `.run(ctx)`) does not count, so every page shell renders `<Styles />` itself. CSS, JSON and Markdown files are not scanned.
- Do not assemble class names (`'bg-' + color`); map values to complete class strings. Put classes that arrive from data (Heap, API responses) in `safelist`.
- The config is JSON only, linked by `@config` with a path relative to the CSS file; without it the default theme applies. A JS config, inline `tailwind.config = {…}`, plugins and `content` have no effect here.
- `@import` accepts only external URLs; put local CSS into the entry itself. v4 syntax (`@import "tailwindcss"`, `@theme`, `@source`, `@plugin`) is not processed.
- Use `@apply` in the entry, not in Vue `<style>` or `<style type="text/tailwindcss">`.
- An unknown `@apply` class, a missing or invalid config, or a local `@import` fails that file's build, leaving its pages without Tailwind styles; fix the error before reporting the page ready.
- Do not load the Tailwind browser script (`tailwind.3.4.16.min.js`, `cdn.tailwindcss.com`) on pages that link an entry.

## Google Fonts

The build bundles Google Fonts into the page and serves them from the account's own domain. It reads the stylesheet URL while building, so write the URL whole:

- In the Tailwind entry: `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap');`, as above.
- In a page shell: `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap" />`, the `href` a string literal or a template of string `const`s declared in the same module.
- Request only the weights and the italic the design renders (`ital,…@1,400` only when italics show): every style in the URL is preloaded with the page.

## QR codes

Display a QR image with `<img :src="qrUrl" alt="QR code">`, computing its URL from the current text:

```ts
const qrUrl = 'https://app.msk.chatium.io/api/1.0/qr?text=' + encodeURIComponent(text)
```

The text is sent to that external service. Do not use this endpoint for secrets or other data that must not leave the application.
