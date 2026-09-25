# Реестр событий, действий и условий

Для конфига используй актуальные зарегистрированные сущности целевого аккаунта и workspace. Проверяй `event.url`, `event.payloadMapping`, `action.routeJson`, `condition.routeJson` и обязательные входные поля. Одних примеров из документации недостаточно: в каждом аккаунте реестр свой.

## Как получить реестр

У плагина Automations есть защищённый read-only маршрут `getRegistryRoute` в `plugin/api/registry.ts`. Он возвращает `{ events, actions, conditions }`; параметр `workspacePath` ограничивает выборку нужным workspace. В коде самого плагина вызывай RouteRef, например `getRegistryRoute.query({ workspacePath }).run(ctx)`. В другом проекте используй доступный интерфейс или API реестра с действующей авторизацией; адрес маршрута получай из RouteRef, не составляй вручную.

Сначала найди нужное событие, действие или условие по имени и назначению. Затем прочитай его `url`, `routeJson`, `payloadMapping` и схему. Если живой реестр недоступен, проверь исходники хуков регистрации и существующие конфиги, но отметь, что регистрация в целевом аккаунте не подтверждена. Не создавай публичный диагностический маршрут ради чтения реестра.

Внутри серверного кода можно отдельно получить события и условия через `@start/sdk`:

```ts
import { getAccountEvents, getAccountConditions } from '@start/sdk'

const events = await getAccountEvents(ctx)
const conditions = await getAccountConditions(ctx)

const event = events.find(item => item.url === soughtEventUrl)
const condition = conditions.find(item => item.pattern === soughtConditionPattern)
const conditionRouteJson = condition?.toJSON()
const conditionSchema = condition && (await condition.schema(ctx))
```

Для событий конкретного workspace плагин использует `getWorkspaceEvents(ctx, rootWorkspace)`. Действия собирает его внутренний `plugin/sdk/getAutomationActions.ts` через хук `actions`; текущий публичный `@automations/sdk` этот метод не экспортирует. Для действий используй маршрут реестра, а при работе внутри плагина — `collectActions(ctx, workspacePath)` из `plugin/api/registry.ts`.

У ссылок действий и условий `.toJSON()` даёт точный `routeJson`, а `.schema(ctx)` — `meta`, `body` и `result`. В `meta` ищи `name`, `description`, `llmDescription`, `icon` и `category`; доступность полей сверяй с типами конкретной функции. Поле `.pattern` подходит для поиска кандидата, но не заменяет `routeJson`.

Пример выборки нужного действия из ответа маршрута:

```ts
const candidates = registry.actions.filter(action => action.category === 'communications')
const target = candidates.find(action => action.name === requiredActionName)
if (!target) throw new Error('Action is not registered')

const { routeJson, inputSchema, actionResultSchema } = target
```

`name` и `category` помогают найти кандидата; перед записью конфига сверь `routeJson` и поля схемы. Если кандидатов несколько, уточни нужный по описанию и исходному RouteRef.

## Что содержит ответ

- `events`: `name`, `url`, `category`, `payloadMapping`.
- `actions` и `conditions`: `name`, `description`, `url`, `routeJson`, `inputSchema`; у действий также `icon` и `category`. Плагин хранит и полные `actionParamsSchema` / `actionResultSchema` либо `conditionParamsSchema` / `conditionResultSchema`.
- `inputSchema` — извлечённый для UI массив полей с `name`, `type`, `required`. В полном `schema.body` действие принимает `params`, условие — `input`; служебный `context` исполнитель передаёт сам.

Например, `schema.body` действия может содержать `params: { type: 'object', properties: { to: { type: 'string', meta: { title: 'Кому' } } } }`; у условия аналогичный объект называется `input`. `schema.result` описывает ответ. Когда следующий шаг читает `steps.<id>.<field>`, проверяй и схему результата, и фактический `return` действия.

Форма снимка для скрипта:

```json
{
  "events": [
    {
      "name": "Order created",
      "url": "event://account/orders/created",
      "payloadMapping": {
        "orderId": { "fieldName": "action_param1", "type": "string" }
      }
    }
  ],
  "actions": [
    {
      "name": "Send email",
      "routeJson": [123, "automationActions/sendEmail", "/send"],
      "inputSchema": [{ "name": "to", "type": "string", "required": true }]
    }
  ],
  "conditions": []
}
```

Число `123`, пути и URL здесь условны. Снимок должен отражать именно целевой аккаунт; не подставляй эти значения в конфиг.

Для локального валидатора оставь только нужные сериализуемые поля ответа:

```ts
const snapshot = {
  events: registry.events.map(({ url, payloadMapping }) => ({ url, payloadMapping })),
  actions: registry.actions.map(({ routeJson, inputSchema }) => ({ routeJson, inputSchema })),
  conditions: registry.conditions.map(({ routeJson, inputSchema }) => ({ routeJson, inputSchema })),
}
```

Сохрани этот JSON вне исходного конфига и передай [валидатору](configuration.md#проверка-перед-завершением) через `--registry`.

## Как читать реестр

- Путь маппинга `event.orderId` образован **ключом** `orderId` в `payloadMapping`. `fieldName` и `fieldExpr` описывают извлечение значения из исходного события и не становятся путём в конфиге. Если `payloadMapping` отсутствует, исполнитель может передать сырые поля события; проверь их по исходнику и реальному событию, не угадывай.
- Для простого поля достаточно `fieldName: 'action_param1'`. Для вложенного значения можно указать `fieldExpr: 'action_param1_mapstrstr.message'` или `fieldExpr: 'action_param1_arrstr[0]'`; исполнитель читает выражение относительно сырого события. Выражение с явным префиксом `event.` тоже допустимо. `fieldExpr` имеет приоритет над `fieldName`. Проверь фактическую форму сырого события.

```ts
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

- `routeJson` — тройка `[accountId, filePath, routePath]` из `.toJSON()` или готового ответа API. В конфиге она обёрнута в `{ "routeType": "function", "routeJson": [...] }`. Не собирай тройку по имени действия, пути исходного файла или `.pattern`.
- `inputSchema` в ответе Automations — массив полей **параметров** с `name`, `type`, `required`. Для действия runtime передаёт `{ context, params }`, для условия — `{ context, input }`; конфиг использует `params` для обоих. `context` не маппится.
- Реестр Automations не публикует схему результата действия в `inputSchema`. Для `steps.<id>.<field>` проверь `.schema(ctx).result` и реальное возвращаемое значение действия. Отдельно убедись, что этот шаг уже выполнен на данном пути.

Например, маппинг `{ message: { fieldName: 'action_param1_mapstrstr', fieldExpr: 'action_param1_mapstrstr.message' } }` создаёт поле `event.message` в параметрах автоматизации. Путь `event.action_param1_mapstrstr.message` здесь неверен: это путь в сырой метрике.

Для небольшого списка по категории фильтруй `registry.events` или `registry.actions` по `category`. При большом реестре сначала ищи имена и URL, затем запрашивай подробную схему только выбранной функции. После настройки запусти локальный валидатор со снимком. Проверка по живому реестру не выполняет автоматизацию и не проверяет значения в runtime.
