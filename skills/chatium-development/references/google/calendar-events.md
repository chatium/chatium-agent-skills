# Google Calendar: чтение и изменение событий

Используй для поиска, создания, переноса и удаления встреч, Google Meet и повторяющихся событий. Для постоянного отслеживания изменений читай [calendar-sync.md](calendar-sync.md).

## Импорты

```typescript
import {
  getGoogleCalendarEvents,
  createGoogleCalendarEvent,
  updateGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
} from '@google/sdk'
```

## 1️⃣ getGoogleCalendarEvents - Получение списка событий

### Описание

Получает список событий из Google Calendar с возможностью фильтрации по дате, поиску и сортировке.

### Параметры

```typescript
interface GetGoogleCalendarEventsParams {
  emailAddress?: string      // Email пользователя (опционально)
  calendarId?: string        // ID календаря (по умолчанию 'primary')
  timeMin?: string           // Минимальное время начала (RFC3339)
  timeMax?: string           // Максимальное время начала (RFC3339)
  maxResults?: number        // Максимум результатов (1-2500, по умолчанию 250)
  singleEvents?: boolean     // Развернуть повторяющиеся события
  orderBy?: string           // Сортировка: 'startTime' или 'updated'
  q?: string                 // Текстовый поиск
  showDeleted?: boolean      // Показывать удаленные события
}
```

### Важные замечания

- `orderBy='startTime'` требует `singleEvents=true`
- Даты в формате RFC3339: `2026-01-20T10:00:00Z` или `2026-01-20T10:00:00+03:00`

### Примеры использования

#### Пример 1: Получить все события на следующую неделю

```typescript
import { getGoogleCalendarEvents } from '@google/sdk'

const result = await getGoogleCalendarEvents(ctx, {
  timeMin: '2026-01-20T00:00:00Z',
  timeMax: '2026-01-27T23:59:59Z',
  singleEvents: true,
  orderBy: 'startTime',
  maxResults: 100
})

if (result.ok) {
  const events = result.result.items
  console.log(`Найдено событий: ${events.length}`)
  events.forEach(event => {
    console.log(`${event.summary} - ${event.start.dateTime}`)
  })
} else {
  console.error('Ошибка:', result.result)
}
```

Поиск по слову задаётся через `q`; для конкретного подключённого аккаунта передай `emailAddress` и нужный `calendarId`.

### Формат ответа (result.result при ok=true)

```typescript
{
  kind: 'calendar#events',
  items: [
    {
      id: 'event_id_123',
      summary: 'Название события',
      description: 'Описание',
      start: {
        dateTime: '2026-01-20T10:00:00+03:00',
        timeZone: 'Europe/Moscow'
      },
      end: {
        dateTime: '2026-01-20T11:00:00+03:00',
        timeZone: 'Europe/Moscow'
      },
      location: 'Офис',
      attendees: [
        { email: 'user@example.com', responseStatus: 'accepted' }
      ],
      hangoutLink: 'https://meet.google.com/xxx-yyyy-zzz'
    }
  ],
  nextPageToken: 'token_for_next_page'
}
```

---

## 2️⃣ createGoogleCalendarEvent - Создание события

### Описание
Создает новое событие в Google Calendar с поддержкой Google Meet, участников, напоминаний и повторений.

### Параметры

```typescript
interface CreateGoogleCalendarEventParams {
  emailAddress?: string      // Email пользователя (опционально)
  calendarId?: string        // ID календаря (по умолчанию 'primary')
  summary: string            // Название события (обязательно)
  description?: string       // Описание
  start: string              // Время начала (обязательно)
  end: string                // Время окончания (обязательно)
  location?: string          // Место проведения
  attendees?: string[]       // Массив email участников
  reminders?: string         // JSON-строка с напоминаниями
  recurrence?: string[]      // Правила повторения (RRULE)
  sendUpdates?: string       // 'all', 'externalOnly', 'none'
  createMeet?: boolean       // Создать Google Meet
  meetRequestId?: string     // ID для Google Meet (идемпотентность)
  conferenceData?: string    // Расширенная настройка конференции
}
```

### Форматы параметров

#### Формат времени (start, end)
Два варианта:

**Вариант 1: RFC3339 строка (простой)**
```typescript
start: '2026-01-20T10:00:00+03:00'
end: '2026-01-20T11:00:00+03:00'
```

**Вариант 2: JSON-строка объекта EventDateTime (расширенный)**
```typescript
start: '{"dateTime":"2026-01-20T10:00:00+03:00","timeZone":"Europe/Moscow"}'
end: '{"dateTime":"2026-01-20T11:00:00+03:00","timeZone":"Europe/Moscow"}'
```

#### Формат напоминаний (reminders)
JSON-строка:
```typescript
reminders: '{"useDefault":false,"overrides":[{"method":"popup","minutes":10},{"method":"email","minutes":60}]}'
```

#### Формат повторений (recurrence)
Массив RRULE строк:
```typescript
recurrence: ['RRULE:FREQ=DAILY;COUNT=5']  // Повторять 5 дней
recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=10']  // По понедельникам, средам, пятницам, 10 раз
```

### Примеры использования

#### Пример 1: Простое событие
```typescript
const result = await createGoogleCalendarEvent(ctx, {
  summary: 'Встреча с командой',
  description: 'Обсуждение проекта',
  start: '2026-01-21T14:00:00+03:00',
  end: '2026-01-21T15:00:00+03:00',
  location: 'Переговорная 1'
})

if (result.ok) {
  console.log('Событие создано! ID:', result.result.id)
  console.log('Ссылка:', result.result.htmlLink)
} else {
  console.error('Ошибка:', result.result)
}
```

#### Пример 2: Событие с участниками и Google Meet
```typescript
const result = await createGoogleCalendarEvent(ctx, {
  summary: 'Планерка',
  start: '2026-01-22T10:00:00+03:00',
  end: '2026-01-22T10:30:00+03:00',
  attendees: ['user1@example.com', 'user2@example.com', 'user3@example.com'],
  createMeet: true,  // Создать Google Meet автоматически
  sendUpdates: 'all'  // Отправить приглашения всем участникам
})

if (result.ok) {
  console.log('Google Meet ссылка:', result.result.hangoutLink)
}
```

#### Пример 3: Повторяющееся событие с напоминаниями
```typescript
const result = await createGoogleCalendarEvent(ctx, {
  summary: 'Ежедневный стендап',
  start: '2026-01-20T09:00:00+03:00',
  end: '2026-01-20T09:15:00+03:00',
  recurrence: ['RRULE:FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR;COUNT=20'],  // Рабочие дни, 20 повторений
  reminders: '{"useDefault":false,"overrides":[{"method":"popup","minutes":5}]}',
  createMeet: true
})
```

#### Пример 4: Событие на весь день
```typescript
const result = await createGoogleCalendarEvent(ctx, {
  summary: 'День рождения',
  start: '{"date":"2026-01-25"}',  // Только дата, без времени
  end: '{"date":"2026-01-26"}'
})
```

---

## 3️⃣ updateGoogleCalendarEvent - Обновление события

### Описание
Обновляет существующее событие в календаре. Поддерживает частичное (PATCH) и полное (PUT) обновление.

### Параметры

```typescript
interface UpdateGoogleCalendarEventParams {
  emailAddress?: string      // Email пользователя (опционально)
  calendarId: string         // ID календаря (обязательно)
  eventId: string            // ID события (обязательно)
  summary?: string           // Новое название
  description?: string       // Новое описание
  start?: string             // Новое время начала
  end?: string               // Новое время окончания
  location?: string          // Новое место
  attendees?: string[]       // Обновленный список участников
  reminders?: string         // JSON-строка с напоминаниями
  recurrence?: string[]      // Обновленные правила повторения
  sendUpdates?: string       // 'all', 'externalOnly', 'none'
  method?: string            // 'patch' (по умолчанию) или 'put'
  createMeet?: boolean       // Добавить Google Meet
  meetRequestId?: string     // ID для Google Meet
  conferenceData?: string    // Расширенная настройка конференции
}
```

### Важные замечания
- `method='patch'` - обновляет только указанные поля (по умолчанию)
- `method='put'` - полная замена события (все неуказанные поля будут удалены)
- Если событие уже имеет Google Meet и `createMeet=true`, Meet не будет создан повторно

### Примеры использования

#### Пример 1: Изменить время события
```typescript
const result = await updateGoogleCalendarEvent(ctx, {
  calendarId: 'primary',
  eventId: 'event_id_123',
  start: '2026-01-21T15:00:00+03:00',  // Новое время
  end: '2026-01-21T16:00:00+03:00',
  sendUpdates: 'all'  // Уведомить участников
})

if (result.ok) {
  console.log('Событие обновлено!')
} else {
  console.error('Ошибка:', result.result)
}
```

#### Пример 2: Добавить Google Meet к существующему событию
```typescript
const result = await updateGoogleCalendarEvent(ctx, {
  calendarId: 'primary',
  eventId: 'event_id_123',
  createMeet: true,
  sendUpdates: 'all'
})

if (result.ok) {
  console.log('Google Meet добавлен:', result.result.hangoutLink)
}
```

Для изменения названия или описания передай только эти поля через PATCH. Если добавляешь участников, сначала получи нужное событие по его ID, проверь успех чтения и объедини текущих участников с новыми: передаваемый `attendees` заменяет список. Не выбирай первое событие из произвольной выдачи.

#### Пример 5: Полное обновление события (PUT)
```typescript
const result = await updateGoogleCalendarEvent(ctx, {
  calendarId: 'primary',
  eventId: 'event_id_123',
  method: 'put',  // Полная замена
  summary: 'Новое событие',
  start: '2026-01-21T10:00:00+03:00',
  end: '2026-01-21T11:00:00+03:00'
  // Все остальные поля (описание, участники, место и т.д.) будут удалены
})
```

---

## 4️⃣ deleteGoogleCalendarEvent - Удаление события

### Описание
Удаляет событие из Google Calendar.

### Параметры

```typescript
interface DeleteGoogleCalendarEventParams {
  emailAddress?: string      // Email пользователя (опционально)
  calendarId: string         // ID календаря (обязательно)
  eventId: string            // ID события (обязательно)
  sendUpdates?: string       // 'all', 'externalOnly', 'none'
}
```

### Примеры использования

#### Пример 1: Удалить событие
```typescript
const result = await deleteGoogleCalendarEvent(ctx, {
  calendarId: 'primary',
  eventId: 'event_id_123'
})

if (result.ok) {
  console.log('Событие удалено!')
} else {
  console.error('Ошибка:', result.result)
}
```

Для уведомлений об отмене передай `sendUpdates: 'all'` или `'externalOnly'`; для конкретного подключённого аккаунта — `emailAddress`.

## 🔧 Обработка ошибок

### Стандартный подход

```typescript
const result = await getGoogleCalendarEvents(ctx, params)

if (result.ok) {
  // Успех - работаем с данными
  const events = result.result.items
  // ... ваша логика
} else {
  // Ошибка - result.result содержит текст ошибки
  console.error('Ошибка при получении событий:', result.result)

  // Можно вернуть ошибку пользователю
  return {
    error: true,
    message: result.result
  }
}
```

### Типичные ошибки и их решения

#### 1. "Параметр emailAddress не указан или указан в неверном формате, и нет email по умолчанию"
**Решение:** Укажите валидный `emailAddress` или настройте email по умолчанию в настройках плагина.


#### 2. "Не удалось получить валидный токен доступа"
**Решение:** Пользователь не авторизован или токен истек. Нужна повторная авторизация.

#### 3. "Не настроены права доступа к Google Calendar"
**Решение:** В настройках плагина нужно включить Calendar scopes и переавторизовать аккаунт.

#### 4. "orderBy=startTime требует singleEvents=true"
**Решение:** При сортировке по времени начала нужно развернуть повторяющиеся события:


#### 5. "Неверный формат JSON в параметре start/end/reminders"
**Решение:** Проверьте корректность JSON-строки:

```typescript
// ✅ Правильно
start: '{"dateTime":"2026-01-21T10:00:00Z","timeZone":"UTC"}'

// ❌ Неправильно
start: '{dateTime:2026-01-21T10:00:00Z}'  // Нет кавычек
```

---

При массовом создании обрабатывай результат каждого события отдельно; частичный успех не означает, что нужно повторять уже успешные операции. Для пользовательских запросов сначала извлеки и проверь дату, часовой пояс и участников, затем вызывай подходящий CRUD-метод.

## Даты, права и повторные вызовы

### 1. Контекст (ctx)
- Всегда передавайте актуальный `ctx` из вашего app.function или app.screen
- Не пытайтесь создать ctx вручную

### 2. Часовые пояса
- Всегда указывайте часовой пояс в датах: `2026-01-21T10:00:00+03:00`
- Или используйте UTC: `2026-01-21T07:00:00Z`
- Избегайте дат без часового пояса

### 3. Идемпотентность
- При создании Google Meet используйте `meetRequestId` для идемпотентности
- Это предотвратит создание дубликатов при повторных запросах
- Для watch-подписок `subscribeGoogleCalendarEvents` идемпотентен по `(emailAddress, calendarId, hookName)`
- Для пересоздания Google channel используйте `renewGoogleCalendarEventsSubscription`

### 5. Права доступа
- Убедитесь, что у пользователя настроены права доступа к Calendar
- SDK работает только с авторизованными пользователями

Для получения более 2500 событий используй постраничное чтение по `nextPageToken`. Ограничивай частоту массового создания событий с учётом лимитов Google API.
