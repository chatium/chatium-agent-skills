# Store notifications for account staff

When implementing a meaningful event that an account operator should act on or know about—such as a submitted lead form, a new application, a completed long-running job, or a failed payment—include a Store Inbox notification in the server-side success path. **This API is only for notifying account staff and administrators (Staff+). Never use it as a mailing or notification channel for ordinary users or customers.** A landing page view, button click, or routine technical operation is not by itself a reason to notify. This complements the business/CRM event; it does not replace saving the record or capturing the event. If the responsible staff member or role cannot be established from the task and existing data, ask rather than guessing an audience.

## Producer API

Inspect the target project's current `@store/sdk` declarations before coding. Use `sendNotification(ctx, input)` for a form or application event. Store creates or updates a message in its managed Feed and projects a stack into Inbox. The caller's app slug/account code determines the source and stack; do not pass a source or write Store's Inbox/Feed directly.

Chat and Sender already maintain their own Feed/Inbox items. Store reads those existing Inbox items without asking the producer to send them again.

The method returns `{ dispatchId, state: 'queued' | 'skipped', eligibleCount, filteredCount, unknownCount }`. `queued` means scheduled, not delivered. `skipped` means no eligible recipients remained. It does not promise an external/mobile push.

## Send a new event

Call on the server after the business record has been saved. Use a stable, event-specific `id`: retrying the same event with the same `id` updates rather than adding a duplicate; distinct submissions need distinct IDs. Point `url` to an authorized detail page if one exists. Do not put secrets or unnecessary customer data into the title/text or URL.

```ts
import { sendNotification } from '@store/sdk'

// After successfully saving the application as `request`:
const result = await sendNotification(ctx, {
  id: `request:${request.id}`,
  recipients: { userIds: [responsibleStaffUserId] },
  typeKey: 'request.created',
  title: ctx.t('New request'),
  text: ctx.t('A new request is ready for review'),
  url: `/app/my-app/requests/${request.id}`
})
```

`recipients` accepts either `{ userIds: string[] }` or `{ accountRoles: ('Staff' | 'Admin' | 'Developer' | 'Owner')[] }`, not both in one call. Select only intended Staff+ recipients; Store also excludes Clients, bots, unknown users, and users without a Staff+ account role even when addressed by ID. This filtering is a safeguard, not permission to pass customer IDs. Prefer a known responsible staff user for a personal task; use roles only when everyone in that role should receive it. Explicit input accepts at most 500 IDs; after role expansion/filtering at most 100 recipients may remain. Above 100 the whole call fails with `STORE_NOTIFICATION_RECIPIENT_LIMIT_EXCEEDED`, not a partial send. The protective source limit is 30 calls and 1000 deliveries per minute (`STORE_NOTIFICATION_RATE_LIMIT_EXCEEDED`). Do not split a large audience into batches just to evade these limits; raise a bulk-delivery requirement separately.

`id`, `title`, and `text` are required; `typeKey` and `url` are optional. Without a `typeKey`, Store uses `general`. A URL may be relative or HTTP(S); prefer an in-app route whose handler checks access. Keep the primary workflow's error semantics explicit: a Store dispatch error should not silently duplicate a saved form on retry. Log a non-critical notification failure, or surface it when delivery is an explicit product requirement.

## Optional notification settings

When users need per-type controls, register `@store/get-notification-types` in the producer application. Its keys must match the `typeKey` values sent above. Store calls this hook when opening settings, not on every send. In v1 all types must have `defaultEnabled: true`; unknown types are also enabled by default.

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

Before claiming the integration works, refresh stale `@store/sdk` typings/dependencies if the method is missing, typecheck the producer, and send one event on a test account. Check the Store Inbox and the account/job logs: dispatch may be queued or filtered. The Store Inbox entry in the shared sidebar has a separate rollout; verify that it is enabled for the target account (currently the UI rollout is limited to `sandbox-r`).
