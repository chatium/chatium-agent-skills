---
title: Создание действий (actions) для автоматизаций, процессов, автодействий, триггеров
description: >
  Изучи этот документ, если пользователь просит тебя создать новое действие (action) для автоматизаций.
  Действия — функции, которые вызываются из автоматизаций как шаги выполнения.
  НЕ путай с тулами для ИИ-агентов: у них другой контракт, описанный в ../ai/tools.md.
---

## Действия для автоматизаций (Automation Actions)

Действия (actions) — переиспользуемые функции, которые выполняют конкретные операции в рамках автоматизаций. Они используются как шаги (steps) в цепочках автоматизаций.

> **⚠️ Это НЕ тулы для ИИ-агентов!** Тулы для AI-агентов регистрируются через хук `@start/agent/tools` и имеют другой контракт (body: `{ context, input }`). Действия для автоматизаций регистрируются через хук `@automations/actions` и используют контракт `{ context, params }`. Для AI-тула см. [Инструменты AI](../ai/tools.md).

### Когда создавать действия для автоматизаций

**СОЗДАВАЙ действия для:**

- Отправки сообщений (email, telegram, sms, push-уведомления)
- Работы с данными (создание/обновление записей в таблицах, CRM)
- Интеграций с внешними API (вебхуки, сторонние сервисы)
- Уведомлений (telegram, whatsapp, slack, discord, внутренние уведомления)
- Платежей и транзакций
- Любых операций с побочными эффектами

Для отправки сообщений через подключённые каналы из действия используй [отправку сообщений Sender](../sender/messaging.md). Если сценарий также требует обработки входящих обновлений, прочитай [Sender webhooks](../sender/webhooks.md).

**НЕ НУЖНО создавать действия для:**

- Проверки условий без побочных эффектов (используй [условия](conditions.md))
- Аналитики и метрик (используй [события](events.md))

### Организация файлов

Создавай инструменты в папке `automationActions/`. Один инструмент — один файл.

Примеры: `automationActions/sendEmail.ts`, `automationActions/createOrder.ts`, `automationActions/addCrmComment.ts`

### Структура действия

Действие создаётся через цепочку методов `app.function().meta().body().result().handle()`:

```typescript
export const myAction = app
  .function('/my-action')
  .meta({
    name: 'myAction', // ТОЛЬКО латиница, camelCase! Используется как идентификатор
    description: 'Описание что делает действие', // Для отображения людям
    hrTitle: 'Моё действие', // Человекочитаемое название для UI (опционально)
    icon: '⚡',
    category: 'custom',
  })
  .body(s => ({
    // context передаётся автоматически системой автоматизаций — НЕ нужно маппить
    context: s.unknown().optional(),

    // params — основные параметры действия, которые маппятся в конфигурации автоматизации
    params: s.object({
      message: s.string().meta({ title: 'Сообщение' }),
      recipientId: s.string().optional().meta({ title: 'ID получателя' }),
    }),
  }))
  .result(s => ({
    success: s.boolean(),
    result: s.smartUnion([
      s.object({
        sentAt: s.date().meta({ title: 'Время выполнения' }),
      }),
      s.string().meta({ title: 'Сообщение об ошибке' }),
    ]).optional(),
  }))
  .handle(async (ctx, body) => {
    const { message, recipientId } = body.params

    ctx.account.log('Executing myAction', { json: { message, recipientId } })

    try {
      // Бизнес-логика здесь
      const result = await doSomething(message, recipientId)

      return {
        success: true,
        result: {
          sentAt: new Date(),
        },
      }
    } catch (err: any) {
      return {
        success: false,
        result: err.message || 'Unknown error',
      }
    }
  })
```

### Параметры действия

#### meta (обязательно)

| Поле | Тип | Обязательное | Описание |
|------|-----|--------------|----------|
| `name` | string | ✅ | Идентификатор, **только латиница** camelCase (например `sendEmail`, `createTicket`) |
| `description` | string | ✅ | Описание что делает действие (для людей) |
| `hrTitle` | string | ❌ | Человекочитаемое название для отображения в UI (например «Отправка email») |
| `icon` | string | ❌ | Эмодзи для отображения в UI |
| `category` | string | ❌ | Категория для группировки |

#### body — входные данные

##### context

Контекст выполнения автоматизации (`ExecutionContext`), передаваемый системой автоматически. Содержит информацию о текущем выполнении:

| Поле | Тип | Описание |
|------|-----|----------|
| `executionId` | string | ID текущего выполнения |
| `timezone` | string | Таймзона субъекта либо таймзона по умолчанию (напр. `Europe/Moscow`) |
| `customerContacts` | `CustomerContact[]` | Контакты клиента (`{ type: 'phone' \| 'email' \| 'telegram_id' \| ..., value: string }`) |
| `steps` | `Record<string, JsonValue>` | Результаты уже выполненных шагов (stepId → output) |

Действие не должно полагаться на конкретную структуру context — она может расширяться. Все необходимые данные должны приходить через `params`.

Всегда объявляй так: `context: s.unknown().optional()`

##### params (обязательно)

Параметры действия. Это основные входные данные, необходимые для выполнения бизнес-логики. Значения маппятся в конфигурации автоматизации (через `$ref`, `$template`, `$static` или статические значения).

Каждый параметр **обязан** иметь `.meta({ title: '...' })` для отображения в UI редактора автоматизаций:

```typescript
params: s.object({
  to: s.string().meta({ title: 'Кому (email)' }),
  subject: s.string().meta({ title: 'Тема письма' }),
  body: s.string().meta({ title: 'Текст письма' }),
  templateId: s.string().optional().meta({
    title: 'ID шаблона',
    description: 'Если не указать, будет применен шаблон default'
  }),
}),
```

#### result — структура ответа

Определяй типизированную структуру результата. Рекомендуется использовать `smartUnion` для объединения объекта результата и строки ошибки:

```typescript
.result(s => ({
  success: s.boolean(),
  result: s.smartUnion([
    s.object({
      messageId: s.string().meta({ title: 'ID сообщения' }),
      sentAt: s.date().meta({ title: 'Время отправки' }),
    }),
    s.string().meta({ title: 'Сообщение об ошибке' }),
  ]).optional(),
}))
```

### Возвращаемое значение

Действие **ОБЯЗАНО** вернуть объект с полями:

| Поле | Тип | Описание |
|------|-----|----------|
| `success` | boolean | `true` — выполнено успешно, `false` — ошибка |
| `result` | object \| string | Данные результата (при успехе) либо текст ошибки (при неудаче) |

```typescript
// Успешное выполнение
return {
  success: true,
  result: {
    messageId: 'msg_123',
    sentAt: new Date(),
  },
}

// Ошибка
return {
  success: false,
  result: 'Не удалось отправить письмо: invalid email',
}
```

### Использование результата

Данные из поля `result` автоматически сохраняются в контексте выполнения автоматизации и доступны в последующих шагах через маппинг `steps.<stepId>.*`.

Например, если действие вернуло `{ success: true, result: { messageId: 'msg_123' } }` и шаг имеет id `send_email`, то в следующих шагах можно обратиться к `steps.send_email.messageId`.

Поэтому важно возвращать в `result` все полезные данные, которые могут понадобиться в следующих шагах автоматизации.

### Регистрация действия

Действия для автоматизаций регистрируются через хук `@automations/actions`:

```typescript
app.accountHook('@automations/actions', async (ctx, params) => {
  return [myAction, anotherAction]
})
```

**Можно возвращать как одно действие, так и массив:**

```typescript
// Одно действие
app.accountHook('@automations/actions', async (ctx, params) => {
  return myAction
})

// Несколько действий
app.accountHook('@automations/actions', async (ctx, params) => {
  return [action1, action2, action3]
})
```

> **⚠️ Не путай с `@start/agent/tools`!** Хук `@start/agent/tools` используется для регистрации тулов AI-агентов. Действия автоматизаций регистрируются ТОЛЬКО через `@automations/actions`.

---

## Примеры действий

### Отправка email

```typescript
export const sendEmailAction = app
  .function('/send-email')
  .meta({
    name: 'sendEmail',
    description: 'Отправляет email на указанный адрес',
    hrTitle: 'Отправка email',
    icon: '📧',
    category: 'communications',
  })
  .body(s => ({
    context: s.unknown().optional(),
    params: s.object({
      to: s.string().meta({ title: 'Email получателя' }),
      subject: s.string().meta({ title: 'Тема письма' }),
      body: s.string().meta({ title: 'Текст письма (HTML)' }),
    }),
  }))
  .result(s => ({
    success: s.boolean(),
    result: s.smartUnion([
      s.object({
        messageId: s.string().meta({ title: 'ID отправленного письма' }),
        sentAt: s.date().meta({ title: 'Время отправки' }),
      }),
      s.string().meta({ title: 'Сообщение об ошибке' }),
    ]).optional(),
  }))
  .handle(async (ctx, params) => {
    const { to, subject, body } = params.params

    ctx.account.log('Sending email', {
      kv: { to, subject },
    })

    try {
      const result = await sendEmail(ctx, { to, subject, body })

      return {
        success: true,
        result: {
          messageId: result.id,
          sentAt: new Date(),
        },
      }
    } catch (err: any) {
      ctx.account.log('Email send failed', { level: 'error', err })
      return {
        success: false,
        result: err.message,
      }
    }
  })
```

### Добавление комментария в CRM

```typescript
export const addCrmCommentAction = app
  .function('/add-crm-comment')
  .meta({
    name: 'addCrmDealComment',
    description: 'Добавляет комментарий к сделке клиента, найденного по email',
    hrTitle: 'Комментарий в CRM',
    icon: '✉️',
    category: 'crm',
  })
  .body(s => ({
    context: s.unknown().optional(),
    params: s.object({
      email: s.string().meta({ title: 'Email клиента' }),
      comment: s.string().meta({ title: 'Текст комментария' }),
    }),
  }))
  .result(s => ({
    success: s.boolean(),
    result: s.smartUnion([
      s.object({
        commentId: s.string().meta({ title: 'ID комментария' }),
        dealId: s.string().meta({ title: 'ID сделки' }),
      }),
      s.string().meta({ title: 'Сообщение об ошибке' }),
    ]).optional(),
  }))
  .handle(async (ctx, body) => {
    const { email, comment } = body.params

    ctx.account.log('Adding CRM comment', { kv: { email } })

    try {
      const client = await getCrmClientByEmail(ctx, email)
      if (!client) {
        return {
          success: false,
          result: `Клиент с email ${email} не найден`,
        }
      }

      const deals = await getActiveCrmDeals(ctx, client.id)
      if (deals.length === 0) {
        return {
          success: false,
          result: `У клиента ${email} нет активных сделок`,
        }
      }

      const result = await addCommentToDeal(ctx, deals[0].id, comment)

      return {
        success: true,
        result: {
          commentId: result.comment.id,
          dealId: deals[0].id,
        },
      }
    } catch (err: any) {
      return {
        success: false,
        result: err.message,
      }
    }
  })
```

### Создание тикета в поддержке

```typescript
export const createTicketAction = app
  .function('/create-ticket')
  .meta({
    name: 'createTicket',
    description: 'Создаёт тикет в системе поддержки',
    hrTitle: 'Создание тикета',
    icon: '🎫',
    category: 'data',
  })
  .body(s => ({
    context: s.unknown().optional(),
    params: s.object({
      title: s.string().meta({ title: 'Заголовок тикета' }),
      description: s.string().meta({ title: 'Описание проблемы' }),
      priority: s.string().optional().meta({ title: 'Приоритет (low, medium, high)' }),
    }),
  }))
  .result(s => ({
    success: s.boolean(),
    result: s.smartUnion([
      s.object({
        ticketId: s.string().meta({ title: 'ID тикета' }),
        ticketUrl: s.string().meta({ title: 'Ссылка на тикет' }),
      }),
      s.string().meta({ title: 'Сообщение об ошибке' }),
    ]).optional(),
  }))
  .handle(async (ctx, body) => {
    const { title, description, priority } = body.params

    try {
      const ticket = await createSupportTicket(ctx, {
        title,
        description,
        priority: priority || 'medium',
      })

      return {
        success: true,
        result: {
          ticketId: ticket.id,
          ticketUrl: ticket.url,
        },
      }
    } catch (err: any) {
      return {
        success: false,
        result: err.message,
      }
    }
  })
```

---

### Рекомендуемые категории

- `communications` — отправка сообщений (email, telegram, sms)
- `data` — работа с данными (создание, обновление, удаление записей)
- `integrations` — интеграции с внешними сервисами (вебхуки, API)
- `notifications` — уведомления (push, slack, discord)
- `payments` — платежи и транзакции
- `crm` — CRM операции (сделки, контакты, комментарии)

---

## Чеклист перед коммитом

- [ ] Действие создано через `app.function().meta().body().result().handle()`
- [ ] `name` написан **на латинице** (camelCase), `description` заполнен в `.meta()`
- [ ] В `body` определены `context: s.unknown().optional()` и `params: s.object({...})`
- [ ] Все параметры в `params` имеют `.meta({ title: '...' })`
- [ ] Определена типизированная структура `.result()` с `success` и `result`
- [ ] Возвращается `{ success: boolean, result }` — при ошибке `result` содержит текст ошибки
- [ ] Полезные данные возвращаются в `result` для использования в последующих шагах автоматизации
- [ ] Ошибки обрабатываются через `try/catch`
- [ ] Действие зарегистрировано через `app.accountHook('@automations/actions', ...)`
- [ ] Файл находится в папке `automationActions/`
- [ ] Добавлено логирование через `ctx.account.log()`


## Отличие от тулов для ИИ-агентов

| Параметр | Действие автоматизации | Тул ИИ-агента |
|----------|----------------------|----------------|
| Хук регистрации | `@automations/actions` | `@start/agent/tools` |
| Body-контракт | `{ context, params }` | `{ context, input }` |
| Где используется | Шаги автоматизаций | AI генерация, чат-боты |
| Документация | Эта статья | [Инструменты AI](../ai/tools.md) |
| context | ExecutionContext автоматизации | Контекст AI-разговора |

**Одна функция НЕ МОЖЕТ быть одновременно действием автоматизации и тулом ИИ-агента** — они используют разные хуки и разные контракты. Если нужна одинаковая бизнес-логика, вынеси её в общую функцию и оберни в два отдельных действия.

Для поиска уже зарегистрированных действий и чтения их схем см. [реестр](registry.md).
