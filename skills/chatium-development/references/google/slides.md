# Google Slides: презентации

Используй для создания презентаций, чтения структуры и batch-операций со слайдами.

## Импорты

```typescript
import {
  createGooglePresentation,
  getGooglePresentation,
  batchUpdateGooglePresentation,
} from '@google/sdk'
```

## Slides SDK (Presentations)

### createGooglePresentation
Создаёт новую пустую презентацию Google Slides (без слайдов — дефолтный титульный слайд удаляется автоматически).

```typescript
const result = await createGooglePresentation(ctx, {
  title: 'Моя презентация',       // обязательный
  parentId: 'folder_id',          // опциональный — папка
  emailAddress: 'user@example.com'
})
// result.result.presentationId — ID созданной презентации
// result.result.pageSize — размеры страницы
```

### getGooglePresentation
Получает полную структуру презентации (slides, masters, layouts, pageSize).

```typescript
const result = await getGooglePresentation(ctx, {
  presentationId: 'presentation_id_123',
  emailAddress: 'user@example.com'
})
// result.result.title — название
// result.result.slides — массив слайдов с содержимым
// result.result.pageSize — размер страницы
```

### batchUpdateGooglePresentation
Выполняет batch-операции над презентацией (создание слайдов, фигур, текста, изображений и т.д.).

> **Важно:** Размеры страницы: 720 x 405 PT (16:9). objectId уникален во всей презентации.
> Порядок requests = z-index (первый — на заднем плане). Сначала создай слайд, потом элементы.

```typescript
const result = await batchUpdateGooglePresentation(ctx, {
  presentationId: 'presentation_id_123',
  requests: JSON.stringify([
    {
      "createSlide": {
        "objectId": "slide_1",
        "insertionIndex": 0
      }
    },
    {
      "createShape": {
        "objectId": "title_1",
        "shapeType": "TEXT_BOX",
        "elementProperties": {
          "pageObjectId": "slide_1",
          "size": { "width": { "magnitude": 600, "unit": "PT" }, "height": { "magnitude": 50, "unit": "PT" } },
          "transform": { "scaleX": 1, "scaleY": 1, "translateX": 60, "translateY": 50, "unit": "PT" }
        }
      }
    },
    {
      "insertText": {
        "objectId": "title_1",
        "text": "Заголовок слайда"
      }
    }
  ]),
  emailAddress: 'user@example.com'
})
// result.result.replies — массив ответов с objectId созданных элементов
// result.result.requestsProcessed — количество обработанных запросов
```
