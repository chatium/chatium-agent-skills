# Creator SDK (`@store/sdk`)

Этот справочник про управление кабинетом. Для проверки лицензии, чтения опций,
расходования ресурсов и заказов в коде плагина см. [Store SDK плагина](plugin-commerce-sdk.md).

API вызывается серверным кодом аккаунта/Workspace под реальным Developer/Owner.
Проверь exports в текущих `.d.ts`; при отсутствии свежих методов обнови `chatium get-typings`.
Если runtime ещё не получил эту версию Store, сообщи о недоступном SDK и используй кабинет,
не подменяй методы прямым доступом к таблицам. Примеры ниже исполняются из checkout
нужного аккаунта согласно [exec](../../chatium-development/exec.md).

## Начальное чтение и подключение

```sh
chatium exec --write <<'TS'
import { getCreatorContext, getCreatorCatalogOptions } from '@store/sdk'
return { context: await getCreatorContext(ctx), options: await getCreatorCatalogOptions(ctx) }
TS
```

```sh
chatium exec --write <<'TS'
import { beginCreatorConnection } from '@store/sdk'
return await beginCreatorConnection(ctx)
TS
```

Покажи владельцу `approvalUrl` и попроси вернуться в исходный чат после подключения.
Если профиля ещё нет, его можно создать и подключить по той же ссылке. После возвращения
перечитай контекст и проверь `connected:true`. Проверка рабочего места использует
служебные операции, поэтому даже начальное чтение выполняется с `--write`.
Ссылка временная, токен не сохраняют в исходниках/документации.
`getCreatorContext` без подключения доступен для диагностики. Справочники и discovery
исходных плагинов тоже доступны до подключения; остальные операции требуют его.

## Методы

Все методы принимают `ctx` первым аргументом; ниже показан второй аргумент.
Отказы — исключения с кодом/сообщением; submission возвращает проверяемый результат.

| Метод | Аргумент | Результат |
| --- | --- | --- |
| `getCreatorContext` | нет | accountId/accountHost/userId, connected, connectionId, profile или null, publicationAccess или null, links |
| `beginCreatorConnection` | нет | approvalUrl, expiresAt; создаёт одноразовую заявку |
| `disconnectCreatorAccount` | нет | success; отзывает разрешение текущего пользователя, сохраняет привязку аккаунта |
| `updateCreatorProfile` | `{expectedUpdatedAt, patch}` | обновлённый profile |
| `getCreatorCatalogOptions` | нет | categories, skillCategories, languages |
| `listCreatorSolutions` | `{kind,limit?,offset?}` | карточки своего кабинета; limit 1–100, default 50, offset 0–10000 |
| `getCreatorSolution` | `{kind,id}` | карточка + publicationIssues |
| `createCreatorTemplate` | `{slug,fields}` | новый черновик шаблона |
| `updateCreatorSolution` | `{kind,id,expectedUpdatedAt,patch}` | обновлённая карточка |
| `getCreatorPluginSources` | нет | directories и apps исходного аккаунта |
| `registerCreatorPlugin` | `{directory,slug}` | карточка собственного нативного плагина |
| `installCreatorPlugin` | `{id}` | slug, url, permissions, requiresUserNotification |
| `createCreatorTemplateUpload` | нет | uploadUrl, expiresInSeconds, fieldName |
| `setCreatorTemplateArchive` | `{id,hash,expectedUpdatedAt}` | карточка с новой revision |
| `getCreatorTemplateArchive` | `{id}` | archiveUrl, expiresAt, revision |
| `requestCreatorPublication` | `{kind,id,expectedUpdatedAt}` | `{success,issues}`; без публикации |
| `withdrawCreatorPublication` | `{kind,id,expectedUpdatedAt}` | карточка без заявки; published не меняется |
| `unpublishCreatorSolution` | `{kind,id,expectedUpdatedAt}` | карточка с isPublished=false; покупки не удаляются |

`kind` = `plugin` или `template`. `id` — ID карточки Store. Идентификатор креатора
не входит ни в один изменяющий SDK-метод. Подключения разных аккаунтов одного кабинета
могут работать с общими карточками, но native registration/install ограничены исходным аккаунтом.

## Доступ сотрудника через агента

Вызови `listCreatorAgentEmployees(ctx, {search})` в рабочем аккаунте через `chatium exec --write`. Метод ищет среди реальных разработчиков и владельцев этого аккаунта. В `items` есть `userId`, имя `name`, подтверждённая почта `email` или `null` и текущее состояние `hasAccess`. Без поиска возвращается первая страница. Для следующей передай `offset: nextOffset`, пока `nextOffset` не станет `null`.

По просьбе «дай Анне доступ» вызови `setCreatorAgentEmployeeAccess(ctx, {userId, enabled: true})` для однозначно найденной Анны. Если совпадений несколько, предложи выбрать по имени и почте. Уточни, какой именно доступ нужен, если из разговора неясно, что речь об агенте креатора. При отзыве передай `enabled: false`. Ответ содержит `userId`, `hasAccess` и `changed`. Значение `changed: false` означает, что нужное состояние уже было установлено. После тайм-аута перечитай состояние. Объясни владельцу, что сотрудник сможет работать со всеми решениями профиля, включая решения из других аккаунтов.

Если сотрудника нет в списке, проверь рабочий аккаунт и роль сотрудника. Системную роль меняют отдельно. При `STORE_CREATOR_CONNECTION_REQUIRED` используй обычное подключение владельца. При `STORE_CREATOR_OWNER_REQUIRED` покажи владельцу вкладку **Настройки → Аккаунты и агент** по `getCreatorContext(ctx).links.connections`. Там он может нажать **Добавить сотрудника** и одобрить запрос вручную. Отдельное рабочее место сотруднику для отправки решения на проверку не требуется.

## Поля

Profile содержит id/name/slug/email/description/site/supportUrl/termsUrl/policyUrl/telegram,
imageHash|null, acceptedAgreement (только чтение), updatedAt. Patch допускает только
публичные строковые поля и `imageHash`. `imageHash:null` очищает логотип; отсутствие поля
сохраняет прежнее значение. owner/команда/реквизиты/согласие в patch не входят.

Карточка (`CreatorSolution`) содержит kind/id/slug/title/shortDescription/description,
iconHash|null, imageHashes, categoryIds, languages, supportsSkills, hasFunctionality,
skills, updatedAt, isPublished, reviewRequestedAt|null, revision|null, hasArchive,
pluginId|null. Архивный hash в DTO не раскрывается, для доступа есть отдельный метод.

Patch/fields: title (до 200), shortDescription (до 1000), description (до 60000),
iconHash|null, imageHashes (до 50), categoryIds (до 50), languages (`ru`/`en`),
supportsSkills, hasFunctionality, skills (до 100). Поддержка скиллов по умолчанию выключена,
функциональность включена. Хотя бы одно должно оставаться включённым. При выключении
supportsSkills список навыков очищается; при hasFunctionality=false функциональные
категории очищаются. Не отправляй эти флаги без намерения изменить соответствующее свойство.

SDK обновления карточки не меняет slug, владельца, native PID, тарифы, платежные признаки,
системное меню или публикацию. Изображения — ранее загруженные доступные для витрины image hashes;
сами бинарные изображения не входят в patch. Для изображений используй обычный
[Storage](../../chatium-development/storage.md), а для ZIP — специальный сценарий шаблона.

## Пример изменения

```sh
chatium exec --write <<'TS'
import { getCreatorSolution, updateCreatorSolution } from '@store/sdk'
const ref = { kind: 'plugin' as const, id: 'ID_КАРТОЧКИ' }
const current = await getCreatorSolution(ctx, ref)
return await updateCreatorSolution(ctx, {
  ...ref,
  expectedUpdatedAt: current.updatedAt,
  patch: { shortDescription: 'CRM с автоматической сводкой сделки' }
})
TS
```

Для добавления скилла сначала прочитай текущий список и справочник категорий.
`skills` заменяет **весь** массив: сохрани записи, которые пользователь не просил удалять.

```ts
const current = await getCreatorSolution(ctx, {kind: 'template', id})
const updatedSkills = current.skills.filter(s => s.id !== 'deal-summary')
updatedSkills.push({
  id: 'deal-summary', title: 'Сводка сделки',
  description: 'Собирает договорённости и предлагает следующий шаг по доступной сделке.',
  categoryIds: [actualSkillCategoryId],
  usage: 'Попросите агента подготовить сводку выбранной сделки. Требуется доступ к CRM.'
})
return await updateCreatorSolution(ctx, {
  kind: 'template', id, expectedUpdatedAt: current.updatedAt,
  patch: {supportsSkills: true, skills: updatedSkills}
})
```

`actualSkillCategoryId` и `id` берутся из чтения, а не из примера. Для нового шаблона
минимум `{slug:'my-template',fields:{title:'Мой шаблон'}}` создаёт черновик без архива.
Далее заполни описания, языки/категории и загрузи ZIP; не отправляй пустой черновик на проверку.

## Конкурентность и повтор

На изменения передавай точное `updatedAt` последнего чтения. При `STORE_CREATOR_CONFLICT`
перечитай карточку/профиль, сравни чужие изменения и примени только нужный patch. Не повторяй
со старым timestamp, не заменяй полную карточку старым снимком. Если менялось то же поле,
согласуй итог с человеком.

После таймаута чтение состояния предшествует повтору. Новый template slug уникален:
при конфликте не создавай `-2` автоматически; найди свою созданную карточку по списку.
Регистрация повторяет ту же пару directory/slug. Для отправленной заявки достаточно
свежего чтения reviewRequestedAt. Не инициируй бесконечные retries.
