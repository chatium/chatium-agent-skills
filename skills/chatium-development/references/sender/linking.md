---
title: Привязка мессенджера к контакту через CRM LinkBucket — полный пример
description: >
  Изучи этот документ, если пользователь просит реализовать привязку мессенджера (Telegram, VK, Макс, Max и др.) к контакту,
  связать форму с ботом, создать deep link для перехода в мессенджер после заполнения формы,
  или упоминает слова "привязка мессенджера", "связка контакта", "linkBucket", "createLinkBucket",
  "deep link", "диплинк", "перейти в бота после формы", "подключить мессенджер к контакту".
---

# Привязка мессенджера к контакту через CRM LinkBucket

Для передачи стартовых данных без CRM-связки используй [обычный bucket](#обычный-bucket-передача-стартового-контекста). Для связывания контактов при переходе web → мессенджер нужен `createLinkBucket` из `@crm/sdk`.

`CreateLinkBucketInput` и `CreateLinkBucketResult` экспортируются из `@crm/sdk`. Метод принимает `contacts` или `contactIds` уже существующих контактов и необязательный `payload`; проверяй `success` перед использованием `bucketId`.

## Обзор сценария

Типичный флоу:

1. Пользователь заполняет форму на сайте (вводит email, телефон, имя и т.д.)
2. Пользователь выбирает мессенджер (Telegram, VK и др.) и нажимает кнопку
3. На **сервере** формируется `linkBucket` через `createLinkBucket` из `@crm/sdk` — в него передаются контакты и любые данные для бизнес-логики
4. Сервер возвращает deep link на нужного бота с ID бакета в стартовом параметре
5. Пользователь переходит по deep link и запускает бота в мессенджере
6. **CRM автоматически** видит, что бот запущен с бакетом, и **сама связывает** контакт мессенджера с контактами, переданными при создании бакета (email, телефон и т.д.)
7. Хук `@sender/message-received` срабатывает — в нём кодирующий агент может отследить привязку и выполнить дополнительную бизнес-логику

---

## ⚠️ КРИТИЧЕСКИ ВАЖНО

### `createLinkBucket` — ТОЛЬКО серверная функция

`createLinkBucket` — это **серверная** функция. Она **НЕ будет работать на клиенте**. Всегда вызывай её в серверном обработчике (`app.post`, `app.get` и т.д.), **никогда** — в клиентском коде (React-компоненты, обработчики кликов на стороне браузера и т.д.).

Если пользователь хочет, чтобы deep link формировался после заполнения формы или по клику на кнопку — нужно:
1. Отправить запрос на сервер
2. На сервере создать `linkBucket` и сформировать deep link
3. Вернуть ссылку клиенту и выполнить редирект

### Баг Safari с асинхронным открытием ссылок

В Safari (и некоторых версиях iOS WebView) **`window.open()` блокируется**, если вызывается **не синхронно** в обработчике клика. Если после клика на кнопку идёт `await fetch(...)`, а потом `window.open(link)` — Safari заблокирует открытие как popup.

**Решение — использовать `window.location.href` вместо `window.open()`**:

Используй `window.location.href = result.link` после успешного ответа RouteRef; клиентский пример ниже.

---

## Deep link форматы для разных мессенджеров

У каждого мессенджера **свой формат** deep link для передачи стартового параметра. При формировании ссылки нужно учитывать целевой мессенджер:

| Мессенджер | Формат deep link | Пример |
|------------|-----------------|--------|
| **Telegram** | `https://t.me/{botUsername}?start=bucket-{bucketId}` | `https://t.me/{botUsername}?start=bucket-{bucketId}` |
| **VKontakte** | `https://vk.com/im?sel=-{groupId}&ref=bucket-{bucketId}` | `https://vk.com/write-{groupId}?ref=bucket-{bucketId}` |
| **Макс / Max** | `https://max.ru/{bot}?start=bucket-{bucketId}` | `https://max.ru/{botUsername}?start=bucket-{bucketId}` |

> **Важно:** Формат deep link зависит от мессенджера. При необходимости поддержки нескольких мессенджеров — формируй ссылки динамически в зависимости от выбора пользователя.

---

## Определение канала: два подхода

Чтобы сформировать deep link, нужно знать username бота (для Telegram/Max) или externalId группы (для VK). Есть два способа получить эти данные:

### Подход 1 (рекомендуемый): Определить канал заранее через `chatium exec`

Перед написанием кода используй тул `chatium exec`, чтобы получить список каналов нужного типа и **согласовать с пользователем**, какой именно канал использовать:

```typescript
// Выполни этот код через chatium exec, чтобы узнать подключённые каналы
import { getChannelsByType } from '@sender/sdk'
const channels = await getChannelsByType(ctx, 'telegram') // или 'vk', 'max' и т.д.
return channels.map(ch => ({ id: ch.id, username: ch.username, externalId: ch.externalId, title: ch.title, active: ch.active }))
```

После выполнения покажи пользователю список каналов и уточни, какой использовать. Когда канал согласован — **захардкодь его данные** (username/externalId) прямо в коде. Это оптимальнее, т.к. не требует лишнего запроса при каждом вызове API.

```typescript
// Замени placeholder на username выбранного и согласованного канала
const TELEGRAM_BOT_USERNAME = '<telegram_bot_username>'
link = `https://t.me/${TELEGRAM_BOT_USERNAME}?start=bucket-${result.bucketId}`
```

**Преимущества:** нет лишнего сетевого запроса при каждом вызове, код проще и быстрее.

### Подход 2 (запасной): Определить канал динамически через `getChannelsByType`

Если канал заранее неизвестен, или пользователь **явно попросил** динамическое определение — используй `getChannelsByType(ctx, type)` в рантайме:

```typescript
import { getChannelsByType } from '@sender/sdk'

// type: 'telegram' | 'vk' | 'max' | 'viber' | 'email' | 'sms' | 'widget' | 'wazzup24' | 'avito' | 'bitrix24' | 'instagram' | 'facebook'
const tgChannels = await getChannelsByType(ctx, 'telegram')
const activeChannels = tgChannels.filter(ch => ch.active)
if (activeChannels.length !== 1) {
  return { success: false, error: 'Нужно выбрать конкретный Telegram-канал' }
}
const tgChannel = activeChannels[0]
if (!tgChannel?.username) {
  return { success: false, error: 'Telegram бот не подключён' }
}
link = `https://t.me/${tgChannel.username}?start=bucket-${result.bucketId}`
```

> **⚠️ Опасность динамического подхода:** Если у пользователя несколько каналов одного типа (например, два Telegram-бота), `getChannelsByType` вернёт их все, и `.find(ch => ch.active)` подхватит **произвольный** из них. Это приведёт к тому, что пользователей будет перебрасывать в разные боты — **это очень плохо**. Поэтому **всегда предпочитай подход 1** (chatium exec + хардкод конкретного канала).

> **Подход 2 оправдан ТОЛЬКО если** пользователь явно попросил динамическое определение И в аккаунте гарантированно один канал данного типа.

---

## Шаг 1. Серверный API — создание LinkBucket и формирование deep link

```typescript
import { createLinkBucket, ContactType } from '@crm/sdk'

// ── Данные каналов (определены заранее через chatium exec и согласованы с пользователем) ──
// Перед написанием кода выполни через chatium exec:
//   import { getChannelsByType } from '@sender/sdk'
//   return await getChannelsByType(ctx, 'telegram')  // или 'vk', 'max'
// Покажи результат пользователю и уточни, какой канал использовать. Затем подставь реальные значения:
const TELEGRAM_BOT_USERNAME = '<telegram_bot_username>'
const VK_GROUP_ID = '<vk_group_id>'
const MAX_BOT_USERNAME = '<max_bot_username>'

// Обработчик формы — СЕРВЕРНАЯ СТОРОНА
// ВАЖНО: экспортируй роут, чтобы на клиенте можно было вызвать его через .run(ctx, body)
// api/link-messenger.ts
export const linkMessengerRoute = app.post('/')
  .body(s => ({
    email: s.string().optional(), phone: s.string().optional(), name: s.string(),
    messenger: s.enum(['telegram', 'vk', 'max']),
  }))
  .handle(async (ctx, req) => {
  const { email, phone, name, messenger } = req.body

  if (!email && !phone) return { success: false, error: 'Укажите email или телефон' }

  // Создаём linkBucket с контактами для автоматической связки в CRM
  const result = await createLinkBucket(ctx, {
    // Контакты, к которым CRM привяжет мессенджер пользователя автоматически
    contacts: [
      ...(email ? [{ type: ContactType.Email, value: email }] : []),
      ...(phone ? [{ type: ContactType.Phone, value: phone }] : []),
    ],
    // payload — любые данные для бизнес-логики
    // Обязательно передавай уникальный source, чтобы в хуке отфильтровать свои бакеты
    payload: {
      source: 'contact-form',        // ← маркер для идентификации в хуке
      userName: name,
      createdAt: new Date().toISOString(),
    },
  })

  if (!result.success) {
    return { success: false, error: result.errorMessage }
  }

  // Формируем deep link — данные каналов захардкожены (определены заранее)
  let link: string

  switch (messenger) {
    case 'telegram':
      link = `https://t.me/${TELEGRAM_BOT_USERNAME}?start=bucket-${result.bucketId}`
      break

    case 'vk':
      link = `https://vk.com/im?sel=-${VK_GROUP_ID}&ref=bucket-${result.bucketId}`
      break

    case 'max':
      link = `https://max.ru/${MAX_BOT_USERNAME}?start=bucket-${result.bucketId}`
      break

    default:
      return { success: false, error: 'Неподдерживаемый мессенджер' }
  }

  return { success: true, link }
})
```

**Что здесь происходит:**
- `contacts` — массив контактов, к которым CRM **автоматически** привяжет аккаунт мессенджера пользователя. Когда пользователь перейдёт по deep link и запустит бота, CRM сама увидит бакет и выполнит связку.
- `payload` — произвольные данные, которые будут доступны в хуке при обработке входящего сообщения. **Всегда передавай `source`** — уникальный идентификатор твоей функциональности, чтобы отличать свои бакеты от чужих. Выбирай такой `source`, чтобы не пересекаться с другими фичами в аккаунте по неймспейсу. Делай как можно уникальнее. Если есть возмжоность зашить текущий адрес воркспейса - делай это.
- Deep link формируется **по-разному** в зависимости от мессенджера. Идентификатор бакета всегда передаётся с префиксом `bucket-`.

---

## Шаг 2. Клиентский код — вызов серверного роута и редирект

В Chatium клиент вызывает серверные роуты через импорт и `.run(ctx, body)`. **Не используй `fetch` вручную** — он не нужен.

```typescript
// Клиентская сторона — импортируем серверный роут
import { linkMessengerRoute } from './api/link-messenger'

async function submitForm(ctx: app.Ctx, formData: { email?: string; phone?: string; name: string; messenger: 'telegram' | 'vk' | 'max' }) {
  // Вызываем серверный роут через .run() — Chatium сам выполнит запрос
  const result = await linkMessengerRoute.run(ctx, formData)

  if (result.success && result.link) {
    // Используем location.href для совместимости с Safari
    window.location.href = result.link
  } else {
    alert('Ошибка: ' + (result.error || 'Не удалось создать ссылку'))
  }
}
```

> **НИКОГДА не используй `fetch('/api/...')` для вызова серверных роутов.** Всегда импортируй роут и вызывай `.run(ctx, body)`. Chatium сам выполнит HTTP-запрос, обеспечит типизацию и авторизацию.

---

## Шаг 3. Обработка входящего сообщения в хуке

Хук `@sender/message-received` — **общий на весь аккаунт**. В него приходят **ВСЕ** входящие сообщения от **ВСЕХ** ботов и каналов. Сначала фильтруй по `params.channel.id`, затем по `bucket.data.source`, чтобы обрабатывать только свои каналы и бакеты. Ограничения личных чатов и TelegramManager описаны в [webhooks.md](webhooks.md).

```typescript
import { findBucketById, sendMessageToChat } from '@sender/sdk'
import type { SenderMessageReceivedHookParams } from '@sender/sdk'

app.accountHook('@sender/message-received', async (ctx, params: SenderMessageReceivedHookParams) => {
  const allowedChannelIds = new Set(['my-channel-id']) // ID выбранного канала
  if (!allowedChannelIds.has(params.channel.id)) return

  const messageText = params.message.text ?? ''

  // --- Извлечение bucketId ---
  let bucketId: string | null = null

  // Способ 1: платформа автоматически парсит startParam
  const startParam = params.message.extra?.startParam
  if (typeof startParam === 'string' && startParam.startsWith('bucket-')) {
    bucketId = startParam.slice('bucket-'.length)
  }

  // Способ 2: парсим из текста сообщения (для Telegram: /start bucket-xxx)
  if (!bucketId) {
    const startMatch = messageText.match(/^\/start\s+bucket-(\S+)/)
    if (startMatch) {
      bucketId = startMatch[1]
    }
  }

  // Если bucketId не найден — это не наше сообщение, выходим
  if (!bucketId) return

  // --- Получаем данные бакета ---
  const bucket = await findBucketById(ctx, bucketId)
  if (!bucket) return

  // --- ОБЯЗАТЕЛЬНО проверяем source ---
  // Убеждаемся, что этот бакет относится именно к нашей задаче
  if (bucket.data?.source !== 'contact-form') return

  // --- Бизнес-логика ---
  // На этом этапе CRM уже автоматически связала контакт мессенджера
  // с email и телефоном, переданными при создании бакета.
  // Здесь можно выполнить дополнительные действия:

  const chatId = params.chatId
  const userName = typeof bucket.data.userName === 'string' ? bucket.data.userName : 'друг'
  const channelSource = params.channel.source // 'Telegram' | 'Vk' | 'External' и т.д.

  // Пример: отправить приветственное сообщение
  await sendMessageToChat(ctx, chatId, {
    text: `Здравствуйте, ${userName}! Ваш ${channelSource} успешно привязан к аккаунту.`,
    format: 'markdown',
  })

  // Пример: записать результат в таблицу, обновить статус лида и т.д.
  // ... любая дополнительная бизнес-логика ...
})
```

**Что здесь происходит:**
1. Хук получает **каждое** входящее сообщение от каждого бота/канала в аккаунте
2. Мы проверяем, есть ли в сообщении `bucketId` (через `extra.startParam` или парсинг текста)
3. Если `bucketId` есть — получаем бакет через `findBucketById`
4. **Проверяем `source`** — чтобы убедиться, что бакет относится к нашей задаче, а не к какой-то другой логике в аккаунте
5. Извлекаем данные из `bucket.data` и выполняем бизнес-логику
6. К этому моменту **CRM уже автоматически связала** контакт мессенджера с контактами из бакета — нам не нужно делать это вручную

---

## Обычный bucket: передача стартового контекста

Bucket хранит стартовые данные, передаваемые через короткий ID в deep link; в отличие от CRM LinkBucket, он не выполняет связку контактов сам по себе. Ссылки-метрики передают UTM и стартовый параметр бота; сохранённые по хешу данные перехода записываются в чат.

```typescript
import { createBucket, findBucketById, updateOrCreateBucket } from '@sender/sdk'
import type { SenderMessageReceivedHookParams } from '@sender/sdk'
```

Форма bucket экспортируется как `BucketDto` из `@sender/sdk`.

### createBucket

Важная функция, которая позволяет "упаковать" объект с данными в строковый идентификатор, для того, чтобы в последующем можно было получить эти данные из входящего сообщения.

Если нам известен window.clrtUid, настоятельно рекомендуется передавать его в data с ключом `uid`. Это позволит связать чат с сессией пользователя.
Если стоит задача после этого сформировать сообщение для агента, нужно передать строковое значение параметром `agentMessage`.

### findBucketById

Находит бакет по ID.

### updateOrCreateBucket

Обновляет существующий бакет или создает новый.

### Пример применения бакетов

Фрагмент серверного обработчика: `body` — проверенные поля формы, `clrtUid` — переданная клиентом строка `window.clrtUid`. Не создавай сессию ради привязки.

Генерация ссылки для запуска бота с параметром start, содержащим ID бакета. В бакет можно положить любые данные, которые нужны для старта диалога с пользователем:

```typescript
// Замени placeholder на username выбранного и согласованного канала
const botUsername = '<telegram_bot_username>';
// Создание бакета с данными
const bucket = await createBucket(ctx, {
    source: 'campaign-start', // Отдельный маркер этого сценария
    uid: clrtUid, // Рекомендуется для связи с сессией
    ref: 'campaign_123',
    promoCode: 'DISCOUNT2024',
    utmSource: 'google',
    utmMedium: 'cpc',
    utmCampaign: 'spring_sale',
    userProfileId: 'user_456',
    userId: ctx.user?.id, // только существующий системный пользователь
    agentMessage: `Пользователь заполнил форму заявки на консультацию по платформе. Данные формы:
    Имя: ${body.name}
    Телефон: ${body.phone}
    Email: ${body.email}
    Comment: ${body.comment}`
}, clrtUid);

return {
    success: true,
    // Ссылка для запуска бота с параметром start, содержащим ID бакета
    link: `https://t.me/${botUsername}?start=bucket-${bucket.id}`
};
```

Обработка входящего сообщения с параметром start, извлечение ID бакета и получение данных из него:

```typescript
app.accountHook('@sender/message-received', async (ctx, params: SenderMessageReceivedHookParams) => {
    const allowedChannelIds = new Set(['my-channel-id'])
    if (!allowedChannelIds.has(params.channel.id)) return

    const messageText = params.message.text || '';
    const startMatch = messageText.match(/^\/start\s+bucket-(\S+)/);
    if (startMatch) {
        const bucketId = startMatch[1];
        const bucket = await findBucketById(ctx, bucketId);
        if (bucket?.data.source === 'campaign-start') {
            const data = bucket.data;
            // Использование данных из бакета
            const promoCode = data.promoCode;
            const ref = data.ref;
            const utmSource = data.utmSource;
            const profileId = data.userProfileId;
            // Логика обработки данных
        }
    }
});
```
