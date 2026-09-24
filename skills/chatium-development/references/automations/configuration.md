---
title: Работа с автоматизациями, автоботами, автодействиями, автоинструментами, воронками, автосериями
description: >
  Изучи этот документ, если пользователь упоминает слова "автоматизация", "автобот", "автодействие", "автоинструмент", "воронка", "автосерия" или похожие, и хочет создать, отредактировать или понять автоматизацию (набор действий, которые выполняются при наступлении определенных событий).
---

# Работа с автоматизациями, автоботами, автодействиями, автоинструментами, воронками, автосериями

Для конфигурации автоматизации используй доступный в проекте automation maker или automation-specific tool: формат зависит от зарегистрированных в аккаунте событий, действий и условий. Для их реализации загрузи [События](events.md), [Условия](conditions.md) или [Действия](actions.md).

> **⚠️ ВАЖНО: Файлы конфигурации автоматизаций ОБЯЗАНЫ иметь расширение `.automationConfig.json`** (например `welcome-series.automationConfig.json`). Система распознаёт автоматизации именно по этому расширению. Файл с расширением `.json` или любым другим — работать НЕ будет.

> Создавай и редактируй `.automationConfig.json` через automation-specific tool, который знает актуальный формат и реестр аккаунта. Если такого инструмента нет, не угадывай схему: ограничь изменение кодом событий, действий, условий или management UI и сообщи о недостающем инструменте.

**Management UI is optional.** Add this page only when the task includes a UI for viewing and managing automations. First reuse an existing `AutomationsView` page; otherwise create `index.tsx` with this content. Configuring an automation alone does not require creating a page:

```tsx
import { requireAccountRole } from '@app/auth'
import { jsx } from '@app/html-jsx'
import { AutomationsView } from '@automations/sdk/components'
import { UiHtmlLayout } from '@html/layout'

app.html('/', async ctx => {
  requireAccountRole(ctx, 'Admin')
  return (
    <UiHtmlLayout
      head={
        <>
          <style>
            {`body {
              --auto-text: #111827;
              --auto-muted: #6b7280;
              --auto-bg: #f8fafc;
              --auto-surface: #ffffff;
              --auto-border: rgba(15, 23, 42, 0.1);
              --auto-primary: #2563eb;
              --auto-primary-hover: #1d4ed8;
              --auto-error: #dc2626;

              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
              color: var(--auto-text);
              min-height: 100vh;
              background-color: white;
            }`}
          </style>
        </>
      }
    >
      <link href="/s/static/lib/fontawesome/6.7.2/css/all.min.css" rel="stylesheet" />
      <AutomationsView ctx={ctx} entryModule={ctx.entryModule} />
    </UiHtmlLayout>
  )
})
```

This provides a UI to view and manage automations. Only create this file once — if it already exists, skip this step.
