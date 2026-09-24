---
title: Yandex OAuth SDK - Инструкция по использованию
description: Изучи этот документ, если пользователь просит добавить вход через Яндекс на кастомную страницу авторизации. Здесь описан SDK-метод получения готовой ссылки Yandex OAuth, его параметры и обработка ошибок.
requireApp: yandexoauth
---

# Yandex OAuth SDK

SDK позволяет получить готовую ссылку для входа через Яндекс и использовать её на собственной странице авторизации Chatium.

## Импорт

```typescript
import { getYandexOauthUrl } from '@yandex-auth/sdk'
```

## getYandexOauthUrl

```typescript
// returnPageRoute — импортированный RouteRef страницы возврата приложения.
const oauthUrl = await getYandexOauthUrl(ctx, {
  back: returnPageRoute.url()
})
```

Метод возвращает `Promise<string>` с готовой ссылкой на страницу авторизации Яндекса.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|:------------:|----------|
| `ctx` | `app.Ctx` | да | Контекст текущего запроса Chatium |
| `params.back` | `string` | нет | Адрес возврата после успешной авторизации |

`back` должен вести на текущий аккаунт Chatium. Внешние адреса не используются и заменяются главной страницей аккаунта.

## Пример на кастомной странице

```tsx
import { jsx } from '@app/html-jsx'
import { getYandexOauthUrl } from '@yandex-auth/sdk'
import { indexPageRoute } from './index'

// login.tsx; indexPageRoute — существующая страница приложения.
export const loginPage = app.html('/', async ctx => {
  const oauthUrl = await getYandexOauthUrl(ctx, {
    back: indexPageRoute.url()
  })

  return (
    <html lang="ru">
      <head>
        <meta charset="utf-8" />
        <title>Вход</title>
      </head>
      <body>
        <a href={oauthUrl}>Войти через Яндекс</a>
      </body>
    </html>
  )
})
```

## Ошибки

Метод выбрасывает исключение, если:

- Yandex OAuth не настроен;
- провайдер выключен в настройках Users;
- ссылку не удалось получить.

При необходимости обработайте ошибку через `try/catch` и скройте кнопку входа либо покажите пользователю сообщение.
