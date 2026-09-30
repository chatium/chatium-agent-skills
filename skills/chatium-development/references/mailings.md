# Mailings SDK

Плагин Mailings предоставляет `@mailings/sdk` для работы с сохранёнными письмами из серверного кода. Для чтения используй `readMessageFile`, для отправки — `sendMessageFromTemplate`. Не обращайся к файлам напрямую и не воспроизводи отправку через другие API. Перед использованием проверь экспорты и типы установленной версии SDK.

## Чтение письма

```typescript
import { readMessageFile } from '@mailings/sdk'

const raw = await readMessageFile(ctx, 'series/welcome.message.yaml')
// raw.content — исходный YAML

const parsed = await readMessageFile(ctx, 'series/welcome.message.yaml', {
  parse: true,
})
// parsed.content — объект с содержимым письма
```

Передай путь письма относительно директории Mailings; полный путь, полученный из Mailings, тоже подходит. Метод возвращает `{ path, content }`: без флага `content` — строка YAML, с `parse: true` — объект. При неверном пути, отсутствии письма или ошибке разбора метод выбрасывает исключение.

## Отправка письма

```typescript
import { sendMessageFromTemplate } from '@mailings/sdk'

const result = await sendMessageFromTemplate(ctx, {
  messageKey: 'series/welcome',
  contacts: [{ type: 'email', value: recipientEmail }],
  variables: { firstName },
})
if (!result.success) throw new Error(result.error ?? 'Не удалось отправить письмо')
```

`messageKey` — ключ письма относительно директории Mailings, обычно без `.message.yaml`. `contacts` задаёт получателей; `variables` и `segment` необязательны. SDK сам выбирает вариант и отправляет письмо. Проверяй `result.success`; при неудаче доступно `result.error`.

## Показать письмо или папку пользователю

Открывай интерфейс плагина Mailings на домене текущего аккаунта по
[правилам превью](../preview.md). Путь для `#/letter/` относителен
`.mailings/storage/` и **включает** `.message.yaml`; это не `messageKey`
метода отправки. Экран письма содержит Email/Чат/SMS-превью. Папка серии
выбирается через UI хранилища `#/store`, а не выдуманным URL папки.
Открытие существующего письма не запускает рассылку.
