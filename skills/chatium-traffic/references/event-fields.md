# Как читать payload событий

Сначала выбери семейство `url`/`urlPath`, затем `action` и версию payload-а. Только после этого интерпретируй `action_param*`, `funnel*` и `customer_contacts`. Названия колонок общие, их бизнес-смысл задаёт writer. SQL выполняется через `queryAi` из `@traffic/sdk`; `event://…` ниже — значения поля `url`, а не адреса API.

## Страницы, приложение и файлы

Обычный веб-просмотр в исследованных данных: HTTP(S) URL, непустой `sid`, пустой `action`. Для отчёта по сайту добавь конкретные домены. При наличии собственной разметки просмотров сверяй её writer и расширяй фильтр явно.

События мобильного приложения имеют `chatium://…` URL; `screen_opened`, `chat_opened`, `account_entered`, `message_sent`, `screen_title_changed` обозначают разные действия. Для просмотров экранов учитывай `screen_opened` и отдельно поддерживаемый legacy пустой `action`. `chat_opened` не считать автоматическим дублем `screen_opened`.

`storage_file_access` — обращение к хранилищу: файлы, картинки, миниатюры, диапазоны видео. Оно имеет HTTP(S) URL, но не является просмотром страницы. Даже 100 запросов файла не означают 100 человек или 100 полных скачиваний.

| Поле при `action = 'storage_file_access'` | Значение |
|---|---|
| `action_param1` | Внешний hash файла, используемый в ссылках |
| `action_param2` | `file` или `thumbnail` |
| `action_param3` | Способ доступа: `hash`, `protected`, `id` |
| `action_param1_int` | Внутренний ID файла |
| `action_params` | JSON с `event`, `access`, `download`, `dims`, `fileId`, `hash`, `appId`, `protected`, `size`, `contentType`, `method`, `range`; часть полей условная |

`request_type` writer выставляет в `get`; настоящий метод для этого семейства — JSON `method`. `size` — размер файла, не измеренные переданные байты. У Range/миниатюр нельзя вычислять трафик как `count() * size`. `uid`/`sid` могут отсутствовать.

## Sender: сообщения и статусы доставки

Унифицированный формат Sender v1 (`action_param8_float = 1`):

| Поле | Значение |
|---|---|
| `urlPath` | Семейство `event://app-sender/…`: `message/sent`, `message/opened`, `message/linkClicked`, `message/sendFailed`, `message/sentStatus/<status>` |
| `action` | Транспорт/источник канала, например `email:email-default-key` или `Telegram`; это не статус доставки |
| `action_param1` | chatId |
| `action_param2` | channelId |
| `action_param3` | externalMessageId, если есть; у кликов/ошибок бывает пустым |
| `funnel` | originType |
| `funnel_node` | originId |
| `funnel_node_from` | mailingId |
| `action_param1_arrstr` | mailingScheduleId, если передан |
| `action_param1_mapstrstr` | personId, channelSource и расширения caller-а: trackingId, trackingSource, targetPath и т.д. |
| `customer_contacts` | Контакты собеседника, а не список нескольких отправлений |
| `uid` | В том числе сохранённый uid персоны, даже когда визита на сайт не было |

`sent` означает событие отправки, `sentStatus/delivered` — статус доставки провайдера; ни один не доказывает попадания во «Входящие». `opened` — событие трекера открытия, которое может создавать почтовый proxy/scanner. `linkClicked` не равно просмотру посадочной страницы: подтверждай его отдельной веб-записью.

Для количества уникальных сообщений выбирай ключ по контракту транспорта (например, channelId + непустой externalMessageId). Несколько статусов одного сообщения — история, а не несколько писем. Для последнего статуса используй `argMax` по времени и сообщи, что это последний статус **в выбранном окне**. Для финального состояния писем, отправленных раньше окна, нужна предыстория.

## Mailings: результат попытки отправки

`event://custom/plugin/mailings/send/result`: `action` — тип канала (`email`, `telegram`, `max`); `action_param1` — chatId, `action_param2` — channelId, `action_param3` — deliveryKey, `action_param8_float = 1` — версия. Итог попытки и причины находятся в JSON `action_params` по контракту mailings.

Это отдельный этап доставки. Не складывай его с Sender `message/sent` как две отправки и не приравнивай deliveryKey к externalMessageId.

## CRM: сделка и клиентское событие

`event://crm/deal/<kind>` с `action = 'deal:<kind>'`:

| Поле | Значение |
|---|---|
| `action_param1` | dealId |
| `action_param2` | Статус сделки |
| `action_param3` | stageId, если есть |
| `action_params` | JSON со снимком сделки: amount, currency, status, paid, paidInternal, paidMoney, paymentStatus, pipelineId, stageId/stageName и previous |
| `customer_contacts` | Контакты сделки |

`created`, `won`, `paid`, `payment-changed`, `stage-changed` — разные события. Для «создано сделок» выбери `/created` и `uniqExact` непустого dealId; для «записей о создании» — count. Текущее состояние сделки получай через `@crm/sdk`, исторический снимок не заменяет его. Нельзя суммировать `paid` по всем изменениям: это накопленная сумма; выбирай события/дельты по денежному контракту и различай реальные деньги, внутренний баланс и тестовые оплаты.

`event://crm/customer/event/<key>` — другие, настраиваемые клиентские события. Их слоты не обязаны совпадать с полями сделки. Например, writer заявки Yowad передаёт `action_param1 = '<source>-order'`, `action_param2 = title`, а сумму/номер/статус — внутри payload-а. Назначение подтверждай кодом, реестром `specs/events.yaml`/payloadMapping либо актуальным SDK-контрактом; не переноси это соглашение на другие аккаунты автоматически.

## Другие пользовательские события

В root-аккаунте встречаются события AI-генераций, авторизации и процессов с пустым `action`. Их идентичность задаёт `urlPath`. Для AI billing, например, отдельные слоты могут означать ID цепочки, генерации или токены — назначать им смысл по аналогии с CRM нельзя.

В разведке сначала возвращай `urlPath`, `action`, count и `mapKeys`/имена JSON-полей. Контакты, тексты сообщений, токены и значения произвольных payload-ов не нужны для построения словаря схемы. После определения семейства выбирай только нужные поля.

Контракты сверены с исходниками: metric `logging.ts`, storage `kafka_events.js`, Sender `plugin/integrations/metricEventUtils.ts`, CRM `plugin/v2/modules/deals/events.ts`, Mailings `plugin/mailings/send/server/delivery.ts`. Переиспользование слотов проверено на живых данных обоих аккаунтов 2026-11-12.
