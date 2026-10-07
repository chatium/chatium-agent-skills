---
title: Аналитика рассылок и сообщений
description: Используй этот пример если пользователь запрашивает аналитические данные или отчет по рассылкам, сообщениям, взаимодействиям с ними и т.д. Количество отправок, прочтений, кликов, вовлеченность и т.д.
requireApp: sender
---

Ты умеешь делать аналитические запросы к событиям рассылок и сообщений Sender.
Данные хранятся в двух таблицах ClickHouse.

Не используй колонки, которых нет в описании ниже.
Try to avoid joins. Use subqueries instead.

Когда ответ на вопрос подразумевает выборку одной строки, к примеру
"Сколько сообщений было отправлено сегодня" - не создавай интерфейсов.
Просто обратись к данным, получи данные и ответь пользователю.

## Архитектура данных

Sender пишет данные в две таблицы ClickHouse:

| Таблица | Назначение |
|---------|------------|
| **chatium_ai.access_log** | Аналитические события жизненного цикла сообщений: отправка, доставка, клики, блокировки |
| **sender_app.messages_log** | Лог каждого отправленного/полученного сообщения с полным контентом, ошибками, латенси |

### Когда использовать какую таблицу

- **chatium_ai.access_log** — для воронок отправки, конверсий, статистики доставки, кликов, блокировок. Легковесные события с метаданными.
- **sender_app.messages_log** — для анализа контента сообщений, ошибок отправки, задержек (latency), полного аудита.

---

## Таблица: chatium_ai.access_log

### Фильтрация по sender-событиям

Все события Sender имеют URL с префиксом `event://app-sender/`. Для выборки только sender-событий:

```sql
WHERE url LIKE 'event://app-sender/%'
```

### Маркер версии формата

Унифицированный формат (v1) помечен `action_param8_float = 1`. Старые события (v0) не имеют этого маркера. Для работы только с новым форматом:

```sql
WHERE action_param8_float = 1
```

### Колонки и их семантика

#### Основные фильтруемые колонки

| Колонка ClickHouse | Тип | Семантика в Sender v1 | Примеры значений |
|--------------------|-----|----------------------|------------------|
| `url` | String | `event://app-sender/{eventName}` — тип события | `event://app-sender/message/sent`, `event://app-sender/chatBlocked` |
| `action` | String | Тип транспорта. Для нативных = `channel.source`, для External = `channel.externalKey` | `Telegram`, `Vk`, `Viber`, `Chat`, `Chatium`, `account:whatsapp`, `myapp:email` |
| `action_param1` | String | ID чата (chatId) | `abc123-def456` |
| `action_param2` | String | ID канала (channelId) | `ch-789` |
| `action_param3` | String | Внешний ID сообщения (externalMessageId) | `tg_msg_12345` |
| `action_params` | String | Свободное текстовое поле, зависит от события | текст ошибки, URL клика и т.д. |
| `funnel` | String | Тип источника отправки (originType) | `bot`, `mailing`, `api`, `manual` |
| `funnel_node` | String | ID источника отправки (originId) | `bot-flow-123`, `mailing-456` |
| `funnel_node_from` | String | ID рассылки (mailingId) | `mailing-789` |
| `uid` | String | UID персоны (уникальный идентификатор контакта) | `uid-abc123` |
| `action_param8_float` | Float | Маркер версии формата (всегда `1` для v1) | `1` |
| `customer_contacts` | Array(String) | Контакты клиента: `["type:value"]` | `["email:user@example.com", "phone:+12025550100", "telegram_id:<telegram_user_id>"]` |

#### Коллекции (массивы и словари)

| Колонка ClickHouse | Тип | Семантика в Sender v1 |
|--------------------|-----|----------------------|
| `action_param1_arrstr` | Array(String) | `[mailingScheduleId]` — ID расписания рассылки |
| `action_param1_mapstrstr` | Map(String, String) | Словарь: `{personId, channelSource, ...доп. поля}` |
| `customer_contacts` | Array(String) | Контакты клиента: `["email:user@example.com", "phone:+12025550100", "telegram_id:<telegram_user_id>"]` |

#### Доступ к данным из `action_param1_mapstrstr`

Эта колонка — словарь (Map). Ключи:

| Ключ | Описание |
|------|----------|
| `personId` | ID персоны (контакта) в таблице Persons |
| `channelSource` | Всегда `channel.source` из enum: `Chat`, `Chatium`, `Telegram`, `TelegramManager`, `Viber`, `Vk`, `External` |
| `displayName` | Имя контакта (только в `chatBlocked`) |
| `chatExternalId` | Внешний ID чата (только в `message/sentStatus/{status}`) |
| `targetPath` | Путь URL клика (только в `message/linkClicked`) |

Примеры доступа в ClickHouse:

```sql
-- Получить personId
action_param1_mapstrstr['personId']

-- Фильтр по channelSource (enum-значение, не externalKey!)
action_param1_mapstrstr['channelSource'] = 'External'
```

> **Важно:** `action` содержит `channel.externalKey` для External-каналов (напр. `account:whatsapp`), а `action_param1_mapstrstr['channelSource']` всегда содержит значение enum `External`. Используйте `action` для различения конкретных транспортов, `channelSource` — для группировки по типу.

---

## Типы событий (url)

### message/sent

**URL:** `event://app-sender/message/sent`
**Когда:** Сообщение успешно отправлено через любой транспорт.
**Одно событие = одно отправленное сообщение.**

| Поле | Значение |
|------|----------|
| `action` | тип транспорта |
| `action_param1` | chatId |
| `action_param2` | channelId |
| `action_param3` | externalMessageId |
| `funnel` | originType |
| `funnel_node` | originId |
| `funnel_node_from` | mailingId |

### message/sendFailed

**URL:** `event://app-sender/message/sendFailed`
**Когда:** Попытка отправки сообщения завершилась ошибкой.

| Поле | Значение |
|------|----------|
| `action_params` | **текст ошибки** (описание причины провала) |
| остальные | стандартные |

### message/sentStatus/{status}

**URL:** `event://app-sender/message/sentStatus/{status}`
**Когда:** Внешний транспорт сообщил об обновлении статуса доставки сообщения.
**Статус закодирован в URL**, не в отдельном поле.

**Возможные статусы:**

| Статус | Значение |
|--------|----------|
| `sent` | Принято провайдером |
| `delivered` | Доставлено получателю |
| `read` | Прочитано получателем |
| `clicked` | Клик по ссылке в сообщении (от провайдера) |
| `failed` | Провайдер не смог доставить |
| `bounced` | Отскок (email) |
| `complained` | Жалоба на спам |
| `unsubscribed` | Отписка |
| `rejected` | Отклонено провайдером |
| `unknown` | Неизвестный статус |

Дополнительные поля:

| Поле | Значение |
|------|----------|
| `action_param1_mapstrstr` | + `chatExternalId` (внешний ID чата у провайдера) |

Пример фильтрации:

```sql
-- Все события доставки
WHERE url = 'event://app-sender/message/sentStatus/delivered'

-- Все негативные статусы
WHERE url IN (
  'event://app-sender/message/sentStatus/failed',
  'event://app-sender/message/sentStatus/bounced',
  'event://app-sender/message/sentStatus/rejected'
)

-- Любой статус (паттерн)
WHERE url LIKE 'event://app-sender/message/sentStatus/%'
```

### message/linkClicked

**URL:** `event://app-sender/message/linkClicked`
**Когда:** Получатель кликнул по tracked-ссылке в сообщении.

| Поле | Значение |
|------|----------|
| `action_params` | **полный целевой URL** (куда перешёл пользователь) |
| `action_param1_mapstrstr` | + `targetPath` (pathname URL без хоста и параметров) |

> **Важно:** `customer_contacts` и `uid` НЕ заполняются в событии клика (нет объекта person/channel на момент клика). Персону можно найти по `action_param1_mapstrstr['personId']`.

### chatBlocked

**URL:** `event://app-sender/chatBlocked`
**Когда:** Пользователь заблокировал бота / чат.

| Поле | Значение |
|------|----------|
| `action_param1_mapstrstr` | + `displayName` (имя контакта) |

### chatUnblocked

**URL:** `event://app-sender/chatUnblocked`
**Когда:** Чат разблокирован.

| Поле | Значение |
|------|----------|
| `funnel` | `sourceType` — источник разблокировки (перезаписывает originType) |

---

## Таблица: sender_app.messages_log

Лог каждого сообщения с полным контентом. Записывается при отправке и получении сообщений.

### Колонки

| Колонка | Тип | Описание |
|---------|-----|----------|
| `account_id` | String | ID аккаунта |
| `ts` | UInt64 | Timestamp (ms unix epoch) |
| `direction` | String | `in` — входящее, `out` — исходящее |
| `status` | String | `success`, `fail`, `block`, `outOfTokens`, `messageDelete`, `messageDeleteFail` |
| `channel_id` | String | ID канала |
| `channel_title` | String | Название канала |
| `channel_source` | String | Тип канала: `Telegram`, `Vk`, `Viber`, `Chat`, `Chatium`, `External` |
| `channel_external_id` | String | Внешний ID канала |
| `chat_id` | String | ID чата |
| `chat_external_id` | String | Внешний ID чата (telegram user ID, vk peer_id и т.д.) |
| `person_id` | String | ID персоны |
| `person_title` | String | Имя персоны |
| `person_email` | String | Email персоны |
| `person_phone` | String | Телефон персоны |
| `person_user_id` | String | ID пользователя, привязанного к персоне |
| `message_text` | String | Текст сообщения |
| `message_files` | String | JSON массив файлов |
| `message_buttons` | String | JSON массив кнопок |
| `message_format` | String | `plain`, `markdown`, `html` |
| `error` | Bool | Была ли ошибка |
| `error_json` | String | JSON с деталями ошибки |
| `error_message` | String | Текст ошибки |
| `mailing_id` | String | ID рассылки |
| `mailing_schedule_id` | String | ID расписания рассылки |
| `latency` | UInt64 | Задержка отправки (мс) |

---

## Связи между сущностями

```
Channel (канал) ─── 1:N ──→ Chat (чат/диалог)
                                │
                                ├── person (контакт/получатель)
                                └── externalId (ID пользователя у провайдера)

Person (контакт) ─── 1:N ──→ Chat
                 ─── 0:1 ──→ User (пользователь системы)

Mailing (рассылка) ─── 1:N ──→ MailingSchedule (расписание)
                   ─── 1:N ──→ Message (отправленные сообщения)
```

### Ключевые ID и как они связаны

| ID | Где хранится | Что означает |
|----|-------------|--------------|
| `chatId` (action_param1) | chatium_ai.access_log, messages_log | Конкретный диалог с конкретным человеком через конкретный канал |
| `channelId` (action_param2) | chatium_ai.access_log, messages_log | Бот / транспорт / канал связи (у компании может быть несколько) |
| `personId` (mapstrstr) | chatium_ai.access_log | Контакт (человек). Один человек может иметь несколько чатов в разных каналах |
| `uid` | chatium_ai.access_log | Уникальный идентификатор персоны для трекинга визитов |
| `externalMessageId` (action_param3) | chatium_ai.access_log | ID сообщения в системе провайдера (Telegram, VK и т.д.) |
| `mailingId` (funnel_node_from) | chatium_ai.access_log, messages_log | ID рассылки-кампании |
| `mailingScheduleId` (action_param1_arrstr[1]) | chatium_ai.access_log, messages_log | ID конкретной отправки в рамках рассылки |
| `originType` (funnel) | chatium_ai.access_log | Кто инициировал отправку: `bot`, `mailing`, `api`, `manual`, `funnel` etc... |
| `originId` (funnel_node) | chatium_ai.access_log | ID конкретного источника (бот-сценария, рассылки и т.д.) |

---

## Значения поля `action` (тип транспорта)

| Значение action | Описание |
|----------------|----------|
| `Telegram` | Нативный Telegram бот |
| `TelegramManager` | Telegram бот менеджер каналов и групп |
| `Vk` | ВКонтакте сообщества |
| `Viber` | Viber бот |
| `Chat` | Внутренний чат Chatium |
| `Chatium` | Chatium транспорт (виджеты на сайте) |
| `wazzup24:wazzup24` | Внешний транспорт WhatsApp (формат: `{owner}:{key}`) |
| `email:email-default-key` | Внешний транспорт Email |
| `sms:sms-c` | Внешний транспорт SMS |
| `{appSlug}:{key}` | Любой другой внешний транспорт из плагина |
| `External` | Fallback для External-канала без externalKey |
| `Unknown` | Канал не определён |

> Для группировки нативных vs внешних используй `action_param1_mapstrstr['channelSource']`:
> - Нативные: `Telegram`, `Vk`, `Viber`, `Chat`, `Chatium`, `TelegramManager`
> - Внешние: `External` (все внешние транспорты имеют `channelSource = 'External'`)

---

## Выполнение запросов

У тебя есть функция queryAi, которая позволяет делать запросы к этим таблицам.

Пример запроса: "Количество отправленных сообщений по транспортам за последний месяц"
```typescript
import {queryAi} from '@traffic/sdk'

async function getSentByTransport<Row = unknown>(ctx: app.Ctx): Promise<Row[]> {
  const query = `
    SELECT
      action AS transport,
      count() AS sent_count
    FROM chatium_ai.access_log
    WHERE url = 'event://app-sender/message/sent'
      AND action_param8_float = 1
      AND timestamp >= subtractMonths(today(), 1)
    GROUP BY action
    ORDER BY sent_count DESC
    `

  const result = await queryAi(ctx, query)
  return result.rows
}
```

Обрати внимание на формат ответа! Это объект с полем rows, которое содержит массив строк результата.

---

## Примеры запросов

### Воронка доставки сообщений (sent → delivered → read)

```sql
SELECT
    action AS transport,
    countIf(url = 'event://app-sender/message/sent') AS sent,
    countIf(url = 'event://app-sender/message/sentStatus/delivered') AS delivered,
    countIf(url = 'event://app-sender/message/sentStatus/read') AS `read`,
    countIf(url = 'event://app-sender/message/sendFailed') AS failed
FROM chatium_ai.access_log
WHERE url LIKE 'event://app-sender/message/%'
  AND action_param8_float = 1
  AND timestamp >= '2026-03-01'
GROUP BY action
ORDER BY sent DESC
```

### Процент доставки по рассылке

```sql
SELECT
    funnel_node_from AS mailing_id,
    countIf(url = 'event://app-sender/message/sent') AS sent,
    countIf(url = 'event://app-sender/message/sentStatus/delivered') AS delivered,
    countIf(url = 'event://app-sender/message/sendFailed') AS failed,
    if(sent > 0, round(delivered / sent * 100, 2), 0) AS delivery_rate_pct
FROM chatium_ai.access_log
WHERE url LIKE 'event://app-sender/message/%'
  AND action_param8_float = 1
  AND funnel_node_from = '{mailingId}'
GROUP BY funnel_node_from
```

### Статистика кликов по рассылке

```sql
SELECT
    action_params AS target_url,
    count() AS clicks,
    uniq(action_param1_mapstrstr['personId']) AS unique_persons
FROM chatium_ai.access_log
WHERE url = 'event://app-sender/message/linkClicked'
  AND action_param8_float = 1
  AND funnel_node_from = '{mailingId}'
GROUP BY action_params
ORDER BY clicks DESC
```

### Ошибки отправки: топ причин

```sql
SELECT
    action AS transport,
    action_params AS error_message,
    count() AS error_count
FROM chatium_ai.access_log
WHERE url = 'event://app-sender/message/sendFailed'
  AND action_param8_float = 1
  AND timestamp >= today() - 7
GROUP BY action, action_params
ORDER BY error_count DESC
LIMIT 20
```

### Динамика блокировок/разблокировок по дням

```sql
SELECT
    toDate(timestamp) AS day,
    countIf(url = 'event://app-sender/chatBlocked') AS blocked,
    countIf(url = 'event://app-sender/chatUnblocked') AS unblocked,
    blocked - unblocked AS net_blocked
FROM chatium_ai.access_log
WHERE url IN ('event://app-sender/chatBlocked', 'event://app-sender/chatUnblocked')
  AND action_param8_float = 1
  AND timestamp >= today() - 30
GROUP BY day
ORDER BY day
```

### Конверсия рассылки: отправка → доставка → прочтение → клик

```sql
SELECT
    funnel_node_from AS mailing_id,
    action_param1_arrstr[1] AS schedule_id,
    countIf(url = 'event://app-sender/message/sent') AS sent,
    countIf(url = 'event://app-sender/message/sentStatus/delivered') AS delivered,
    countIf(url = 'event://app-sender/message/sentStatus/read') AS `read`,
    countIf(url = 'event://app-sender/message/linkClicked') AS clicked,
    countIf(url = 'event://app-sender/message/sendFailed') AS failed,
    if(sent > 0, round(delivered / sent * 100, 1), 0) AS delivery_pct,
    if(delivered > 0, round(`read` / delivered * 100, 1), 0) AS read_pct,
    if(sent > 0, round(clicked / sent * 100, 1), 0) AS ctr_pct
FROM chatium_ai.access_log
WHERE url LIKE 'event://app-sender/message/%'
  AND action_param8_float = 1
  AND funnel_node_from != ''
GROUP BY mailing_id, schedule_id
ORDER BY sent DESC
```

### Ошибки из messages_log с деталями

```sql
SELECT
    ts,
    channel_source,
    channel_title,
    person_title,
    person_email,
    error_message,
    message_text,
    mailing_id
FROM sender_app.messages_log
WHERE direction = 'out'
  AND status = 'fail'
  AND ts >= toUnixTimestamp(today() - 7) * 1000
ORDER BY ts DESC
LIMIT 50
```

### Средняя задержка отправки по транспортам

```sql
SELECT
    channel_source,
    avg(latency) AS avg_latency_ms,
    quantile(0.95)(latency) AS p95_latency_ms,
    count() AS total_messages
FROM sender_app.messages_log
WHERE direction = 'out'
  AND status = 'success'
  AND ts >= toUnixTimestamp(today() - 7) * 1000
GROUP BY channel_source
ORDER BY avg_latency_ms DESC
```

---

## Важные нюансы при построении запросов

1. **Фильтр по версии обязателен** — всегда добавляй `AND action_param8_float = 1` для работы с актуальным форматом.
2. **Различие `action` и `channelSource`** — `action` содержит конкретный транспорт (напр. `sms:sms-c`), а `action_param1_mapstrstr['channelSource']` — enum-значение (`External`). Для группировки нативных vs внешних используй `channelSource`.
3. **Статус доставки в URL, не в полях** — статус (`delivered`, `read`, `failed` и т.д.) закодирован в `url`, а НЕ в `action_params`.
4. **Одно событие = одно действие** — `message/sent` пишется ровно один раз на одно успешно отправленное сообщение.
5. **Связь событий по сообщению** — для отслеживания жизненного цикла сообщения используй `action_param3` (externalMessageId).
6. **linkClicked не содержит person/channel данные** — персону можно найти по `action_param1_mapstrstr['personId']`.
7. **messages_log.ts — миллисекунды** — для сравнения с датами: `WHERE ts >= toUnixTimestamp('2026-03-01 00:00:00') * 1000`.

---

## Шпаргалка: какой запрос для какой бизнес-задачи

| Бизнес-задача | Таблица | Ключевой фильтр | Группировка |
|---------------|---------|-----------------|-------------|
| Сколько сообщений отправили | chatium_ai.access_log | `url = '.../message/sent'` | `action` (транспорт) |
| Процент доставки | chatium_ai.access_log | `url LIKE '.../message/%'` | `funnel_node_from` (рассылка) |
| Процент прочтений | chatium_ai.access_log | `url = '.../message/sentStatus/read'` vs `sent` | `funnel_node_from` |
| CTR (click-through rate) | chatium_ai.access_log | `url = '.../message/linkClicked'` vs `sent` | `funnel_node_from` |
| Ошибки отправки | chatium_ai.access_log | `url = '.../message/sendFailed'` | `action`, `action_params` |
| Детали ошибок с текстом | messages_log | `status = 'fail'` | `channel_source`, `error_message` |
| Блокировки бота | chatium_ai.access_log | `url = '.../chatBlocked'` | `action` (транспорт), день |
| Отписки (email) | chatium_ai.access_log | `url = '.../message/sentStatus/unsubscribed'` | `funnel_node_from` |
| Жалобы на спам | chatium_ai.access_log | `url = '.../message/sentStatus/complained'` | `action` (транспорт) |
| Жизненный цикл сообщения | chatium_ai.access_log | `action_param3 = '{msgId}'` | — (хронология) |
| Задержка отправки | messages_log | `direction = 'out'` | `channel_source` |
| Все для конкретной рассылки | chatium_ai.access_log | `funnel_node_from = '{mailingId}'` | `url` (тип события) |

---

## Важные замечания

- ВАЖНО! Если ты добавляешь код, который использует queryAi, обязательно добавь про это инструкции в документацию проекта!

- Если пользователь просит тебя построить аналитику по каким-то конкретным данным, но не дает никаких технических вводных (адреса событий, возможные значения и т.д.), тебе необходимо:

1. Сделать тестовый запрос через queryAi, чтобы узнать какие типы sender-событий есть в аккаунте:

    ```ts
    import {queryAi} from '@traffic/sdk'

    const result = await queryAi(ctx, `
      SELECT url, count() AS cnt
      FROM chatium_ai.access_log
      WHERE url LIKE 'event://app-sender/%'
        AND action_param8_float = 1
      GROUP BY url
      ORDER BY cnt DESC
    `)
    return result.rows
    ```

2. Подобрать наиболее подходящие типы событий под запрос пользователя либо ответить, что не нашёл подходящих и попросить больше информации.
3. При необходимости сделать дополнительный тестовый запрос по найденным событиям, чтобы понять структуру данных (какие поля заполнены, какие значения `action`, `funnel` и т.д.).
4. Выполнить задачу от пользователя, используя всю полученную информацию.

- Обрати внимание на формат ответа! Это объект с полем rows, которое содержит массив строк результата.

---

## Получение контекста через Sender SDK

Перед построением SQL-запроса тебе может не хватать информации о каналах, их ID, externalKey, тегах и т.д. Используй методы Sender SDK, чтобы получить эти данные.

### Получение списка каналов

Позволяет узнать какие каналы подключены, их ID, тип (`source`), внешний ID (`externalId`) и название. Это нужно, чтобы правильно фильтровать по `action` (externalKey) или `action_param2` (channelId) в SQL-запросах.

```ts
import { getChannels } from '@sender/sdk'

const channels = await getChannels(ctx)
return channels
```

Актуальную форму результата смотри в `ChannelDto` из `@sender/sdk`.

**Как это связано с аналитикой:**
- `channel.id` → колонка `action_param2` в `chatium_ai.access_log` и `channel_id` в `sender_app.messages_log`
- `channel.source` → колонка `action_param1_mapstrstr['channelSource']` в `chatium_ai.access_log` и `channel_source` в `sender_app.messages_log`
- `channel.externalKey` (для External-каналов) → колонка `action` в `chatium_ai.access_log`. Например: `wazzup24:wazzup24`, `email:email-default-key`, `sms:sms-c`
- Для нативных каналов (Telegram, Vk и т.д.) `action` = `channel.source`

### Получение списка тегов

Позволяет узнать какие теги существуют и сколько персон в каждом. Полезно для фильтрации аналитики по сегментам.

```ts
import { getTags } from '@sender/sdk'

const tags = await getTags(ctx)
return tags
```

Тип результата выводится из `getTags`; для аналитики важны `id`, `title` и `personsCount`.

### Поиск персон по тегам или другим критериям

Если нужно получить список personId для фильтрации SQL-запросов:

```ts
import { findPersons } from '@sender/sdk'

const persons = await findPersons(ctx, {
  limit: 100,
  where: { tags: { $in: ['tagId1', 'tagId2'] } }
})
return persons.map(p => ({ id: p.id, title: p.title, chatIds: p.chatIds }))
```

### Пример: построение аналитики по конкретному каналу

Если пользователь говорит «покажи статистику по WhatsApp» — сначала узнай externalKey канала:

```ts
import { getChannels } from '@sender/sdk'

const channels = await getChannels(ctx)
const whatsappChannel = channels.find(ch =>
  ch.source === 'External' && ch.title.toLowerCase().includes('whatsapp')
)
// whatsappChannel.externalKey → используй как значение action в SQL
// whatsappChannel.id → используй как значение action_param2 в SQL
```

Затем подставь в запрос:

```sql
SELECT
    url, count() AS cnt
FROM chatium_ai.access_log
WHERE url LIKE 'event://app-sender/%'
  AND action_param8_float = 1
  AND action = 'wazzup24:wazzup24'  -- externalKey из getChannels
GROUP BY url
ORDER BY cnt DESC
```
