# Google Calendar: подписка и синхронизация изменений

Используй для watch/hooks, initial full sync, incremental sync, renew и отключения подписок. Это единый lifecycle: приложение хранит состояние и управляет jobs.

## Импорты

```typescript
import {
  subscribeGoogleCalendarEvents,
  renewGoogleCalendarEventsSubscription,
  unsubscribeGoogleCalendarEvents,
  listGoogleCalendarEventSubscriptions,
  getGoogleCalendarEventChanges,
} from '@google/sdk'
```

## Поток синхронизации

Для отслеживания изменений используются три разные операции:

1. `subscribeGoogleCalendarEvents` - подписывает выбранный календарь на Google push notifications и будит ваш `app.accountHook`, когда Google сообщает об изменении.
2. `renewGoogleCalendarEventsSubscription` - пересоздает Google watch channel до `expiration`.
3. `getGoogleCalendarEventChanges` - читает одну страницу истории/дельты событий из Google Calendar.

Push notification от Google не содержит сами события. Это только сигнал "в календаре что-то изменилось". После такого сигнала клиентское приложение само решает, когда и как вызывать `getGoogleCalendarEventChanges`: сразу в hook, через свою job, через очередь, с debounce или вручную.

Плагин не хранит клиентский `syncToken`, не запускает sync jobs и не пытается сам вычитать весь календарь. `syncToken`, `pageToken`, состояние обработки страниц и бизнес-логику хранит приложение, которое использует SDK.

Плагин не обновляет Google watch-подписку автоматически. Клиентское приложение обязано само вызвать `renewGoogleCalendarEventsSubscription` до `expiration`. Если этого не сделать, Google channel протухнет, и hook-сигналы молча перестанут приходить.

Правильный поток:

1. Зарегистрируйте `app.accountHook`.
2. Вызовите `subscribeGoogleCalendarEvents`.
3. Сохраните `subscriptionId`, `expiration`, `watch_status='active'`, `sync_status='not_started'` в своей таблице.
4. Сделайте initial full sync через `getGoogleCalendarEventChanges` без `syncToken`.
5. Пока ответ содержит `result.nextPageToken`, вызывайте метод снова с тем же режимом и новым `pageToken`.
6. Когда ответ содержит `result.nextSyncToken`, сохраните его в своем приложении и поставьте `sync_status='ready'`.
7. После следующих hook-сигналов вызывайте `getGoogleCalendarEventChanges` уже с сохраненным `syncToken`.
8. Если incremental sync вернул `error: 'sync_token_expired'`, очистите локальное состояние и сделайте новый initial full sync.
9. Отдельно проверяйте `expiration` каждые 6-12 часов и вызывайте `renewGoogleCalendarEventsSubscription`, когда до истечения осталось меньше 24 часов.

Важно по hook API: в типах платформы `app.accountHook` и `app.pluginHook` используют один UGC hook runtime. Но это не разрешение писать клиентский код через `app.pluginHook`. Клиентское приложение обязано регистрировать обработчик через `app.accountHook`; `app.pluginHook` остается API для plugin-кода и в SDK-примерах не используется.

Если `app.accountHook` с указанным `hookName` не зарегистрирован или удален до `unsubscribeGoogleCalendarEvents`, плагин не сможет доставить сигнал в ваш код. Зарегистрируйте hook до `subscribeGoogleCalendarEvents` и держите его активным до отключения подписки.

Важно про namespace hook-а: `hookName` в методах SDK - это plugin-local ключ без `@`, например `test/google-calendar-events-changed`. Клиентский обработчик регистрируется с namespace Google plugin: `app.accountHook('@google/' + hookName, handler)`. Не используйте произвольный namespace вроде `@test/...`: Google plugin не сможет доставить туда сигнал через `execHook`.

По Google Calendar API `nextSyncToken` появляется только на последней странице. Если есть `nextPageToken`, значит страниц еще больше, а `nextSyncToken` пока не будет. Google также кодирует состояние синка в `pageToken`, поэтому изменения, появившиеся во время прохода страниц initial full sync, не должны потеряться.

⚠️ Не путайте `subscribeGoogleCalendarEvents` с `subscribeGoogleCalendar`. `subscribeGoogleCalendar` добавляет календарь в CalendarList пользователя. `subscribeGoogleCalendarEvents` подписывает приложение на push-сигналы изменений событий.

ИИ-агент обязан вести клиентский статус. Без статуса невозможно надежно понять, завершен ли initial sync, можно ли использовать `syncToken`, нужно ли делать renew, не идет ли уже sync/renew параллельно, и почему календарь перестал обновляться.

## 5️⃣ subscribeGoogleCalendarEvents - Подписка на изменения событий

### Описание
Подписывает выбранный календарь на Google Calendar push notifications. После подписки Google будет присылать сигнал в плагин, а плагин будет вызывать ваш `app.accountHook`.

Важно: hook получает только notification, без списка событий. Сами изменения нужно читать отдельным вызовом `getGoogleCalendarEventChanges`.

### Параметры

```typescript
interface SubscribeGoogleCalendarEventsParams {
  emailAddress?: string      // Email пользователя (опционально)
  calendarId: string         // ID календаря, например 'primary'
  hookName: string           // Plugin-local hook key, например 'my-app/google-calendar-events-changed'
}
```

`hookName` обязателен. Используйте plugin-local формат без `@`, например `crm/google-calendar-events-changed`. Точный формат: regex `/^[A-Za-z0-9_-]+\/[A-Za-z0-9_/-]+$/`, длина не больше 120 символов. Клиентский `accountHook` для этого ключа должен быть `@google/crm/google-calendar-events-changed`.

`emailAddress` плагин нормализует через `toLowerCase().trim()`. После subscribe сохраняйте `emailAddress` из ответа SDK и передавайте его явно в renew/list/unsubscribe, чтобы не зависеть от default email и регистра строки.

### Идемпотентность

Активная подписка уникальна по `(emailAddress, calendarId, hookName)`.

- Повторный вызов с тем же триплетом возвращает существующую active-подписку и не создает новый Google channel.
- Если старая запись уже `disabled` или `error`, новый subscribe создает новую подписку.

Для пересоздания Google channel используйте отдельный метод `renewGoogleCalendarEventsSubscription`.

Плагин не делает автоматический renew. Клиент обязан сам следить за `expiration` и вызывать renew до истечения.

### Формат ответа

```typescript
type SubscribeGoogleCalendarEventsResult =
  | {
      ok: true
      result: {
        subscriptionId: string
        emailAddress: string
        calendarId: string
        hookName: string
        status: 'active'
        channelId: string
        resourceId?: string
        expiration?: number
      }
    }
  | {
      ok: false
      error?: 'email_not_resolved' | 'oauth_missing' | 'oauth_no_calendar_scope' | 'google_api_error' | string
      result: string
    }
```

Типовые ошибки:

- `email_not_resolved` - email не передан и default email в плагине не найден; нужно выбрать/настроить Google account.
- `oauth_missing` - Google OAuth для этого email не настроен или token не refresh-ится; нужна авторизация/переавторизация в плагине.
- `oauth_no_calendar_scope` - у OAuth-записи нет Calendar scope; включите Calendar scopes и переавторизуйте Google account.

### Пример

```typescript
const hookName = 'my-app/google-calendar-events-changed'

app.accountHook('@google/' + hookName, async (ctx, notification) => {
  // Быстро обработайте сигнал или поставьте свою job/очередь.
  // Список событий здесь не приходит.
  await syncCalendarChanges(ctx, notification)
})

const subscription = await subscribeGoogleCalendarEvents(ctx, {
  emailAddress: 'user@example.com',
  calendarId: 'primary',
  hookName
})

if (!subscription.ok) {
  return subscription.result
}
```

### Payload hook

```typescript
interface GoogleCalendarEventsChangedNotification {
  subscriptionId: string
  emailAddress: string
  calendarId: string
  hookName: string
  channelId: string
  resourceId?: string
  resourceState: string
  messageNumber?: string
  receivedAt: string
}
```

`resourceState='sync'` - служебная первичная нотификация Google. Плагин ее не отправляет в client hook.

---

## 6️⃣ renewGoogleCalendarEventsSubscription - Обновление Google watch

### Описание
Пересоздает Google Calendar watch channel для уже активной подписки. Это нужно делать до `expiration`, иначе Google перестанет присылать push-сигналы, и ваш `app.accountHook` больше не будет просыпаться.

Renew вызывается только по полному ключу `(emailAddress, calendarId, hookName)`. Не используйте `subscriptionId` для renew: полный ключ делает клиентский код явным и не привязывает бизнес-логику к внутреннему ID записи.

Передавайте `emailAddress` явно из своей статусной таблицы. Не полагайтесь на default email между subscribe и renew: default мог измениться.

### Параметры

```typescript
interface RenewGoogleCalendarEventsSubscriptionParams {
  emailAddress?: string      // Email пользователя. Если не указан, используется email по умолчанию
  calendarId: string         // ID календаря
  hookName: string           // Тот же hookName, который использовался при subscribe
}
```

### Формат ответа

```typescript
type RenewGoogleCalendarEventsSubscriptionResult =
  | {
      ok: true
      result: {
        subscriptionId: string
        emailAddress: string
        calendarId: string
        hookName: string
        status: 'active'
        channelId: string
        resourceId?: string
        expiration?: number
      }
    }
  | {
      ok: false
      error?: 'no_active_subscription' | 'renew_too_frequent' | 'email_not_resolved' | 'oauth_missing' | 'oauth_no_calendar_scope' | 'google_api_error' | string
      result: string
    }
```

### Когда вызывать renew

- Проверяйте свои watch-подписки каждые 6-12 часов через свою job/cron.
- Вызывайте renew, когда до `expiration` осталось меньше 24 часов.
- Не вызывайте renew чаще 1 раза в час на один `(emailAddress, calendarId, hookName)`, кроме ручного восстановления после явной ошибки.
- Плагин сам enforce-ит лимит: слишком частый renew вернет `renew_too_frequent`.
- Если renew вернул `renew_too_frequent`, не ретрайте сразу. Дождитесь следующего штатного maintenance cycle через 6-12 часов или исправьте свою renew-политику, если она вызывает метод чаще 1 раза в час.
- Если `expiration` отсутствует, до него меньше 15 минут или expiration уже прошел, плагин пропустит throttle как emergency recovery.
- Если renew вернул `error:'no_active_subscription'`, активной подписки в плагине нет: поставьте `watch_status='disabled'`, заново вызовите `subscribeGoogleCalendarEvents`, сохраните новый `subscriptionId/expiration` и затем проверьте, нужен ли initial full sync.
- Если renew вернул `email_not_resolved`, `oauth_missing` или `oauth_no_calendar_scope`, это user-actionable ошибка настройки Google account/scopes. Не ретрайте циклом, покажите оператору действие.
- Если `expiration` уже прошел, вызовите renew, но затем сделайте новый initial full sync: часть push-сигналов могла быть потеряна.
- `renewedAt` в ответе нет. Если приложению нужно знать время успешного renew, после `ok:true` само запишите `last_renew_at = Date.now()` в свою статусную таблицу.

### Пример клиентской renew job

```typescript
const calendarWatchMaintenanceJob = app.job('/calendar-watch-maintenance', async (ctx) => {
  const states = await getActiveCalendarWatchStates(ctx)
  const now = Date.now()

  for (const state of states) {
    if (!state.expiration) {
      await updateCalendarWatchState(ctx, state.id, {
        watch_status: 'error',
        last_error: 'expiration отсутствует, невозможно безопасно планировать renew'
      })
      continue
    }

    const msToExpiration = state.expiration - now
    const shouldRenew = msToExpiration < 24 * 60 * 60 * 1000
    const renewedRecently = state.last_renew_at && now - state.last_renew_at < 60 * 60 * 1000

    if (!shouldRenew || renewedRecently) {
      continue
    }

    await updateCalendarWatchState(ctx, state.id, {
      watch_status: 'renewing',
      last_error: null
    })

    const renewed = await renewGoogleCalendarEventsSubscription(ctx, {
      emailAddress: state.email_address,
      calendarId: state.calendar_id,
      hookName: state.hook_name
    })

    if (!renewed.ok && renewed.error === 'no_active_subscription') {
      await updateCalendarWatchState(ctx, state.id, {
        watch_status: 'disabled',
        last_error: String(renewed.result)
      })

      const subscribed = await subscribeGoogleCalendarEvents(ctx, {
        emailAddress: state.email_address,
        calendarId: state.calendar_id,
        hookName: state.hook_name
      })

      if (subscribed.ok) {
        await updateCalendarWatchState(ctx, state.id, {
          watch_status: 'active',
          subscription_id: subscribed.result.subscriptionId,
          expiration: subscribed.result.expiration,
          sync_status: 'initial_syncing',
          last_error: null
        })
        await initialCalendarSync(ctx, state.email_address, state.calendar_id)
      }
      continue
    }

    if (!renewed.ok) {
      await updateCalendarWatchState(ctx, state.id, {
        watch_status: msToExpiration <= 0 ? 'expired' : 'error',
        last_error: String(renewed.result)
      })
      continue
    }

    await updateCalendarWatchState(ctx, state.id, {
      watch_status: 'active',
      // subscriptionId при renew стабилен; сохраняем его для идемпотентности локального состояния.
      subscription_id: renewed.result.subscriptionId,
      expiration: renewed.result.expiration,
      last_renew_at: now,
      last_error: null
    })

    if (msToExpiration <= 0) {
      await clearCalendarCache(ctx, state.calendar_id)
      await initialCalendarSync(ctx, state.email_address, state.calendar_id)
    }
  }
})
```

---

## 7️⃣ getGoogleCalendarEventChanges - История и дельта изменений

### Описание
Читает одну страницу событий через Google Calendar `events.list`. Метод нужен для двух режимов:

- initial full sync - первый проход по календарю, чтобы получить начальный `nextSyncToken`;
- incremental sync - чтение изменений после сохраненного `syncToken`.

SDK не делает loop внутри метода. Один вызов = одна страница. Если вернулся `nextPageToken`, вызывайте метод снова.

### Параметры

```typescript
interface GetGoogleCalendarEventChangesParams {
  emailAddress?: string      // Email пользователя (опционально)
  calendarId: string         // ID календаря
  syncToken?: string         // Токен предыдущего успешного sync
  pageToken?: string         // Токен следующей страницы
  updatedMin?: string        // Ручной режим "изменено после", RFC3339. Не смешивать с syncToken
  maxResults?: number        // Размер страницы, максимум 2500
  showDeleted?: boolean      // По умолчанию true
}
```

### Формат ответа

```typescript
type GetGoogleCalendarEventChangesResult =
  | {
      ok: true
      result: {
        calendarId: string
        emailAddress: string
        events: GoogleCalendarEvent[]
        changedEvents: GoogleCalendarEvent[]
        deletedEvents: GoogleCalendarEvent[]
        nextPageToken?: string
        nextSyncToken?: string
      }
    }
  | {
      ok: false
      error?: 'sync_token_expired' | 'calendar_not_found' | 'email_not_resolved' | 'oauth_missing' | 'oauth_no_calendar_scope' | 'google_api_error' | string
      result: string
    }
```

`deletedEvents` - события со `status='cancelled'`. Иногда событие может появиться только в `deletedEvents`, если оно было создано и удалено между двумя sync-проходами.

Перед чтением Google `events.list` метод проверяет email, OAuth token и Calendar scope. Ошибки `email_not_resolved`, `oauth_missing`, `oauth_no_calendar_scope` обрабатывайте так же, как в `subscribeGoogleCalendarEvents`: это требует действия оператора, а не быстрого retry-loop.

Семантика массивов:

- `events` - сырые `items` из Google Calendar API.
- `changedEvents` - subset из `events`, где `status !== 'cancelled'`.
- `deletedEvents` - subset из `events`, где `status === 'cancelled'`.

### Первый full sync

Первый запрос делается без `syncToken` и без `updatedMin`:

```typescript
async function initialCalendarSync(ctx, emailAddress: string, calendarId: string) {
  let pageToken: string | undefined

  while (true) {
    const page = await getGoogleCalendarEventChanges(ctx, {
      emailAddress,
      calendarId,
      pageToken,
      maxResults: 500
    })

    if (!page.ok) {
      throw new Error(String(page.result))
    }

    await processEvents(page.result.changedEvents, page.result.deletedEvents)

    if (page.result.nextPageToken) {
      pageToken = page.result.nextPageToken
      continue
    }

    if (!page.result.nextSyncToken) {
      throw new Error('Google Calendar не вернул nextSyncToken на последней странице')
    }

    await saveSyncToken(ctx, calendarId, page.result.nextSyncToken)
    break
  }
}
```

Правило: `nextSyncToken` сохраняется только после последней страницы, когда `nextPageToken` уже нет.

### Incremental sync после hook-сигнала

После первого full sync приложение хранит `syncToken`. На каждый следующий сигнал из `app.accountHook` вызывайте метод с этим токеном:

```typescript
async function syncCalendarChanges(ctx, notification) {
  const syncToken = await loadSyncToken(ctx, notification.calendarId)
  let pageToken: string | undefined

  while (true) {
    const page = await getGoogleCalendarEventChanges(ctx, {
      emailAddress: notification.emailAddress,
      calendarId: notification.calendarId,
      syncToken,
      pageToken,
      maxResults: 500
    })

    if (!page.ok && page.error === 'sync_token_expired') {
      await clearCalendarCache(ctx, notification.calendarId)
      await initialCalendarSync(ctx, notification.emailAddress, notification.calendarId)
      return
    }

    if (!page.ok) {
      throw new Error(String(page.result))
    }

    await processEvents(page.result.changedEvents, page.result.deletedEvents)

    if (page.result.nextPageToken) {
      pageToken = page.result.nextPageToken
      continue
    }

    if (page.result.nextSyncToken) {
      await saveSyncToken(ctx, notification.calendarId, page.result.nextSyncToken)
    }

    return
  }
}
```

Если изменений много, Google может вернуть несколько страниц даже для incremental sync. В этом случае используйте тот же `syncToken` и новый `pageToken`, пока не получите `nextSyncToken`.

### Важные правила Google sync

- `syncToken` нельзя смешивать с `updatedMin`.
- При `syncToken` нельзя добавлять фильтры `timeMin`, `timeMax`, `q`, `orderBy` и ряд других фильтров Google Calendar API.
- При `syncToken` удаленные события всегда должны попадать в результат; не ставьте `showDeleted=false`.
- Не рассчитывайте на сортировку "по убыванию". Sync API возвращает измененные ресурсы, порядок не должен быть бизнес-логикой.
- `updatedMin` используйте только для ручных сценариев или диагностики. Основной надежный sync-state - `nextSyncToken`.
- Не стройте постоянный incremental sync на `updatedMin`: для этого нужен initial full sync без `syncToken`, затем сохраненный `nextSyncToken`.
- Если Google вернул `410 Gone`, старый `syncToken` больше нельзя использовать: очистите локальный кэш/состояние и сделайте новый initial full sync.

Документация Google: [Synchronize resources efficiently](https://developers.google.com/workspace/calendar/api/guides/sync), [Events: list](https://developers.google.com/workspace/calendar/api/v3/reference/events/list).

---

## 🧭 Обязательный клиентский статус для ИИ агента Чатиум

Приложению с `subscribeGoogleCalendarEvents` нужно постоянное хранилище состояния. Переиспользуй существующее подходящее хранилище; отдельную Heap-таблицу создавай только при его отсутствии. SDK не хранит за клиента `syncToken`, `pageToken`, статус синхронизации и расписание renew. Далее «таблица статусов» означает это хранилище.

Минимальная структура:

```typescript
interface ClientCalendarWatchState {
  id: string
  email_address: string
  calendar_id: string
  hook_name: string

  watch_status: 'active' | 'renew_required' | 'renewing' | 'expired' | 'error' | 'disabled'
  sync_status: 'not_started' | 'initial_syncing' | 'ready' | 'sync_required' | 'syncing' | 'error'

  subscription_id?: string
  expiration?: number
  sync_token?: string
  page_token?: string

  last_hook_at?: number
  last_sync_at?: number
  last_renew_at?: number
  last_error?: string
}
```

### Почему статус нужно обновлять обязательно

- Без `watch_status` агент не узнает, что Google channel скоро истечет или уже истек.
- Без `expiration` агент не сможет вызвать renew вовремя, и Google перестанет слать hook-сигналы.
- Без `sync_status` агент может запустить два sync-прохода параллельно и перезаписать свой `syncToken` старым значением.
- Без `sync_status='not_started' | 'initial_syncing' | 'ready'` агент не поймет, можно ли уже делать incremental sync.
- Без `page_token` агент потеряет прогресс, если page-by-page проход оборвался.
- Без `last_error` оператор и следующий запуск агента не поймут, почему календарь перестал обновляться.

Короткое правило: сначала обнови статус, потом делай внешний вызов. После внешнего вызова снова обнови статус. Не держи состояние только в памяти job.

### Полная последовательность для AI агента

1. Выбери существующее постоянное хранилище статусов или создай Heap-таблицу, если подходящего нет.
2. Выбери plugin-local `hookName`, например `my-app/google-calendar-events-changed`.
3. Зарегистрируй `app.accountHook('@google/' + hookName, handler)`.
4. Вызови `subscribeGoogleCalendarEvents(ctx, { emailAddress, calendarId, hookName })`.
4. Если `ok:false`, запиши `watch_status='error'`, `last_error`.
   - `email_not_resolved`: нужна настройка/выбор Google email.
   - `oauth_missing`: нужна авторизация или переавторизация Google account в плагине.
   - `oauth_no_calendar_scope`: нужно включить Calendar scopes и переавторизоваться.
   - Generic error: сохраняй `last_error`, не запускай бесконечный retry-loop.
5. Если `ok:true`, сохрани `subscription_id`, `expiration`, `watch_status='active'`, `sync_status='not_started'`.
6. Перед initial sync поставь `sync_status='initial_syncing'`.
7. Вызови `getGoogleCalendarEventChanges` без `syncToken`.
8. После каждой страницы обработай события и сохрани `page_token`, если есть `nextPageToken`.
9. Когда пришел `nextSyncToken`, сохрани `sync_token`, очисти `page_token`, поставь `sync_status='ready'`.
10. В `app.accountHook` не делай большой sync прямо в webhook. Запиши `last_hook_at`, поставь `sync_status='sync_required'` и поставь свою job/очередь.
11. Sync job перед стартом ставит `sync_status='syncing'`.
12. Sync job вызывает `getGoogleCalendarEventChanges` с сохраненным `syncToken`.
13. После последней страницы сохраняет новый `sync_token`, чистит `page_token`, ставит `sync_status='ready'`.
14. Если пришел `sync_token_expired`, очисти `sync_token` и локальный кэш событий, поставь `sync_status='initial_syncing'`, повтори initial sync.
    Если history method вернул `email_not_resolved`, `oauth_missing` или `oauth_no_calendar_scope`, поставь `sync_status='error'`, сохрани `last_error` и запроси настройку Google account/scopes.
15. Отдельная клиентская maintenance job проверяет `expiration` каждые 6-12 часов.
16. Если до `expiration` меньше 24 часов, поставь `watch_status='renew_required'`.
17. Перед renew поставь `watch_status='renewing'`.
18. Вызови `renewGoogleCalendarEventsSubscription(ctx, { emailAddress, calendarId, hookName })`.
19. Если renew вернул `error === 'renew_too_frequent'`, сохрани `last_error`, оставь `watch_status='active'` или поставь `error` по своей политике, но не запускай быстрый retry. Жди следующего штатного maintenance cycle через 6-12 часов.
20. Если renew вернул `error === 'no_active_subscription'`, поставь `watch_status='disabled'`, вызови новый `subscribeGoogleCalendarEvents`, сохрани новый `subscriptionId/expiration` и вернись к initial sync.
21. Если renew вернул `email_not_resolved`, `oauth_missing` или `oauth_no_calendar_scope`, сохрани `last_error`, поставь `watch_status='error'` и запроси настройку Google account/scopes.
22. После успешного renew сохрани новый `expiration`, `last_renew_at`, поставь `watch_status='active'`. `subscriptionId` при renew остается тем же.
23. Если renew упал по другой причине, сохрани `last_error`. Если `expiration` уже прошел, поставь `watch_status='expired'`; если еще не прошел, можно поставить `watch_status='error'` и повторить позже по своей политике.
24. Если пользователь отключает интеграцию, вызови `unsubscribeGoogleCalendarEvents`, затем поставь `watch_status='disabled'`.

---

## 8️⃣ unsubscribeGoogleCalendarEvents и listGoogleCalendarEventSubscriptions

### unsubscribeGoogleCalendarEvents

Отключает SDK watch-подписку. Метод не удаляет события из Google Calendar.

```typescript
await unsubscribeGoogleCalendarEvents(ctx, {
  subscriptionId: 'subscription_id'
})
```

Допустимые варианты:

```typescript
type UnsubscribeGoogleCalendarEventsParams =
  | { subscriptionId: string }
  | { emailAddress?: string; calendarId: string; hookName: string }

type UnsubscribeGoogleCalendarEventsResult =
  | { ok: true; result: { subscriptionId: string; status: 'disabled' } }
  | { ok: false; error?: 'email_not_resolved' | 'subscription_not_found' | string; result: string }
```

Пустой вызов `unsubscribeGoogleCalendarEvents(ctx, {})` запрещен. Частичные фильтры вроде "только calendarId" тоже запрещены, чтобы случайно не снести все подписки.

Повторный unsubscribe уже отключенной подписки идемпотентен: метод возвращает успех без повторных Google/master вызовов. Если используете вариант с полным ключом, передавайте тот же normalized `emailAddress`, который сохранили из результата subscribe.

### listGoogleCalendarEventSubscriptions

Возвращает список SDK watch-подписок для диагностики и UI клиента.

```typescript
const subscriptions = await listGoogleCalendarEventSubscriptions(ctx, {
  emailAddress: 'user@example.com',
  calendarId: 'primary'
})
```

Параметры:

```typescript
interface ListGoogleCalendarEventSubscriptionsParams {
  emailAddress?: string
  calendarId?: string
  hookName?: string
  status?: 'active' | 'disabled' | 'error'
  limit?: number
}
```

`limit` по умолчанию `100`, максимум `500`. Pagination через `offset` в MVP нет; если подписок больше, фильтруйте по `emailAddress`, `calendarId`, `hookName` или `status`.

Сортировка фиксированная: `createdAt desc`. Если результат обрезан лимитом, вы получите последние созданные подписки; для полного покрытия используйте фильтры.

Формат ответа:

```typescript
type ListGoogleCalendarEventSubscriptionsResult =
  | {
      ok: true
      result: Array<{
        subscriptionId: string
        emailAddress: string
        calendarId: string
        hookName: string
        status: 'active' | 'disabled' | 'error'
        channelId: string
        resourceId?: string
        expiration?: number
        lastNotificationAt?: number
        lastRenewAt?: number
      }>
    }
  | {
      ok: false
      error?: string
      result: string
    }
```

Метод не возвращает `channel_token_hash`, `master_route_secret`, `master_webhook_url`, raw `channelToken` и OAuth tokens. Это диагностический список публичных watch-подписок текущего account context, а не доступ к внутреннему master routing index.

## Проверка интеграции

- [ ] Для подписки на изменения использую `app.accountHook`, а не `app.pluginHook`
- [ ] Перед `subscribeGoogleCalendarEvents` зарегистрировал `app.accountHook('@google/' + hookName, handler)`
- [ ] В SDK передаю plugin-local `hookName` без `@`, например `my-app/google-calendar-events-changed`
- [ ] `hookName` соответствует `/^[A-Za-z0-9_-]+\/[A-Za-z0-9_/-]+$/` и не длиннее 120 символов
- [ ] Не путаю `subscribeGoogleCalendarEvents` с `subscribeGoogleCalendar`
- [ ] Ошибки subscribe `email_not_resolved`, `oauth_missing`, `oauth_no_calendar_scope` обрабатываю как user-actionable, а не как бесконечный retry
- [ ] Сохраняю watch/sync lifecycle в постоянном хранилище приложения
- [ ] После subscribe сохранил `expiration`, `watch_status`, `sync_status`
- [ ] Сам вызываю `renewGoogleCalendarEventsSubscription` до `expiration`
- [ ] Не вызываю renew чаще 1 раза в час на один `(emailAddress, calendarId, hookName)`
- [ ] Ошибки renew проверяю через `result.error`, включая `no_active_subscription`, `renew_too_frequent`, `email_not_resolved`, `oauth_missing`, `oauth_no_calendar_scope`, а не через поиск текста ошибки
- [ ] Для истории изменений храню `syncToken` в своем приложении, не ожидаю этого от плагина
- [ ] Ошибки history `email_not_resolved`, `oauth_missing`, `oauth_no_calendar_scope` обрабатываю как настройку Google account/scopes, а не как retry
- [ ] Если пришел `nextPageToken`, читаю следующую страницу и не сохраняю новый `syncToken` до последней страницы
- [ ] Если пришел `sync_token_expired`, очищаю локальное состояние и делаю новый initial full sync
