# Receive staff notifications in code (preview)

Use this reference when the user wants a programmable notification destination,
not just sending an event. This transport is in Store preview; verify that the
target SDK provides `notificationHandlersManifest` and `channels.handlers` before
using it. Do not emulate it with direct Feed/Inbox subscriptions or a custom queue.

The producer still uses `sendNotification` and passes structured event attributes
in `data` (see [Notifications](notifications.md#event-metadata)). The recipient
chooses which registered functions to invoke. Registration alone must never
subscribe staff or change their preferences. This is optional personal delivery,
not mandatory business processing: staff can turn it off.

## Register a destination

Define the app.function in one file:

```ts
// notificationReceiver.ts
import { AccessDeniedError } from '@app/errors'
import type { NotificationHandlerInput } from '@store/sdk'

export const receiveNotification = app.function(
  '/receive',
  async (ctx, event: NotificationHandlerInput, caller) => {
    if (caller.type !== 'plugin' || caller.appSlug !== 'store') {
      throw new AccessDeniedError('Store only')
    }
    // event.user is the recipient, NOT ctx.user.
    // Validate your domain permissions and event.notification.data here.
    // Deduplicate a consequential side effect by event.deliveryId.
  }
)
```

Import its RouteRef from a **different file** into a static declaration:

```ts
// notificationManifest.ts
import { t } from '@app/i18n'
import { notificationHandlersManifest } from '@store/sdk'
import { receiveNotification } from './notificationReceiver'

app.manifest('@store/notification-handlers', notificationHandlersManifest, {
  handlers: [{
    key: 'process-request',
    title: t('Process request notifications'),
    description: t('Run the selected request workflow'),
    function: receiveNotification
  }]
})
```

Same syntax for account code and plugins. Read [Manifests](manifests.md) for
build-time restrictions: no ctx, database queries, async execution, inline
app.function declaration/callback or HTTP URL. A same-file local RouteRef is not
an imported constant and is not supported by the static compiler.

Each declaration has 1–20 handlers. Keys start with a Latin letter and contain
letters, digits, `.`, `_`, `-`, up to 80 characters. Required title is up to 120,
optional description up to 500, each a string or static `t(...)` marker. The SDK
exports `NotificationHandlersDeclaration` for shared declaration data.
Keys are unique within the declaring account/plugin. Full IDs are isolated as
`app:<slug>:handler:<key>` or `account:<accountId>:handler:<key>`.

Do not confuse this destination manifest with `notificationTypesManifest`,
which declares event sources and their settings categories. Registering a handler
does not create an event source or automatically receive all notifications.

## Select for the current user

Only at the staff user's explicit request, use `getNotificationSettings(ctx)`:
`handlers` returns `{ id, title, description?, provider }`, without RouteRefs.
`handlersUnavailable` indicates discovery trouble: preserve existing selections.
Let the user choose known IDs and source/type, then:

```ts
await updateNotificationSettings(ctx, {
  sourceKey: selectedSourceKey, // Returned by settings.sources/workspaces.
  channels: { handlers: selectedHandlerIds }
})
```

`channels.handlers` replaces the complete selection (maximum 10 IDs). Default is
`[]`; registration never auto-enables it. An omitted field leaves it untouched.
Per-type `typeOverrides[typeKey].handlers` inherits when absent; explicit `[]`
opts out. Source-wide patches clear only handler exceptions. The four boolean
channels keep their defaults and independent settings. New unknown IDs are
rejected; previously saved removed choices can remain or be cleared. Do not pass
functions/URLs in preferences or set another user's choices.

## Callback semantics

`NotificationHandlerInput` contains:

- `deliveryId`, stable for retries of this dispatch to this user/handler;
- `handlerId`, the fully qualified selected destination;
- `account: { id, name, url }`;
- **`user: { id, accountRole, language }`**, the real Staff+ recipient;
- `notification: { id, dispatchId, issuedAt, source, typeKey, title, text, url?, data? }`.

`notification.id` is the producer ID; title/text use the recipient's language
variant, while data is unchanged JSON metadata. The invocation is background work:
do not require the recipient's session or derive their identity from ctx.user.
Validate source, type and data before domain-specific actions; arbitrary data is
not authorization. Never echo an event into the same notification channel without
a clear stopping condition.

Any resolved function return counts as success; its value is ignored. Throw for
retryable failure. Store retries only failed user/handler pairs, at most five
attempts with 5/30/120/300-second delays, rechecking role/opt-out/registration.
Removed handlers are skipped. This is not exactly-once: an effect may happen before
a timeout. Deduplicate your own effect by deliveryId. A fresh sendNotification call,
even with the same notification.id, produces new delivery IDs.

`sendNotification.handlerCount` counts scheduled invocations, not confirmed
execution. Each handler/user pair charges the normal delivery rate limit.
Handler-only delivery is supported; other channels remain independent.

Typecheck against generated SDK declarations. With user permission, verify on a
test Staff+ profile: catalogue discovery, two selected handlers, source/type
inheritance, explicit empty opt-out, actual background payload, and retry of only
one failing handler with unchanged deliveryId. Do not send real e-mail/Telegram
or alter production preferences merely to test this transport.
