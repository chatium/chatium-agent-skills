# Notifications for administrators and staff

Use this mechanism whenever the requested feature must notify account administrators, employees, or other Staff+ users. It applies to **any server-side account code, workspace, application, or plugin**: a landing-page form, a new request or booking, a failed payment, a finished generation, an automation action, or a background job. The user need not say “Store notifications”: the public `@store/sdk` is the standard entry point for staff notifications throughout Chatium, not an API limited to code inside Store.

**Only account staff and administrators (Staff+), never ordinary users or customers.** A customer confirmation or broadcast is separate and uses the relevant Sender/Mailings API. A landing page view, button click, or routine technical operation is not by itself a reason to notify. Notifications complement saving the business record and capturing its CRM event; they do not replace either. Establish the responsible staff user or role before sending.

## Choose the notification API first

- Use `sendNotification` from `@store/sdk`. Store handles the source, history, Inbox projection, enabled delivery channels, and personal preferences. A work queue can coexist with notifications; it is not a replacement when the user requested an alert.
- Do not create or update Feed/Inbox items directly with `@app/feed` or `@app/inbox`, create notification/delivery tables, or send staff alerts directly through e-mail/Sender to recreate this feature. Those lower-level APIs are for tasks that actually implement a chat/Inbox client or the notification subsystem itself.
- If `@store/sdk` or a method is missing from local typings, refresh the project's dependencies/typings or report the missing integration. Do not fall back to a homemade notification system.

## Producer API

Inspect the target project's current `@store/sdk` declarations before coding. Use `sendNotification(ctx, input)` for a form or application event. Store adds or updates an event in the recipient's notification history and delivers it through the enabled channels. The caller's app slug/account code determines the source and stack; do not pass a source or bypass the public SDK to write Store data directly.

Chat and Sender already maintain their own notifications. Do not duplicate their messages by sending them through Store again; Store notification preferences do not control native Chat/Sender messages.

The method returns `{ dispatchId, state: 'queued' | 'skipped', eligibleCount, inboxCount, emailCount, telegramCount, filteredCount, unknownCount }`. `eligibleCount` counts unique recipients with an enabled available channel; the three channel counters count planned deliveries. `queued` means scheduled, not delivered; `skipped` means no eligible recipients remained. It does not promise a native/mobile push.

Inbox and e-mail are enabled by default unless the recipient has changed their preferences. E-mail requires a confirmed staff e-mail address; without one, Inbox still works independently. The sender is `notifications@chatium.ai` on the US cluster and `notifications@chatium.ru` elsewhere. Enqueuing a letter does not prove receipt in the mailbox.

Telegram is a third, independent opt-in channel, off by default. The staff user connects `@chatium_notifications_bot` from **All notifications → Notification settings**, presses Start, returns to Store and confirms the displayed Telegram profile. Only then does the UI unlock Telegram choices; connecting alone does not enable event categories. Store handles this channel too: do not implement a separate bot/webhook or use Sender for these staff alerts. The public settings result includes `telegram` availability, connection status and the current/pending profile; no bot credentials. `channels.telegram` and per-type `telegram` overrides are booleans; an omitted Telegram source setting means false. A saved opt-in cannot deliver without a confirmed active connection. Switching these preferences does not connect/rebind a Telegram profile; that is the user's settings UI flow.

## Send a new event

Call on the server after the business record has been saved. Use a stable, event-specific `id`: the same `id` updates the Inbox history message rather than adding a duplicate; distinct submissions need distinct IDs. A new SDK call with the same ID can still send another e-mail: sent letters cannot be updated, and exactly-once e-mail delivery is not guaranteed. After an ambiguous failure, do not retry blindly: the first call may have succeeded. Reconcile with the recipient before sending another letter. Point `url` to an authorized detail page if one exists. Do not put secrets or unnecessary customer data into the title/text or URL.

```ts
import { sendNotification } from '@store/sdk'

// After successfully saving the application as `request`:
const result = await sendNotification(ctx, {
  id: `request:${request.id}`,
  recipients: { userIds: [responsibleStaffUserId] },
  typeKey: 'request.created',
  title: ctx.t('New request'),
  text: ctx.t('A new request is ready for review'),
  url: `/admin/requests/${request.id}`
})
```

The example works in account code as well as application/plugin server code. Use the real detail route: an account might use `/admin/requests/...`, while an application might use `/app/my-app/requests/...`. Store determines the source from the authenticated caller; do not forge an app identity for account code.

`recipients` accepts either `{ userIds: string[] }` or `{ accountRoles: ('Staff' | 'Admin' | 'Developer' | 'Owner')[] }`, not both in one call. Select only intended Staff+ recipients; Store also excludes Clients, bots, unknown users, and users without a Staff+ account role even when addressed by ID. This filtering is a safeguard, not permission to pass customer IDs. Prefer a known responsible staff user for a personal task; use roles only when everyone in that role should receive it. Role matching is exact: `['Staff']` does not also mean Admin/Developer/Owner. Explicit input accepts at most 500 IDs; after role expansion and Staff+ filtering, before channel preferences, at most 100 recipients may remain. Above 100 the whole call fails with `STORE_NOTIFICATION_RECIPIENT_LIMIT_EXCEEDED`, not a partial send. The protective source limit is 30 calls and 1000 deliveries per minute (`STORE_NOTIFICATION_RATE_LIMIT_EXCEEDED`); Inbox and e-mail each count as a delivery. These codes are in the error message, not a promised `error.code` property. Do not split a large audience into batches just to evade these limits; raise a bulk-delivery requirement separately.

`id`, `title`, and `text` are required; `typeKey` and `url` are optional. Without a `typeKey`, Store uses `general`. A URL may be relative or HTTP(S); prefer an in-app route whose handler checks access. Keep the primary workflow's error semantics explicit: a Store dispatch error should not silently duplicate a saved form on retry. Log a non-critical notification failure, or surface it when delivery is an explicit product requirement.

## Register notification settings

For an application/plugin, register the public `@store/get-notification-types` hook so that it appears in the settings UI and settings SDK. Only applications returning a valid hook response are configurable. An application without this hook can send notifications using defaults, but does not appear in settings. Account/workspace code can call `sendNotification` directly; it does not need to invent an application or register an app hook just to send.

No categories are required. For just the common delivery-channel controls, return an empty group list:

```ts
app.pluginHook('@store/get-notification-types', () => ({
  version: 'v1',
  groups: []
}))
```

Return the object, not `null`, `undefined`, or `{}`. With no `typeKey` on a send, the notification uses `general` and follows the application's channel settings. To expose per-type controls, declare groups whose item keys match the sent `typeKey`. In v1 `defaultEnabled: false` is unsupported; omit it or use `true`. Future/unknown types inherit the recipient's source settings, initially both channels on.

```ts
app.pluginHook('@store/get-notification-types', ctx => ({
  version: 'v1',
  groups: [{
    key: 'requests',
    title: ctx.t('Requests'),
    items: [{
      key: 'request.created',
      title: ctx.t('New requests'),
      defaultEnabled: true
    }]
  }]
}))
```

## Change the current user's settings

Use these server-side `@store/sdk` methods **only at the user's explicit request**. Do not opt users in or out as a hidden part of implementing a form or sending a notification. Both methods require the authenticated real Staff+ user's context in the current account. There is no target `userId` or `accountId`; Clients, bots and anonymous contexts are rejected. An agent tool must retain the requesting human's authorized context, not construct or impersonate one.

```ts
import { getNotificationSettings, updateNotificationSettings } from '@store/sdk'

const settings = await getNotificationSettings(ctx)
// Inspect settings.sources for application keys, titles, schemas and choices;
// settings.workspaces contains the available workspace/account sources.

// User asks: "Disable Pay e-mails, keep Inbox unchanged."
const updated = await updateNotificationSettings(ctx, {
  sourceKey: 'app:pay', // Use a sourceKey returned by getNotificationSettings.
  channels: { email: false }
})

// User asks to re-enable e-mail only for payment refunds.
await updateNotificationSettings(ctx, {
  sourceKey: 'app:pay',
  typeKeys: ['payment.refunded'], // Use keys from the returned schema.
  channels: { email: true }
})
```

- `getNotificationSettings(ctx)` returns `{ sources, workspaces, schemasUnavailable, telegram }`. Each source includes `sourceKey`, title, `channels: { inbox, email, telegram? }`, and per-type `typeOverrides`; applications also have `schema`. If discovery failed, do not assume the missing application's settings were reset.
- `updateNotificationSettings(ctx, { sourceKey, channels, typeKeys? })` applies immediately and returns the resulting `{ sourceKey, channels, typeOverrides }`, the same settings used by the UI. `channels` must contain at least one boolean `inbox`/`email`/`telegram`; omitted channels and unrelated sources remain unchanged.
- Without `typeKeys`, the change applies to the entire source and clears its per-type exceptions **only for the selected channels**, just like the UI's whole-application toggle. With `typeKeys`, it changes only those types, preserving the source defaults and other types. A supplied list must contain 1–100 known type keys; an empty list is an error, not "all". `general` is also supported.
- To reset one type to inheritance, set its selected channel to the source's value. To reset the whole source to defaults, omit `typeKeys` and set `{ inbox: true, email: true, telegram: false }`.
- Unknown/unavailable sources and unknown types are rejected without changing settings. The SDK does not accept recipient lists or edit another person's preferences. It does not send a test notification or confirm an e-mail address. These settings do not control announcements or native Chat/Sender messages.

After a settings change, inspect the returned result or read settings again and tell the user exactly what changed. Do not claim actual mail delivery merely because e-mail was enabled.

Before claiming the notification integration works, typecheck it with the current `@store/sdk` typings. With permission, send one event to an agreed test staff recipient and check their Inbox and/or mailbox: `queued` alone does not prove receipt. Notifications are available to Staff+ in every account with Store. Do not send a real test message without authorization or make this check a condition for accepting unrelated process behavior.

Public reference: [Store SDK and staff notifications](https://dev.chatium.ru/app/knowledge/~/framework-chatium/store-sdk/vozmozhnosti-store-sdk.md), [notification settings and the types hook](https://dev.chatium.ru/app/knowledge/~/framework-chatium/store-sdk/nastrojka-uvedomleniy.md). These pages document the three methods and link to their detailed contracts.
