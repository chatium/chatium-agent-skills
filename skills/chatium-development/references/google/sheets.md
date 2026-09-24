# Google Sheets: таблицы

Используй для чтения и записи диапазонов, создания таблиц и batch-операций с листами.

## Импорты

```typescript
import {
  getGoogleSheet,
  updateGoogleSheet,
  batchUpdateGoogleSheet,
  createGoogleSheet,
} from '@google/sdk'
```

## Sheets SDK

### getGoogleSheet
Читает данные из Google Spreadsheet.

```typescript
// Вариант 1: Получить значения конкретного диапазона
const result = await getGoogleSheet(ctx, {
  spreadsheetId: 'spreadsheet_id_123',
  range: 'Sheet1!A1:D10',        // опциональный — A1 notation
  emailAddress: 'user@example.com'
})
// result.result.values — двумерный массив [[row1], [row2], ...]

// Вариант 2: Получить всю таблицу (метаданные)
const result2 = await getGoogleSheet(ctx, {
  spreadsheetId: 'spreadsheet_id_123',
  includeFormatting: true  // опциональный — включить данные сетки
})
// result2.result.sheets — массив листов
```

### updateGoogleSheet
Записывает данные в ячейки таблицы.

```typescript
const result = await updateGoogleSheet(ctx, {
  spreadsheetId: 'spreadsheet_id_123',
  range: 'Sheet1!A1:B2',         // обязательный
  values: '[["Name","Age"],["Alice",30]]', // обязательный — JSON-строка двумерного массива
  valueInputOption: 'USER_ENTERED', // опциональный: 'RAW' | 'USER_ENTERED' (по умолчанию)
  emailAddress: 'user@example.com'
})
```

### batchUpdateGoogleSheet
Выполняет batch-операции (форматирование, слияние ячеек, добавление листов и т.д.).

> **Важно:** `batchUpdate` работает с числовым `sheetId`, а не с именем листа.
> При создании таблицы с кастомными листами Google назначает свой `sheetId` (не обязательно `0`).
> Перед вызовом `batchUpdateGoogleSheet` необходимо получить реальный `sheetId` через `getGoogleSheet`:
>
> ```typescript
> const meta = await getGoogleSheet(ctx, { spreadsheetId })
> const sheetId = meta.result.sheets[0].properties.sheetId // sheetId первого листа
> ```

```typescript
// 1. Получаем sheetId нужного листа
const meta = await getGoogleSheet(ctx, { spreadsheetId: 'spreadsheet_id_123' })
const sheetId = meta.result.sheets[0].properties.sheetId

// 2. Используем реальный sheetId в requests
const result = await batchUpdateGoogleSheet(ctx, {
  spreadsheetId: 'spreadsheet_id_123',
  requests: JSON.stringify([
    {
      "addSheet": {
        "properties": { "title": "Новый лист" }
      }
    },
    {
      "repeatCell": {
        "range": { "sheetId": sheetId, "startRowIndex": 0, "endRowIndex": 1 },
        "cell": {
          "userEnteredFormat": { "textFormat": { "bold": true } }
        },
        "fields": "userEnteredFormat.textFormat.bold"
      }
    }
  ]),
  emailAddress: 'user@example.com'
})
```

### createGoogleSheet
Создаёт новую Google Spreadsheet.

```typescript
const result = await createGoogleSheet(ctx, {
  title: 'Моя таблица',          // обязательный
  sheets: JSON.stringify([        // опциональный — описания листов
    { "properties": { "title": "Данные" } },
    { "properties": { "title": "Сводка" } }
  ]),
  parentId: 'folder_id',         // опциональный — папка
  emailAddress: 'user@example.com'
})
// result.result.spreadsheetId — ID созданной таблицы
```
