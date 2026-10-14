# Routes and RouteRefs

## Route convention and inputs

Define one route at `/` per file. The file path determines the page or API address; `index.tsx` is its folder's entry page. Use ordinary filenames and pass variable inputs through query/body schemas. Bracket names such as `[id].tsx` are literal filenames, not dynamic parameters.

Use GET for reads and POST for mutations. Heap IDs are strings: get/update/delete take an unchanged ID in `.query()`, while editable fields belong in `.body()`. Schema callbacks validate and infer `req.query` and `req.body`.

This update uses the [Items table](heap.md#table-definition) and an [account-role check](auth.md#access-checks):

```ts
// api/items/update.ts
import { requireAccountRole } from '@app/auth'
import Items from '../../tables/items.table'

export const itemUpdateRoute = app.post('/')
  .query(s => ({ id: s.string() }))
  .body(s => ({ title: s.string().min(1) }))
  .handle(async (ctx, req) => {
    requireAccountRole(ctx, 'Staff')
    const item = await Items.update(ctx, { id: req.query.id, title: req.body.title })
    return { id: item.id, title: item.title }
  })
```

The schema builder also supports `number`, `boolean`, `enum`, `array`, `object`, `.optional()`, and numeric bounds. `app.get('/', handler)` and `app.post('/', handler)` are shorthand for handlers without typed inputs. JSON APIs return serializable data; page handlers return an [HTML shell](coding.md#ui-convention).

For one-off inspection, debugging, or seed, use [`chatium exec`](exec.md) instead of adding a temporary route.

## Domain homepages with `.chatiumrc`

To serve a folder's entry page at a domain's `/`, edit `indexPath` in the `.chatiumrc` at the account source root. Merge it into the existing configuration, preserving other settings. The file accepts JSON5; these examples use strict JSON.

For one homepage on every domain connected to the account:

```json
{
  "indexPath": "website"
}
```

Create `website/index.tsx` with its page handler at `/`, following the [HTML shell convention](coding.md#ui-convention). The value is an account-relative folder path, without a leading `/`; the folder resolves to its index page. A specific page path such as `website/landing` is also supported.

For different homepages by domain:

```json
{
  "indexPath": {
    "example.com": "website",
    "help.example.com": "support",
    "*": "website"
  }
}
```

Here `example.com/` serves `website/index.tsx`, and `help.example.com/` serves `support/index.tsx`. Keys are exact hostnames, without a scheme, port, or URL path. `*` selects the homepage for any hostname without its own entry; list `www.example.com` separately when it needs a different mapping. Domains must already be connected to the account; this setting selects their homepages.

The account's root index page (`index.tsx`, another supported code index, or `index.html`) takes precedence over `indexPath`. Inspect an existing root index before relying on domain mappings, and resolve any conflict within the requested scope. If no homepage is selected or the selected page cannot be resolved, Chatium continues its normal start-page fallback.

`indexPath` selects the handler for `/` internally, keeping the browser at the domain root. Other pages retain their file-based paths: `website/about.tsx` is still `/website/about`. Use RouteRefs for navigation. Verify `/` on each mapped hostname and a fallback hostname, using the intended published or [preview branch](SKILL.md#publishing-and-branch-preview).

## Route references

Export a route when another file uses it. Import it directly from that file, including in Vue; route objects are not page props.

| Need | Call |
| --- | --- |
| Navigate to an application page | `pageRoute.url()` |
| Include a record ID | `pageRoute.query({ id }).url()` |
| Get a local path, without the domain | `pageRoute.path()`; chain `.query(...)` when needed |
| Call a GET API | `getRoute.query({ id }).run(ctx)`; omit `.query()` if unnecessary |
| Call a POST API | `postRoute.query({ id }).run(ctx, body)` |

RouteRefs provide the account/workspace prefix on the frontend and backend. Use page RouteRefs for links and API RouteRefs for data calls; navigation follows file-based pages. Platform authentication endpoints are covered in [auth.md](auth.md#sign-in-and-sign-out), and file-service uploads in [storage.md](storage.md#upload-flow).

## Server redirects

In a server handler, return `ctx.resp.redirect(...)`. For an internal destination, import its exported RouteRef rather than constructing an application path:

```ts
// Inside a handler; destinationPageRoute is the imported page RouteRef.
return ctx.resp.redirect(destinationPageRoute.url())
```

## Editing flow

For an editor, implement only the operations the task needs:

1. Authorize the page and load the selected record on the server using a read that includes records the editor may manage. A supplied but missing ID is an error; only the absence of an edit ID opens creation.
2. Pass editable, serializable data to Vue as props. Use the loaded ID to distinguish editing from creation.
3. Save new records through a create handler and existing records through an update handler. A failed update stays an error and never falls back to creation. Enforce permissions in each handler even when the page already checks them.
4. Delete through a separate POST handler using the same query-ID convention. Navigate through the destination page's RouteRef after a successful operation.

For publication states, keep [public and administrative reads](heap-filter.md#public-and-administrative-reads) separate. Return display-ready values and plain editable numbers for [Money](heap.md#money-and-serialization).
