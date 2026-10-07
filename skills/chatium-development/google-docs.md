# Google Docs: документы

Используй для создания, чтения и изменения содержимого Google Docs.

## Импорты

```typescript
import {
  getGoogleDoc,
  batchUpdateGoogleDoc,
  createGoogleDoc,
} from '@google/sdk'
```

## Docs SDK

### getGoogleDoc
Получает полную структуру документа (body, content, etc.).

```typescript
const result = await getGoogleDoc(ctx, {
  documentId: 'document_id_123',
  emailAddress: 'user@example.com'
})
// result.result.title — название
// result.result.body.content — массив структурных элементов
```

### batchUpdateGoogleDoc
Выполняет batch-операции над документом.

```typescript
const result = await batchUpdateGoogleDoc(ctx, {
  documentId: 'document_id_123',
  requests: JSON.stringify([
    {
      "insertText": {
        "location": { "index": 1 },
        "text": "Привет, мир!\n"
      }
    },
    {
      "updateTextStyle": {
        "range": { "startIndex": 1, "endIndex": 13 },
        "textStyle": { "bold": true, "fontSize": { "magnitude": 18, "unit": "PT" } },
        "fields": "bold,fontSize"
      }
    }
  ]),
  emailAddress: 'user@example.com'
})
```

### createGoogleDoc
Создаёт новый Google Doc.

```typescript
const result = await createGoogleDoc(ctx, {
  title: 'Мой документ',         // обязательный
  parentId: 'folder_id',         // опциональный
  emailAddress: 'user@example.com'
})
// result.result.documentId — ID созданного документа
```
