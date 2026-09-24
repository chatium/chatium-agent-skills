---
title: Создание условий (функций проверки)
description: >
  Изучи этот документ, если нужно создать условие (condition) — функцию проверки, возвращающую boolean. Условия используются для проверки состояний: наличие заказов, принадлежность email к домену, проверка времени суток и другие проверки бизнес-логики.
---

## Условия (Conditions)

Условия (conditions) — это функции проверки, которые возвращают `satisfied: true` или `satisfied: false`. Они могут использоваться в любых частях системы, где нужна проверка состояния.
Например в автоматизациях для контроля продолжения выполнения (если условие не выполнено — автоматизация останавливается)
Или в ИИ агентах для принятия решений на основе текущих данных.

### Когда создавать условия

**СОЗДАВАЙ условия для:**

- Проверки наличия/отсутствия данных (есть ли заказы, подписка, и т.д.)
- Проверки принадлежности (email из домена, пользователь в группе)
- Проверки временных условий (время суток, день недели)
- Проверки числовых порогов (сумма покупок больше X)
- Любых бизнес-правил, которые можно выразить как да/нет

**НЕ НУЖНО создавать условия для:**

- Получения данных без проверки (используй действия)
- Сложной логики с побочными эффектами (используй действия)

### Структура условия

Условие создаётся через цепочку методов `app.meta().body().result().function()`:

```typescript
export const myCondition = app
  .meta({
    name: 'myAwesomeConditionName', // should match pattern '^[a-zA-Z0-9_-]{1,128}$'
    description: 'Описание что проверяет условие',
    llmDescription: 'Используй этот инструмент для проверки ...',
    category: 'category_name',
  })
  .body(s => ({
    context: s.unknown(),
      // Входные параметры условия
    input: s.object({
      userEmail: s.string().meta({ title: 'Email пользователя' }),
      minAmount: s.number().optional().meta({ title: 'Минимальная сумма' }),
    })
  }))
  .result(s => ({
    success: s.boolean(),
    satisfied: s.boolean().optional()
  }))
  .function('condition_slug', async (ctx, params) => {
    const { context, input } = params
    const result = await checkSomething(input)
    return { success: true, satisfied: result }
  })
```

### Параметры условия

#### body — входные данные

Входные параметры условия. Каждый параметр должен иметь `.meta({ title: '...' })` для отображения в UI.

```typescript
input: s.object({
  userEmail: s.string().describe('Email пользователя').meta({ title: 'Email пользователя' }),
  minAmount: s.number().optional().describe('Минимальная сумма').meta({ title: 'Дата для проверки' }),
}),
```

### Возвращаемое значение

| Поле | Тип | Описание |
|------|-----|----------|
| `success` | boolean | `true` — проверка выполнена успешно, `false` — ошибка при проверке |
| `satisfied` | boolean | `true` — условие выполнено, `false` — условие не выполнено |

```typescript
return { success: true, satisfied: true }   // Условие выполнено
return { success: true, satisfied: false }  // Условие НЕ выполнено
return { success: false }                   // Ошибка при проверке
```

---

### Регистрация условия

Условия регистрируются через хук `@start/account-conditions`:

```typescript
app.accountHook('@start/account-conditions', async (ctx, params) => {
  return [myCondition, anotherCondition]
})
```

---

## Примеры условий

### Проверка отсутствия заказов

```typescript
export const notHasOrderCondition = app
  .meta({
    name: 'userNotHasOrder',
    description: 'Проверяет, что у пользователя нет заказов',
    llmDescription: 'Используй этот инструмент чтобы проверить, что пользователь не совершал покупок',
    category: 'user_checks',
  })
  .body(s => ({
    context: s.unknown(),
    input: s.object({
      userEmail: s.string().meta({ title: 'Email пользователя' }),
    }),
  }))
  .result(s => ({ success: s.boolean(), satisfied: s.boolean().optional() }))
  .function('not_has_order', async (ctx, params) => {
    const { input } = params
    try {
      const orders = await Orders.findBy(ctx, { userEmail: input.userEmail, status: 'completed' })
      return { success: true, satisfied: orders.length === 0 }
    } catch (error) {
      ctx.account.log('notHasOrderCondition error', { level: 'error', err: error })
      return { success: false }
    }
  })
```

### Проверка домена email

```typescript
export const emailDomainMatchCondition = app
  .meta({
    name: 'emailDomainMatch',
    description: 'Проверяет, что email принадлежит указанному домену',
    llmDescription: 'Используй этот инструмент чтобы проверить, что email пользователя принадлежит определённому домену',
    category: 'email_checks',
  })
  .body(s => ({
    context: s.unknown(),
    input: s.object({
      email: s.string().meta({ title: 'Email для проверки' }),
      domain: s.string().meta({ title: 'Домен (например: company.com)' }),
    }),
  }))
  .result(s => ({ success: s.boolean(), satisfied: s.boolean().optional() }))
  .function('email_domain_match', async (ctx, params) => {
    const { input } = params
    const { email, domain } = input

    if (!email.includes('@')) {
      return { success: false }
    }

    const emailDomain = email.split('@')[1]?.toLowerCase()
    const targetDomain = domain.toLowerCase()

    return { success: true, satisfied: emailDomain === targetDomain }
  })
```

### Проверка времени суток

```typescript
import { utcToZonedTime } from '@npm/date-fns-tz'

export const timeOfDayCondition = app
  .meta({
    name: 'timeOfDay',
    description: 'Проверяет, что текущее время попадает в указанный диапазон',
    llmDescription: 'Используй этот инструмент чтобы проверить, что текущее время находится в заданном диапазоне часов',
    category: 'time_checks',
  })
  .body(s => ({
    context: s.object({
      journeyId: s.string(),
      configId: s.string(),
      timezone: s.string(),
      event: s.object({ triggeredAt: s.date(), payload: s.unknown() }),
      userId: s.string().optional(),
      customerContacts: s.array(s.object({ type: s.string(), value: s.string() })),
      vars: s.record(s.string(), s.any()),
    }),
    input: s.object({
      startHour: s.number().int().min(0).max(23).optional().meta({ title: 'Начало (час, 0-23)' }),
      endHour: s.number().int().min(0).max(23).meta({ title: 'Конец (час, 0-23)' }),
      timezone: s.string().optional().meta({ title: 'Таймзона (например: Europe/Moscow)' }),
    }),
  }))
  .result(s => ({ success: s.boolean(), satisfied: s.boolean().optional() }))
  .function('time_of_day', async (ctx, params) => {
    const { endHour, timezone } = params.input
    const startHour = params.input.startHour ?? 0

    const currentHour = utcToZonedTime(new Date(), timezone || 'UTC').getHours()
    if (!Number.isFinite(currentHour)) return { success: false }

    let satisfied: boolean

    if (startHour <= endHour) {
      satisfied = currentHour >= startHour && currentHour <= endHour
    } else {
      // Ночной диапазон (например, 22-06)
      satisfied = currentHour >= startHour || currentHour <= endHour
    }

    return { success: true, satisfied }
  })
```

### Рекомендуемые категории условий

- `user_checks` — проверки пользователя (наличие заказов, подписок)
- `crm_checks` — проверки CRM (статусы сделок, теги)
- `time_checks` — временные проверки (время суток, день недели)
- `data_checks` — проверки данных (заполненность полей, форматы)
- `business_rules` — бизнес-правила (лимиты, пороги)

---

## Чеклист перед коммитом

- [ ] Условие создано через `app.meta().body().result().function()`
- [ ] Указано понятное `name`, `description` и `llmDescription` в `.meta()`
- [ ] Все параметры в `body` имеют `.meta({ title: '...' })`
- [ ] Возвращается `{ success: boolean, satisfied: boolean }`
- [ ] При ошибках возвращается `{ success: false }`
- [ ] Условие зарегистрировано через `app.accountHook('@start/account-conditions', ...)`
- [ ] Выбрана подходящая категория

Для поиска уже зарегистрированных условий и чтения их схем см. [реестр](registry.md).
