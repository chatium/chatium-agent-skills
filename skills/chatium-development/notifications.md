# Notifications for administrators and staff

Use this mechanism whenever the requested feature must notify account administrators, employees, or other Staff+ users. It applies to **any server-side account code, workspace, application, or plugin**: a landing-page form, a new request or booking, a failed payment, a finished generation, an automation action, or a background job. The user need not say “Store notifications”: the public `@store/sdk` is the standard entry point for staff notifications throughout Chatium, not an API limited to code inside Store.

**Only account staff and administrators (Staff+), never ordinary users or customers.** A customer confirmation or broadcast is separate and uses the relevant Sender/Mailings API. A landing page view, button click, or routine technical operation is not by itself a reason to notify. Notifications complement saving the business record and capturing its CRM event; they do not replace either. Establish the responsible staff user or role before sending.

## Choose the notification API first

- Use `sendNotification` from `@store/sdk`. Store handles the source, history, notification center, enabled delivery channels, and personal preferences. A work queue can coexist with notifications; it is not a replacement when the user requested an alert.
- Do not create or update platform messages directly with `@app/feed` or `@app/inbox`, create notification/delivery tables, or send staff alerts directly through e-mail/Sender to recreate this feature. Those lower-level APIs are for tasks that actually implement a chat client or the notification subsystem itself.
- If `@store/sdk` or a method is missing from local typings, refresh the project's dependencies/typings or report the missing integration. Do not fall back to a homemade notification system.

## Producer API

Inspect the target project's current `@store/sdk` declarations before coding. Use `sendNotification(ctx, input)` for a form or application event. Store adds or updates an event in the recipient's notification history and delivers it through the enabled channels. Account code **must** pass `source: { key, title? }`; a plugin may omit it to use the whole plugin as the source, or pass it to create a separately configurable source. The namespace always comes from the authenticated caller, not input. Never write Store data directly.

Chat and Sender already maintain their own notifications. Do not duplicate their messages by sending them through Store again; Store notification preferences do not control native Chat/Sender messages.

The method returns `{ dispatchId, state: 'queued' | 'skipped', eligibleCount, inboxCount, emailCount, telegramCount, filteredCount, unknownCount }`. `eligibleCount` counts unique recipients with an enabled available channel; the three channel counters count planned deliveries. `queued` means scheduled, not delivered; `skipped` means no eligible recipients remained. It does not promise a native/mobile push.

All four channel preferences (`inbox`, `email`, `telegram`, `app`) are enabled by default unless the recipient has changed them. The `inbox` channel is labeled **Notifications** / **Уведомления** in the UI; keep its technical key unchanged. Native app delivery is not implemented yet and its control is hidden; `app` currently stores only a preference. E-mail requires a confirmed staff e-mail address; without one, the notification center still works independently. The sender is `notifications@chatium.ai` on the US cluster and `notifications@chatium.ru` elsewhere. Enqueuing a letter does not prove receipt in the mailbox.

### E-mail prerequisites

Before implementing an e-mail-only request or diagnosing missing staff mail, check `ctx.user.confirmedEmail` for the requesting user (for another authorized staff recipient, check their confirmed identity through the users API). An address in extended profile/CRM data is not proof of confirmation. `getNotificationSettings` returns channel preferences, not e-mail verification; `channels.email: true` does not mean the address exists. Without a confirmed address Store skips e-mail, while other available channels can still return `queued`; `emailCount: 0` is expected.

If the user says “send notifications to name@example.org”, the SDK has no arbitrary-address parameter. Show the currently confirmed address, if any, and explain that the requested address must be added and confirmed by the user in **their profile**, `/app/users/me` in the current account (`ctx.account.url('/app/users/me')`). Do not claim it was changed, set contact data to simulate verification, or send the staff alert through Sender/direct mail instead. After the user confirms the address, enable the requested source/type's e-mail preference only if requested; then test with permission. Example response: “Для писем нужен подтверждённый адрес профиля. Добавьте и подтвердите его в своём профиле, затем включите e-mail в настройках доставки”. Do not launch a delivery-debugging workflow or blindly resend before this check.

### Telegram connection

Telegram is an independent channel, enabled by default but unavailable until connected. The staff user connects the notification bot from **All notifications → Delivery settings**, presses Start, returns to Store and confirms the displayed Telegram profile. Confirmation makes delivery available for already enabled categories; explicit opt-outs remain unchanged. Store handles this channel too: do not implement a separate bot/webhook or use Sender for these staff alerts. The public settings result includes `telegram` availability, connection status and the current/pending profile; no bot credentials. `channels.telegram` and per-type `telegram` overrides are booleans; an omitted Telegram source setting means true. An enabled preference cannot deliver without a confirmed active connection. Switching these preferences does not connect/rebind a Telegram profile; that is the user's settings UI flow.

## Send a new event

Call on the server after the business record has been saved. Use a stable, event-specific `id`: the same `id` updates the notification history message rather than adding a duplicate; distinct submissions need distinct IDs. A new SDK call with the same ID can still send another e-mail: sent letters cannot be updated, and exactly-once e-mail delivery is not guaranteed. After an ambiguous failure, do not retry blindly: the first call may have succeeded. Reconcile with the recipient before sending another letter. Point `url` to an authorized detail page if one exists. Do not put secrets or unnecessary customer data into the title/text or URL.

```ts
import { sendNotification } from '@store/sdk'

// Reuse this definition in the notification settings manifest below.
const notificationSource = { key: 'requests', title: 'Заявки' }

// After successfully saving the application as `request`:
const result = await sendNotification(ctx, {
  id: `request:${request.id}`,
  source: notificationSource,
  recipients: { userIds: [responsibleStaffUserId] },
  typeKey: 'request.created',
  title: ctx.t('New request'),
  text: ctx.t('A new request is ready for review'),
  url: `/admin/requests/${request.id}`
})
```

The example works in account code as well as application/plugin server code. Use the real detail route: an account might use `/admin/requests/...`, while an application might use `/app/my-app/requests/...`. `source.key` is a local stable key, not the fully qualified `sourceKey` returned by the settings SDK. Account sources and plugin sources are isolated; different plugins cannot select each other's namespace. Missing `source.key` in account code throws `STORE_NOTIFICATION_SOURCE_KEY_REQUIRED`. Keys start with a Latin letter and contain only letters, digits, `.`, `_`, `-`, up to 80 characters. Optional `source.title` is up to 120 characters; without it the local key is shown (default plugin source: its slug). Reuse the source key/title in the manifest and each send so settings and notification labels match. Do not infer identity from a workspace title, folder or URL.

`recipients` accepts either `{ userIds: string[] }` or `{ accountRoles: ('Staff' | 'Admin' | 'Developer' | 'Owner')[] }`, not both in one call. Select only intended Staff+ recipients; Store also excludes Clients, bots, unknown users, and users without a Staff+ account role even when addressed by ID. This filtering is a safeguard, not permission to pass customer IDs. Prefer a known responsible staff user for a personal task; use roles only when everyone in that role should receive it. Role matching is exact: `['Staff']` does not also mean Admin/Developer/Owner. Explicit input accepts at most 500 IDs; after role expansion and Staff+ filtering, before channel preferences, at most 100 recipients may remain. Above 100 the whole call fails with `STORE_NOTIFICATION_RECIPIENT_LIMIT_EXCEEDED`, not a partial send. The protective source limit is 30 calls and 1000 deliveries per minute (`STORE_NOTIFICATION_RATE_LIMIT_EXCEEDED`); each enabled available channel counts as a delivery. These codes are in the error message, not a promised `error.code` property. Do not split a large audience into batches just to evade these limits; raise a bulk-delivery requirement separately.

`id`, `title`, and `text` are required; `typeKey` and `url` are optional. Without a `typeKey`, Store uses `general`. A URL may be relative or HTTP(S); prefer an in-app route whose handler checks access. Keep the primary workflow's error semantics explicit: a Store dispatch error should not silently duplicate a saved form on retry. Log a non-critical notification failure, or surface it when delivery is an explicit product requirement.

### Recipient language

Store uses each recipient's profile language, falling back to Russian on the main cluster and English on US. System e-mail/Telegram labels are translated independently of the producer's language. For multilingual event content, optionally supply up to 10 `translations` variants:

```ts
// Alongside the required fallback title/text in sendNotification input:
translations: {
  ru: { title: 'Новая заявка', text: 'Заявка готова к обработке' },
  en: { title: 'New request', text: 'A request is ready for review' }
}
```

Each variant has the same title/text limits as the fallback (160/4000 characters). Selection is exact language code, then base language (`ru-RU` → `ru`), then the required fallback strings. Language keys accept `-` or `_`, are case-insensitive, and duplicate normalized keys are rejected. The selected content is used for all enabled channels for that recipient and is saved in their history; changing the profile language does not translate existing history. Store never auto-translates arbitrary text. A producer's `ctx.t` call before dispatch only renders in that caller's language, not in all recipients' languages.

## Register notification settings

Use **the same static declaration in account/workspace code and plugins**: `app.manifest('@store/notification-types', notificationTypesManifest, value)`. Import `notificationTypesManifest` from `@store/sdk`; passing it as the second argument type-checks `{ version, key?, title?, items?, groups? }`. The optional exported `NotificationTypesDeclaration` type can annotate shared declaration data. Account declarations require `key`; plugin declarations may omit it for the default plugin source. Only valid declared sources appear in settings, before their first notification. A source without a manifest can send using defaults, but is not configurable. Do not create a fake plugin for account code.

No categories are required. For common delivery controls in account code:

```ts
import { notificationTypesManifest } from '@store/sdk'

const notificationSource = { key: 'requests', title: 'Заявки' }
app.manifest('@store/notification-types', notificationTypesManifest, {
  ...notificationSource,
  version: 'v1',
  groups: []
})
```

The declaration contains only static data; for build-time restrictions and general SDK declaration rules, read [Manifests](manifests.md). Notification declarations need no RouteRefs.

Pass the object, not `null`, `undefined`, or `{}`. Use optional top-level `items` for a **flat list**, `groups` for collapsible groups, or both. Group/item keys are stable and have the same format as a source key. Item keys must be unique across the entire schema and match the sent `typeKey`. At most 20 groups and 100 types total; a declared group must not be empty. Duplicate source keys in the same caller namespace are invalid; declare distinct keys for separate sources. Without `typeKey`, the send uses `general`. `defaultEnabled: false` is unsupported; omit it or use `true`. Unknown types inherit the source channel settings.

Titles accept plain strings or static `t(...)` markers from `@app/i18n`. Store resolves markers for the settings viewer; do not use `ctx.t` inside a manifest. The send API's `source.title` still requires a ready string, e.g. `{ key: 'requests', title: ctx.t('Requests') }`, not the marker tuple.

```ts
import { t } from '@app/i18n'
import { notificationTypesManifest } from '@store/sdk'

app.manifest('@store/notification-types', notificationTypesManifest, {
  version: 'v1',
  key: 'requests', // Optional for a plugin; required for account code.
  title: t('Requests'),
  items: [{ key: 'request.created', title: t('New requests') }],
  groups: [{
    key: 'processing',
    title: t('Processing'),
    items: [{
      key: 'request.completed',
      title: t('Completed requests'),
      defaultEnabled: true
    }]
  }]
})
```

## Change the current user's settings

Use these server-side `@store/sdk` methods **only at the user's explicit request**. Do not opt users in or out as a hidden part of implementing a form or sending a notification. Both methods require the authenticated real Staff+ user's context in the current account. There is no target `userId` or `accountId`; Clients, bots and anonymous contexts are rejected. An agent tool must retain the requesting human's authorized context, not construct or impersonate one.

```ts
import { getNotificationSettings, updateNotificationSettings } from '@store/sdk'

const settings = await getNotificationSettings(ctx)
// Inspect settings.sources for application keys, titles, schemas and choices;
// settings.workspaces contains registered account/workspace sources with the same schema.

// User asks: "Disable Pay e-mails, keep the notification center unchanged."
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

- `getNotificationSettings(ctx)` returns `{ sources, workspaces, schemasUnavailable, telegram }`. Both arrays have the same entry contract: `sourceKey`, title, `channels: { inbox, email, telegram, app }`, per-type `typeOverrides`, and `schema` with `items`/`groups` arrays. `sources` contains plugin sources; `workspaces` contains account sources, not an inferred workspace inventory. Use returned `sourceKey` unchanged in settings calls; use the local `source.key` when sending. If discovery failed, do not assume missing settings were reset.
- `updateNotificationSettings(ctx, { sourceKey, channels, typeKeys? })` applies immediately and returns the resulting `{ sourceKey, channels, typeOverrides }`, the same settings used by the UI. `channels` must contain at least one boolean `inbox`/`email`/`telegram`/`app`; omitted channels and unrelated sources remain unchanged. `app` does not activate native push delivery yet.
- Without `typeKeys`, the change applies to the entire source and clears its per-type exceptions **only for the selected channels**, just like the UI's whole-application toggle. With `typeKeys`, it changes only those types, preserving the source defaults and other types. A supplied list must contain 1–100 known type keys; an empty list is an error, not "all". `general` is also supported.
- To reset one type to inheritance, set its selected channel to the source's value. To reset the whole source to defaults, omit `typeKeys` and set `{ inbox: true, email: true, telegram: true, app: true }`.
- Unknown/unavailable sources and unknown types are rejected without changing settings. The SDK does not accept recipient lists or edit another person's preferences. It does not send a test notification or confirm an e-mail address. These settings do not control announcements or native Chat/Sender messages.

After a settings change, inspect the returned result or read settings again and tell the user exactly what changed. Do not claim actual mail delivery merely because e-mail was enabled.

Before claiming the notification integration works, typecheck it with the current `@store/sdk` typings. With permission, send one event to an agreed test staff recipient and check their notification center and/or mailbox: `queued` alone does not prove receipt. Notifications are available to Staff+ in every account with Store. Do not send a real test message without authorization or make this check a condition for accepting unrelated process behavior.

Public reference: [Store SDK and staff notifications](https://dev.chatium.ru/app/knowledge/~/framework-chatium/store-sdk/vozmozhnosti-store-sdk.md), [notification settings and the typed manifest](https://dev.chatium.ru/app/knowledge/~/framework-chatium/store-sdk/nastrojka-uvedomleniy.md). These pages document the declaration, the three methods and their detailed contracts.
