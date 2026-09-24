---
title: Примеры аналитических запросов к данным о трафике и событиях
description: Посещения сайта, поведение и зарегистрированные события Chatium; схемы ClickHouse и SQL-запросы.
requireApp: traffic
---

Ты умеешь делать аналитические запросы к событиям
Лог событий хранится в базе данных Clickhouse

Ниже, у тебя есть полная структура этой базы. Ты можешь делать к ней запросы
Не используй колонки, которых нет в БД

Try to avoid joins. Use subqueries instead.

Когда ответ на вопрос подразумевает выборку одной строки, к примеру
"Сколько пользователей было сегодня на сайте" - не создавай интерфейсов
Просто обратись к данным, получи данные и ответь пользователю

## Структура базы данных

```sql
CREATE TABLE chatium_ai.access_log
(
    `uid` String,
    `url` String,
    `path` String,
    `domain` String,
    `referer` Nullable(String),
    `user_agent` Nullable(String),
    `ip` Nullable(String),
    `location_country` Nullable(String),
    `location_region` Nullable(String),
    `location_time_zone` Nullable(String),
    `location_city` Nullable(String),
    `location_coordinates_latitude` Nullable(Float32),
    `location_coordinates_longitude` Nullable(Float32),
    `device_name` Nullable(String),
    `os_name` Nullable(String),
    `request_type` String,
    `auth_id` Nullable(Int32),
    `account_type` String,
    `user_id` Nullable(String),
    `user_type` LowCardinality(String),
    `session_id` String,
    `ts` DateTime,
    `ts64` DateTime64(3),
    `dt` Date,
    `auth_key` Nullable(String),
    `auth_first_name` Nullable(String),
    `auth_last_name` Nullable(String),
    `auth_lang` Nullable(String),
    `user_roles` Array(String),
    `user_status` Nullable(String),
    `user_first_name` Nullable(String),
    `user_last_name` Nullable(String),
    `user_icon_image` Nullable(String),
    `user_phone` Nullable(String),
    `user_email` Nullable(String),
    `user_platforms` Array(String),
    `auth_type` Nullable(String),
    `user_expires_at` Nullable(DateTime),
    `user_expires_at_dt` Nullable(Date),
    `fcm_token` Nullable(String),
    `utm_source` Nullable(String),
    `utm_content` Nullable(String),
    `utm_medium` Nullable(String),
    `utm_campaign` Nullable(String),
    `utm_term` Nullable(String),
    `session_email` Nullable(String),
    `session_phone` Nullable(String),
    `ua_client_type` Nullable(String),
    `ua_client_name` Nullable(String),
    `ua_client_version` Nullable(String),
    `ua_device_type` Nullable(String),
    `ua_device_brand` Nullable(String),
    `ua_device_model` Nullable(String),
    `ua_os_name` Nullable(String),
    `ua_os_version` Nullable(String),
    `ua_os_platform` Nullable(String),
    `ua_bot_name` Nullable(String),
    `ua_bot_category` Nullable(String),
    `sid` Nullable(String),
    `sid_duration` Nullable(Int32),
    `title` Nullable(String),
    `screen_height` Nullable(Int16),
    `screen_width` Nullable(Int16),
    `screen_pixel_ratio` Nullable(Int8),
    `inferred_uid` Nullable(Bool),
    `inferred_sid` Nullable(Bool),
    `funnel` Nullable(String),
    `funnel_node` Nullable(String),
    `funnel_node_from` Nullable(String),
    `action` Nullable(String),
    `action_params` Nullable(String),
    `urlPath` String,
    `action_param1` Nullable(String),
    `action_param2` Nullable(String),
    `action_param3` Nullable(String),
    `user_account_role` Nullable(String),
    `action_param1_float` Nullable(Float32),
    `action_param2_float` Nullable(Float32),
    `action_param3_float` Nullable(Float32),
    `action_param4_float` Nullable(Float32),
    `action_param5_float` Nullable(Float32),
    `action_param6_float` Nullable(Float32),
    `action_param7_float` Nullable(Float32),
    `action_param8_float` Nullable(Float32),
    `action_param1_int` Nullable(Int32),
    `action_param2_int` Nullable(Int32),
    `action_param3_int` Nullable(Int32),
    `sign` Int8,
    `keys` Array(String),
    `values` Array(String),
    `action_param1_arrstr` Array(String),
    `action_param2_arrstr` Array(String),
    `action_param3_arrstr` Array(String),
    `action_param1_uint32arr` Array(UInt32),
    `gc_visit_id` Nullable(Int64),
    `gc_visitor_id` Nullable(Int64),
    `gc_session_id` Nullable(Int64),
    `param_clrt` String,
    `clrt_type` LowCardinality(String),
    `clrt_campaign_id` String,
    `clrt_ad_id` String,
    `_debug` LowCardinality(String),
    `is_from_kafka` Bool,
    `clrt_run_id` UInt32,
    `action_param1_mapstrstr` Map(String, String),
    `action_param2_mapstrstr` Map(String, String),
    `resolved_user_id` String
)

CREATE VIEW chatium_ai.behaviour2_log
(
    `version_ts` DateTime64(3),
    `ts64` DateTime64(3),
    `dt` Date,
    `clrt_run_id` UInt32,
    `browser_session_id` String,
    `browser_id_started_at` DateTime64(3),
    `url` String,
    `urlPath` String,
    `uid` String,
    `sid` String,
    `user_id` String,
    `user_type` LowCardinality(String),
    `gc_visit_id` Int64,
    `gc_visitor_id` Int64,
    `gc_session_id` Int64,
    `view_focused_duration` UInt32,
    `view_total_duration` UInt32,
    `mouse_distance` UInt32,
    `scroll_distance` UInt32,
    `click_counter` UInt32,
    `selection_length` UInt32,
    `resolved_user_id` String
)
```

Расходы, CAC, ROI, ROAS и связка событий с рекламными источниками — в [attribution.md](attribution.md).

## Пример записи в таблице в виде JSON

Все значения ниже синтетические; они показывают формат записи, а не данные реального аккаунта или посетителя.

```json
{
  "uid": "example-visitor-id",
  "url": "https://example.com/demo",
  "path": "/demo",
  "domain": "example.com",
  "referer": "https://example.com/app/start/~/demo",
  "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
  "ip": "192.0.2.1",
  "location_country": "US",
  "location_region": "",
  "location_time_zone": "Etc/UTC",
  "location_city": "",
  "location_coordinates_latitude": 0,
  "location_coordinates_longitude": 0,
  "device_name": "",
  "os_name": "Mac",
  "request_type": "get",
  "auth_id": null,
  "account_type": "Chatium",
  "user_id": "example-user-id",
  "user_type": "Real",
  "session_id": "example-session-id",
  "ts": "2026-01-01 00:00:00",
  "ts64": "2026-01-01 00:00:00.000",
  "dt": "2026-01-01",
  "auth_key": null,
  "auth_first_name": null,
  "auth_last_name": null,
  "auth_lang": null,
  "user_roles": [],
  "user_status": null,
  "user_first_name": "Пример",
  "user_last_name": "Пользователя",
  "user_icon_image": "https://example.com/avatar.png",
  "user_phone": "12025550100",
  "user_email": "user@example.com",
  "user_platforms": [],
  "auth_type": null,
  "user_expires_at": null,
  "user_expires_at_dt": null,
  "fcm_token": null,
  "utm_source": "",
  "utm_content": "",
  "utm_medium": "",
  "utm_campaign": "",
  "utm_term": "",
  "session_email": null,
  "session_phone": null,
  "ua_client_type": "browser",
  "ua_client_name": "Chrome",
  "ua_client_version": "138.0",
  "ua_device_type": "desktop",
  "ua_device_brand": "Apple",
  "ua_device_model": "",
  "ua_os_name": "Mac",
  "ua_os_version": "10.15",
  "ua_os_platform": "",
  "ua_bot_name": null,
  "ua_bot_category": null,
  "sid": "example-browser-session-id",
  "sid_duration": 60,
  "title": "Демонстрационная страница",
  "screen_height": 900,
  "screen_width": 1440,
  "screen_pixel_ratio": 1,
  "inferred_uid": false,
  "inferred_sid": false,
  "funnel": null,
  "funnel_node": null,
  "funnel_node_from": null,
  "action": null,
  "action_params": null,
  "urlPath": "https://example.com/demo",
  "action_param1": null,
  "action_param2": null,
  "action_param3": null,
  "user_account_role": "Owner",
  "action_param1_float": null,
  "action_param2_float": null,
  "action_param3_float": null,
  "action_param4_float": null,
  "action_param5_float": null,
  "action_param6_float": null,
  "action_param7_float": null,
  "action_param8_float": null,
  "action_param1_int": null,
  "action_param2_int": null,
  "action_param3_int": null,
  "sign": 1,
  "keys": [],
  "values": [],
  "action_param1_arrstr": [],
  "action_param2_arrstr": [],
  "action_param3_arrstr": [],
  "action_param1_uint32arr": [],
  "gc_visit_id": null,
  "gc_visitor_id": null,
  "gc_session_id": null,
  "param_clrt": "",
  "clrt_type": "",
  "clrt_campaign_id": "",
  "clrt_ad_id": "",
  "_debug": "",
  "is_from_kafka": true,
  "clrt_run_id": 1,
  "action_param1_mapstrstr": {},
  "action_param2_mapstrstr": {},
  "resolved_user_id": "example-user-id"
}
```

## Выполнение запросов

У тебя есть функция queryAi, которая позволяет делать запросы к этим таблицам

Sample for query: "Visits, users and sessions count for last month by dates"
```typescript
import {queryAi} from '@traffic/sdk'

async function getTrafficByDate<Row = unknown>(ctx: app.Ctx): Promise<TrafficResult<Row>> {
  const query = `
    SELECT
      toDate(toStartOfDay(dt)) as period, -- by days
      COUNT() as visits_count,
      uniq(resolved_user_id) as users_count,
      uniq(uid) as sessions_count
    FROM
      chatium_ai.access_log
    WHERE
      startsWith(urlPath, 'https')
      AND dt BETWEEN subtractMonths(today(), 1) AND today()
    GROUP BY
      period
    `

  const result = await queryAi(ctx, query)
  return result.rows
}

type TrafficResult<Row = unknown> = {
  rows: Row[]
}
```

## Подбор адресов (urlPath) событий

Этот раздел применяй только для разовой ad-hoc аналитики, когда пользователь не передал спецификацию, `relatedEvents`, `eventUrl` или другой явный список событий.

Если ты работаешь внутри process analytics / `type: analytics` workspace и в контексте уже есть `relatedEvents` или `eventUrl`, не подбирай адреса событий самостоятельно через ClickHouse, `chatium exec`, `getWorkspaceEvents` или `getAccountEvents`. Используй переданные `eventUrl` как source of truth. Если нужного события нет в контексте, попроси обновить спецификацию процесса.

Обрати внимание! Если ты использовал для записи событий writeWorkspaceEvent, то такие события будут иметь urlPath вида event://account/<workspacePath>/eventName.
Если события созданы в других воркспейсах и явный список событий не передан, получи список событий с помощью `getAccountEvents` и подбери там подходящие.

## Пример "Сколько времени посетители проводят на сайте"

```sql
  SELECT
    url,
    count() as cnt,
    avg(view_focused_duration) as avg_view_focused_duration
  FROM
    chatium_ai.behaviour2_log
  WHERE
    startsWith(urlPath, 'https')
    AND dt BETWEEN subtractMonths(today(), 1) AND today()
  GROUP BY
    url
  ORDER BY
    cnt DESC
  LIMIT 0, 10
```

## Пример "С каких устройств заходят люди на сайт"

```sql
  SELECT
    ua_device_type,
    ua_device_brand,
    ua_os_name,
    ua_client_name,
    COUNT(uid) as sessions_count
  FROM
    chatium_ai.access_log
  WHERE
    (
      startsWith(urlPath, 'https://')
    )
    AND dt BETWEEN toStartOfMonth(today()) AND today()
  GROUP BY
    ua_device_type,
    ua_device_brand,
    ua_os_name,
    ua_client_name
  ORDER BY sessions_count DESC
  LIMIT 0, 30
```

## Пример "Какие самые популярные страницы за последние 30 дней"

```sql
  SELECT
    urlPath,
    ua_device_brand,
    ua_os_name,
    ua_client_name,
    COUNT(uid) as sessions_count
  FROM
    chatium_ai.access_log
  WHERE
    (
      startsWith(urlPath, 'https://')
    )
    AND dt BETWEEN toStartOfMonth(today()) AND today()
  GROUP BY
    ua_device_type,
    ua_device_brand,
    ua_os_name,
    ua_client_name
  ORDER BY sessions_count DESC
  LIMIT 0, 30
```

## Важные замечания

- ВАЖНО! Если ты добавляешь код, который использует queryAi, обязательно добавь про это инструкции в документацию проекта!

- Если пользователь просит тебя построить аналитику по каким-то конкретным данным, но не дает никаких технических вводных (адреса событий, `relatedEvents`, `eventUrl`, возможные значения и т.д.), тебе необходимо:

1. Узнать (с помощью chatium exec) какие события зарегистрированы в аккаунте.
  Пример извлечения списка доступных событий:

    ```ts
    import {getAccountEvents} from '@start/sdk'

    return await getAccountEvents(ctx)
    ```

В результате будет доступно поле payloadMapping, которое поможет более корректно подобрать поля в соответствии с запросом пользователя.
2. Подобрать наиболее подходящие под запрос пользователя либо ответить, что не нашел подходящих событий и попросить отправить больше информации.
3. Делать тестовый запрос через queryAi только если он нужен для ответа пользователя. Не делай тестовые запросы для подбора URL, когда URL уже переданы в спецификации или контексте.
4. Выполнить задачу от пользователя, используя всю полученную информацию.

Если `relatedEvents` / `eventUrl` уже переданы в задаче, пропусти шаги поиска событий и используй только переданный список.

- Обрати внимание на формат ответа! Это объект с полем rows, которое содержит массив строк результата.
