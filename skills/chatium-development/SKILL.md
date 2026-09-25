---
name: chatium-development
description: "Create and edit Chatium UGC application source: Vue and file-based routes, Heap, auth, storage, jobs, and platform SDK integrations for agents, messaging, automations, payments, analytics, media, CRM, and Google services. Excludes Chatium platform backend development."
---

# Chatium development

Work on the requested application behavior in its existing source. Respond in the user's language. The references contain development conventions as well as platform API details; examples demonstrate mechanisms, not a required application structure.

Before working in a workspace or isolated module, read its `.CHATIUM-LLM.md` if present. When changing architecture, key functionality, or substantial project decisions, create or update that file, integrating information into its existing sections. Do not create a document per component or require documentation changes for a question-only response.

## Runtime and module boundaries

- Backend TypeScript runs in sandboxed V8 with platform modules and packages, without Node.js builtins, filesystem, or shell access. These limits concern application code, not local development tools.
- Schedule deferred backend work with [jobs](jobs.md); server handlers do not use `setTimeout` or `setInterval`.
- Global `app` registers backend routes and jobs; handlers receive `ctx`. Vue has a global `ctx` in both script and template, with no context prop needed.
- Start every module under `shared/` with `// @shared` on its first line. Apply the same directive to non-route TSX helpers imported by Vue. Route files need no marker merely because Vue imports their RouteRefs.
- Keep tables and backend-only operations in server modules. Vue can import components, shared code, RouteRefs, and platform modules with client support, including storage display helpers.

## Read for the task

Load only references covering the change; a link does not require reading unrelated examples.

| Task | Reference |
| --- | --- |
| Create a workspace, build/change Vue UI, or display a QR code | [coding.md](coding.md) |
| Define an endpoint, navigate, call an API, or connect an editor | [routing.md](routing.md) |
| Define/change a table, write records, handle Money or links | [heap.md](heap.md) |
| Filter, paginate, search, aggregate, or batch-load records | [heap-filter.md](heap-filter.md) |
| Enforce access, authenticate, or work with profiles/users | [auth.md](auth.md) |
| Display stored files, upload in an app, or upload local files with the CLI | [storage.md](storage.md) |
| Schedule or cancel background work | [jobs.md](jobs.md) |
| Inspect deployed data, debug server code, or seed data | [exec.md](exec.md) |

## Specialized references

Read the article matching the task directly. Follow links inside it only when their stated condition applies. When a reference requires deployed account data, use [chatium exec](exec.md) from the relevant workspace.

### AI

Agents run conversations with history and tools; their configuration lives in `*.agent.json` source files. In Git accounts, edit their configuration in source; use the agent SDK to run conversations. Standalone `startCompletion` from `@start/sdk` generates text, JSON or media with callback results.

| Task | Reference |
| --- | --- |
| Create or edit an agent or department, use agents in Git branches, run conversations, or connect a transport | [Agents and SDK](references/ai/agents.md) |
| Receive an agent turn's output in your function via `directOutputTool` | [Agent direct output](references/ai/agents.md#directoutputtool) |
| Run standalone generation with callbacks, native tools, images or video | [Generation](references/ai/generation.md) |
| Create an agent tool, a direct-output function, or tools for `startCompletion` | [Tools](references/ai/tools.md) |

### Automations

Automations runs deterministic sequences after events: conditions check state, actions perform operations, and configuration connects the steps. Use it for follow-ups after forms or payments, notifications and scheduled sequences.

| Task | Reference |
| --- | --- |
| Create/change important business actions (forms, orders, payments, sign-ups), or record a business/browser event linked to CRM or automations | [Events](references/automations/events.md) |
| Check a business condition without side effects | [Conditions](references/automations/conditions.md) |
| Create a reusable step with side effects | [Actions](references/automations/actions.md) |
| Inspect registered events, actions, conditions and their schemas | [Registry](references/automations/registry.md) |
| Create, edit, or validate a `.automationConfig.json` sequence; add its management UI when requested | [Configuration](references/automations/configuration.md) |

### Sender

Sender manages customer communications over connected Telegram/VK/email/SMS and other channels. Use its server-side `@sender/sdk` for notifications, broadcasts, deterministic bots, incoming updates and recipient management.

| Task | Reference |
| --- | --- |
| Handle incoming private messages, callback buttons, group updates or raw webhooks | [Webhooks](references/sender/webhooks.md) |
| Send messages, read history, delete messages or call Telegram/VK APIs | [Messaging](references/sender/messaging.md) |
| Connect or select a channel; find or update channels, chats, people, tags or Telegram groups | [Entities](references/sender/entities.md) |
| Pass start context or UTM data, or link CRM contacts to a messenger using deep links | [Buckets and linking](references/sender/linking.md) |
| Find a profile by Telegram username | [Username lookup](references/sender/telegram-username.md) |
| Report on message sends, delivery, reads, clicks, blocks, errors or latency | [Sender analytics](references/sender/analytics.md) |

### Google

`@google/sdk` connects Google accounts to Chatium code. Use it for meetings, calendar synchronization, external Drive files, spreadsheets, documents and presentations.

- Call methods with `(ctx, params)` and check `{ ok, result }`: `result` contains data on success or an error message on failure. Calendar watch/sync methods also return an `error` code.
- `emailAddress` selects the connected account; if omitted, the configured default is used. Calendar also falls back for an invalid email. If no default is configured when fallback is needed, the call fails.
- Calendar requires account authorization and Calendar scopes. Drive/Sheets/Docs/Slides use `non_sensitive` OAuth (master mode).

| Task | Reference |
| --- | --- |
| Find, create, reschedule or delete meetings; add Google Meet or recurrence | [Calendar events](references/google/calendar-events.md) |
| Watch calendar changes, maintain a local copy and renew subscriptions | [Calendar sync](references/google/calendar-sync.md) |
| Read or update files, create folders, or resolve file access through `/app/google` | [Drive](references/google/drive.md) |
| Read or write cells, create spreadsheets or format sheets | [Sheets](references/google/sheets.md) |
| Read, create or edit text documents | [Docs](references/google/docs.md) |
| Create or edit presentations | [Slides](references/google/slides.md) |

### Analytics

Use recorded ClickHouse data for traffic reports, funnels, ad spend, acquisition cost and revenue attribution. These articles describe the schemas and queries through `queryAi` from `@traffic/sdk`.

| Task | Reference |
| --- | --- |
| Analyze visits, devices, pages, time on site or recorded business events | [Traffic](references/analytics/traffic.md) |
| Analyze ad spend, CAC, ROI, ROAS or attribution by source ID/UTM | [Attribution](references/analytics/attribution.md) |

### Other tasks

| Task | Reference |
| --- | --- |
| Build a Vue web chat for support, a shared room, a webinar, or an AI agent | [chat-client.md](references/chat-client.md) |
| Embed a GetCourse form | [getcourse-form.md](references/getcourse-form.md) |
| Push realtime backend updates to a browser over a socket | [realtime.md](references/realtime.md) |
| Build a live UI, choose/limit polling, or eliminate N+1 and repeated requests | [performance.md](references/performance.md) |
| Render a video stored in Chatium | [video.md](references/video.md) |
| Translate UI strings or edit `*.lang.yml` files | [i18n.md](references/i18n.md) |
| Save a customer form and capture its CRM/analytics event | [forms.md](references/forms.md) |
| Create payments (including partial payments), receipts or saved-card charges, or handle payment callbacks | [payments.md](references/payments.md) |
| Refund a payment or handle refund lifecycle hooks | [payment-refunds.md](references/payment-refunds.md) |
| Create a PDF asynchronously from HTML or a URL | [pdf.md](references/pdf.md) |
| Hash, sign, encrypt, or perform other cryptographic work | [crypto.md](references/crypto.md) |
| Serve `robots.txt` or `sitemap.xml` | [seo.md](references/seo.md) |
| Integrate Bitrix24 | [bitrix24.md](references/bitrix24.md) |
| Integrate AmoCRM | [amocrm.md](references/amocrm.md) |
| Reply to Instagram comments, check follows, or send Direct messages through Meta | [meta-instagram.md](references/meta-instagram.md) |
| Add Yandex OAuth to a custom sign-in page | [yandex-oauth.md](references/yandex-oauth.md) |

## API source of truth

Before relying on an API signature, inspect the package's exported `.d.ts` files available in the current project or in a source explicitly provided by the user. References explain behavior, invariants, integration flow, and pitfalls; some also carry a minimal contract where typings were unavailable. If the relevant typings are missing, use that documented contract when present and report that type verification is unavailable. Otherwise request the missing declarations or documentation rather than inventing a signature.

Before finishing, obtain fresh results from the project's available checks (such as typecheck, build, and relevant tests). Fix causes rather than hiding errors with broad `any`, assertions, suppressions, or weakened schemas; narrow, justified assertions are acceptable. Report unavailable checks and unrelated existing failures separately, and distinguish local checks from deployed runtime verification.

## Publishing and branch preview

Publishing changes to `main` publishes them to production. Publishing to any other branch publishes a branch version.

To preview a published branch, set this browser cookie on the account's site. Replace only `<branchName>` with the target branch name:

```
__chtmPreviewMode__=account:<branchName>
```

You can also give user a link directly to the branch preview by appending `?__chtmPreviewMode__=account:<branchName>` to the site's URL.
