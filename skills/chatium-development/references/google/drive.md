# Google Drive: файлы и папки

Используй для создания папок, чтения и изменения файлов, а также поиска файлов с разрешённым доступом.

## Импорты

```typescript
import {
  createGoogleDriveFolder,
  createGoogleDriveFile,
  updateGoogleDriveFile,
  getGoogleDriveFile,
  getGoogleDriveFileContent,
  getAccessibleGoogleDriveFiles,
} from '@google/sdk'
```

## Drive SDK

### createGoogleDriveFolder
Создаёт папку на Google Drive.

```typescript
const result = await createGoogleDriveFolder(ctx, {
  name: 'Моя папка',           // обязательный
  parentId: 'folder_id_123',   // опциональный — ID родительской папки
  emailAddress: 'user@example.com' // опциональный
})
// result.result.id — ID созданной папки
```

### createGoogleDriveFile
Создаёт файл с текстовым содержимым (два шага: метаданные + upload).

```typescript
const result = await createGoogleDriveFile(ctx, {
  name: 'report.txt',           // обязательный
  content: 'Содержимое файла',  // обязательный
  mimeType: 'text/plain',       // опциональный, по умолчанию text/plain
  parentId: 'folder_id',        // опциональный
  emailAddress: 'user@example.com'
})
```

### updateGoogleDriveFile
Обновляет метаданные и/или содержимое файла.

```typescript
const result = await updateGoogleDriveFile(ctx, {
  fileId: 'file_id_123',        // обязательный
  name: 'new_name.txt',         // опциональный — новое имя
  content: 'Новое содержимое',  // опциональный — новое содержимое
  mimeType: 'text/plain',       // опциональный
  emailAddress: 'user@example.com'
})
```

### getGoogleDriveFile
Получает метаданные файла (id, name, mimeType, webViewLink, parents, size).

```typescript
const result = await getGoogleDriveFile(ctx, {
  fileId: 'file_id_123',
  emailAddress: 'user@example.com'
})
// result.result.name, result.result.webViewLink, etc.
```

### getGoogleDriveFileContent
Скачивает содержимое файла (для не-Google-нативных файлов).

```typescript
const result = await getGoogleDriveFileContent(ctx, {
  fileId: 'file_id_123',
  emailAddress: 'user@example.com'
})
// result.result — содержимое файла (строка)
```

### getAccessibleGoogleDriveFiles
Получает список файлов из локальной Heap таблицы (picker + созданные SDK). Если среди файлов нет нужного пользователю, ему необходимо перейти в настройки приложения google (/app/google) и разрешить доступ для этих файлов.

```typescript
const result = await getAccessibleGoogleDriveFiles(ctx, {
  emailAddress: 'user@example.com',
  mimeType: 'application/vnd.google-apps.spreadsheet', // опциональный фильтр
  source: 'created'                                     // опциональный: 'created' | 'picker'
})
// result.result.files — массив файлов
// result.result.totalCount — количество
```

## Типичный сценарий

```typescript
import { createGoogleSheet, updateGoogleSheet, createGoogleDoc, batchUpdateGoogleDoc } from '@google/sdk'

// 1. Создаём папку
const folder = await createGoogleDriveFolder(ctx, { name: 'Проект Альфа' })
if (!folder.ok) throw new Error(folder.result)
const folderId = folder.result.id

// 2. Создаём таблицу в папке
const sheet = await createGoogleSheet(ctx, {
  title: 'Бюджет',
  parentId: folderId
})
const spreadsheetId = sheet.result.spreadsheetId

// 3. Заполняем таблицу
await updateGoogleSheet(ctx, {
  spreadsheetId,
  range: 'Sheet1!A1:C3',
  values: JSON.stringify([
    ['Статья', 'План', 'Факт'],
    ['Маркетинг', 100000, 95000],
    ['Разработка', 200000, 210000]
  ])
})

// 4. Создаём документ
const doc = await createGoogleDoc(ctx, {
  title: 'Отчёт',
  parentId: folderId
})

// 5. Заполняем документ
await batchUpdateGoogleDoc(ctx, {
  documentId: doc.result.documentId,
  requests: JSON.stringify([
    { insertText: { location: { index: 1 }, text: 'Ежемесячный отчёт\n\nПроект Альфа успешно завершён.\n' } }
  ])
})
```

Для деталей операций с таблицами и документами см. [Sheets](sheets.md) и [Docs](docs.md).
