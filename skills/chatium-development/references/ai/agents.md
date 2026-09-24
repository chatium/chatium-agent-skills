---
title: Chatium AI Agents SDK — отправка сообщений агентам и управление цепочками из кода воркспейса
description: Using the Chatium AI Agents SDK (@ai-agents/sdk/process) — отправка сообщений агентам, управление цепочками, directOutputTool, отделы (departments), контекст тулов. Применяй, когда пишешь код воркспейса, который запускает агентов, шлёт им сообщения, читает историю цепочек или управляет их жизненным циклом.
---

# Chatium AI Agents SDK — Skill

> Руководство по программному управлению AI-агентами Chatium из кода воркспейса.
> Импорт: `import { ... } from '@ai-agents/sdk/process'`. Все функции первым аргументом принимают `ctx` и вызываются внутри хендлера (`app.function` / `app.get/post` / `app.job` / хук).

---

## 1. Что такое агент

**Агент** — LLM-воркер, описанный конфигом (`XXX.agent.json` в воркспейсе), который ведёт разговоры («цепочки») с пользователями, умеет вызывать инструменты, может работать автономно и реагировать на события.

Конфиг задаёт: `title`, `instructions[]`, `model`, `temperature`, `enabledTools[]`, `nativeTools`, `waitingToolEnabled` (автономность), `goal`, лимиты токенов и т.д. (тип/схема — `JsonAgentConfig` / `JsonAgentConfigSchema`).

### Два режима
- **Standalone** — одна роль ведёт весь диалог сама. Поддерживает `goal`, автономность, распределение по дочерним агентам.
- **Department (отдел)** — агент-**оркестратор** с массивом inline-**специалистов**. Оркестратор — единственная точка входа, сам клиенту не пишет, а делегирует задачи специалистам через тул `call-agent`. Специалисты: `LLM` (модель + тулы) и `mailer` (только текст рассылок). У отделов нет `goal`.

---

## 2. Ключевые концепты

| Термин | Что это |
|---|---|
| **Chain (цепочка)** | Один тред-разговор пользователь↔агент. Имеет состояние, историю, счётчик токенов, контекст. |
| **chainKey** | Идентификатор разговора (обычно один на пару «пользователь + агент»). Под одним `chainKey` у агента живёт ровно одна цепочка; смена ключа создаёт другой разговор. |
| **chainId** | Внутренний id цепочки (после создания). |
| **Message** | Сообщение истории. Хранится как `llmMessages` — массив блоков Anthropic-style (`text` / `tool_use` / `tool_result` / `image` / …). |
| **wakeAgent** | Флаг при push'е: `true` — рантайм сразу прогонит ход агента; `false` — сообщение ляжет в очередь без запуска. |
| **Состояния цепочки** | `waiting`, `generating`, `sleeping`, `blocked`, `stopped`, `redirected`, `error` и др. |

---

## 3. Создание и настройка агентов

Эта статья описывает **runtime-управление** уже существующими агентами. Для создания или изменения `*.agent.json` используй доступный в проекте инструмент настройки агентов и его валидацию; не собирай конфиг по этой runtime-документации.

---

## 4. Отправка сообщений и запуск ходов

### Связка агента с транспортом

Не реализуй связку агента с транспортом через хук `@sender/message-received` по умолчанию. Это кастомная интеграция, а не стандартный путь подключения агента к мессенджеру.

Стандартный сценарий: дай пользователю ссылку `/app/sender`, попроси выбрать нужный транспорт, открыть раздел **Приложение** и связать агента с этим транспортом в интерфейсе Сендера. Так Сендер сам будет доставлять входящие сообщения в цепочку агента и управлять транспортной интеграцией.

Писать свой обработчик `@sender/message-received` стоит только при явной необходимости кастомной логики, например:
- нестандартная обработка текста входящих сообщений до передачи агенту;
- проверка доступов, ролей, подписок или ограничений перед запуском агента;
- детерминированная обработка кнопок, команд, deeplink/start-параметров или специальных сценариев;
- маршрутизация между несколькими агентами или сервисами по правилам, которые нельзя выразить стандартной связкой в интерфейсе.

Если такой причины нет, не пиши хук и не делай ручной `pushMessageToChain*` для входящих сообщений транспорта: направь пользователя в `/app/sender` и настрой связь агент↔транспорт через UI.

Основной способ «общаться» с агентом — положить сообщение в цепочку и (опц.) разбудить агента. Ход **асинхронный**: функция возвращается сразу. `wakeAgent: false` накапливает контекст без немедленного ответа; затем разбуди агента отдельным push или `unsleepChain`.

### `pushMessageToChainByContacts(ctx, params)` — **основной метод** `@public`
Резолвит цепочку по **контактам клиента**: SDK мёрджит контакты в одного CRM-клиента и находит/создаёт под него одну цепочку для агента. Приоритетный способ — когда есть email/телефон/uid, а не готовый `chainKey`.

Поля: `agentId`, `contacts: [{ type, value }]`, `messageText`, `wakeAgent`, `files?`, `createChainIfNotExists?`, `chainParams?` (`{ title, userId, uid, userProfile, chainMeta }`), `toolContext?` (произвольные данные для тулов — см. §5), `specialistId?`, `directOutputTool?`, `generationOptions?`. Возвращает `{ chainId }`.

```ts
await pushMessageToChainByContacts(ctx, {
  agentId,
  contacts: [{ type: 'email', value: 'user@example.com' }, { type: 'phone', value: '+12025550100' }],
  messageText: 'Ваш вебинар начинается через час!',
  wakeAgent: true,
  createChainIfNotExists: true,
})
```

### `pushMessageToChain(ctx, params)` `@public`
Когда есть собственный стабильный идентификатор разговора — резолв по `(agentId, chainKey)` **или** `(agentId, chainId)`. Поля: `agentId`, `chainKey` **или** `chainId`, `messageText`, `wakeAgent`, `files?`, `createChainIfNotExists?` + `chainParams?` (`{ title, model, userId, uid, userProfile, chainMeta, senderChatId }`), `specialistId?`, `directOutputTool?`, `generationOptions?`. Возвращает `{ chainId, chainKey }`.

### `pushMessagesToChainByContacts(ctx, params)` `@public`
**Batch**: несколько сообщений/задач в **одну** цепочку клиента за один вызов. CRM-резолв делается один раз, дальше каждый элемент `messages[]` уходит отдельным push'ем в ту же цепочку. Рантайм **сериализует** обработку: следующее сообщение берётся только после завершения предыдущего хода — порядок в массиве = порядок обработки. Поля: `agentId`, `contacts`, `wakeAgent`, `createChainIfNotExists?`, `chainParams?`, `messages: [{ messageText, files?, specialistId?, directOutputTool?, generationOptions? }]`. Возвращает `{ chainId, pushedCount }`.

### Как агент отвечает пользователю: `sendMessageToChat` и `chatId`
Обычно агент общается с пользователем **через тул `sendMessageToChat`** (или его варианты с задержкой) — он отправляет сообщение в чат **по `chatId`**. Чтобы агент мог ответить, ему нужно **знать `chatId`**, в который писать.

Самый надёжный способ дать агенту `chatId` — **положить его в `messageText`** того push'а, который ты делаешь: текст попадает в историю, агент его читает и передаёт в `sendMessageToChat`. Без известного агенту `chatId` он физически не сможет доставить ответ пользователю.

```ts
await pushMessageToChainByContacts(ctx, {
  agentId, contacts, wakeAgent: true,
  messageText: `Пользователь (chatId: ${chatId}) спрашивает: ${userQuestion}`,
})
```

> `chainParams.senderChatId` **агенту-модели в рантайме не виден** — он доступен только тулам через `body.context.senderChatId`. Поэтому, если агент сам решает, кому писать, `chatId` должен быть в истории сообщений (т.е. в `messageText`).

---

## 5. Per-turn опции генерации

Применяются к ближайшему ходу и очищаются после.

### `directOutputTool: DirectOutputToolConfig` `@public`
**Synthetic tool call.** Ты заранее знаешь, что результат хода должен «уйти» в конкретный тул/функцию. На этом turn'е рантайм добавляет в системный промпт указание про формат финального текста; когда completion завершается **финальным текстом**, рантайм оборачивает его в синтетический `tool_use`, **вызывает целевой тул/функцию с этим текстом как input** и пишет `tool_result` в историю. Снаружи выглядит так, будто агент сам вызвал тул.

**Что можно указать в `handler` — две формы:**

1. **Существующий тул агента** — структурный ref `{ isWorkspaceTool?, accountId?, path, pattern }` (тот же формат, что в `enabledTools`; бери из `getEnabledToolEntry`). Например, `sendMessageToChat`: текст модели станет input'ом этого тула и уйдёт сообщением в чат. Резолвится через `findTool` среди **включённых** тулов агента.

2. **Произвольная `app.function`** — передаёшь ссылку на функцию напрямую (она НЕ обязана быть тулом агента). Рантайм вызовет её по ссылке тем же контрактом, что и тул: `handler.run(ctx, { context, input })`. Так ты получаешь сгенерированный агентом текст в свою функцию и делаешь с ним что угодно.

**Как писать целевую `app.function`** (контракт `{ context, input }`):
```ts
export const myDirectOutputTarget = app
  .function('my-direct-output-target')
  .body(s => ({
    context: s.object({ chainId: s.string() }, { additionalProperties: true }),
    input: s.object({ message: s.string() }, { additionalProperties: true }),
  }))
  .handle(async (ctx, body) => {
    const text = body.input.message       // сгенерированный агентом текст
    const { chainId } = body.context
    // ...делаешь с текстом что нужно
    return { ok: true }
  })

// использование:
await pushMessageToChainByContacts(ctx, {
  agentId, contacts, wakeAgent: true,
  messageText: 'Сгенерируй приветственное письмо',
  directOutputTool: {
    handler: myDirectOutputTarget,   // ссылка на app.function (есть .run/.toJSON)
    contentField: 'message',         // весь текст модели → input.message
  },
})
```

**Маппинг вывода модели в `input`:**
- `contentField: string` — весь текст уходит в `input[contentField]`.
- `contentSections: string[]` — мульти-поле: модель оборачивает каждую секцию в XML-тег `<name>…</name>`, парсер кладёт содержимое в `input[name]` (имена секций = теги = имена input-полей).
- `extraInput: Record<string, any>` — доп. поля, попадают в `input` буквально (агент видит их в синтетическом `tool_use` в истории).
- `context: Record<string, any>` — доп. контекст в `body.context` целевой функции, но **НЕ** в `input` → агент его не видит (для скрытых данных: id кампании, секреты). Runtime-поля контекста (см. ниже) приоритетнее и не затираются.

**Доступ к тулам на directOutput-ходе (`tools?`):**
- **По умолчанию тулы доступны** — модель может вызывать тулы для подготовки ответа и затем написать финальный текст.
- `{ enabled: false }` — все тулы выключены (модель только пишет текст).
- `{ enabled: true, exclude: ['toolName'] }` — доступны все, кроме перечисленных по `name`.
- Синтетический вывод срабатывает **только** когда ход завершается финальным текстом; если модель вызвала тул — идёт обычный tool-call path.

**Прочее:** `toolDisplayName?` — имя в синтетическом `tool_use`; `outputFormat?: 'markdown' | 'plain'` — формат вывода (подсказка модели + пост-обработка).

### Что доступно тулу в `body.context`
Поля runtime-контекста и контракт результата описаны в [Инструментах AI](tools.md#body-context-и-input); читай при реализации целевой функции.

> Свои данные пробрасывай тулам через `toolContext` при push'е (`*ByContacts`) — тул прочитает их в `body.context.chainContext`. Либо через `directOutputTool.context` (скрыто от модели, только для directOutput-цели). Runtime-поля имеют приоритет и не затираются твоими.

### `generationOptions: GenerationOptions` `@public`
Override параметров генерации на ход. Актуальную форму импортируй как `GenerationOptions` из `@ai-agents/sdk/process`; она независима от `directOutputTool`.

### `specialistId: string`
Department-routing: прогнать ход на конкретном специалисте отдела, минуя оркестратора.

---

## 6. Чтение состояния

### Цепочки
- **`getChainMessages(ctx, { chainId, offset?, limit?, createdAtOrder? })`** `@public` — постранично читает сообщения → `{ success, value: { messages: ChainMessageDTO[] } }` либо `{ success: false, reason }`. `llmMessages` — блоки Anthropic-style. Department-поля (`producedByAgentId`, `parentCompletionId`, `pendingTaskId`) заполнены только в режиме отдела.
- **`getChainPendingMessages(ctx, { chainId })`** `@public` — снимок неподхваченных pending-push'ей (дебаг).
- **`findChainById(ctx, id)`** / **`findChainsByKey(ctx, key)`** / **`findChainsBy(ctx, where, options?)`** `@public`.
- **`getAgentChains(ctx, { agentId, offset?, limit?, createdAtOrder? })`** / **`getAgentChainsCount(ctx, agentId)`** `@public`.

### Агенты
- **`findAgentById(ctx, agentId)`** `@public`.
- **`findAgents(ctx, search?)`** `@public` — поиск по аккаунту (id/key/title/parentAgentId).
- **`findCurrentWorkspaceAgents(ctx, { search? }?)`** `@public` — агенты текущего воркспейса (+`workspaceAgentKey` = имя `.agent.json`-файла).
- **`findAgentsList(ctx)`** `@public` — список `{ id, key, title, parentAgentId, distribution* }`.
- **`findAgentsLinkedToWorkspace(ctx, workspaceId)`** `@public`.

---

## 7. Управление жизненным циклом цепочки

- **`sleepChain(ctx, chainId, sleepUntil: Date)`** `@public` — усыпить до даты.
- **`sleepChainForever(ctx, chainId)`** `@public` — усыпить бессрочно.
- **`unsleepChain(ctx, chainId)`** `@public` — разбудить.
- **`blockChain(ctx, chainId)`** `@public` — заблокировать (агент больше не реагирует).
- **`stopChain(ctx, chainId)`** `@public` — остановить.
- **`redirectChain(ctx, { fromAgentId, toAgentId, chainKey, copyChainParams?, messageText? })`** `@public` — передать цепочку другому агенту.

---

## 8. Каналы (transport)

Для встраивания Vue-чата с агентом на страницу прочитай [Веб-чат](../chat-client.md).

- **`linkAgentToChannel(ctx, { agentId, channelId })`** `@public`.
- **`isAgentLinkedToChannel(ctx, { agentId, channelId })`** `@public`.
- **`unlinkAgentFromChannel(ctx, { agentId, channelId })`** `@public`.

---

## 9. Инструменты, инструкции, модели

Для создания или обновления тула прочитай [Инструменты AI](tools.md). Канонические `enabledTools`/directOutput refs получай через SDK, не собирай вручную.

- **`getAllAvailableTools(ctx)`** `@public` — каталог: `{ tools: [{ path, name, description, llmDescription, appName, workspacePath, isAccountTool, nativeJson }] }`.
- **`getEnabledToolEntry(ctx, nativeJson, workspacePath?)`** `@public` — `nativeJson` тула → канонический ref `{ accountId?, isWorkspaceTool, path, pattern }` (формат для `enabledTools` и для `directOutputTool.handler`-дескриптора).
- **`findWorkspaceTools(ctx)`** `@public` — тулы текущего воркспейса.
- **`findInstructionsList(ctx)`** `@public` — переиспользуемые блоки инструкций.
- **`findModelsList(ctx)`** `@public` — доступные модели.

---
