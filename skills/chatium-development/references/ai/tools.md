---
title: "Agent and AI-generation tools"
description: "Read this article if you asked for creating a tool for an agent or for generic AI-generation. Прочитай статью если просят написать тул / инструмент для ИИ-агента, либо сделать AI-генерацию (письмо/JSON/текст) с приёмом результата в свою функцию."
---

# Agent and AI-generation tools

**Тул** — это серверная TypeScript-функция, которую ИИ-агент вызывает по ходу диалога, чтобы что-то сделать в реальном мире (найти данные в БД, отправить сообщение, создать запись, дёрнуть внешний API). Тот же механизм используется для **generic AI-generation**: ты можешь не отдавать тул агенту как обычный инструмент, а указать его как `directOutputTool` — тогда модель напишет текст, а рантайм передаст этот текст в твою функцию (см. раздел в конце).

## Где хранить
Все тулы — в папке `tools/`. **Один тул — один файл.** Например: `tools/newTool.ts`.

## Анатомия тула
Цепочка: `app.function(path).meta({...}).body(s => {...}).handle(async (ctx, body) => {...})`.
Обязательны все четыре звена; `handle` — основная логика.

```typescript
import { findUserById } from '@app/auth'

export const myAwesomeTool = app
  .function('/my-awesome')                 // path — уникальный в воркспейсе
  .meta({
    name: 'my-awesome',                    // ИМЯ, которое видит и вызывает модель (латиница, уникальное)
    description: 'Что делает инструмент — для человека.',
    llmDescription: 'КОГДА вызывать + что делает + какие поля обязательны — для ИИ.',
  })
  .body(s =>
    s.object(
      {
        context: s.object(
          {
            // runtime-поля кладёт движок агента (см. ниже). Опциональны.
            userId: s.string().optional(),
            chainId: s.string().optional(),
          },
          { additionalProperties: true },   // движок добавляет много полей — оставляй открытым
        ),
        input: s.object(
          {
            field1: s.string().describe('Описание поля для модели'),
            field2: s.string().optional().describe('Необязательное поле'),
          },
          { additionalProperties: true },
        ),
      },
      { additionalProperties: true },
    ),
  )
  .handle(async (ctx, body) => {
    ctx.account.log('myAwesomeTool', { json: { chainId: body.context.chainId } })

    const { userId } = body.context
    const { field1, field2, ...rest } = body.input
    const user = userId ? await findUserById(ctx, userId) : null

    try {
      // ...логика тула...
      return { ok: true, result: 'Result of myAwesomeTool' }
    } catch (err: unknown) {
      return { ok: false, result: err instanceof Error ? err.message : 'Unknown error' }
    }
  })
```

## `meta`: name / description / llmDescription
- **`name`** — это то, **что видит и вызывает модель** (попадает в `tool_use.name`). Латиница, kebab/camelCase, уникальное в наборе тулов агента.
- **`description`** — человекочитаемое описание (для UI/людей).
- **`llmDescription`** — **главный триггер вызова**: опиши, **когда** тул нужно вызвать, что он делает и какие поля обязательны. Если `llmDescription` не задан — модель опирается на `description`. Плохой `llmDescription` = модель не позовёт тул или позовёт не вовремя.

## `body`: `context` и `input`
Оба поля **обязательны** в схеме, но **могут быть пустыми объектами**. Везде ставь `{ additionalProperties: true }`.

- **`input`** — параметры, которые **заполняет модель** на основе диалога. Каждое поле должно иметь `.describe('...')` — это подсказка модели, что туда класть. Пустой объект — если входа нет.
- **`context`** — runtime-данные, которые подкладывает движок агента. **Не завязывайся жёстко на его структуру** (поля зависят от сценария). Полезные поля, которые там обычно есть:

| Поле | Что это |
|---|---|
| `agentId` | id агента, обрабатывающего ход |
| `chainId` / `chainKey` | id и ключ цепочки (разговора) |
| `userId` / `uid` | идентификаторы пользователя цепочки |
| `customerContacts` | контакты клиента (CRM) |
| `chainContext` | произвольные данные, переданные в push как `toolContext` |
| `senderChatId` | `chatId` транспортного канала (виден тулам, не модели) |
| `completionModel` | имя модели текущего хода |
| `incomingMessageId` | id входящего сообщения; изоляция per-push конфига |

## `handle`: логика
`async (ctx, body) => {...}`. Через `ctx` доступен весь серверный SDK платформы: heap-таблицы, `@app/auth`, `@app/request`, `@sender/sdk`, `@crm/sdk`, аналитика и т.д. Логируй только диагностические идентификаторы, например имя тула и `chainId`; не сохраняй секреты, полный `body` и пользовательское содержимое. Оборачивай рискованную логику в `try/catch`.

## Среда исполнения
Внутри вызова тула нет текущей авторизации пользователя.
`ctx.user` всегда будет равен undefined

## Контракт возврата
Тул всегда возвращает объект:
```typescript
return { ok: true, result: 'Operation completed' }
```
- **`ok: true`** — успех. Если есть осмысленный вывод для модели — положи его в `result` **строкой** (для объектов — `JSON.stringify(...)`). Если данных нет — `result` можно опустить.
- **`ok: false`** — ошибка. В `result` дай **внятное описание** («User ID not found», текст исключения) — модель это увидит и сможет среагировать/переспросить.
- Как это видит рантайм: `isError = !result.ok`, а **весь возвращённый объект сериализуется в JSON и кладётся в `tool_result`** — то есть `result` (и любые доп. поля) попадут модели. Не клади в `result` гигантские полотна — это контекст модели и токены.

## Регистрация
```typescript
app.accountHook('@start/agent/tools', async (ctx) => {
  return myAwesomeTool // один тул или массив
})
```
Хук **делает тулы доступными** агентам аккаунта. (Существует и `app.pluginHook('@start/agent/tools', ...)` — для плагинных тулов.)

## Доступность ≠ включённость: подключение к агенту
Регистрация в хуке делает тул **доступным**, но конкретный агент вызывает только те тулы, что перечислены в его `enabledTools` (по каноничному ref'у `{ accountId?, isWorkspaceTool, path, pattern }`). Включай тул через доступный в проекте инструмент настройки агентов, который собирает `enabledTools` и валидирует конфиг.

## Тул как цель `directOutputTool` (generic AI-generation)
Если задача — не «дать агенту кнопку», а **сгенерировать текст и принять результат в свой код** (письмо, JSON, описание), используй `directOutputTool` при push-е сообщения (см. [Агенты](agents.md)):
- финальный текст модели передаётся целевой функции; обычные подготовительные tool calls доступны, если их не отключить через `directOutputTool.tools`;
- рантайм оборачивает его в синтетический `tool_use` и **вызывает твой тул/`app.function` с этим текстом как `input`** тем же контрактом `handler.run(ctx, { context, input })`;
- целевая функция **не обязана** быть включённым тулом агента.

Так твой `handle(ctx, body)` получает `body.input.<contentField>` = сгенерированный текст и `body.context` = runtime-поля цепочки. Маппинг текста в поля — через `contentField` (одно поле) или `contentSections` (несколько XML-секций).

## Повторные вызовы и входные данные

Защищай побочные эффекты от повторного вызова: модель может повторить заказ, платёж или отправку. Делай input простым и проверяй, что агенту хватает контекста для заполнения его полей.

## Tools для standalone startCompletion

For standalone generation, reuse the same tool declaration and return contract. Pass the tool explicitly in `startCompletion`'s `tools` array, not `nativeTools`. Its `context` comes from the completion caller; do not assume agent runtime fields are present. Registration in `@start/agent/tools` is only needed for discovery by agents.

For the complete call and callback lifecycle, see [generation.md](generation.md). Agent `directOutputTool` is a separate path: it delivers generated text to a target function in an existing agent chain, as described above.
