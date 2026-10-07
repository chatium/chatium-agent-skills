---
title: Как получить информацию о пользователе по его username в Telegram.
---

# Поиск пользователя по username в Telegram

Используй следующий код, чтобы найти пользователя по его username в Telegram. `requestedUsername` — строка с username, указанным в задаче:
```typescript
import { findPersons } from "@sender/sdk";

const [person] = await findPersons(ctx, {
  where: {
    username: requestedUsername,
  },
});

const userId = person?.user;
```
