---
name: Создание веб-чата на Vue
description: >-
  Создание и встраивание веб-чата на Vue через публичный SDK @start/sdk/chatClient/vue:
  хук useChatClient, рендер ленты и «моё/чужое», отправка с файлами, подгрузка истории,
  realtime по сокету, inject для автовебинара/фейковых сообщений, произвольные
  метаданные сообщения (data) для флагов и баннеров, и подключение AI-агента
  через серверный токен generateChatClientAgentToken.
  Использовать при создании виджетов, чатов поддержки, общего чата/комнаты,
  чата-вебинара или чата с агентом
---

# chatClient — Vue-клиент

Дженерик SDK для любого веб-чата. Вся техника чата (канал, сокет, история,
оптимистичная отправка, мерж ленты) — внутри SDK.

## Импорты

```ts
import { useChatClient } from '@start/sdk/chatClient/vue'
import type {
  ChatClientMessageView, // = сообщение в ленте
  ChatClientFile,        // файл для send()
  ChatClientChange,      // дельта (нужна только если уходишь на core напрямую)
} from '@start/sdk/chatClient/vue'

// серверный выпуск токена для привязки агента — из корня SDK:
import { generateChatClientAgentToken } from '@start/sdk'
```

## Быстрый старт (чат поддержки)

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useChatClient } from '@start/sdk/chatClient/vue'

const { messages, me, hasEarlier, loading, error, send, loadEarlier } =
  useChatClient({
    transport: { key: 'support-service-chat', title: 'Поддержка' },
    chat: { externalId: 'demo' },
  })

const draft = ref('')
const isMine = (m: { createdBy: string }) => m.createdBy === me.value

async function submit() {
  const text = draft.value.trim()
  if (!text) return
  draft.value = ''
  await send(text) // оптимистично появится сразу, потом подтвердится по сокету
}
</script>

<template>
  <button v-if="hasEarlier" @click="loadEarlier">Загрузить ранее</button>
  <div
    v-for="m in messages"
    :key="m.id"
    :class="{ mine: isMine(m), pending: m.pending }"
  >
    {{ m.text }}
  </div>
  <form @submit.prevent="submit"><input v-model="draft" /></form>
</template>
```

`useChatClient` сам зовёт `init()` при монтировании и чистится в `onUnmounted` —
вручную ничего вызывать не нужно.

## API

`useChatClient(opts)` возвращает реактивные refs и методы отправки, пагинации, локальной вставки и предварительного создания чата. Актуальные формы `ChatClientOptions`, `ChatClientMessage`, `ChatClientMessageView`, `ChatClientFile` и результата хука экспортируются из `@start/sdk/chatClient/vue`.

## Как указывать идентификаторы

- **`transport.key`** — тип виджета (`'support-SLUG'`, `'webinar-ID'`, …). Из него
  выводится канал: один на аккаунт и на ключ. `title` нужен только при первом
  создании канала, дальше необязателен.
- **`chat.externalId`** — id конкретного разговора внутри канала. Ты сам решаешь,
  что это: `'demo'`, `order-<id>`, `lesson-<id>` и т.п.
- **`chat.shared`**:
  - `false`/опущено → **индивидуальный** чат. Каждый юзер получает свой чат под
    этим `externalId` (в своём неймспейсе). Это сценарий «поддержка/визитёр↔агент».
  - `true` → **общий** (группа/комната): один на `(канал, externalId)` для всех.
    ⚠️ Для группы `externalId` = capability: любой авторизованный юзер аккаунта,
    угадав его, читает/пишет. Для непубличных групп делай `externalId`
    неугадываемым (например с секретным суффиксом). В группах недоступна привязка агента

## Сообщения

- **«Моё/чужое»**: `m.createdBy === me.value`. SDK ролевно-нейтрален — сторону и
  отображение определяешь ты.
- **«Часики»**: `m.pending === true` пока сервер не подтвердил отправку.
- **Имя/аватар**: SDK несёт только `createdBy` (id). Резолв id → имя/аватар — на
  тебе.

## Возможности

### Отправка с файлами

```ts
await send('смотри', {
  files: [{ url, hash, mime_type: 'image/png', name: 'pic.png' }],
})
```

`url` и `hash` обязательны (тип `ChatClientFile`).

### Метаданные сообщения (`data`) — флаги, баннеры

К любому сообщению можно прицепить произвольный объект `data` — он делает
round-trip (отправка → эхо по сокету → история) и доступен на оптимистике сразу.
Используй для флагов, разметки, служебных меток; что рисовать по ним — решаешь сам.

```ts
// отправка с флагом
await send('Оплатите заказ', {
  data: { banner: 'payment', orderId: '42' },
})

// inject тоже несёт data
inject([
  {
    id: 'sys:1',
    text: 'Системное уведомление',
    files: null,
    createdBy: 'system',
    createdAt: new Date().toISOString(),
    data: { banner: 'info' },
  },
])
```

```vue
<div v-for="m in messages" :key="m.id">
  <PaymentBanner v-if="m.data?.banner === 'payment'" :order-id="m.data.orderId" />
  {{ m.text }}
</div>
```

`data` появляется сразу на своём (оптимистичном) сообщении, переживает эхо и
подгрузку истории. Для **группы** и своего сообщения в **individual** приходит и
по сокету; для эха individual-сообщения *другим* вкладкам перенос `data` по
realtime зависит от sender (на оптимистик/историю это не влияет).

### Пагинация истории

`hasEarlier` → показать кнопку; `loadEarlier()` догружает предыдущую страницу
(по 300). Лента остаётся отсортированной автоматически.

### Realtime

Подписка на сокет — автоматически при `init()`. Новые сообщения (свои эхо, ответы
агента/оператора) прилетают в `messages` сами.

### inject — фейковые/локальные сообщения (автовебинар)

Подкидывает сообщения в ту же ленту (merge + сортировка по `createdAt` + дедуп по
`id`). Помечаются `source: 'local'`. Тайминг (когда звать) — на тебе.

```ts
const { inject } = useChatClient({
  transport: { key: 'webinar' },
  chat: { externalId: 'webinar-demo' },
})

// createdAt — абсолютный момент: SDK поставит сообщение в нужное место ленты.
inject([
  {
    id: 'fake:1',
    createdBy: 'persona:Анна',
    text: 'Привет всем!',
    files: null,
    createdAt: new Date(new Date(webinar.startedAt).getTime() + 3000).toISOString(),
  },
])
```

Различай в рендере: `m.source === 'local'` (фейк) vs `'real'` (из sender).

## Подключение агента через серверный роут

Привязка агента к каналу декларативна: передаёшь `agentId` + `agentToken` в
`useChatClient`. Токен защищает `agentId` от подмены на клиенте и выпускается
**серверно** через `generateChatClientAgentToken(ctx, { agentId, transportKey })`.
`transportKey` обязан совпадать с `transport.key` чата.

Рекомендуемый способ — выпустить токен в **серверном page-роуте** и отдать пропом
(токен готов синхронно, без клиентского раунд-трипа):

```tsx
import { jsx } from '@app/html-jsx'
import { generateChatClientAgentToken } from '@start/sdk'
import MyChat from './MyChat.vue'

// my-chat.tsx
export const myChatPage = app.get('/', async ctx => {
  const agentId = 'my-agent-id'
  const agentToken = await generateChatClientAgentToken(ctx, {
    agentId,
    transportKey: 'support', // == transport.key ниже
  })

  return (
    <html>
      <head><title>Чат</title></head>
      <body>
        <MyChat agentId={agentId} agentToken={agentToken} />
      </body>
    </html>
  )
})
```

```vue
<!-- MyChat.vue -->
<script setup lang="ts">
import { useChatClient } from '@start/sdk/chatClient/vue'

const props = defineProps<{ agentId: string; agentToken: string }>()

const { messages, me, send, agentLinked } = useChatClient({
  transport: { key: 'support', title: 'Поддержка' },
  chat: { externalId: 'demo' }, // индивидуальный: визитёр → агент
  agentId: props.agentId,
  agentToken: props.agentToken,
})
// agentLinked: true — привязан, false — токен невалиден/сбой, undefined — не запрашивали
</script>
```

> Альтернатива для SPA без серверного рендера пропа: завести свой роут, вернуть из
> него токен и дёрнуть `await myTokenRoute.run(ctx, …)` до `useChatClient` (учти,
> что `useChatClient` инитит синхронно — токен должен быть готов к моменту вызова).

### Создать чат заранее (`ensure`)

По умолчанию sender-чат **ленивый**: рождается на первом `send()`. Визит страницы
чат не создаёт — пустые чаты в sender не плодятся.

`ensure()` материализует чат заранее, без отправки сообщения.

> ⚠️ Использовать **только при явной необходимости иметь чат заранее** — например,
> чтобы **агент мог написать в этот чат первым** (до того, как визитёр что-либо
> отправил). Если такой потребности нет — не зови `ensure()`, оставь ленивое
> создание, иначе будешь плодить пустые чаты.

```ts
const { ensure } = useChatClient({
  transport: { key: 'webinar', title: 'Автовебинар' },
  chat: { externalId: 'webinar-demo' },
  agentId,
  agentToken,
})

await ensure() // чат создан, сообщений нет — теперь агент может поздороваться первым
```

Идемпотентно: повторный `ensure()` (или обычный `send()`) тот же чат не дублирует.
