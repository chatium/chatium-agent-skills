# Sender: каналы, чаты, персоны и теги

Используй для поиска и управления каналами, чатами, профилями Person, тегами и Telegram-группами. Методы и типы импортируются из `@sender/sdk` и вызываются на сервере.

## Основные сущности

- **Channel** — подключённый транспорт: бот, группа, почтовый или другой канал.
- **Chat** — переписка через конкретный канал; связан с Person. Внутренний `chatId` Sender отличается от внешнего ID провайдера.
- **Person** — профиль получателя с контактными данными, полями и тегами; может быть связан с системным User.
- **Tag** — метка для сегментации профилей.

## Подключение и выбор канала

Проверь существующие каналы через `getChannels(ctx)` и покажи пользователю доступные варианты. Если нужного активного канала нет, направь пользователя в Sender UI: `/app/sender/v2#/settings/channel/add`. Транспорт должен быть подключён и активен до разработки интеграции. Когда по запросу подходят несколько каналов, уточни выбор.

## Импорты

```typescript
import {
  getChannels,
  getChannelsByType,
  findChannels,
  createOrUpdateChannelBySecret,
  findChatByExternalId,
  findChatById,
  searchChats,
  getPersonByChatId,
  getPersonByExternalId,
  getPersonsByUserId,
  getPersonsByUid,
  findPersonsByChatIds,
  findPersons,
  addTagsToPerson,
  removeTagsFromPerson,
  updatePersonFields,
  getOrCreateTag,
  getTags,
  getLastActiveGroupsForTgManager,
  getTelegramGroups,
  getOrCreateChat,
} from '@sender/sdk'
```

## Управление каналами связи

### getChannels

Получает список каналов связи, с возможностью сразу отфильтровать по id.

**Параметры**:

- `params.id` - Фильтр по ID канала

**Когда использовать**: Для получения списка всех настроенных каналов коммуникации.

### getChannelsByType

Получает список каналов связи, отфильтрованных по типу транспорта. Удобнее `getChannels`, когда заранее известен тип нужного мессенджера.

**Параметры**:

- `type` - Тип транспорта (строка) или массив типов для фильтрации

**Когда использовать**: Когда нужно получить каналы конкретного мессенджера (например, только Telegram-ботов или только VK-группы). Также удобен при формировании deep link — можно запросить каналы нужного типа и взять из них username или externalId.

**Пример**:

```typescript
// Получить все Telegram-боты
const tgChannels = await getChannelsByType(ctx, 'telegram')
// selectedChannelId — ранее согласованный с пользователем ID
const selectedTgBot = tgChannels.find(ch => ch.id === selectedChannelId && ch.active)

// Получить каналы нескольких типов сразу
const channels = await getChannelsByType(ctx, ['telegram', 'vk', 'max'])
```

### findChannels

Универсальный поиск каналов связи с поддержкой HQL-фильтрации, пагинации и сортировки. В отличие от `getChannels` (фильтр только по `id`) и `getChannelsByType` (фильтр только по типу), этот метод позволяет строить произвольные запросы к каналам — по любым полям, с операторами сравнения, сортировкой и постраничной выдачей.

**Параметры**:

- `params.where` - Обязательные условия фильтрации; используется HQL-синтаксис, аналогичный heap-таблицам
- `params.limit` - Максимальное количество результатов
- `params.offset` - Смещение для пагинации
- `params.order` - Сортировка результатов (например, `'title'`, `{ createdAt: 'desc' }`)

Поля фильтра смотри в SDK; `source` и `externalKey` определяют транспорт.

Фильтрация поддерживает все стандартные HQL-операторы: `$gt`, `$gte`, `$lt`, `$lte`, `$regex`, `$options`, `$or`, `$and`, `$not`, массивы значений (IN) и т.д.

> **Примечание:** `type` и `source` — разные вещи. `source` — это внутренний тип канала в Сендере (например, `'External'`). А `type` — вычисляемое человекопонятное значение (например, `'email'`, `'sms'`, `'wazzup24'`), которое определяется по комбинации `source` и `externalKey`. Фильтровать в `where` можно только по `source` (и/или `externalKey`), а не по `type`.

**Когда использовать**: Когда нужен гибкий поиск каналов по произвольным условиям — например, найти все активные каналы определённого типа, отсортировать по дате создания, или выполнить пагинированную выборку.

**Примеры**:

```typescript
import { findChannels } from '@sender/sdk'

// Пагинация — вторая страница по 10 каналов, отсортированных по дате создания
const page2 = await findChannels(ctx, {
  where: { source: 'Telegram', active: true },
  limit: 10,
  offset: 10,
  order: { createdAt: 'desc' },
})

```

### createOrUpdateChannelBySecret

Создает новый канал или обновляет существующий по секретному ключу. Если известен токен или секрет канала.

**Параметры**:

- `source` - Тип источника канала (Telegram, VK, и т.д.)
- `secret` - Секретный ключ (токен бота)
- `callback` - URL для обратного вызова (требуется свой post-ендпоинт, куда будут приходить все обновления)
- `setWebhook` - Установить webhook автоматически

**Когда использовать**: При настройке новых каналов связи или обновлении существующих.

## Поиск чатов

### findChatByExternalId

Находит чат по внешнему ID.

**Параметры**:

- `chatExternalId` - Внешний ID чата
- `channelId` - ID канала (требуется, если не указан channelExternalId)
- `channelExternalId` - Внешний ID канала (требуется, если не указан channelId)
- `getPerson` - Включить данные пользователя

### findChatById

Находит чат по внутреннему ID. `getPerson: true` включает профиль; отсутствие чата возвращается как `null`.

### searchChats

Выполняет поиск чатов по id или externalId.

**Параметры**:

- `search` - Поисковая строка (id или externalId)
- `channelId` - ID канала для поиска

## Управление профилями для чатов (Person)

### getPersonByChatId

Получает данные пользователя по ID чата.

### getPersonByExternalId

Получает данные пользователя по внешнему ID. Как правило это id чата во внешней системе. Или email если это email канал. Либо телефон, если это sms канал.

### getPersonsByUserId

Получает профили по User ID. Их может быть несколько — по профилю на каждый чат. `channelIds` ограничивает каналы.

### getPersonsByUid

Получает профили по UID. Uid - это специальный идентификатор, который генерирует клинетский счетчик. Его почти всегда можно получить в браузере из `window.clrtUid`. `channelIds` ограничивает каналы.

### findPersonsByChatIds

Находит пользователей по массиву ID чатов.

### findPersons

Универсальный поиск пользователей с пагинацией.

**Параметры**:

- `limit` - Лимит результатов
- `offset` - Смещение для пагинации
- `where` - Условия поиска. Язык фильтрации такой же как у heap-таблиц.

Например:

```typescript
const taggedPersons = await findPersons(ctx, {
    limit: 10,
    where: { tags: { $in: ['tag1', 'tag2'] } }
});

const persons = await findPersons(ctx, {
    limit: 10,
    where: {
        $and: [
            {
                $or: [
                    { externalId: { $ilike: '%@gmail.com' } },
                    { email: { $like: '%@gmail.com' } },
                    { user: userId },
                    { title: { $like: '%John%' } }
                ]
            },
            { isBlocked: false }
        ]
    }
});
```

## Управление тегами пользователей

### addTagsToPerson

Добавляет теги пользователю.

**Параметры**:

- `tagIds` - Массив ID тегов для добавления
- Один из: `personId`, `externalId` или `chatId` для идентификации профиля

### removeTagsFromPerson

Удаляет теги по `tagIds`; профиль задаётся через `personId`, `externalId` или `chatId`.

### updatePersonFields

Обновляет поля пользователя.

Поле `user` принимает ID системного пользователя (`ctx.user.id`); `null` отвязывает пользователя от профиля. Остальные доступные поля смотри в сигнатуре `updatePersonFields`.

## Работа с тегами

### getOrCreateTag

Создает новый тег.

```typescript
const tag = await getOrCreateTag(ctx, 'customer')
```

### getTags

Получает список всех тегов.

```typescript
const tags = await getTags(ctx)
```

## Telegram-методы

### getLastActiveGroupsForTgManager

Получает последние активные группы для Telegram менеджера, при необходимости заданного через `tgManagerId`. Как правило это все группы/каналы, в которые добавлен бот менеджер с ролью администратор и в которых есть активность за последние сутки.

### getTelegramGroups

Получает список Telegram групп или каналов, подключенных к сендеру.

## Универсальные методы

### getOrCreateChat

Получает существующий чат или создаёт новый по `externalId` и `channelId`. `userId` связывает его с системным пользователем, `createParams` задаёт профиль нового чата. Проверяй `success` перед использованием `chat`/`person`; при ошибке прочитай `message`.

`recipientExternalId` — строковый внешний ID адресата в выбранном канале `selectedChannelId`.

```typescript
const result = await getOrCreateChat(ctx, {
  externalId: recipientExternalId,
  channelId: selectedChannelId,
  userId: ctx.user?.id,
  createParams: { firstName: 'Иван' },
})
if (!result.success) throw new Error(result.message)
```
