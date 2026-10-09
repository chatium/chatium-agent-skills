---
name: chatium-development
description: "Create and edit Chatium account and plugin code: Vue and file-based routes, Heap, auth, storage, jobs, and platform SDK integrations for agents, messaging, mailings, automations, payments, analytics, Yandex.Direct and VK Ads, media, CRM, and Google services. Excludes Chatium platform backend development."
---

# Chatium development

Work on the requested account or plugin behavior in its existing source. Respond in the user's language. The references contain development conventions as well as platform API details; examples demonstrate mechanisms, not a required project structure.

## Scope gate: ask before inspecting

**First action after loading this skill for an ambiguous new task:** ask one concise question that identifies the project, source of the action, or recipient list. Then wait. Until the answer, do not list or read repository files, business knowledge, or live account data, and do not run `chatium exec`. You may read general platform references and explain the general mechanism. For “send one email to existing customers,” ask where the recipient list comes from; do not inspect the current branch or Sender first. For “tag new leads,” ask which lead source or project is meant. A current branch, one visible process, and generic words like “lead” are not confirmation.

Use `processes` only for a confirmed change to an existing process or a genuinely multi-stage customer journey. A standalone page, mailing, or automation uses the relevant development references without creating a process. Once the user identifies the target, inspect only the relevant source and data.

Before working in a workspace or isolated module, read its `.CHATIUM-LLM.md` if present. When changing architecture, key functionality, or substantial project decisions, create or update that file, integrating information into its existing sections. Do not create a document per component or require documentation changes for a question-only response.

## Runtime and module boundaries

- Backend TypeScript runs in sandboxed V8 with platform modules and packages, without Node.js builtins, filesystem, or shell access. These limits concern application code, not local development tools.
- Imported plugin SDK function bodies are cached in consuming accounts. Keep exported wrappers thin: forward arguments to a stable `app.function` RouteRef. Put validation, parsing, policy and business logic inside that live plugin handler or its private server helpers, so plugin fixes do not require rebuilding every consumer. Preserve existing route paths and compatible arguments.
- Schedule deferred backend work with [jobs](jobs.md); server handlers do not use `setTimeout` or `setInterval`.
- Global `app` registers backend routes and jobs; handlers receive `ctx`. Vue has a global `ctx` in both script and template, with no context prop needed.
- Start every module under `shared/` with `// @shared` on its first line. Apply the same directive to non-route TSX helpers imported by Vue. Route files need no marker merely because Vue imports their RouteRefs.
- Keep tables and backend-only operations in server modules. Vue can import components, shared code, RouteRefs, and platform modules with client support, including storage display helpers.

## Read for the task

Load only references covering the change; a link does not require reading unrelated examples. Resolve linked filenames from the directory containing this `SKILL.md`.
For an actionable business event with a known Staff+ recipient—such as a submitted lead, a completed job, or a failed payment—implement a Store Inbox notification alongside the business event; use [Store notifications](store-notifications.md). This mechanism is only for account staff and administrators, never for ordinary users or customers. If the staff audience is unclear, establish it before sending.

| Task | Reference |
| --- | --- |
| Show or open a page, letter, letter folder, knowledge article, or automation; present the result of an edit | [preview.md](preview.md) |
| Create a workspace, build/change Vue UI, or display a QR code | [coding.md](coding.md) |
| Define an endpoint, navigate, call an API, or connect an editor | [routing.md](routing.md) |
| Define/change a table, write records, handle Money or links | [heap.md](heap.md) |
| Filter, paginate, search, aggregate, or batch-load records | [heap-filter.md](heap-filter.md) |
| Enforce access, authenticate, or work with profiles/users | [auth.md](auth.md) |
| Display stored files, upload in an app, or upload local files with the CLI | [storage.md](storage.md) |
| Schedule or cancel background work | [jobs.md](jobs.md) |
| Inspect deployed data, debug server code, or seed data | [exec.md](exec.md) |
| Read platform logs for an account with an available Source Git checkout | [Account logs](account-logs.md) |
| Inspect Store plugin permissions or install a plugin through `chatium exec` | [Store plugin installation](store-plugin-install.md) |
| Notify account staff about a meaningful application event (a new lead, completed job, failed payment, etc.) | [Store notifications](store-notifications.md) |

## Specialized references

Read the article matching the task directly. Follow links inside it only when their stated condition applies. When a reference requires deployed account data, use [chatium exec](exec.md) from the relevant workspace.

### AI

Agents run conversations with history and tools; their configuration lives in `*.agent.json` source files. In Git accounts, edit their configuration in source; use the agent SDK to run conversations. Standalone `startCompletion` from `@start/sdk` generates text, JSON or media with callback results.

| Task | Reference |
| --- | --- |
| Create or edit an agent or department, use agents in Git branches, run conversations, or connect a transport | [Agents and SDK](ai-agents.md) |
| Validate a standalone agent JSON, choose knowledge, tools, model or limits | [Agent config](ai-agent-config.md) |
| Plan reminders, repeat follow-ups and stop autonomous work | [Agent autonomy](ai-autonomy.md) |
| Distinguish model instructions, chain context, CRM and knowledge access | [Agent context and knowledge](ai-context-and-knowledge.md) |
| Route a shared channel to one agent, hand off a customer, or verify routing in preview | [Agent routing and handoff](ai-routing-and-handoff.md) |
| Receive an agent turn's output in your function via `directOutputTool` | [Agent direct output](ai-agents.md#directoutputtool) |
| Run standalone generation with callbacks, native tools, images or video | [Generation](ai-generation.md) |
| Create an agent tool, a direct-output function, or tools for `startCompletion` | [Tools](ai-tools.md) |

### Automations

Automations runs deterministic sequences after events: conditions check state, actions perform operations, and configuration connects the steps. Use it for follow-ups after forms or payments, notifications and scheduled sequences.

| Task | Reference |
| --- | --- |
| Create/change important business actions (forms, orders, payments, sign-ups), or record a business/browser event linked to CRM or automations | [Events](automations-events.md) |
| Check a business condition without side effects | [Conditions](automations-conditions.md) |
| Create a reusable step with side effects | [Actions](automations-actions.md) |
| Inspect registered events, actions, conditions and their schemas | [Registry](automations-registry.md) |
| Create, edit, or validate a `.automationConfig.json` sequence; add its management UI when requested | [Configuration](automations-configuration.md) |
| Resolve stable automation IDs, inspect execution logs or work with Git branches and historical IDs | [Automations SDK](automations-sdk.md) |

### Sender

Sender manages customer communications over connected Telegram/VK/email/SMS and other channels. Use its server-side `@sender/sdk` for notifications, broadcasts, deterministic bots, incoming updates and recipient management.

| Task | Reference |
| --- | --- |
| Handle incoming private messages, callback buttons, group updates or raw webhooks | [Webhooks](sender-webhooks.md) |
| Send messages, read history, delete messages or call Telegram/VK APIs | [Messaging](sender-messaging.md) |
| Connect or select a channel; find or update channels, chats, people, tags or Telegram groups | [Entities](sender-entities.md) |
| Pass start context or UTM data, or link CRM contacts to a messenger using deep links | [Buckets and linking](sender-linking.md) |
| Find a profile by Telegram username | [Username lookup](sender-telegram-username.md) |
| Report on message sends, delivery, reads, clicks, blocks, errors or latency | [Sender analytics](sender-analytics.md) |

### Mailings

Read [Mailings](mailings.md) when creating or changing letters. It distinguishes new letters in Mailings storage from existing legacy YAML letters inside a `type: emails` process workspace; preserve the latter when extending that workspace. For stored letters, use the Mailings SDK to read a letter by path or send it from a template.

### Google

`@google/sdk` connects Google accounts to Chatium code. Use it for meetings, calendar synchronization, external Drive files, spreadsheets, documents and presentations.

- Call methods with `(ctx, params)` and check `{ ok, result }`: `result` contains data on success or an error message on failure. Calendar watch/sync methods also return an `error` code.
- `emailAddress` selects the connected account; if omitted, the configured default is used. Calendar also falls back for an invalid email. If no default is configured when fallback is needed, the call fails.
- Calendar requires account authorization and Calendar scopes. Drive/Sheets/Docs/Slides use `non_sensitive` OAuth (master mode).

| Task | Reference |
| --- | --- |
| Find, create, reschedule or delete meetings; add Google Meet or recurrence | [Calendar events](google-calendar-events.md) |
| Watch calendar changes, maintain a local copy and renew subscriptions | [Calendar sync](google-calendar-sync.md) |
| Read or update files, create folders, or resolve file access through `/app/google` | [Drive](google-drive.md) |
| Read or write cells, create spreadsheets or format sheets | [Sheets](google-sheets.md) |
| Read, create or edit text documents | [Docs](google-docs.md) |
| Create or edit presentations | [Slides](google-slides.md) |

### Advertising APIs

Use the server-side `@ads-cabinet/sdk` for live Yandex.Direct and VK Ads API access through connected cabinets. Before API calls, check that the Store application `adscabinet` is installed and the selected platform's cabinet is authorized. If the application is absent, tell the user to connect **«Рекламные кабинеты»**; if authorization or credentials are missing, tell them exactly what to configure in `/app/adscabinet`. Read [Advertising cabinets](ads-cabinet.md) for these checks, account selection, SDK methods, and error handling. An API integration request does not authorize installing the application or changing advertising campaigns.

### Analytics

Use recorded ClickHouse data for traffic reports, funnels, ad spend, acquisition cost and revenue attribution. These articles describe the schemas and queries through `queryAi` from `@traffic/sdk`.

| Task | Reference |
| --- | --- |
| Analyze visits, devices, pages, time on site or recorded business events | [Traffic](analytics-traffic.md) |
| Analyze ad spend, CAC, ROI, ROAS or attribution by source ID/UTM | [Attribution](analytics-attribution.md) |

### Other tasks

| Task | Reference |
| --- | --- |
| Build a Vue web chat for support, a shared room, a webinar, or an AI agent | [chat-client.md](chat-client.md) |
| Embed a GetCourse form | [getcourse-form.md](getcourse-form.md) |
| Push realtime backend updates to a browser over a socket | [realtime.md](realtime.md) |
| Build a live UI, choose/limit polling, or eliminate N+1 and repeated requests | [performance.md](performance.md) |
| Render a video stored in Chatium | [video.md](video.md) |
| Translate UI strings or edit `*.lang.yml` files | [i18n.md](i18n.md) |
| Save a customer form and capture its CRM/analytics event | [forms.md](forms.md) |
| Create payments, receipts or saved-card charges; list/count attempts or payments; handle payment callbacks or import historical payments | [payments.md](payments.md) |
| Accept bonuses, tokens or an internal wallet balance through Pay; implement quote/debit/refund adapters or delegated balance charges | [internal-balance-payments.md](internal-balance-payments.md) |
| Implement an external Pay provider, register full or partial transfers, or issue provider-side receipts | [payment-providers.md](payment-providers.md) |
| Refund a payment or handle refund lifecycle hooks | [payment-refunds.md](payment-refunds.md) |
| Create a PDF asynchronously from HTML or a URL | [pdf.md](pdf.md) |
| Hash, sign, encrypt, or perform other cryptographic work | [crypto.md](crypto.md) |
| Serve `robots.txt` or `sitemap.xml` | [seo.md](seo.md) |
| Integrate Bitrix24 | [bitrix24.md](bitrix24.md) |
| Integrate AmoCRM | [amocrm.md](amocrm.md) |
| Reply to Instagram comments, check follows, or send Direct messages through Meta | [meta-instagram.md](meta-instagram.md) |
| Add Yandex OAuth to a custom sign-in page | [yandex-oauth.md](yandex-oauth.md) |

## API source of truth

Before relying on an API signature, inspect the package's exported `.d.ts` files available in the current project or in a source explicitly provided by the user. References explain behavior, invariants, integration flow, and pitfalls; some also carry a minimal contract where typings were unavailable. If the relevant typings are missing, use that documented contract when present and report that type verification is unavailable. Otherwise request the missing declarations or documentation rather than inventing a signature.

Before finishing, obtain fresh results from the project's available checks (such as typecheck, build, and relevant tests). Fix causes rather than hiding errors with broad `any`, assertions, suppressions, or weakened schemas; narrow, justified assertions are acceptable. Report unavailable checks and unrelated existing failures separately, and distinguish local checks from deployed runtime verification.

Run `chatium typecheck <paths...>` on the folders or files you changed: it checks them and their imports, using less memory than a bare `chatium typecheck` of the whole account. When a change alters an export, add every folder that imports it.

## Show the result

When the user asks to see an entity, or after completing a change to a page,
letter, letter series, knowledge article, or automation, open its rendered UI in the
available preview panel. Follow [preview.md](preview.md) for the actual
entity routes, branch selection, and Mailings folder limitations. Give a
link as well; do not claim the preview opened unless the tool succeeded.
Process maps and their presentation milestones belong to the `processes`
skill. For an agent page use the route in [preview.md](preview.md).

## Publishing and branch preview

Publishing changes to `main` publishes them to production. Publishing to any other branch publishes a branch version.

To preview a published branch, set this browser cookie on the account's site. Replace only `<branchName>` with the target branch name:

```
__chtmPreviewMode__=account:<branchName>
```

For a direct link, set the `__chtmPreviewMode__` query parameter to `account:<branchName>` using URL encoding. Preserve existing query parameters and put the query before any `#` fragment; see [preview.md](preview.md).
