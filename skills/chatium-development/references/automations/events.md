---
title: Важно прочитать, если создаешь важный для бизнеса функционал или он связан с действиями клиента, по которому можно будет построить аналитику или запустить автоматизации!
description: >
  Особенно важно, если то, что ты делаешь связано с заполнением любой формы (регистрация, заявка, обратная связь), созданием заказа, заявки, брони, оплатой или изменение статуса оплаты, регистрацией пользователя, подпиской на рассылку, записью на мероприятие/вебинар/консультацию и другие ключевые действия пользователя, которые важны для бизнеса.
---

## Регистрация событий для автоматизаций и аналитики

События аккаунта — это механизм для отслеживания важных действий пользователей. Они используются для:
- **Аналитики** — понимание что происходит в аккаунте, метрики, отчёты (маппинг параметров по запросу клиента)
- **Автоматизаций** — триггеры для запуска цепочек действий (отправка писем, уведомлений, http-запросы)
- **ИИ агентов** — данные для анализа и принятия решений по пользователю

### Когда добавлять события

**ОБЯЗАТЕЛЬНО** добавляй события в следующих случаях:
- Заполнение любой формы (регистрация, заявка, обратная связь)
- Создание заказа, заявки, брони
- Оплата или изменение статуса оплаты
- Регистрация пользователя
- Подписка на рассылку
- Запись на мероприятие/вебинар/консультацию
- Скачивание материалов (лид-магниты)
- Другие ключевые действия пользователя, которые важны для бизнеса

**НЕ НУЖНО** добавлять события для:
- Просмотра страниц (для этого есть отдельная аналитика)
- Технических операций (миграции, служебные задачи)
- Внутренних административных действий

### Запись события

Записывай событие после успешного бизнес-действия, а не до него.

Используй функцию `writeWorkspaceEvent` из `@start/sdk`:

```typescript
import { writeWorkspaceEvent } from '@start/sdk'

// Внутри обработчика после успешного действия
await writeWorkspaceEvent(ctx, 'form_submitted', {
  user: ctx.user ? { id: ctx.user.id, type: ctx.user.type } : undefined,
  action_param1_mapstrstr: {
    formType: 'registration',
    source: 'landing',
  },
  customer_contacts: [
  {
    type: 'email',
    value: formData.email,
  }, {
    type: 'phone',
    value: formData.phone,
  }],
  action_param1: formData.name,      // строковое значение 1
  action_param2: formData.email,     // строковое значение 2
  action_param3: formData.phone,     // строковое значение 3
  action_param1_int: formData.amount, // числовое значение 1
  uid: userUid, // ЭТО ВСЕГДА СТРОКА! если известен uid пользователя (как правило его почти всегда можно получить на клиенте из window.clrtUid либо из куки запроса "x-chtm-uid")
  utm_source: req.query.utm_source,
  utm_medium: req.query.utm_medium,
  utm_campaign: req.query.utm_campaign,
})
```

### Запись события клиента (captureCustomerEvent)

Если событие связано с конкретным клиентом (пользователем/лидом), используй `captureCustomerEvent` из `@crm/sdk`. Эта функция автоматически связывает контакты с клиентом в CRM и создаёт/обновляет карточку клиента.

```typescript
import { captureCustomerEvent, getCustomerEventUrl } from '@crm/sdk'

await captureCustomerEvent(ctx, {
  event: 'form_submitted',
  name: 'Заполнена форма регистрации',

  // Контакты клиента (обязательно хотя бы один)
  contacts: [
    { type: 'email', value: formData.email },
    { type: 'phone', value: formData.phone },
  ],

  // Или добавить подтверждённые контакты из userId
  appendUserContacts: userId,

  // Данные для создания/обновления карточки клиента
  customer: {
    displayName: formData.name,
    utm: {
      source: req.query.utm_source,
      medium: req.query.utm_medium,
      campaign: req.query.utm_campaign,
      content: req.query.utm_content,
      term: req.query.utm_term,
    },
  },

  // Связать с записями в других таблицах
  linkRecords: [
    HeapRecordItem,
  ],

  // Произвольные данные события
  payload: {
    formType: 'registration',
    source: 'landing',
  },

  // Дополнительные поля метрики; зарезервированные поля формирует CRM
  metricEventData: {
    action_param1: formData.name,
    action_param2: formData.email,
    utm_source: req.query.utm_source,
  },
})
```

В `metricEventData` допускается `action`. Зарезервированы `url`, `funnel`, `funnel_node`, `funnel_node_from` и `customer_contacts`: CRM формирует их сама. URL события получается через `getCustomerEventUrl(ctx, event)`.

`CaptureCustomerEventInput` экспортируется из `@crm/sdk`. Укажи хотя бы один контакт через `contacts` или `appendUserContacts`; иначе результат содержит ошибку `no_contacts`. Проверяй `success` перед использованием результата.

Для описания полей события в реестре используй [payloadMapping и fieldExpr](registry.md#как-читать-реестр). Это метаданные события, не аргументы `captureCustomerEvent`.

#### Результат captureCustomerEvent

При успехе возвращает `customerIds`, `contactIds`, `recordIds`. При ошибке — `errorCode` и `errorMessage`.

### workspaceEvent vs customerEvent — когда что использовать

Есть два ключевых отличия:

1. **Привязка к клиенту.** Если событие связано с конкретным клиентом (пользователем, лидом) — используй `captureCustomerEvent`. Если событие не привязано к клиенту (системное, административное) — используй `writeWorkspaceEvent`.

2. **Контекст вызова.** `workspaceEvent` привязан к конкретному проекту (workspace), из которого был вызван — `getWorkspaceEventUrl` генерирует URL, зависящий от текущего workspace. `customerEvent` — глобальный: `getCustomerEventUrl` генерирует одинаковый URL независимо от того, из какого проекта он вызван. **Если запись события (`captureCustomerEvent`) и регистрация события (`getCustomerEventUrl` в хуке) происходят в разных проектах — используй `customerEvent`.**

| Сценарий | Тип | Причина |
|----------|-----|---------|
| Клиент заполнил форму заявки | customerEvent | Привязано к клиенту, нужна карточка в CRM |
| Клиент оплатил заказ | customerEvent | Привязано к клиенту |
| Клиент записался на вебинар | customerEvent | Привязано к клиенту |
| Событие из одного проекта, обработка в другом | customerEvent | Контекст вызова разный |
| Системное уведомление об ошибке | workspaceEvent | Не привязано к клиенту |
| Внутреннее событие внутри одного проекта | workspaceEvent | Один контекст, нет клиента |

### Данные события и контакты

Актуальные поля метрики смотри в локальных typings. `action_paramN` хранят строки, варианты `_int` и `_float` — целые и дробные числа, `_arrstr` и `_uint32arr` — массивы, `_mapstrstr` — словари строк. Передавай известные UTM-метки и `uid` посетителя; `uid` всегда строка (`window.clrtUid` или cookie `x-chtm-uid`).

`user` заполняй только из действительного `ctx.user`; данные формы не превращают посетителя в авторизованного пользователя.

Передавай известные контакты, не придумывая их:

- `writeWorkspaceEvent`: `customer_contacts: [{ type: 'email', value: email }]`.
- `captureCustomerEvent`: `contacts` и/или `appendUserContacts`. Не передавай `customer_contacts` ни в корень CRM-вызова, ни в `metricEventData`: CRM формирует его из контактов.

### Пример полной реализации

```typescript
import { writeWorkspaceEvent } from '@start/sdk'

// api/contact/submit.ts; saveFormData — серверная функция сохранения формы.
export const submitFormRoute = app.post('/')
  .body(s => ({
    name: s.string(), email: s.string(), phone: s.string(),
    message: s.string(), clrtUid: s.string().optional(),
  }))
  .handle(async (ctx, req) => {
    const { name, email, phone, message, clrtUid } = req.body
    const cookieUid = req.headers?.cookie?.split(';')
      .map(cookie => cookie.trim()).find(cookie => cookie.startsWith('x-chtm-uid='))
      ?.slice('x-chtm-uid='.length)

    // Сохраняем данные формы
    await saveFormData(ctx, { name, email, phone, message })

    // Записываем событие
    await writeWorkspaceEvent(ctx, 'contact_form_submitted', {
      user: ctx.user ? { id: ctx.user.id, type: ctx.user.type } : undefined,
      uid: (clrtUid ?? cookieUid) || undefined,
      customer_contacts: [
        { type: 'email', value: email },
        { type: 'phone', value: phone },
      ],
      action_param1: name,
      action_param2: email,
      action_param3: phone,
      action_param1_mapstrstr: { message },
    })

    return { success: true }
  })
```

### Использование событий на клиенте

**ВАЖНО:** На клиенте (в браузере) нельзя использовать `captureCustomerEvent`. Для записи событий на клиенте используй `writeWorkspaceEvent` — API полностью унифицировано и работает одинаково как на сервере, так и на клиенте.

Если событие является чисто браузерным (клик по кнопке, скролл до блока, просмотр видео, взаимодействие с интерактивным элементом и т.д.) — **вызывай `writeWorkspaceEvent` прямо в клиентском коде**, в том же компоненте, где происходит действие. **Не нужно** создавать отдельный серверный эндпоинт для записи таких событий.

```typescript
// Пример: запись события прямо в клиентском компоненте
import { writeWorkspaceEvent } from '@start/sdk'

// Внутри клиентского компонента, где доступен браузерный ctx:
const handleScrollReached = () => {
  writeWorkspaceEvent(ctx, 'scrolled_to_pricing', {
    action_param1: 'pricing-section',
  })
}

const handleCTAClick = () => {
  writeWorkspaceEvent(ctx, 'cta_button_clicked', {
    action_param1: 'signup-button',
    action_param2: 'hero-section',
  })
}

```
