# SDK автоматизаций и ветки Source Git

Импортируй публичные методы из `@automations/sdk`. После публикации `main`
получи постоянный ID по пути конфига:

```ts
import { getAutomationByPath, getAutomationLogs } from '@automations/sdk'

const automation = await getAutomationByPath(
  ctx, 'process/automations/reminder.automationConfig.json', 'main',
)
if (!automation) throw new Error('Automation config is not available yet')
const { items, total } = await getAutomationLogs(ctx, {
  automationId: automation.automationId,
  branchName: 'main',
  limit: 50,
  includeSteps: true,
})
```

`getAutomationByPath` возвращает `null` либо
`{ automationId, branchName, filePath, sourceFileId }`. `automationId` —
постоянная идентичность; `sourceFileId` меняется при переносе файла.
Не составляй ID автоматизации из `source-file:<path>`.

`getAutomationLogs(ctx, query)` возвращает `{ items, total }`. Запрос может
содержать `automationId` (строку или массив), `executionId`, `workspacePath`,
`branchName`, `includeUnknownBranch`, статус, временной диапазон и прочие
фильтры из опубликованных typings. Без `branchName` сохраняется прежний
охват SDK. С `branchName` возвращается эта ветка; если нужны также старые
записи без сведений о ветке, укажи `includeUnknownBranch: true`.

У каждой записи есть канонический `automationId`, исходный
`storedAutomationId`, исторический `automationPath` и
`currentAutomationPath` (если текущий конфиг доступен). В новых записях
доступны `branchName`, `sourceFileId`, `startedCommitSha`,
`lastStepCommitSha`, `isTestRun`; у старых неизвестные значения равны `null`.
Шаги могут иметь собственный `commitSha`: цепочка после задержки могла
продолжиться уже на новом конфиге той же ветки. `enrich: true` добавляет
названия и сведения о шагах из конфига ветки выполнения.

Ветка позволяет посмотреть конфиг и выполнить ручной тест. Обычные события
обрабатывает опубликованный `main`. После публикации изменения URL плагин
сверяет всю группу подписок включённой автоматизации. Для старого конфига
без достоверной даты создания или изменения интерфейс показывает `—`.
