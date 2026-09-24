---
title: Meta (Instagram) SDK - Инструкция по использованию
description: Изучи этот документ, если пользователь просит написать функционал, который взаимодействует с Instagram через Meta API (ответы на комментарии, проверка подписки, отправка Direct-сообщений). Здесь описаны функции SDK Meta и их параметры.
requireApp: meta
---

# Meta (Instagram) SDK Documentation

SDK для работы с Instagram через Meta Graph API из других плагинов Chatium.

## Установка и импорт

```typescript
import {
  replyToInstagramComment,
  checkInstagramSubscription,
  sendDirectMessage
} from '@meta/sdk'
```

## Общие правила

- Все функции принимают `ctx` первым аргументом и `params` вторым
- Все функции возвращают `{ ok: boolean, result: any | string }`
- При `ok: false` в `result` содержится текст ошибки
- При `ok: true` в `result` содержится результат операции
- В примерах `channel` — согласованный Instagram-канал из webhook после фильтрации; `commentId` и `instagramUserId` — ID целевого комментария и IGSID пользователя из соответствующего события, не произвольные значения.
- Транспорт Instagram (токен доступа, pageId) определяется автоматически по `channelExternalId`
- `channelExternalId` — это значение `channel.externalId` из webhook-payload, в формате `meta:<instagramBusinessAccountId>`

---

## Комментарии Instagram

### replyToInstagramComment

Публичный ответ на комментарий в Instagram + опциональный Private Reply в Direct.

```typescript
import { replyToInstagramComment } from '@meta/sdk'

const result = await replyToInstagramComment(ctx, {
  channelExternalId: channel.externalId,
  comment_id: commentId,
  text: 'Спасибо за комментарий!',
  private_reply_text: 'Привет! Отправил подробности в Direct.'  // опционально
})

if (result.ok) {
  // result.result — { comment_id, reply_id, text, private_reply }
  // private_reply: { success: boolean, message_id?: string, error?: string } | undefined
}
```

**Параметры:**

| Параметр | Тип | Обязательный | Описание |
|----------|-----|:------------:|----------|
| channelExternalId | string | да | `channel.externalId` из webhook |
| comment_id | string | да | ID комментария Instagram |
| text | string | да | Текст публичного ответа на комментарий |
| private_reply_text | string | нет | Текст Private Reply в Direct |

**Логика работы:**
1. Находит Instagram-транспорт по `channelExternalId`, получает валидный токен
2. Публикует публичный ответ на комментарий через Graph API
3. Если передан `private_reply_text` — дополнительно отправляет Private Reply в Direct
4. Возвращает информацию об опубликованном ответе и статус Private Reply (если был запрошен)

---

## Подписка пользователя

### checkInstagramSubscription

Проверка, подписан ли пользователь Instagram на бизнес-аккаунт.

```typescript
import { checkInstagramSubscription } from '@meta/sdk'

const result = await checkInstagramSubscription(ctx, {
  channelExternalId: channel.externalId,
  userId: instagramUserId  // IGSID
})

if (result.ok) {
  // result.result — { is_following: boolean }
}
```

**Параметры:**

| Параметр | Тип | Обязательный | Описание |
|----------|-----|:------------:|----------|
| channelExternalId | string | да | `channel.externalId` из webhook |
| userId | string | да | IGSID пользователя Instagram |

**Логика работы:**
1. Находит Instagram-транспорт по `channelExternalId`, получает валидный токен
2. Запрашивает у Graph API поле `is_user_follow_business` для пользователя
3. Возвращает `{ is_following: true | false }`

**Особенности:**
- Если у бизнеса нет согласия пользователя (User consent), Graph API возвращает ошибку с кодом `230`. В этом случае `result` будет содержать сообщение: `"User consent is required — пользователь ещё не взаимодействовал с бизнесом в Direct"`. Пользователь должен сначала написать бизнесу в Direct, чтобы появилась возможность проверить подписку.

---

## Direct-сообщения

### sendDirectMessage

Отправка текстового сообщения пользователю Instagram в Direct.

```typescript
import { sendDirectMessage } from '@meta/sdk'

const result = await sendDirectMessage(ctx, {
  channelExternalId: channel.externalId,
  userId: instagramUserId,  // IGSID получателя
  text: 'Здравствуйте! Чем могу помочь?'
})

if (result.ok) {
  // result.result — { message_id, recipient_id }
}
```

**Параметры:**

| Параметр | Тип | Обязательный | Описание |
|----------|-----|:------------:|----------|
| channelExternalId | string | да | `channel.externalId` из webhook |
| userId | string | да | IGSID получателя |
| text | string | да | Текст сообщения |

**Логика работы:**
1. Находит Instagram-транспорт по `channelExternalId`, получает валидный токен и `pageId`
2. Отправляет сообщение через `POST /{pageId}/messages`
3. Возвращает идентификаторы отправленного сообщения и получателя

**Особенности:**
- Действует 24-часовое окно ответа Instagram Messaging: если последнее сообщение от пользователя пришло более 24 часов назад, API вернёт ошибку. В этом случае `result` будет содержать сообщение: `"Cannot send message: 24-hour response window has expired."`
