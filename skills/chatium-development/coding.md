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

A Vue component in server JSX mounts in the browser. Write `<Comp ssr />` to render it on the server too: the page then carries its HTML and the browser hydrates it. Opt in only for a component whose first render is the same on the server and in the browser and holds no other user's data:

- Render the first frame from the component's JSON props and `ctx` only. While it renders on the server, `ctx` is the browser's (`window.__jsx_app_ctx`: lang, account, user, `req` params/query/path) in the component, its composables and the modules they call. Load other data in `onMounted` as above or pass it as props. Keep `setup` synchronous: no top-level `await` in `<script setup>`, no async `setup()`, no `onServerPrefetch`; the server would wait for them, and the browser hydrates without their result. Never call a route's `.run()` in `setup`: on the server it runs the handler directly. `.url()` is fine anywhere. The island's imports run as server code there: Heap and sockets are real, and `toString()` of an imported css or js file throws.
- Keep no mutable state at module level anywhere in the island's imports (`.vue`, `.ts`, composables): a store, cache, counter or `ref()` outside `setup()` lives once per server process, shared by every request and user, so another user's data would reach this user's HTML. Keep state inside `setup()`, or `provide` it from the island's root. Do not write to `globalThis`/`window`, to prototypes of built-in types or to objects of `vue`/`@app/*` modules. Do not read `ctx` at a module's top level.
- Read browser globals (`window`, `document`, `localStorage`, `navigator`, `location`, timers) only in `onMounted`, event handlers and `watch` callbacks without `immediate`, into refs that start from a value the server can render; a `typeof window` check does not make setup code server-safe, and a module the island imports must not touch them at its top level. Keep `Math.random()`, the current date and dates formatted in the local time zone (the server's is UTC) out of rendered output, and `<script>` out of `<template>`: the server renders it, the browser's compiler drops it.
- Child components may come from their `.vue` files or through `.ts` modules (an `index.ts` barrel, a registry, `defineAsyncComponent`); create their VNodes (`h(Comp)`) inside render functions, not at a module's top level. Do not `extends` or `mixins` a component imported from a `.vue` file: on the server the import is a stub without its options; share logic through composables. Declare routes, hooks and Heap tables in `.ts` files, not in `.vue`: the server never registers them from a `.vue`, and a route there makes the island render in the browser only. A component's `__chatiumPrepareVueApp` runs on the server too, so pick the router history by `import.meta.env.SSR` (`true` on the server; only Source Build defines it, as only Source Build renders `ssr`: with the legacy build `import.meta.env` is `undefined`): `createRouter({ history: import.meta.env.SSR ? createMemoryHistory(base) : createWebHistory(base), routes })`. The page's URL and `router.isReady()` are handled for you; keep `window`/`document` out of the hook and the router's guards.
- Only a template's `<Teleport to="body">` renders on the server. Another target (`to="#modals"`), a dynamic `:to`, `h(Teleport)` or a teleport in a slot its component renders more than once makes the island render in the browser only.
- State one island changes and another renders from can hydrate with wrong classes and attributes, because islands mount in no fixed order; render such state after `onMounted`, or keep it in one island.

When the server render fails, the island mounts in the browser as without `ssr`: the browser console gets a `Vue SSR failed` warning naming the component, and the account logs get the same warning with the reason. After adding `ssr`, check the browser console for that warning and hydration mismatch details, and the logs for the reason.

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
