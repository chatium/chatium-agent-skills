---
title: AmoCRM SDK  - Инструкция по использованию
description: Изучи этот документ, если пользователь просит написать функционал, который взаимодействует с AMO CRM. Здесь описаны функции для работы с контактами и сделками, а также их параметры и логика работы.
requireApp: amocrm
---

# AmoCRM SDK Documentation

SDK для работы с AmoCRM из других плагинов Chatium.

## Подключение

```typescript
import { searchAmoCrmContact, createAmoCrmLead, createAmoCrmCatalogElement, linkAmoCrmEntities } from '@amocrm/sdk'
```

## API Reference

### Contacts

#### `searchAmoCrmContact(ctx, params)`
Поиск контакта по ID, телефону или email.

```typescript
const result = await searchAmoCrmContact(ctx, { contactId: '12345' })
const result = await searchAmoCrmContact(ctx, { phone: '+12025550100' })
const result = await searchAmoCrmContact(ctx, { email: 'user@example.com' })
```

| Параметр | Тип | Обязательный | Описание |
|----------|-----|-------------|----------|
| contactId | string | нет* | ID контакта для прямого получения по ID |
| phone | string | нет* | Телефон для поиска |
| email | string | нет* | Email для поиска |

\* Хотя бы одно из трёх обязательно.

При поиске по `contactId` используется `GET /api/v4/contacts/{id}` — возвращает объект контакта напрямую. При поиске по `phone`/`email` используется `GET /api/v4/contacts?query=...` — возвращает `_embedded.contacts[]`.

---

#### `createAmoCrmContact(ctx, params)`
Создание нового контакта. Поддержка проверки дубликатов.

```typescript
const result = await createAmoCrmContact(ctx, {
  phone: '+12025550100',
  email: 'user@example.com',
  firstName: 'Иван',
  lastName: 'Иванов',
  checkDuplicates: true,
  contactCustomFields: [{ fieldId: 123, value: 'значение' }]
})
```

| Параметр | Тип | Обязательный | Описание |
|----------|-----|-------------|----------|
| phone | string | нет* | Телефон |
| email | string | нет* | Email |
| firstName | string | нет | Имя |
| lastName | string | нет | Фамилия |
| checkDuplicates | boolean | нет | Проверить дубликаты перед созданием |
| contactCustomFields | CustomFieldInput[] | нет | Доп. поля контакта |

\* Хотя бы одно из двух обязательно.

---

#### `updateAmoCrmContact(ctx, params)`
Обновление существующего контакта.

```typescript
const result = await updateAmoCrmContact(ctx, {
  contactId: '12345',
  phone: '+12025550100',
  firstName: 'Пётр'
})
```

| Параметр | Тип | Обязательный | Описание |
|----------|-----|-------------|----------|
| contactId | string | да | ID контакта |
| phone | string | нет | Телефон |
| email | string | нет | Email |
| firstName | string | нет | Имя |
| lastName | string | нет | Фамилия |
| customFields | CustomFieldInput[] | нет | Доп. поля |

---

#### `getAmoCrmContactCustomFields(ctx)`
Получение списка кастомных полей контактов.

```typescript
const result = await getAmoCrmContactCustomFields(ctx, {})
```

Параметров нет.

---

### Leads

#### `createAmoCrmLead(ctx, params)`
Создание сделки с автоматическим поиском/созданием контакта.

```typescript
const result = await createAmoCrmLead(ctx, {
  leadName: 'Новая сделка',
  price: 50000,
  phone: '+12025550100',
  email: 'user@example.com',
  contactName: 'Иван',
  comment: 'Комментарий к сделке',
  leadCustomFields: [{ fieldId: 456, value: 'значение' }]
})
```

| Параметр | Тип | Обязательный | Описание |
|----------|-----|-------------|----------|
| leadName | string | да | Название сделки |
| price | number | нет | Бюджет (по умолчанию 0) |
| contactName | string | нет | Имя контакта |
| phone | string | нет* | Телефон |
| email | string | нет* | Email |
| comment | string | нет | Примечание к сделке |
| contactCustomFields | CustomFieldInput[] | нет | Доп. поля контакта |
| leadCustomFields | CustomFieldInput[] | нет | Доп. поля сделки |

\* Хотя бы одно из двух обязательно.

Автоматически использует настройки воронки из `amocrm_pipelines_settings`, если они заданы.


Результат:
```
{
  ok: true,
  result: {
    leadId: createdLead.id,
    contactId: foundContactId,
    isNewContact: !existingContact,
    leadName,
    price
  }
}

{
  ok: false,
  result: `Ошибка при создании сделки: ${error instanceof Error ? error.message : String(error)}`
}
```

---

#### `createAmoCrmLeadExistingContact(ctx, params)`
Создание сделки с существующим контактом (без поиска/создания).

```typescript
const result = await createAmoCrmLeadExistingContact(ctx, {
  leadName: 'Повторная сделка',
  price: 30000,
  contactId: 12345,
  comment: 'Клиент вернулся'
})
```

| Параметр | Тип | Обязательный | Описание |
|----------|-----|-------------|----------|
| leadName | string | да | Название сделки |
| price | number | нет | Бюджет |
| contactId | number | да | ID контакта в amoCRM |
| comment | string | нет | Примечание |
| contactCustomFields | CustomFieldInput[] | нет | Доп. поля контакта (best-effort) |
| leadCustomFields | CustomFieldInput[] | нет | Доп. поля сделки |

Результат:
```typescript
{
  ok: true,
  result: {
    leadId: createdLead.id,
    contactId: contactId,
    leadName,
    price
  }
}

{
  ok: false,
  result: `Ошибка при создании сделки: ${error instanceof Error ? error.message : String(error)}`
}
```

---

#### `getAmoCrmLeadById(ctx, params)`
Получение сделки по ID.

```typescript
const result = await getAmoCrmLeadById(ctx, { leadId: '12345' })
```

| Параметр | Тип | Обязательный | Описание |
|----------|-----|-------------|----------|
| leadId | string | да | ID сделки |

---

#### `getAmoCrmLeadsByContactId(ctx, params)`
Получение сделок по ID контакта.

```typescript
const result = await getAmoCrmLeadsByContactId(ctx, { contactId: '12345' })
```

| Параметр | Тип | Обязательный | Описание |
|----------|-----|-------------|----------|
| contactId | string | да | ID контакта |

---

#### `updateAmoCrmLead(ctx, params)`
Обновление сделки.

```typescript
const result = await updateAmoCrmLead(ctx, {
  leadId: '12345',
  name: 'Обновлённое название',
  price: 100000,
  customFields: [{ fieldId: 789, value: 'новое значение' }]
})
```

| Параметр | Тип | Обязательный | Описание |
|----------|-----|-------------|----------|
| leadId | string | да | ID сделки |
| name | string | нет | Название |
| price | number | нет | Бюджет |
| customFields | CustomFieldInput[] | нет | Доп. поля |

---

### Lead Actions

#### `addAmoCrmLeadComment(ctx, params)`
Добавление комментария (примечания) к сделке.

```typescript
const result = await addAmoCrmLeadComment(ctx, {
  leadId: '12345',
  comment: 'Текст комментария'
})
```

| Параметр | Тип | Обязательный | Описание |
|----------|-----|-------------|----------|
| leadId | string | да | ID сделки |
| comment | string | да | Текст комментария |

---

#### `addAmoCrmLeadTag(ctx, params)`
Добавление тега к сделке.

```typescript
const result = await addAmoCrmLeadTag(ctx, { leadId: '12345', tagName: 'VIP' })
const result = await addAmoCrmLeadTag(ctx, { leadId: '12345', tagId: 100 })
```

| Параметр | Тип | Обязательный | Описание |
|----------|-----|-------------|----------|
| leadId | string | да | ID сделки |
| tagId | number | нет* | ID тега |
| tagName | string | нет* | Название тега |

\* Хотя бы одно из двух обязательно.

---

#### `removeAmoCrmLeadTag(ctx, params)`
Удаление тега из сделки.

```typescript
const result = await removeAmoCrmLeadTag(ctx, { leadId: '12345', tagName: 'VIP' })
```

| Параметр | Тип | Обязательный | Описание |
|----------|-----|-------------|----------|
| leadId | string | да | ID сделки |
| tagId | number | нет* | ID тега |
| tagName | string | нет* | Название тега |

\* Хотя бы одно из двух обязательно.

---

#### `moveAmoCrmLeadToPipelineStage(ctx, params)`
Перемещение сделки в указанный этап воронки по названиям.

```typescript
const result = await moveAmoCrmLeadToPipelineStage(ctx, {
  leadId: 12345,
  pipelineName: 'Продажи',
  statusName: 'Переговоры'
})
```

| Параметр | Тип | Обязательный | Описание |
|----------|-----|-------------|----------|
| leadId | number | да | ID сделки |
| pipelineName | string | да | Точное название воронки |
| statusName | string | да | Точное название этапа |

---

### Custom Fields & Pipelines

#### `getAmoCrmLeadCustomFields(ctx)`
Получение списка кастомных полей сделок.

```typescript
const result = await getAmoCrmLeadCustomFields(ctx, {})
```

---

#### `getAmoCrmPipelines(ctx)`
Получение списка всех воронок.

```typescript
const result = await getAmoCrmPipelines(ctx, {})
```

---

#### `getAmoCrmPipelineById(ctx, params)`
Получение воронки по ID.

```typescript
const result = await getAmoCrmPipelineById(ctx, { pipelineId: '123' })
```

| Параметр | Тип | Обязательный | Описание |
|----------|-----|-------------|----------|
| pipelineId | string | да | ID воронки |

---

#### `getAmoCrmPipelineStatusById(ctx, params)`
Получение статуса воронки по ID.

```typescript
const result = await getAmoCrmPipelineStatusById(ctx, {
  pipelineId: '123',
  statusId: '456'
})
```

| Параметр | Тип | Обязательный | Описание |
|----------|-----|-------------|----------|
| pipelineId | string | да | ID воронки |
| statusId | string | да | ID статуса |

---

### Catalogs

В примерах ниже `selectedCatalogId`, `selectedElementIds`, `selectedElementId`, `selectedLeadId`, `selectedContactId` и `selectedFieldId` — числовые ID выбранных сущностей текущего аккаунта (для `selectedElementIds` — массив). Получи их из ответа CRM или от пользователя; для методов чтения преобразуй ID в строки, как показано в примере.

#### `getAmoCrmCatalogs(ctx)`
Получение списка всех каталогов (списков) аккаунта.

```typescript
const result = await getAmoCrmCatalogs(ctx, {})
```

Параметров нет.

Возвращает каталоги с полями: `id`, `name`, `type` (`"regular"` | `"invoices"` | `"products"`).

---

#### `getAmoCrmCatalogElements(ctx, params)`
Получение элементов каталога с опциональной фильтрацией по ID.

```typescript
const result = await getAmoCrmCatalogElements(ctx, {
  catalogId: String(selectedCatalogId),
  elementIds: selectedElementIds.map(String),
  withInvoiceLink: true
})
```

| Параметр | Тип | Обязательный | Описание |
|----------|-----|-------------|----------|
| catalogId | string | да | ID каталога |
| elementIds | string[] | нет | Массив ID элементов для фильтрации |
| withInvoiceLink | boolean | нет | Получить URL печатной формы счета (по умолчанию false) |

---

#### `createAmoCrmCatalogElement(ctx, params)`
Создание элемента в каталоге (счёт, товар и т.д.) с опциональной привязкой к сделке.

```typescript
// Создать элемент и привязать к сделке
const result = await createAmoCrmCatalogElement(ctx, {
  catalogId: selectedCatalogId,
  name: 'Счёт №123',
  customFields: [
    { fieldId: selectedFieldId, value: 50000 }
  ],
  leadId: selectedLeadId,
  quantity: 1
})

// Создать элемент без привязки
const result = await createAmoCrmCatalogElement(ctx, {
  catalogId: selectedCatalogId,
  name: 'Товар А'
})
```

| Параметр | Тип | Обязательный | Описание |
|----------|-----|-------------|----------|
| catalogId | number | да | ID каталога |
| name | string | да | Название элемента |
| customFields | CustomFieldInput[] | нет | Кастомные поля элемента |
| leadId | number | нет | ID сделки для привязки после создания |
| quantity | number | нет | Количество при привязке (по умолчанию 1) |

Если `leadId` передан, элемент привязывается к сделке автоматически (best-effort: при ошибке привязки элемент всё равно создаётся, в результат добавляется `_linkWarning`).

---

#### `updateAmoCrmCatalogElement(ctx, params)`
Обновление существующего элемента каталога.

```typescript
const result = await updateAmoCrmCatalogElement(ctx, {
  catalogId: selectedCatalogId,
  elementId: selectedElementId,
  name: 'Счёт №123 (обновлён)',
  customFields: [
    { fieldId: selectedFieldId, value: 75000 }
  ]
})
```

| Параметр | Тип | Обязательный | Описание |
|----------|-----|-------------|----------|
| catalogId | number | да | ID каталога |
| elementId | number | да | ID элемента |
| name | string | нет* | Новое название |
| customFields | CustomFieldInput[] | нет* | Поля для обновления |

\* Хотя бы одно из двух обязательно.

---

### Entity Linking

#### `linkAmoCrmEntities(ctx, params)`
Универсальная привязка сущностей друг к другу.

```typescript
// Привязка элемента каталога к сделке
const result = await linkAmoCrmEntities(ctx, {
  entityType: 'leads',
  entityId: selectedLeadId,
  toEntityType: 'catalog_elements',
  toEntityId: selectedElementId,
  catalogId: selectedCatalogId,
  quantity: 1
})

// Привязка контакта к сделке
const result = await linkAmoCrmEntities(ctx, {
  entityType: 'leads',
  entityId: selectedLeadId,
  toEntityType: 'contacts',
  toEntityId: selectedContactId,
  isMain: true
})
```

| Параметр | Тип | Обязательный | Описание |
|----------|-----|-------------|----------|
| entityType | string | да | Тип основной сущности: leads, contacts, companies, customers |
| entityId | number | да | ID основной сущности |
| toEntityType | string | да | Тип привязываемой сущности: leads, contacts, companies, customers, catalog_elements |
| toEntityId | number | да | ID привязываемой сущности |
| catalogId | number | нет* | ID каталога (*обязателен для catalog_elements) |
| quantity | number | нет | Количество (для catalog_elements, по умолчанию 1) |
| priceId | number | нет | ID поля типа Цена (для catalog_elements) |
| isMain | boolean | нет | Главный контакт (для contacts) |

---

## Формат CustomFieldInput

Все функции, принимающие кастомные поля, используют единый формат:

```typescript
type CustomFieldInput = {
  fieldId: number    // ID поля в amoCRM
  value?: any        // Простой режим: одно значение
  values?: any[]     // Продвинутый режим: массив values в формате amoCRM API
}
```

**Простой режим** — передаёте `value`, SDK автоматически оборачивает в `[{ value: ... }]`:
```typescript
{ fieldId: 123, value: 'текст' }
{ fieldId: 456, value: 42 }
```

**Продвинутый режим** — передаёте `values` напрямую в формате amoCRM:
```typescript
{ fieldId: 789, values: [{ value: 'option1', enum_id: 100 }] }
```

---

## Формат ответа

Все функции возвращают унифицированный формат:

```typescript
{
  ok: boolean       // true = успех, false = ошибка
  result: any       // данные при успехе, строка с ошибкой при неудаче
}
```
