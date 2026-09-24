# Sender: отправка и работа с сообщениями

Используй для отправки уведомлений, чтения истории, удаления сообщений и вызовов Telegram/VK API через подключённый канал. Методы импортируются из `@sender/sdk` и выполняются на сервере. Если канал ещё не определён, проверь [подключение и выбор канала](entities.md#подключение-и-выбор-канала).

Для встраивания Vue-интерфейса переписки на страницу прочитай [Веб-чат](../chat-client.md).

## Импорты

```typescript
import {
  sendMessageToChat,
  sendMessageToSession,
  sendMessageToUser,
  sendMessageByTypeAndExternalId,
  sendMessageToContacts,
  findMessagesByChatId,
  deleteMessagesByOrigin,
  deleteMessage,
  runTelegramApi,
  runVkApi,
} from '@sender/sdk'
```

Для явных аннотаций публичные типы сообщений экспортируются из `@sender/sdk`: `FeedMessageDto`, `MessageDto`, `SendMessageInput`, `SendMessageButton`, `SendMessageFile`, `SendMessageToContactsParams`, `SendMessageToContactsResult`.

## Отправка сообщений

### Аналитика отправок: originType и originId

При отправке сообщений, по которым в дальнейшем нужна аналитика (рассылки, воронки, автоворонки, уведомления и т.д.), **обязательно передавай `originType` и `originId`** в объекте сообщения (`SendMessageInput`).

Эти поля попадают в колонки `funnel` (originType) и `funnel_node` (originId) таблицы `chatium_ai.access_log`, что позволяет:
- группировать и фильтровать аналитику по источнику отправки
- строить воронки конверсий по конкретным рассылкам/сценариям
- удалять сообщения по источнику через `deleteMessagesByOrigin`

**Рекомендуемые значения `originType`:**

| originType | Когда использовать |
|------------|-------------------|
| `mailing` | Рассылка / массовая отправка |
| `funnel` | Воронка / автоворонка |
| `bot` | Бот-сценарий / автоответ |
| `api` | Программная отправка через API |
| `notification` | Системное уведомление |
| `manual` | Ручная отправка |

**`originId`** — уникальный идентификатор конкретного источника. Например: ID рассылки, ID шага воронки, ID сценария бота. Используй осмысленные идентификаторы, чтобы в аналитике было легко найти нужный источник.

**Пример:**

```typescript
await sendMessageToChat(ctx, chatId, {
  text: 'Специальное предложение для вас!',
  originType: 'mailing',
  originId: 'promo-spring-2026',
})

```

> **Важно:** Если `originType` и `originId` не переданы, сообщение всё равно будет отправлено, но в аналитике оно не будет привязано к конкретному источнику, и по нему нельзя будет построить фильтрованную выборку.

### sendMessageToChat

Отправляет сообщение в конкретный чат.

Передавай внутренний Sender `chatId`, а не ID чата внешнего транспорта. `enabledChannels` ограничивает разрешённые каналы.

### sendMessageToSession

В качестве `sessionId` используй `window.clrtUid`, который создаёт клиентский счётчик.

### sendMessageToUser

Ограничивай отправку через `enabledChannels`, иначе сообщение может уйти во все связанные каналы пользователя.

### sendMessageByTypeAndExternalId

Отправляет сообщение по типу канала и внешнему ID с дополнительными параметрами. Позволяет создать чат, если его нет, указать дополнительные параметры для создания профиля, а также обернуть ссылки для отслеживания кликов.
Передавай согласованные `channels`, особенно для External. `createChatParams.userId` связывает новый чат с системным пользователем; `wrapLinks` включает отслеживание, а `addLinksParams` добавляет параметры к обёрнутым ссылкам.

### sendMessageToContacts

Универсальный метод для отправки сообщения по списку контактов (email, телефон, telegram_id, vk_id, max_id). Метод автоматически подбирает подходящие каналы связи для каждого контакта, поддерживает шаблонизацию переменных в тексте и кнопках, а также создаёт чат, если его ещё нет.

В отличие от `sendMessageToChat` и `sendMessageByTypeAndExternalId`, этот метод принимает **массив контактов** разных типов и сам маршрутизирует сообщение по нужным каналам. Это удобно для рассылок и уведомлений, когда у одного получателя может быть несколько контактных данных (email + telegram и т.д.).

Импортируй `sendMessageToContacts` и, если нужна явная аннотация, `SendMessageToContactsParams`/`SendMessageToContactsResult` из `@sender/sdk`. `channels` — белый список каналов, `excludedChannels` — чёрный; `wrapLinks` и `trackingParams` включают отслеживание ссылок.

**Шаблонизация переменных:**

Тексты в `message.plain`, `message.html`, `message.short`, `message.subject`, а также `text` и `url` в кнопках поддерживают подстановку переменных в формате `{{key}}`. Неразрешённые плейсхолдеры (кроме тех, что внутри URL) заменяются на пустую строку.

**Логика подбора каналов:**

- Метод автоматически ищет подходящий канал связи для каждого контакта на основе его типа
- Для контактов типа `phone` обязательно поле `message.short` — иначе отправка через SMS-канал будет пропущена
- Для контактов типа `email` используется `message.html` (если есть) как HTML-версия и `message.subject` как тема
- Если подходящих каналов нет, в `results` вернётся запись с `success: false`

**Когда использовать**: Для рассылок и уведомлений, когда нужно отправить одно и то же сообщение на разные контактные данные (email, телефон, мессенджеры) без ручного маршрутирования по каналам.

**Пример — отправка уведомления по email и в Telegram:**

`recipientTelegramId` — строковый Telegram ID адресата из проверенных контактов получателя.

```typescript
import { sendMessageToContacts } from '@sender/sdk'

const result = await sendMessageToContacts(ctx, {
  message: {
    subject: 'Ваш заказ №{{orderNumber}} подтверждён',
    plain: 'Здравствуйте, {{name}}! Ваш заказ №{{orderNumber}} подтверждён и передан в обработку.',
    html: '<h1>Заказ подтверждён</h1><p>Здравствуйте, {{name}}! Ваш заказ №{{orderNumber}} передан в обработку.</p>',
    buttons: [
      { type: 'link', text: 'Отследить заказ', url: 'https://example.com/orders/{{orderNumber}}' },
    ],
    inlineButtons: true,
  },
  variables: {
    name: 'Иван',
    orderNumber: '12345',
  },
  contacts: [
    { type: 'email', value: 'ivan@example.com' },
    { type: 'telegram_id', value: recipientTelegramId },
  ],
  wrapLinks: true,
  originType: 'notification',
  trackingParams: { utm_source: 'transactional' },
  originId: 'order-12345-confirmation',
})

if (result.success) {
  ctx.account.log('Уведомление отправлено', { json: result.results })
} else {
  ctx.account.log('Ошибка отправки', { level: 'warn', json: result })
}
```

**Пример — SMS-уведомление:**

```typescript
const result = await sendMessageToContacts(ctx, {
  message: {
    short: 'Код подтверждения: {{code}}',
  },
  variables: { code: '4821' },
  contacts: [
    { type: 'phone', value: '+12025550100' },
  ],
})
```

## Работа с сообщениями

### findMessagesByChatId

Находит все сообщения в конкретном чате с возможностью настройки пагинации и сортировки.

**Параметры**:

- `chatId` - ID чата
- `params.limit` - Лимит сообщений (по умолчанию 100)
- `params.offset` - Смещение для пагинации
- `params.reverse` - Обратный порядок сортировки
- `params.mode` - Режим выборки: 'head' (начало) или 'tail' (конец)

**Когда использовать**: Для получения истории сообщений в чате с настройкой параметров выборки.

**Пример**:

```typescript
const messages = await findMessagesByChatId(ctx, 'chat_123', {
    limit: 50,
    reverse: true
});
```

### deleteMessagesByOrigin

Удаляет сообщения по источнику отправки. Для того, чтобы была возможность удалить сообщение, при отправке мы должны указать `originId` и `originType` в объекте сообщения.

**Параметры**:

- `chatId` - ID чата
- `originId` - ID источника сообщения
- `originType` - Тип источника сообщения

**Когда использовать**: Когда нужно удалить сообщения зная источник или модель, с которой было связано сообщение.

**Пример**:

```typescript
const result = await deleteMessagesByOrigin(ctx, 'chat_123', 'object01_12', 'notification');
if (result?.success) {
    ctx.account.log('deleteMessagesByOrigin. Сообщения удалены');
} else {
    ctx.account.log('deleteMessagesByOrigin. Ошибка', { json: { reason: result?.reason } });
}
```

### deleteMessage

Удаляет конкретное сообщение. Проверяй `result?.success`: ответ может отсутствовать, как и у `deleteMessagesByOrigin`.

**Параметры**:

- `chatId` - ID чата
- `messageId` - ID сообщения для удаления

**Когда использовать**: Для удаления отдельного сообщения по его ID.

**Пример**:

```typescript
const result = await deleteMessage(ctx, 'chat_123', 'msg_456');
```

## Работа с внешними API

### runTelegramApi

Выполняет запрос к Telegram Bot API. Метод обеспечивает безопасное исопльзование АПИ телеграм, без необходимости указания секрета(токена) транспорта. Для определения токена важно передать либо chatId либо data.channelId.

**Параметры**:

- `chatId` - ID чата (может быть null, но в этом случае в `data` должен быть указан `channelId`)
- `method` - Метод Telegram API
- `data` - Данные для отправки, включая channelId если chatId не указан

**Когда использовать**: Для прямого вызова методов Telegram API.

**Пример**:

```typescript
const [success, result, error] = await runTelegramApi(ctx, 'chat_123', 'sendMessage', {
    text: 'Hello!'
}) || [false, null, 'No response'];

if (success) {
    console.log('Сообщение отправлено:', result);
} else {
    console.log('Ошибка:', error);
}
```

### runVkApi

Выполняет запрос к VK API. Метод обеспечивает безопасное использование VK API без необходимости указывать секрет (токен) транспорта. Для определения токена важно передать `channelId`.

**Параметры**:

- `channelId` - ID канала VK (обязательный)
- `method` - Метод VK API
- `data` - Параметры запроса

**Когда использовать**: Для работы с ВКонтакте API напрямую.

**Пример**:

```typescript
const [success, response, error] = await runVkApi(ctx, 'channel_vk', 'messages.send', {
    peer_id: 123,
    message: 'Привет!'
}) || [false, null, 'No response'];
```

## Обработка ошибок

Многие методы возвращают результаты в формате `[success, data, error]` или объекты с полем `success`. Рекомендуется всегда проверять успешность выполнения:

```typescript
try {
    const result = await runTelegramApi(ctx, chatId, 'sendMessage', { text: 'Hello' });
    if (result) {
        const [success, data, error] = result;
        if (success) {
            ctx.account.log('Успешно отправлено');
        } else {
            ctx.account.log('Ошибка API', { json: { error } });
        }
    }
} catch (error) {
    ctx.account.log('Системная ошибка', {
        level: 'error',
        err: error instanceof Error ? error : new Error('Unknown Sender error'),
    });
}
```
