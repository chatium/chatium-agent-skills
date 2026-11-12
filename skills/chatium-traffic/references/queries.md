# Рецепты SQL через queryAi

Каждый SQL ниже передаётся в `await queryAi(ctx, sql)`, результат — `result.rows`. Примеры используют последние 7 или 30 дней; для воспроизводимой серии замени `now()` и нижнюю границу на фиксированные значения в часовом поясе отчёта. Поля и ограничения доступа см. в [схеме](schema.md).

## Литералы и обработка ответа

```ts
import { queryAi } from '@traffic/sdk'

function sqlString(value: string): string {
  return "'" + value.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"
}

const sql = `SELECT ts64, url, action
  FROM chatium_ai.access_log
  WHERE dt >= today() - 7 AND ts >= now() - INTERVAL 7 DAY
    AND ts < now() AND path = ${sqlString(selectedPath)}
  ORDER BY ts64 DESC LIMIT 50`
const result = await queryAi(ctx, sql)
if (!result || !Array.isArray(result.rows)) throw new Error('Unexpected traffic query result')
return result.rows
```

Проверяй формат дат до SQL; это строки `YYYY-MM-DD` или валидированные timestamps, не SQL-фрагменты. `escapeValue` из старого builder имеет специальный префикс `raw:` и не подходит как универсальная защита внешнего ввода. Не используй его с непроверенным пользовательским текстом.

## Просмотры, сессии и посетители по дням

```sql
SELECT dt,
  count() AS views,
  uniqExact(sid) AS sessions,
  uniqExactIf(uid, uid != '') AS visitors,
  uniqExactIf(user_id, ifNull(user_id, '') != '' AND user_type = 'Real') AS known_users
FROM chatium_ai.access_log
WHERE dt >= today() - 30
  AND ts >= now() - INTERVAL 30 DAY AND ts < now()
  AND ifNull(sid, '') != ''
  AND ifNull(ua_bot_name, '') = ''
  AND (
    ((startsWith(url, 'https://') OR startsWith(url, 'http://'))
     AND ifNull(action, '') = '')
    OR ((startsWith(url, 'chatium://') OR startsWith(url, 'app://')
         OR startsWith(url, 'event://app/'))
        AND ifNull(action, '') IN ('', 'screen_opened'))
  )
GROUP BY dt ORDER BY dt
```

Это просмотры с трекерной сессией во всём аккаунте, включая сотрудников. Фильтр веб-просмотров соответствует исследованным writers; собственные события просмотров добавляй по их контракту. Для клиентской аудитории добавь `AND ifNull(user_account_role, '') NOT IN ('Owner','Admin','Developer','Staff')`; исключение технических путей — отдельный продуктовый фильтр. Для топа страниц используй ту же базу, `GROUP BY path ORDER BY views DESC LIMIT 30`. `path` объединяет домены, а `urlPath` сохраняет URL без query/fragment.

Канал «приложение» определяется не только схемой URL: учитывай также `ua_client_type = 'app'` или `startsWith(ifNull(user_agent, ''), 'Chatium/')`, чтобы включить веб-страницы внутри приложения. Добавление условия канала не заменяет фильтр просмотров.

## Посещаемость конкретного сайта

Согласуй домены: yowad.ru и yowad.com — один аккаунт, но отдельные сайты/хосты для такого разреза. У root-аккаунта chatium.ru могут встречаться чужие домены и CDN. Ни принадлежность аккаунту, ни непустой `session_id` не заменяют фильтр сайта.

```sql
SELECT dt,
  count() AS pageviews,
  uniqExact(uid) AS visitors,
  uniqExact(sid) AS sessions,
  uniqExactIf(user_id, user_type = 'Real' AND ifNull(user_id, '') != '') AS known_users
FROM chatium_ai.access_log
WHERE dt >= '2026-11-05' AND dt < '2026-11-12'
  AND ts64 >= toDateTime64('2026-11-05 00:00:00', 3, 'Europe/Moscow')
  AND ts64 < toDateTime64('2026-11-12 00:00:00', 3, 'Europe/Moscow')
  AND domain = 'yowad.ru'
  AND (startsWith(url, 'https://') OR startsWith(url, 'http://'))
  AND ifNull(action, '') = ''
  AND uid != '' AND ifNull(sid, '') != ''
  AND ifNull(ua_bot_name, '') = ''
GROUP BY dt ORDER BY dt
```

Замени домен, даты и часовой пояс на параметры задачи. Сотрудники здесь включены. Чтобы получить уникальных за весь период, убери `dt` из SELECT/GROUP BY: сумма дневных visitors/sessions не даёт уникальных за неделю. Не включай сюда `storage_file_access`, серверные `event://` события и `screen_opened` приложения без отдельного определения общей метрики.

## Активные сотрудники: Developer + Owner, остальные роли

```sql
SELECT
  uniqExactIf(user_id, user_account_role IN ('Developer','Owner')) AS developers_with_owners,
  uniqExact(user_id)
    - uniqExactIf(user_id, user_account_role IN ('Developer','Owner')) AS other_roles,
  uniqExact(user_id) AS total
FROM chatium_ai.access_log
WHERE dt >= today() - 30
  AND ts >= now() - INTERVAL 30 DAY AND ts < now()
  AND user_account_role IN ('Staff','Admin','Developer','Owner')
  AND ifNull(user_id, '') != '' AND ifNull(sid, '') != ''
  AND ifNull(ua_bot_name, '') = ''
  AND (
    ((startsWith(url, 'https://') OR startsWith(url, 'http://'))
     AND ifNull(action, '') = '')
    OR ((startsWith(url, 'chatium://') OR startsWith(url, 'app://')
         OR startsWith(url, 'event://app/'))
        AND ifNull(action, '') IN ('', 'screen_opened'))
  )
```

Человек с любой ролью Developer/Owner в выбранных строках входит в первую категорию; вторая содержит только оставшихся Staff/Admin. Для разреза исходных ролей используй `GROUP BY user_account_role`, но предупреди о пересечениях. Вопрос «сколько выдано доступов сейчас» требует сервиса пользователей, не access_log.

## UTM первого просмотра сессии

Возьми базовую выборку просмотров выше, сверни по `sid` с `argMin(tuple(utm_source, utm_medium, utm_campaign), ts64) AS entry_utm`, затем группируй по элементам tuple и считай сессии. Tuple сохраняет NULL первого просмотра вместо выбора следующей непустой UTM. Первый просмотр **внутри окна** может отличаться от реального начала сессии; для точной атрибуции прочитай предысторию выбранных sid в обоснованном ограниченном окне. Не суммируй дневные uniq для уникальных за месяц.

```sql
WITH sessions AS (
  SELECT sid,
    argMin(tuple(utm_source, utm_medium, utm_campaign), ts64) AS entry_utm
  FROM chatium_ai.access_log
  WHERE dt >= '2026-11-05' AND dt < '2026-11-12'
    AND domain = 'yowad.ru'
    AND (startsWith(url, 'https://') OR startsWith(url, 'http://'))
    AND ifNull(action, '') = '' AND ifNull(sid, '') != ''
    AND ifNull(ua_bot_name, '') = ''
  GROUP BY sid
)
SELECT
  ifNull(tupleElement(entry_utm, 1), '') AS source,
  ifNull(tupleElement(entry_utm, 2), '') AS medium,
  ifNull(tupleElement(entry_utm, 3), '') AS campaign,
  count() AS sessions
FROM sessions
GROUP BY source, medium, campaign
ORDER BY sessions DESC LIMIT 30
```

Это UTM первого наблюдаемого просмотра данного домена в окне; пустые метки называй «UTM не задана», не «прямой трафик». Для одинакового ts64 нужен дополнительный подтверждённый порядок: миллисекундная точность не гарантирует уникальность события.

## Бизнес-события и payload

Для известного события используй его точный URL или `action` по контракту отправителя. В процессных workspace сначала прочитай `specs/events.yaml` и `payloadMapping`. `workspaceEvent` URL строится `getWorkspaceEventUrl(ctx, key)` из `@start/sdk`, `customerEvent` — `getCustomerEventUrl(ctx, key)` из `@crm/sdk`, на сервере. Значение helper-а вставляй через `sqlString`.

```sql
SELECT dt, action, count() AS events,
  uniqExactIf(resolved_user_id, resolved_user_id != '') AS resolved_visitors
FROM chatium_ai.access_log
WHERE dt >= today() - 7
  AND ts >= now() - INTERVAL 7 DAY AND ts < now()
  AND action = 'account_connected'
GROUP BY dt, action ORDER BY dt
```

Это события подключения и их аудитория, не число впервые подключившихся за всю историю. Для «новых» найди первый момент по user_id в достаточной предыстории и явно укажи глубину поиска/начало сбора. Для аудита неизвестных событий допустим ограниченный top `url, action, count()` за короткий период; он не заменяет известный реестр событий.

Для сделок CRM используй их отдельный контракт из [payload событий](event-fields.md), без фильтра `sid` или домена сайта:

```sql
SELECT dt, count() AS creation_events,
  uniqExactIf(action_param1, ifNull(action_param1, '') != '') AS created_deals
FROM chatium_ai.access_log
WHERE dt >= '2026-11-05' AND dt < '2026-11-12'
  AND urlPath = 'event://crm/deal/created'
  AND action = 'deal:created'
GROUP BY dt ORDER BY dt
```

Это зарегистрированные события создания, а не вся текущая CRM. Старый импорт может не писать такие события; наличие истории логов и наличие записей в CRM проверяются отдельно.

## Поведение

Для duration/scroll/clicks прочитай [поведение и качество данных](behaviour.md): единицы, повторные снимки, ограничения `FINAL` и проверенный диагностический запрос. Сумма сырых накопительных счётчиков не является точным временем на сайте.

## Рекламные расходы

```sql
SELECT dt, platform, utm_campaign,
  sum(expense) AS expense_rub,
  sum(clicks) AS ad_clicks,
  sum(views) AS ad_views,
  sum(impressions) AS ad_impressions
FROM chatium_ai.traffic_source_statistics
WHERE dt >= today() - 30 AND dt <= today() AND is_deleted = 0
GROUP BY dt, platform, utm_campaign
ORDER BY dt, expense_rub DESC
LIMIT 500
```

Это календарные дни с включённым сегодня, не точные последние 720 часов: у источника дневная гранулярность. Проверенное представление уже выбирает финальные версии статистики. `expense` — RUB по контракту интеграции; валютные поля сохраняй для сверки. В проверенной интеграции Yandex Direct показы записаны в `views`, а `impressions` = 0. Выбирай метрику показов по контракту платформы; не складывай эти поля и не делай универсальный fallback без проверки. Label источника можно брать из `action_param1_mapstrstr['ad_name']`/`['campaign_name']` с fallback на UTM и ID.

Если строк за период нет, отдельно проверь `min(dt)`, `max(dt)`, count за более широкое ограниченное окно: исторические расходы могут быть, а свежая синхронизация — отсутствовать. Сообщай «нет записанной статистики за период», а не «на рекламу потрачено 0». `action_param1_int = 1` у расходов означает проблему UTM, а у других таблиц/событий имеет другое значение.

Для ROI/CAC сначала агрегируй события и расходы независимо, затем соединяй агрегаты. Проверенная схема access_log не содержит `matched_traffic_source_ids`; сначала DESCRIBE, и лишь при наличии используй эту атрибуцию. Иначе сопоставляй UTM + дату с явной пометкой ограниченной точности и контролем many-to-many. Не приравнивай рекламные клики к аналитическим сессиям.

## Типичные ошибки

- `Unknown identifier account_id`: это скрытая колонка в account-scoped views; убери её из SQL, сверив нужный ctx.
- `Not enough privileges`/`Unknown table`: проверь имя и доступность представления через SDK. Не подменяй его глобальной таблицей.
- `Invalid query`: валидатор ищет некоторые запрещённые подстроки даже внутри строк/комментариев. Проверь SQL; для легитимного значения, которое блокируется, сообщи ограничение, не маскируй строку ради обхода.
- `Aggregate function ... inside another aggregate/WHERE`: alias совпал с исходной колонкой (`title`, `user_id`, `url`); дай агрегату другое имя.
- `filteredQueryAi` вернул нефильтрованный период: переданный filter автоматически не меняет SQL.
- В результате `queryAi` строки лежат в `.rows`; проверяй этот массив. Поля `.data` и обязательного `.success` в этом контракте нет.
