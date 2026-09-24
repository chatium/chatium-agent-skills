# Расходы на рекламу и атрибуция

Используй для расходов по источникам, CAC, ROI, ROAS и сквозной аналитики. Запросы выполняются через `queryAi` из `@traffic/sdk`; ответ содержит `rows`. При связывании расходов с событиями прочитай [правила выбора `relatedEvents`/`eventUrl`](traffic.md#подбор-адресов-urlpath-событий) и [колонки событий](traffic.md#структура-базы-данных).

## Расходы на рекламу и сквозная аналитика

Расходы по рекламным источникам лежат в `chatium_ai.traffic_source_statistics`. Эту таблицу заполняет внешний модуль рекламных кабинетов через ClickHouse. Не импортируй его SDK и не создавай свои таблицы расходов, если задача только про аналитику.

Важные поля таблицы расходов:

- `dt` — дата статистики.
- `platform` — рекламная платформа: `YD` (Yandex Direct), `VK` (VK Ads), `Tg` (Telegram Ads), `Av` (Avito). В старых данных может встретиться `VKold`.
- `expense` — расход в рублях.
- `expense_eur`, `exchange_eur_to_rub`, `currency` — валютные поля.
- `clicks`, `views`, `impressions`, `goals` — рекламные метрики источника.
- `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term` — UTM-метки расходной строки.
- `funnel`, `landing`, `client_id` — дополнительные группировки.
- `traffic_source_id` — технический ID расходной строки/источника, например `YD_{client_id}_{adId}`, `VK_{client_id}_{bannerId}`, `Tg_{cabinetId}_{adId}`, `Av_{client_id}_{itemId}`. Не показывай его пользователю как основное название источника.
- `action_param1_int = 1` означает проблему с UTM-разметкой или нераспознанную настройку UTM.
- `action_param1_mapstrstr` хранит человекочитаемые метаданные источника: `campaign_name`, `adgroup_name`, `ad_name`, `banner_name`, `ad_title`, `ad_category`, `city`, `url` и похожие поля.

Для сквозной аналитики основной ключ атрибуции — `access_log.matched_traffic_source_ids`, если он заполнен. Связывай его с `traffic_source_statistics.traffic_source_id` через `has(matched_traffic_source_ids, traffic_source_id)`, `ARRAY JOIN` или предварительную агрегацию по ID. Мы считаем этот платформенный матчинг доверенным: он уже нормализует UTM/CLRT/внутренний словарь в технический ID расходной строки.

Если `matched_traffic_source_ids` пустой или недоступен, fallback — связывать расходы и визиты по `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term` и `dt`/периоду. В ответе явно помечай такую аналитику как менее надёжную, потому что UTM fallback может терять детализацию, смешивать кампании и создавать риск many-to-many.

Для пользовательского отчета не выводи голый `traffic_source_id`. Показывай `platform`, UTM/funnel/landing и readable label из `action_param1_mapstrstr`:

```sql
coalesce(
  nullIf(action_param1_mapstrstr['ad_name'], ''),
  nullIf(action_param1_mapstrstr['banner_name'], ''),
  nullIf(action_param1_mapstrstr['ad_title'], ''),
  nullIf(action_param1_mapstrstr['campaign_name'], ''),
  nullIf(action_param1_mapstrstr['adgroup_name'], ''),
  traffic_source_id
) AS source_label
```

Для CAC, ROI, ROAS и окупаемости сначала агрегируй события/выручку и расходы в отдельных CTE по дате, UTM или source id, и только потом соединяй агрегаты. Не делай сырой many-to-many JOIN визитов, событий и расходов.

Пример расходов по платформам и UTM:

```sql
SELECT
  dt,
  platform,
  utm_source,
  utm_medium,
  utm_campaign,
  sum(expense) AS expense_rub,
  sum(clicks) AS clicks,
  sum(views) AS views
FROM chatium_ai.traffic_source_statistics
WHERE is_deleted = 0
  AND dt BETWEEN toDate('2026-06-01') AND toDate('2026-06-30')
GROUP BY dt, platform, utm_source, utm_medium, utm_campaign
ORDER BY dt, platform, expense_rub DESC
```

Пример основной связки расходов и событий через `matched_traffic_source_ids`:

```sql
WITH
  events_by_source AS (
    SELECT
      dt,
      traffic_source_id,
      uniqExactIf(uid, url = '{lead_registered_event_url}') AS leads,
      uniqExactIf(uid, url = '{order_paid_event_url}') AS paid_users,
      sumIf(coalesce(action_param1_float, 0), url = '{order_paid_event_url}') AS revenue
    FROM chatium_ai.access_log
    ARRAY JOIN matched_traffic_source_ids AS traffic_source_id
    WHERE dt BETWEEN toDate('2026-06-01') AND toDate('2026-06-30')
      AND traffic_source_id != ''
      AND url IN ('{lead_registered_event_url}', '{order_paid_event_url}')
    GROUP BY dt, traffic_source_id
  ),
  spend_by_source AS (
    SELECT
      dt,
      traffic_source_id,
      any(platform) AS platform,
      coalesce(
        nullIf(any(action_param1_mapstrstr['ad_name']), ''),
        nullIf(any(action_param1_mapstrstr['banner_name']), ''),
        nullIf(any(action_param1_mapstrstr['ad_title']), ''),
        nullIf(any(action_param1_mapstrstr['campaign_name']), ''),
        nullIf(any(action_param1_mapstrstr['adgroup_name']), ''),
        traffic_source_id
      ) AS source_label,
      sum(expense) AS expense_rub
    FROM chatium_ai.traffic_source_statistics
    WHERE is_deleted = 0
      AND dt BETWEEN toDate('2026-06-01') AND toDate('2026-06-30')
    GROUP BY dt, traffic_source_id
  )
SELECT
  e.dt,
  'matched_traffic_source_ids' AS attribution_quality,
  s.platform,
  s.source_label,
  e.traffic_source_id,
  e.leads,
  e.paid_users,
  e.revenue,
  s.expense_rub,
  round(s.expense_rub / nullIf(e.leads, 0), 2) AS cac,
  round(e.revenue / nullIf(s.expense_rub, 0), 4) AS roas
FROM events_by_source e
LEFT JOIN spend_by_source s
  ON s.dt = e.dt
 AND s.traffic_source_id = e.traffic_source_id
ORDER BY e.dt, s.expense_rub DESC
```

Пример fallback-связки расходов и событий по UTM, если `matched_traffic_source_ids` недоступен:

```sql
WITH
  events_by_utm AS (
    SELECT
      dt,
      ifNull(utm_source, '') AS utm_source,
      ifNull(utm_medium, '') AS utm_medium,
      ifNull(utm_campaign, '') AS utm_campaign,
      ifNull(utm_content, '') AS utm_content,
      ifNull(utm_term, '') AS utm_term,
      uniqExactIf(uid, url = '{lead_registered_event_url}') AS leads,
      uniqExactIf(uid, url = '{order_paid_event_url}') AS paid_users,
      sumIf(coalesce(action_param1_float, 0), url = '{order_paid_event_url}') AS revenue
    FROM chatium_ai.access_log
    WHERE dt BETWEEN toDate('2026-06-01') AND toDate('2026-06-30')
      AND url IN ('{lead_registered_event_url}', '{order_paid_event_url}')
    GROUP BY dt, utm_source, utm_medium, utm_campaign, utm_content, utm_term
  ),
  spend_by_utm AS (
    SELECT
      dt,
      ifNull(utm_source, '') AS utm_source,
      ifNull(utm_medium, '') AS utm_medium,
      ifNull(utm_campaign, '') AS utm_campaign,
      ifNull(utm_content, '') AS utm_content,
      ifNull(utm_term, '') AS utm_term,
      sum(expense) AS expense_rub
    FROM chatium_ai.traffic_source_statistics
    WHERE is_deleted = 0
      AND dt BETWEEN toDate('2026-06-01') AND toDate('2026-06-30')
    GROUP BY dt, utm_source, utm_medium, utm_campaign, utm_content, utm_term
  )
SELECT
  e.dt,
  'utm_fallback_lower_confidence' AS attribution_quality,
  e.utm_source,
  e.utm_medium,
  e.utm_campaign,
  e.utm_content,
  e.utm_term,
  e.leads,
  e.paid_users,
  e.revenue,
  s.expense_rub,
  round(s.expense_rub / nullIf(e.leads, 0), 2) AS cac,
  round(e.revenue / nullIf(s.expense_rub, 0), 4) AS roas
FROM events_by_utm e
LEFT JOIN spend_by_utm s
  ON s.dt = e.dt
 AND s.utm_source = e.utm_source
 AND s.utm_medium = e.utm_medium
 AND s.utm_campaign = e.utm_campaign
 AND s.utm_content = e.utm_content
 AND s.utm_term = e.utm_term
ORDER BY e.dt, s.expense_rub DESC
```
