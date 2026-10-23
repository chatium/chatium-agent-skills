# Typed static manifests

Use a manifest when an SDK asks account code or a plugin to declare static capabilities or settings. The same `app.manifest(...)` call works in both; provider identity is supplied by the platform.

## Declare against the SDK's type

Import the manifest handle from the owning SDK and pass it as the second argument. Keep the manifest name a literal string matching that handle:

```ts
import { notificationTypesManifest } from '@store/sdk'

app.manifest('@store/notification-types', notificationTypesManifest, {
  version: 'v1',
  key: 'requests',
  title: 'Requests'
})
```

For notification-specific keys, groups, localization and delivery, read [Notifications](notifications.md#register-notification-settings).

Declare at module top level. Values are extracted at build time: use static literals, objects, arrays and supported imported constants. There is no `ctx`, request, current user, database access, HTTP request, arbitrary callback, `async` or `await`. Do not calculate the declaration from runtime account data or wrap it in a handler. Updating its static data requires publishing new source.

If the SDK schema accepts a RouteRef, **import an existing exported `app.function` constant from another file**. A same-file local function reference is not supported by the static extractor. Do not declare `app.function(...)` inside manifest data, pass an HTTP route or substitute a callback. The declared function may perform runtime work when called later; the manifest itself does not execute it. Do not invent function fields that the owning schema does not define. [Notification handlers](notification-handlers.md#register-a-destination) provide a two-file example.

## Define a type in an SDK

When implementing the SDK that owns the contract, export its typed handle:

```ts
/** @public */
export const featureManifest = app.manifest.type('@my-app/features', s => ({
  key: s.string(),
  title: s.string(),
  action: s.functionRouteRef(s.any(), s.any()).optional()
}))
```

Only the owner reads its declarations; consumers import the handle to type-check declarations, not to enumerate other providers:

```ts
// In the owning application's ordinary server handler, not in a declaration:
const declarations = await featureManifest.getManifests(ctx, { validate: true })
for (const { provider, value } of declarations) {
  // provider.type is 'account' or 'plugin'; plugin provider has appSlug/appId.
  // Enforce the owning SDK's namespace, duplicate-key and authorization rules.
}
```

The envelope is `{ provider, value }`; the declaring file path is not part of its public identity. Regenerate published SDK typings after changing a manifest type and check a consumer against those generated declarations, including nested fields.
