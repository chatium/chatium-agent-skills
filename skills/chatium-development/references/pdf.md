---
title: Vault createPdf SDK - Инструкция по использованию
description: Изучи этот документ, если пользователь просит создать PDF из HTML или страницы по URL. Здесь описан асинхронный метод createPdf из @vault/sdk, его параметры, callback через PendingTask, формат результата и правила доступа к защищённым файлам.
requireApp: vault
---

# Vault PDF SDK Documentation

SDK создаёт PDF из готового HTML или публичной HTTP(S)-страницы и сохраняет результат в FileService.

## Импорт

```typescript
import {
  createPdf,
  type PdfCompletedCallbackBody,
} from '@vault/sdk'
```

## Общие правила

- `createPdf` принимает `ctx` первым аргументом и объект параметров вторым.
- Нужно передать ровно один источник: `html` или `url`.
- Генерация выполняется асинхронно, метод сразу возвращает `PendingTask`.
- `onCompleted` обязателен. Vault сам регистрирует его через `setPendingTaskCallback`.
- Callback вызывается и при успехе, и при ошибке. Проверяй `body.result.ok`.
- `context` необязателен и приходит в callback как `body.params`.
- Polling и отдельный метод получения статуса не нужны.
- По умолчанию PDF загружается как защищённый файл (`protected: true`).

---

## Callback результата

Сначала объяви функцию, которая обработает завершение `PendingTask`:

```typescript
import type { PdfCompletedCallbackBody } from '@vault/sdk'

type PdfContext = {
  documentId: string
}

export const pdfCompletedRoute = app.function(
  '/pdf-completed',
  async (ctx, body: PdfCompletedCallbackBody<PdfContext>) => {
    const context = body.params

    if (body.result.ok) {
      // Общий PendingTask-контракт также допускает content вместо result.
      if (!('result' in body.result)) throw new Error('Missing PDF result')
      const {
        requestId,
        jobId,
        hash,
        fileName,
        fileSize,
        pages,
      } = body.result.result

      // Сохрани hash и связанные данные в своей таблице.
      // context.documentId можно использовать для связи с исходной сущностью.
    } else {
      const { code } = body.result
      const reason = 'reason' in body.result ? body.result.reason : undefined

      // Сохрани или покажи ошибку генерации.
    }

    return { ok: true }
  },
)
```

Не вызывай `setPendingTaskCallback` или `setPendingTaskCallbacks` вручную — это уже делает `createPdf`.

---

## Создание PDF из HTML

```typescript
import { createPdf } from '@vault/sdk'

const pendingTask = await createPdf(ctx, {
  html: '<h1>Отчёт</h1><p>Готовый HTML-документ</p>',
  sourceName: 'report',
  format: 'A4',
  margin: '15mm',
  printBackground: true,
  onCompleted: pdfCompletedRoute,
  context: {
    documentId: 'document-123',
  },
})

return pendingTask
```

HTML не должен быть пустым. Максимальный размер — 10 МБ.

---

## Создание PDF из URL

```typescript
const pendingTask = await createPdf(ctx, {
  url: 'https://example.com/report',
  sourceName: 'report',
  onCompleted: pdfCompletedRoute,
  context: {
    documentId: 'document-123',
  },
})

return pendingTask
```

Разрешены только HTTP(S)-адреса без логина и пароля в URL. Для тяжёлых страниц предпочитай готовый `html`: загрузка по URL может завершиться navigation timeout.

---

## Настройки и результат

Сигнатуру `createPdf` и результат смотри в `@vault/sdk`; callback использует `PdfCompletedCallbackBody`, как в примере выше. `context` должен быть сериализуемым.

`sourceName` задаёт основу имени файла. По умолчанию используются A4, портретная ориентация, масштаб 1 и печать фона. Масштаб допустим от 0.1 до 2; поля задаются с единицами (`15mm`, `1cm`, `0.5in`). `waitUntil` выбирает условие завершения загрузки страницы.

## Защищённые и публичные файлы

По умолчанию создаётся защищённый PDF:

```typescript
await createPdf(ctx, {
  html,
  onCompleted: pdfCompletedRoute,
  // protected: true применяется автоматически
})
```

Callback `PendingTask` выполняется как фоновая job без пользовательской auth-сессии. Поэтому для защищённого hash нельзя прямо вызывать `getOriginalUrl` или `getDownloadUrl` внутри callback. Сохраняй `hash`, создавай временную shared-ссылку либо формируй URL позже в авторизованном запросе.

Если PDF действительно должен быть доступен без авторизации, создай публичный файл:

```typescript
await createPdf(ctx, {
  html,
  protected: false,
  onCompleted: pdfCompletedRoute,
})
```

Для публичного hash обычные `getOriginalUrl` и `getDownloadUrl` работают без пользовательской сессии.
