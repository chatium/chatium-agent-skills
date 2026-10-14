---
title: Meta (Instagram) SDK - Инструкция по использованию
description: Изучи этот документ, если пользователь просит написать функционал, который взаимодействует с Instagram через Meta API (ответы на комментарии и Private Reply, проверка подписки, отправка Direct-сообщений с кнопками, обработка нажатий кнопок). Здесь описаны функции SDK Meta, их параметры и события Instagram в хуке `@sender/webhook-received`.
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
- В примерах `channel` — Instagram-канал из события после фильтрации по `channel.type === 'instagram'`; `commentId` и `instagramUserId` — ID целевого комментария и IGSID пользователя из того же события, не произвольные значения.
- Транспорт Instagram (токен доступа, pageId) определяется автоматически по `channelExternalId`
- `channelExternalId` обязателен во всех методах — это `channel.externalId` Instagram-канала Sender, в формате `meta:<instagramBusinessAccountId>`. IGSID действует только в пределах одного бизнес-аккаунта, поэтому канал и пользователь должны относиться к одному аккаунту.

---

## Комментарии Instagram

### replyToInstagramComment

Отвечает на комментарий публично, через Private Reply в Direct или обоими способами.

```typescript
import { replyToInstagramComment } from '@meta/sdk'

// Публичный ответ + Private Reply: сначала комментарий, затем Direct
const result = await replyToInstagramComment(ctx, {
  channelExternalId: channel.externalId,
  comment_id: commentId,
  text: 'Спасибо за комментарий!',
  private_reply_text: 'Привет! Отправил подробности в Direct.'
})

if (result.ok) {
  // result.result — { comment_id, reply_id?, text?, private_reply? }
  // private_reply: { success: boolean, message_id?: string, error?: string } | undefined
}
```

Чтобы отправить только публичный ответ, передайте `text` без `private_reply_text`.

```typescript
// Только Private Reply: публичный ответ под комментарием не создаётся
const result = await replyToInstagramComment(ctx, {
  channelExternalId: channel.externalId,
  comment_id: commentId,
  private_reply_text: 'Привет! Отправил подробности в Direct.'
})
```

**Параметры:**

| Параметр | Тип | Обязательный | Описание |
|----------|-----|:------------:|----------|
| channelExternalId | string | да | `channel.externalId` Instagram-канала |
| comment_id | string | да | ID комментария Instagram |
| text | string | нет | Текст публичного ответа на комментарий |
| private_reply_text | string | нет | Текст Private Reply в Direct |

Нужен хотя бы один из `text` и `private_reply_text`. Если не передать ни одного из них, метод вернёт ошибку. `text: ''` тоже вызывает ошибку: для отправки только в Direct поле `text` нужно полностью опустить.

**Логика работы:**
1. Находит Instagram-транспорт по `channelExternalId`, получает валидный токен
2. Если передан `text`, публикует публичный ответ на комментарий через Graph API
3. Если передан `private_reply_text`, отправляет Private Reply после публичного ответа или сразу, когда `text` отсутствует
4. Возвращает результат выполненной операции; `reply_id` и `text` заполнены только при публичном ответе

При запросе обоих ответов ошибка публикации комментария останавливает отправку в Direct (`ok: false`). Если публичный ответ успешен, а Private Reply нет, `ok` остаётся `true`; проверяйте `result.result.private_reply.success`. В режиме только Private Reply `ok` отражает результат его отправки.

**Ограничения Meta для Private Reply:** один Private Reply на комментарий, не позже 7 дней после комментария, только текст без вложений.

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

// В типах SDK result — { is_following: boolean } | string
if (result.ok && typeof result.result !== 'string' && result.result.is_following) {
  // пользователь подписан
}
```

**Параметры:**

| Параметр | Тип | Обязательный | Описание |
|----------|-----|:------------:|----------|
| channelExternalId | string | да | `channel.externalId` Instagram-канала |
| userId | string | да | IGSID пользователя Instagram |

**Логика работы:**
1. Находит Instagram-транспорт по `channelExternalId`, получает валидный токен
2. Запрашивает у Graph API поле `is_user_follow_business` для пользователя
3. Возвращает `{ is_following: true | false }`

**Особенности:**
- Если у бизнеса нет согласия пользователя (User consent), Graph API возвращает ошибку с кодом `230`. В этом случае `result` будет содержать сообщение: `"User consent is required — пользователь ещё не взаимодействовал с бизнесом в Direct"`. Пользователь должен сначала написать бизнесу в Direct, чтобы появилась возможность проверить подписку. Не путайте этот `ok: false` с `is_following: false`.

---

## Direct-сообщения

### sendDirectMessage

Отправка сообщения пользователю Instagram в Direct: обычного текста или текста с кнопками.

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
| channelExternalId | string | да | `channel.externalId` Instagram-канала |
| userId | string | да | IGSID получателя |
| text | string | да | Текст сообщения. С кнопками — не длиннее 640 символов |
| buttons | `SendDirectMessageButton[]` | нет | Кнопки под текстом (1–3), см. «Кнопки». Не передано или `[]` — обычное сообщение |
| inlineButtons, disableKeyboardRemove, isPersistentKeyboard | unknown | нет | Настройки клавиатуры Chatium. В Instagram клавиатуры нет — принимаются и игнорируются |

**Логика работы:**
1. Проверяет параметры и кнопки; при ошибке ничего не отправляет
2. Находит Instagram-транспорт по `channelExternalId`, получает валидный токен и `pageId`
3. Отправляет сообщение через `POST /{pageId}/messages`; при непустом `buttons` — как Instagram Button Template
4. Возвращает идентификаторы отправленного сообщения и получателя

**Особенности:**
- Действует 24-часовое окно ответа Instagram Messaging: если последнее сообщение от пользователя пришло более 24 часов назад, API вернёт ошибку. В этом случае `result` будет содержать сообщение: `"Cannot send message: 24-hour response window has expired."`
- Отправленное сообщение, с кнопками или без, попадает в историю чата Sender через эхо Instagram. Эхо не вызывает `@sender/webhook-received`.

#### Кнопки (Instagram Button Template)

Сообщение с кнопками — это текст и до 3 кнопок под ним. Кнопка либо открывает ссылку (`url`), либо при нажатии присылает плагину код действия (`payload`) событием `instagram_postback`.

```typescript
const result = await sendDirectMessage(ctx, {
  channelExternalId: channel.externalId,
  userId: instagramUserId,
  text: 'Что вам прислать?',
  buttons: [
    { title: 'Получить прайс', payload: 'GET_PRICE' },
    { title: 'Наш сайт', url: 'https://example.com' },
  ],
})
```

**Поля кнопки:**

| Поле | Обязательное | Что происходит |
|---|---|---|
| title | да | Текст на кнопке |
| url | одно из `url` / `payload` | Кнопка открывает ссылку |
| payload | одно из `url` / `payload` | При нажатии приходит событие `instagram_postback` с этим значением |
| color | нет | Игнорируется: у кнопок Instagram нет оформления |
| id | нет | Игнорируется и вместо `payload` не подставляется |
| requestContact | нет | `true` — ошибка: Instagram не поддерживает запрос контакта |
| openAsWebApp | нет | `true` — ошибка: Instagram не поддерживает веб-приложения |

**Правила.** Все кнопки проверяются до отправки. При нарушении метод возвращает `{ ok: false, result: 'Кнопки Instagram: …' }` и ничего не отправляет:
- не больше 3 кнопок;
- `text` не пустой и не длиннее 640 символов (эмодзи считается одним символом);
- у каждой кнопки непустой `title` и ровно одно из `url` / `payload`;
- `url` и `payload` — строки; пустая строка или строка из пробелов означает «не задано»;
- `requestContact` и `openAsWebApp` — только `false` или не переданы.

Если ошибка относится к конкретной кнопке, в конце текста указан её номер с 1, например `(#1)` или `(#1, url)`.

Кнопки видны только в мобильном приложении Instagram, в веб-версии Meta их не показывает.

#### Кнопки при отправке через Sender

Сообщение с `buttons` можно отправить в Instagram-чат и через `@sender/sdk` (см. [sender-messaging.md](sender-messaging.md)). Применяются те же правила: строки кнопок объединяются по порядку (всего не больше 3), у каждой кнопки `text` становится названием, `url` — ссылкой, `callbackData` — `payload`. Если кнопки не проходят проверку, сообщение не отправляется. Текст уходит одним сообщением с кнопками, файлы — отдельными сообщениями после него.

---

## События Instagram в `@sender/webhook-received`

Комментарии, Direct-сообщения и нажатия кнопок приходят в общий хук аккаунта `@sender/webhook-received` (см. [sender-webhooks.md](sender-webhooks.md)). В хуке `params.channel` — `ChannelPublicDto`: Instagram-канал определяется по `channel.type === 'instagram'`, тип события — по `sourcePayload.type`. Для этих событий `chatId` не передаётся, а `chat` равен `null`.

| `sourcePayload.type` | Событие | `sourcePayload.data` |
|---|---|---|
| `instagram_comment` | Комментарий под публикацией | `{ id, text, from: { id, username? }, media?: { id }, parentId? }`; `from.id` — IGSID автора |
| `instagram_direct_message` | Сообщение в Direct | `{ id, chatId, text?, attachments? }`; `chatId` — IGSID отправителя |
| `instagram_postback` | Нажатие кнопки с `payload` | см. ниже |

`sourcePayload.sender` во всех трёх событиях — `{ id, username?, name?, profile_pic? }`; если данные профиля получить не удалось, есть только `id` (у комментария ещё `username`).

- Собственные комментарии бизнес-аккаунта и события без текста (удаление, редактирование) в хук не передаются.
- Direct-сообщение, кроме этого события, создаёт обычное входящее сообщение в чате Sender. Нажатие кнопки сообщения в Sender не создаёт.

### Нажатие на кнопку — `instagram_postback`

Нажатие приходит **только** этим событием хука. Оно одинаково для кнопок SDK (`payload`), кнопок из Sender (`callbackData`), а также Ice Breakers и постоянного меню аккаунта. Что означает `payload`, решает ваш плагин.

```json
{
  "type": "instagram_postback",
  "data": {
    "id": "aWdfZAG1faXRlbTox...",
    "chatId": "906963382156839",
    "title": "Получить прайс",
    "payload": "GET_PRICE",
    "timestamp": 1760360000000
  },
  "sender": {
    "id": "906963382156839",
    "username": "example.user",
    "name": "Иван",
    "profile_pic": "https://..."
  }
}
```

| Поле | Тип | Значение |
|---|---|---|
| `data.id` | string \| null | mid нажатия от Instagram; `null`, если Meta его не прислала |
| `data.chatId` | string | IGSID нажавшего |
| `data.title` | string | Название нажатой кнопки; `""`, если Meta его не прислала (тогда заполнен `payload`) |
| `data.payload` | string | `payload` кнопки из SDK / `callbackData` кнопки из Sender; `""`, если Meta его не прислала (тогда заполнен `title`) |
| `data.timestamp` | number \| null | Время нажатия от Meta, мс; `null`, если Meta его не прислала |

Доставка без гарантий:
- Meta может доставить одно нажатие повторно; плагин дубли не отсеивает и уникальность `data.id` не гарантирует — делайте обработку идемпотентной;
- при сбое пересылки отдельное нажатие может не прийти, повторной доставки нет.

### Пример обработчика

```typescript
import type { ChannelPublicDto } from '@sender/sdk'
import { replyToInstagramComment, checkInstagramSubscription, sendDirectMessage } from '@meta/sdk'

// Публичного типа параметров хука нет: описаны только используемые поля.
type InstagramSourcePayload =
  | { type: 'instagram_comment'; data: { id: string; text: string; from: { id: string; username?: string } } }
  | { type: 'instagram_direct_message'; data: { id: string; chatId: string; text?: string } }
  | { type: 'instagram_postback'; data: { id: string | null; chatId: string; title: string; payload: string; timestamp: number | null } }

app.accountHook('@sender/webhook-received', async (ctx, params: { channel: ChannelPublicDto; sourcePayload: unknown }) => {
  const channelExternalId = params.channel.externalId
  if (params.channel.type !== 'instagram' || !channelExternalId) return

  // Другие значения type не попадут ни в одну ветку ниже.
  const event = params.sourcePayload as InstagramSourcePayload

  if (event.type === 'instagram_comment') {
    const comment = event.data
    const sub = await checkInstagramSubscription(ctx, { channelExternalId, userId: comment.from.id })
    // ok: false без User consent — автор ещё не писал бизнесу в Direct
    const isFollowing = sub.ok && typeof sub.result !== 'string' && sub.result.is_following

    await replyToInstagramComment(ctx, {
      channelExternalId,
      comment_id: comment.id,
      ...(isFollowing
        ? { text: 'Спасибо за комментарий!', private_reply_text: 'Вот ваш подарок: ...' }
        : { text: 'Подпишитесь на наш аккаунт и попробуйте снова!' }),
    })
  }

  if (event.type === 'instagram_direct_message') {
    await sendDirectMessage(ctx, {
      channelExternalId,
      userId: event.data.chatId,
      text: 'Что вам прислать?',
      buttons: [{ title: 'Получить прайс', payload: 'GET_PRICE' }],
    })
  }

  if (event.type === 'instagram_postback' && event.data.payload === 'GET_PRICE') {
    await sendDirectMessage(ctx, { channelExternalId, userId: event.data.chatId, text: 'Вот прайс: ...' })
  }
})
```

Если к Instagram-каналу подключён AI-агент, он тоже ответит на Direct-сообщение: не дублируйте его ответ из хука.

---

## Где взять IGSID пользователя

IGSID (Instagram-Scoped ID) — ID пользователя в пределах одного бизнес-аккаунта Instagram. Его передают в `userId`:

- комментарий в `@sender/webhook-received`: `sourcePayload.data.from.id`;
- Direct-сообщение и нажатие кнопки в `@sender/webhook-received`: `sourcePayload.data.chatId`;
- персона Sender в Instagram-канале: `person.externalId`;
- контакты клиента CRM: контакт `{ type: 'instagram_uid', value: '<IGSID>' }`.

### В инструменте AI-агента

Бери IGSID из контактов клиента в `body.context.customerContacts`: элемент с `type: 'instagram_uid'`, его `value` — IGSID. Поле есть, только если цепочка связана с клиентом CRM. Не выводи IGSID из `chainKey`: у цепочки клиента CRM ключ — ID клиента.

```typescript
// context в схеме тула: customerContacts: s.array(s.object({ type: s.string(), value: s.string() })).optional()
const igsid = body.context.customerContacts?.find(contact => contact.type === 'instagram_uid')?.value
if (!igsid) return { ok: false, result: 'У клиента нет контакта Instagram' }
```

Контакт не указывает Instagram-аккаунт. Если в аккаунте один активный Instagram-канал, `channelExternalId` — его `externalId` из `getChannelsByType(ctx, 'instagram')`. Если каналов несколько, по контакту канал не определить: согласуй с пользователем, какой канал использовать.
