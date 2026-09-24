# Реестр событий, действий и условий

Используй для инспекции доступных в аккаунте событий и функций перед настройкой автоматизации.

## Получение зарегистрированных действий и тулов

Реестр событий и условий доступен через `@start/sdk`, реестр действий — через `@automations/sdk`. Импортируй только методы для выбранной задачи: для просмотра условий не требуется обращаться к реестру действий. Инспекцию выполняй через [`chatium exec`](../../exec.md).

### Импорт

```typescript
import { getAccountEvents, getAccountConditions } from '@start/sdk'
import { getAutomationActions } from '@automations/sdk'
```

### Получение списка событий

Возвращает все зарегистрированные события в аккаунте:

```typescript
import { getAccountEvents } from '@start/sdk'

const events = await getAccountEvents(ctx)

// Результат: EventDeclaration[] из @start/sdk
```

### Поле fieldExpr в payloadMapping

При описании `payloadMapping` в метаданных события `EventDeclaration` из `@start/sdk` для каждого поля можно указать опциональное свойство `fieldExpr` — это JS-выражение, которое позволяет извлечь значение из вложенной структуры данных. Актуально для словарей (`mapstrstr`) и массивов (`arrstr`), когда нужное значение находится не на верхнем уровне поля.

Если значение лежит в простом поле (например, `action_param1`), `fieldExpr` указывать **не нужно** — достаточно `fieldName`. Используй `fieldExpr` только когда нужно добраться до конкретного ключа словаря или элемента массива.

```typescript
import type { EventDeclaration } from '@start/sdk'

const payloadMapping: EventDeclaration['payloadMapping'] = {
  // Простое поле — fieldExpr не нужен
  name: { title: 'Имя', fieldName: 'action_param1', type: 'string' },

  // Значение из словаря — нужен fieldExpr
  message: {
    title: 'Сообщение',
    fieldName: 'action_param1_mapstrstr',
    fieldExpr: 'event.action_param1_mapstrstr.message', // достаём ключ "message" из словаря
    type: 'string',
  },

  // Элемент массива — нужен fieldExpr
  firstTag: {
    title: 'Первый тег',
    fieldName: 'action_param1_arrstr',
    fieldExpr: 'event.action_param1_arrstr[0]', // достаём первый элемент массива
    type: 'string',
  },
}
```


### Получение списка действий

Возвращает все зарегистрированные действия/инструменты:

```typescript
import { getAutomationActions } from '@automations/sdk'

const actions = await getAutomationActions(ctx)

// Результат: FunctionRouteRef[]
// Массив ссылок на роуты действий
```

### Получение списка условий

Возвращает все зарегистрированные условия:

```typescript
import { getAccountConditions } from '@start/sdk'

const conditions = await getAccountConditions(ctx)

// Результат: FunctionRouteRef[]
// Массив ссылок на роуты условий
```

### Получение схемы инструмента

Чтобы узнать детали о конкретном инструменте (действии или условии), запроси его схему:

```typescript
import { getAutomationActions } from '@automations/sdk'

const actions = await getAutomationActions(ctx)

// Для каждого действия можно получить полную схему
for (const action of actions) {
  const schema = await action.schema(ctx)

  // schema содержит:
  // {
  //   meta: {
  //     name: string        - Название для UI
  //     description: string - Описание
  //     llmDescription?: string - Инструкция для ИИ
  //     icon?: string       - Эмодзи
  //     category?: string   - Категория
  //   },
  //   body: { ... }         - Схема входных параметров
  //   result: { ... }       - Схема результата
  // }
}
```

### Пример: Построение реестра

```typescript
import { getAccountEvents, getAccountConditions } from '@start/sdk'
import { getAutomationActions } from '@automations/sdk'

// Собираем полный реестр
const [events, actionsRaw, conditionsRaw] = await Promise.all([
  getAccountEvents(ctx),
  getAutomationActions(ctx),
  getAccountConditions(ctx),
])

// Обогащаем действия схемами
const actions = []
for (const action of actionsRaw) {
  if (!action) continue
  const schema = await action.schema(ctx)
  actions.push({
    name: schema.meta.name,
    description: schema.meta.description,
    icon: schema.meta.icon,
    category: schema.meta.category,
    url: action.pattern,
    paramsSchema: schema.body,
    resultSchema: schema.result,
  })
}

// Обогащаем условия схемами
const conditions = []
for (const condition of conditionsRaw) {
  if (!condition) continue
  const schema = await condition.schema(ctx)
  conditions.push({
    name: schema.meta.name,
    description: schema.meta.description,
    url: condition.pattern,
    paramsSchema: schema.body,
    resultSchema: schema.result,
  })
}

return { events, actions, conditions }
```

### Использование через chatium exec

При работе с ИИ-агентом, используй инструмент `chatium exec` для выполнения этих методов:

**Шаг 1: Получить список доступных данных**

```
Вызови chatium exec с кодом:

import { getAccountEvents, getAccountConditions } from '@start/sdk'
import { getAutomationActions } from '@automations/sdk'

const events = await getAccountEvents(ctx)
const actions = await getAutomationActions(ctx)
const conditions = await getAccountConditions(ctx)

return {
  eventsCount: events.length,
  events: events.map(e => ({ name: e.name, url: e.url, category: e.category })),
  actionsCount: actions.filter(Boolean).length,
  conditionsCount: conditions.length,
}
```

**Шаг 2: Получить детали конкретного инструмента**

```
Вызови chatium exec с кодом:

import { getAutomationActions } from '@automations/sdk'

const actions = await getAutomationActions(ctx)
const targetAction = actions.find(a => a?.pattern?.includes('send-email'))

if (targetAction) {
  const schema = await targetAction.schema(ctx)
  return {
    name: schema.meta.name,
    description: schema.meta.description,
    llmDescription: schema.meta.llmDescription,
    inputParams: schema.body,
    outputResult: schema.result,
  }
}

return { error: 'Action not found' }
```

### Структура схемы параметров (body/result)

Схема параметров описывается в формате JSON Schema-подобной структуры:

```typescript
// Пример schema.body для действия sendEmail:
{
  context: { type: 'unknown', optional: true },
  automationContext: {
    type: 'object',
    optional: true,
    properties: {
      userId: { type: 'string', optional: true },
      customerContacts: {
        type: 'array',
        optional: true,
        items: {
          type: 'object',
          properties: {
            type: { type: 'string' },
            value: { type: 'string' },
          }
        }
      }
    }
  },
  params: {
    type: 'object',
    properties: {
      to: { type: 'string', meta: { title: 'Кому (email)' } },
      subject: { type: 'string', meta: { title: 'Тема письма' } },
      body: { type: 'string', meta: { title: 'Текст письма' } },
    }
  }
}
```

### Фильтрация по категориям

```typescript
import { getAccountEvents } from '@start/sdk'
import { getAutomationActions } from '@automations/sdk'

// Получить только события форм
const events = await getAccountEvents(ctx)
const formEvents = events.filter(e => e.category === 'forms')

// Получить только действия для коммуникаций
const actions = await getAutomationActions(ctx)
const communicationActions = []
for (const action of actions) {
  if (!action) continue
  const schema = await action.schema(ctx)
  if (schema.meta.category === 'communications') {
    communicationActions.push({
      name: schema.meta.name,
      url: action.pattern,
    })
  }
}
```

Для условий схема содержит `input`, для действий — `params`; точную форму возвращает `.schema(ctx)`. Регистрация функций описана в [actions.md](actions.md) и [conditions.md](conditions.md).
