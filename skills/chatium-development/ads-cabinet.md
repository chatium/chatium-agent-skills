# Yandex.Direct and VK Ads through advertising cabinets

Use this reference for live advertising API access from Chatium account or plugin code: inspecting cabinets, campaigns, groups, ads, keywords, statistics, or making a requested change. Import the server-side `@ads-cabinet/sdk`; it uses the cabinets connected in **«Рекламные кабинеты»**, refreshes supported tokens internally, and does not expose credentials. Inside the ads-cabinet source account use `/sdk`.

For reports on already collected expenses, CAC, ROI, ROAS, or revenue attribution, use [Attribution](analytics-attribution.md) and `@traffic/sdk`. Direct API access does not require UTM configuration or automatic ClickHouse collection. Conversely, connecting a cabinet does not backfill collected analytics.

## Prerequisites: check in this order

Run deployment checks only in the **consuming account's** Source Git workspace, following [chatium exec](exec.md). The ads-cabinet development account is not evidence that another account has installed or configured the application. Local module declarations show available signatures, not live installation or credentials.

### 1. Application installed

The Store/application slug is **`adscabinet`**; the SDK source account name is **`ads-cabinet`**. They are different identifiers.

When `@store/sdk` and an Admin account-code caller are available, inspect installation before importing the advertising SDK:

```sh
chatium exec <<'EOF'
import { getPluginInstallInfo } from '@store/sdk'
const info = await getPluginInstallInfo(ctx, 'adscabinet')
return { installed: info.installed, title: info.title, storeUrl: info.storeUrl }
EOF
```

If `installed` is false, stop advertising calls and tell the user, in their language:

> Приложение «Рекламные кабинеты» не подключено к этому аккаунту. Подключите его в Store, затем настройте нужный рекламный кабинет.

Link to the returned `storeUrl`. Do not invent a Store URL. Do not install automatically: this workflow tells the user to connect the application. If they explicitly ask you to install it, follow [Store plugin installation](store-plugin-install.md).

If inspection is unavailable because of caller permissions, missing declarations, or an unavailable build, report that installation could not be verified and direct the user to the account's Store. Do not label that uncertainty as an absent application. An unresolved `@ads-cabinet/sdk` import can also mean stale typings or an SDK version mismatch; check installation separately.

### 2. Platform credentials configured

Once installation is verified, inspect the **requested platform** through its account-list method. For example, for Direct:

```sh
chatium exec <<'EOF'
import { listYandexDirectAccounts } from '@ads-cabinet/sdk'
const { accounts } = await listYandexDirectAccounts(ctx)
return accounts.map(({ id, name, login, status, clients }) => ({ id, name, login, status, clients }))
EOF
```

For VK use `listVkAdsAccounts(ctx)` and inspect `id`, `name`, `status`, `isAgency`, and `clients`. Both methods return `{ accounts }` without tokens. Credentials of one platform do not establish readiness of the other. An account-list call reads stored connection metadata; confirm actual access with a small read for the selected cabinet.

If the platform has no connected cabinet, or its authorization is missing/expired and cannot be refreshed, stop dependent calls and say what to configure. Link to `https://<consuming-account-host>/app/adscabinet`, substituting the actual account host:

- **Direct:** «Настройте доступ к Яндекс.Директу: откройте “Рекламные кабинеты” → “Яндекс.Директ” → “Аккаунты” → “Подключить кабинет”». The UI's **«Приложение для авторизации Chatium»** method opens Yandex OAuth, then accepts the confirmation code in the application. This method does not require the user's own OAuth Client ID/Secret. Use the UI's own-application method only when that is their chosen configuration.
- **VK Ads:** «Настройте реквизиты ВК Рекламы: откройте “Рекламные кабинеты” → “ВК Реклама” → “Аккаунты” → “Подключить кабинет ВК Рекламы”». For an independent cabinet enter the **Client ID and Client Secret** from VK's API access settings in that form. The agency form accepts an existing agency **access token**; Vitamin.tools has its own connection form.

Do not ask the user to paste tokens, secrets, or OAuth confirmation codes into chat or source code. These belong in the application's connection UI. Reconnect a manually supplied agency token when expired; it has no refresh token. Keep authentication separate from advertiser billing/ORD details: do not request an INN merely to read campaigns unless the provider's actual setup error requires it.

### 3. Select the intended cabinet and advertiser

- `accountId` always means the **Heap record `id` returned by the SDK**. It is not a provider user id, OAuth Client ID, campaign id, or application slug.
- Direct also accepts `clientLogin`, the advertiser's login from `accounts[].clients[].login`. Pass it for an agency's client. The `excluded` flag concerns automatic data collection; it is not an API access prohibition.
- VK accepts `accountId` and uses that cabinet's token scope. `clients[]` is agency metadata, not a token selector. Passing a provider `clientId`, username, or Direct-style `clientLogin` cannot switch a VK agency token to a client. If that token cannot access the requested client, connect an appropriate client cabinet/token in the application before continuing; do not silently read the agency's own data.
- Pass an explicit target whenever the intended cabinet is known. Direct otherwise selects the first active cabinet (or the first stored cabinet if none is active). VK permits omission only when exactly one active cabinet is connected and rejects ambiguous selection. When the task does not identify which of several cabinets/clients is intended, ask for that selection.
- A successful empty campaign list or empty statistics is data, not proof of missing credentials. Distinguish an authorization failure from an empty result.

Both SDKs allow account-code callers and these plugin slugs: `adscabinet`, `ads-cabinet`, `traffic`, `dev`, `crm`, `start`, `mailings`, `knowledge`, `agent-process`. `Invalid caller` means the caller is unsupported; reinstalling or re-entering credentials will not resolve it. Use an authorized account handler rather than weakening the caller restriction.

## Yandex.Direct SDK

All methods take `ctx` first and return a Promise. These are named exports from `@ads-cabinet/sdk`.

| Method | Input beyond `ctx` | Result |
| --- | --- | --- |
| `listYandexDirectAccounts` | None | `{ accounts }`: `id`, `name`, `login`, `email`, `status`, `yandexUserId`, `clients`, `lastSyncAt` |
| `listYandexDirectCampaigns` | Optional target plus `ids`, `states`, `statuses`, `types`, `fieldNames`, `extraParams` | `{ campaigns }`, native Direct fields such as `Id`, `Name`, `State` |
| `listYandexDirectAdGroups` | Target; non-empty `campaignIds` or `ids`; optional `statuses`, `fieldNames`, `extraParams` | `{ adGroups }`, including `TrackingParams` |
| `listYandexDirectAds` | Target; non-empty `campaignIds`, `adGroupIds`, or `ids`; optional `states`, `statuses`, `extraParams` | `{ ads }`, including type-specific texts and URLs |
| `listYandexDirectKeywords` | Target; non-empty `campaignIds`, `adGroupIds`, or `ids`; optional `states`, `statuses`, `fieldNames`, `extraParams` | `{ keywords }` |
| `getYandexDirectStats` | Target; `dateFrom`, `dateTo`; optional `groupBy`, `byDay`, `campaignIds`, `fieldNames`, `includeVat` | `{ fields, rows }` |
| `callYandexDirectApi` | Target; `service`, `method`, optional native `params`, `v5` | Native API envelope, usually `{ result }` or `{ error }` |
| `updateYandexDirect` | Target; `service`, optional `action` (default `update`); `items` for updates or `ids` for other actions | `{ results }` with native per-item results |
| `setYandexDirectTrackingParams` | Target; `campaignIds`, `trackingParams` | `{ results, adGroupIds }`; updates every selected campaign's ad groups |

Target means `{ accountId?, clientLogin? }`. `fieldNames` adds to entity-list defaults; in statistics it **replaces** default metric fields. `extraParams` can supply native API parameters such as `UnifiedCampaignFieldNames`; verify their schema for the requested method before using them. Lists paginate internally; never deliberately use an empty filter to mean “none”.

```ts
import { listYandexDirectCampaigns, listYandexDirectAds, getYandexDirectStats } from '@ads-cabinet/sdk'

// accountId and clientLogin were selected from listYandexDirectAccounts.
const target = { accountId, clientLogin }
const { campaigns } = await listYandexDirectCampaigns(ctx, { ...target, states: ['ON'] })
const campaignIds = campaigns.map(campaign => campaign.Id)
if (campaignIds.length) {
  const { ads } = await listYandexDirectAds(ctx, { ...target, campaignIds })
  const { fields, rows } = await getYandexDirectStats(ctx, {
    ...target,
    campaignIds,
    dateFrom: '2026-09-01',
    dateTo: '2026-09-07',
    groupBy: 'campaign',
    byDay: true,
    fieldNames: ['Impressions', 'Clicks', 'Cost'],
  })
}
```

`groupBy` is `campaign` (default), `adgroup`, `ad`, `keyword`, `day`, or `none`; `byDay` adds `Date` to a non-day grouping. Report dates are inclusive `YYYY-MM-DD`. The Reports API can prepare a report asynchronously; the SDK polls internally and may take about a minute. If still preparing, report that condition and retry the read later, without reconnecting a healthy cabinet. For recurring collection use [jobs](jobs.md), not timers in application handlers.

Report money is returned in ordinary currency units, not micros, in the advertiser's currency; do not assume RUB for every cabinet. `includeVat` defaults to true. Ordinary entity/raw API money fields still use the provider's native units; the report behavior does not redefine them. Missing numeric report cells can be `null`. IDs of 16+ digits are preserved as strings; pass them through as received and never coerce them to `Number`.

For a requested rename:

```ts
import { updateYandexDirect } from '@ads-cabinet/sdk'
const { results } = await updateYandexDirect(ctx, {
  accountId, clientLogin,
  service: 'campaigns',
  items: [{ Id: campaignId, Name: newName }],
})
```

`service` is `campaigns`, `adgroups`, `ads`, or `keywords`; non-update actions are `suspend`, `resume`, `archive`, `unarchive`, `delete`, using `ids`. Additional methods (including creation, bids, moderation, dictionaries) use `callYandexDirectApi(ctx, { accountId, clientLogin, service, method, params })`. It defaults to v501; `v5: true` selects v5. HTTP success is not per-item success: inspect `Errors`/`Warnings` in update results and a raw response's `error` envelope.

## VK Ads SDK

This is **ВК Реклама at ads.vk.com** (API v2/v3). It does not cover the old `api.vk.com/method/ads.*` cabinet or VK messenger methods from `@sender/sdk`. Verify that the deployed SDK exports these methods before use; an older Direct-only version needs an application update, not new credentials.

| Method | Input beyond `ctx` | Result |
| --- | --- | --- |
| `listVkAdsAccounts` | None | `{ accounts }`: safe cabinet metadata and normalized `clients` |
| `listVkAdsCampaigns` | Optional `VkAdsList` | `{ campaigns }`, VK `ad_plans` |
| `listVkAdsAdGroups` | Optional `VkAdsList` | `{ adGroups }`, VK `ad_groups` |
| `listVkAdsBanners` | Optional `VkAdsList` plus `adGroupId` | `{ banners }`, VK advertisements |
| `getVkAdsStats` | `accountId?`, `type`, non-empty `ids`, `dateFrom`, `dateTo`, optional `period`, `metricGroups` | Native statistics object with `items` and any provider totals |
| `callVkAdsApi` | `accountId?`, `path`, optional `method`, `query`, `body` | Native JSON response; HTTP 204 returns `null` |

`VkAdsList` accepts `accountId`, `ids`, `statuses`, `fieldNames`, `extraParams`, `limit`, `offset`. `ids`, `statuses`, and `fieldNames` must be non-empty when provided. Entity lists fetch all pages by default; `limit` (1–250) explicitly selects **one page**, with `offset` defaulting to 0. `fieldNames` adds fields to defaults. `extraParams` carries native VK query parameters; the SDK owns pagination. Reads exceeding 100 pages fail instead of silently returning a partial list; narrow filters or paginate explicitly.

```ts
import { listVkAdsAccounts, listVkAdsCampaigns, listVkAdsBanners, getVkAdsStats } from '@ads-cabinet/sdk'

const { accounts } = await listVkAdsAccounts(ctx)
// Select accountId from accounts; do not use accounts[].clientId as accountId.
const { campaigns } = await listVkAdsCampaigns(ctx, { accountId, statuses: ['active'] })
const ids = campaigns.map(campaign => campaign.id)
if (ids.length) {
  const statistics = await getVkAdsStats(ctx, {
    accountId,
    type: 'ad_plans',
    ids,
    dateFrom: '2026-09-01',
    dateTo: '2026-09-07',
    period: 'day',
    metricGroups: ['base'],
  })
}
const { banners } = await listVkAdsBanners(ctx, { accountId, adGroupId })
```

Statistics `type` is `ad_plans`, `ad_groups`, `banners`, or `users`; `period` is `day` (default) or `summary` over the specified date range. `metricGroups` defaults to `['base']`, sent as the v2 `metrics` query. The response preserves native VK nesting (`items`, `rows`, `total`, metric groups). `base.shows`, `base.clicks`, and decimal-string `base.spent` are not flattened into Direct's columns or multiplied by cabinet expense/VAT settings. Provider date-range/id-count limits still apply; narrow or batch the read according to the actual API response rather than silently clipping dates or dropping ids.

For raw reads or an explicitly requested update:

```ts
import { callVkAdsApi } from '@ads-cabinet/sdk'
const user = await callVkAdsApi(ctx, { accountId, path: 'v2/user.json' })

// Run only for a rename requested by the user.
const result = await callVkAdsApi(ctx, {
  accountId,
  path: `v2/ad_plans/${campaignId}.json`,
  method: 'POST',
  body: { name: newName },
})
```

`path` is a relative v2/v3 `.json` path without `/api/`, a URL, query string, or encoded path. OAuth/token endpoints are unavailable. `method` defaults to `GET`; `POST`, `PUT`, `PATCH`, and `DELETE` are supported. Supply native query values through `query` and an object through `body`; GET does not accept a body. Headers and the API origin are controlled by the plugin. VK entity updates use POST on the resource-id endpoint; do not translate Direct action names into assumed VK endpoints. For additional fields/endpoints, inspect the current [VK API documentation](https://ads.vk.com/doc/api) and project typings before constructing the payload.

## Errors, writes, and verification

- Missing application → tell the user to connect the Store application. Missing cabinet/credentials → give the relevant platform setup path. Unknown `accountId` → correct cabinet selection. Multiple active VK cabinets → select explicitly. Unsupported caller → fix the execution context. Permission/rate-limit/invalid-field failures → report the actual API issue; these do not prove missing credentials.
- VK refreshes supported cabinet tokens internally and retries a GET once after `401 expired_token`. A supplied agency token requires reconnection. Raw VK writes are never automatically retried. Direct throws HTTP/service errors in list/update methods; raw Direct calls can return an `error` envelope. Preserve this distinction when handling results.
- Reads do not authorize renames, budget changes, UTM rewrites, suspend/resume, creation, moderation, or deletion. `setYandexDirectTrackingParams` overwrites every affected group's template; do not call it just to inspect UTM. For a requested write, use the selected cabinet and exact entity ids, inspect provider item errors, then read the changed state. After a timeout or ambiguous failure, read before any retry because the first write may have applied.
- Keep SDK calls in backend account/plugin code. Expose a UI through an appropriately protected account RouteRef; do not send the SDK or credentials to Vue or an unauthenticated endpoint.
- Check imports and payloads with available generated typings and `chatium typecheck <changed-paths>`. A local typecheck does not prove deployed readiness. A live check uses the consuming account's successful Source Build and selected cabinet. Report local checks and runtime verification separately.

The minimal contract here follows the public `sdk/index.ts`, `sdk/yandexDirectTypes.ts`, and `sdk/vkAdsTypes.ts` and their private `app.function` handlers in ads-cabinet. Prefer the installed version's exported declarations when they differ; never invent VK exports for a Direct-only deployment.

When extending this SDK, retain thin exported wrappers over live `app.function` handlers and register new entrypoints in `chatium.publicFiles`. `chatium generate-typings` uses public-only emission: mark intended public exports with `/** @public */`, or a deliberately public entrypoint with `/** @public-all */`. Inspect the generated declarations for the actual methods; a successful command that emits only `export {}` does not expose an SDK contract. Keep tokens, tables and authentication helpers in private plugin modules.
