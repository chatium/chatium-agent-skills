# Доступ и публичный SDK

## Аккаунт и исполнение

Работай в Source Git checkout **принимающего аккаунта** (например, chatium.ru или yowad.ru), а не издателя mailings.chatium.ru. Проверь `git remote get-url origin`. Если checkout отсутствует, `chatium clone <домен> <директория>` создаёт его. SDK импортируется как `@mailings/sdk`, CRM — `@crm/sdk/v2`, хранилище — `@vault/sdk`. Внутренние `/plugin/...` пути принадлежат приложениям, использовать их из аккаунта не нужно.

`chatium exec` передаёт сниппет серверу аккаунта из remote, исполняет опубликованную ветку и печатает `Executed commit`. Незакоммиченные локальные изменения не исполняются. На текущей версии CLI для записей нужен `--write`; сам флаг не даёт разрешения на отправку. При несовпадении API обнови типы через `chatium get-typings`, проверь установленные версии; не подменяй отсутствующий метод прямой записью в Heap.

Этот общий скилл доступен независимо от установки Mailings. Отсутствие локальных типов само по себе не доказывает отсутствие приложения: обнови типы и проверь серверный импорт `@mailings/sdk`. Если приложение не подключено, предложи подключить «Рассылки» в выбранном аккаунте. Если импорт работает, но нужного метода нет, сообщи о необходимости обновить приложение. Пустой список каналов означает, что сначала нужно подключить подходящий транспорт; настройки домена и почты выполняй по скиллу `chatium-domain-email`.

Чтение (целиком готовый сниппет):

```sh
chatium exec <<'JS'
const sdk = await import('@mailings/sdk');
return {
  channels: await sdk.listMailingChannels(ctx),
  segments: await sdk.listMailingSegments(ctx),
  drafts: await sdk.listMailings(ctx, {status: 'draft', pageSize: 20}),
};
JS
```

Для записи используй такую же quoted heredoc с `chatium exec --write`. Большие HTML/JSON удобнее передавать через файл сниппета: `chatium exec --write < /tmp/mailing-operation.ts`. Это исполняемый код: вставляй данные как корректные строковые/JSON-литералы, не через shell interpolation. Не печатай всю CRM или содержимое вложений; возвращай нужные поля и компактные итоги.

## Методы

Все функции принимают `ctx` первым аргументом. В таблице он опущен. Методы бросают ошибки, если не указано иное. DTO содержат сериализуемые значения, даты — ISO.

| Метод                                                                                                 | Параметры после ctx / результат                                                                 |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `listMailingChannels()`                                                                               | Активные поддерживаемые каналы `{id,title,type,source,messageKind,deliveryProvider?}[]`         |
| `listMailingSegments({parentRef?})`                                                                   | `{id,title,subtitle,ref,hasChildren,childRef?}[]`; группы раскрывай по childRef                 |
| `countMailingAudience(ref)`                                                                           | Число клиентов, не сообщений; см. аудитории                                                     |
| `listMailings({search?,status?,offset?,pageSize?})`                                                   | `{mailings,total,totalAll,orphanTests}`; offset по 20, pageSize 1–100                           |
| `createMailingDraft({key,title,channelIds,audienceRef?})`                                             | Пустой черновик или группа с `groupMembers`; не отправляет                                      |
| `getMailing(id)`                                                                                      | Одна рассылка, включая snapshot, аудиторию, каналы, состояние и ошибки; для группы другой метод |
| `getMailingGroup(id)`                                                                                 | Группа и `groupMembers`                                                                         |
| `updateMailingSettings({mailingId,title?,audienceRef?,channelIds?,variableBindings?,batchSettings?})` | Обновлённая рассылка; ограничения редактирования общие с интерфейсом                            |
| `getMailingContent(id)`                                                                               | `{id,content,fields,variables,editorMode,blocks,htmlLayout?,revision,editable,...}`             |
| `updateMailingContent({mailingId,expectedRevision,content,editorMode?,blocks?,htmlLayout?})`          | Новый документ с revision; конфликт не перезаписывать вслепую                                   |
| `prepareMailing({mailingId,audienceRef?})`                                                            | Проверяет черновик, сохраняет coverage; не отправляет и не планирует                            |
| `listTestRecipients({id,search?,scope?,contactOffset?})`                                              | `{contacts:[{id,name,email}],next}`; email — историческое имя поля, там может быть messenger ID |
| `sendMailingTest({id,key,contactIds,emails,expectedRevision?})`                                       | Реальная отправка теста через job; `{test,mailing}`                                             |
| `getMailingTest({id,sourceMailingId})`                                                                | `{test}` с результатами и диагностикой транспорта                                               |
| `getCurrentMailingTest(mailingId)`                                                                    | `{test}` для текущих контента/каналов/подстановок; test может быть null                         |
| `listMailingTests({id,offset?})`                                                                      | `{tests,total}`, по 20; история доступна и после завершения                                     |
| `startMailing({mailingId,runAt?})`                                                                    | Запускает/планирует основную рассылку; ISO с зоной, только будущее время                        |
| `getMailingStats(id)`                                                                                 | `{stats,trackingDebug}`, включая total/channels/reasons и состояние источников                  |
| `listMailingDeliveries({mailingId,search?,status?,channelId?,offset?,pageSize?})`                     | `{deliveries,total}`, до 100 записей                                                            |
| `getMailingDeliveryErrors({mailingId,deliveryId})`                                                    | Диагностика конкретного сообщения из списка; проверяет принадлежность рассылке                  |
| `getMailingGroupStats(id)`                                                                            | Сумма основных отправок и досылок без тестов; flags known/unavailableRuns                       |
| `stopMailing({mailingId})`                                                                            | Отменяет одну отправку; для batch проверь завершение отмены по batchState.phase; доставленные сообщения не отзывает |
| `archiveMailing({mailingId,archived})`                                                                | Архив/восстановление; активная отправка запрещает архивирование                                 |
| `deleteMailing({mailingId})`                                                                          | Только черновик; история отправленных сохраняется                                               |

`listMailings.status`: all, active, archived, draft, scheduled, preparing, sending, completed, error, cancelled. Проходи страницы до total, если нужен полный список. Для delivery-фильтра допустимы all, accepted, error, cancelled, clicked, unsubscribed, delivered, read, sent, pending, sending.

## Создание и редактирование

ID в примерах — значения, уже полученные от SDK, не названия канала/коллекции. Параметр key (до 100 символов для нового API) описывает намерение создать одну рассылку, например `launch-november-2026-v1`. Сохрани его вместе с ID. При повторе того же запроса возвращается текущая запись, включая ручные правки. Тот же key с другими исходными параметрами даёт `mailing_key_conflict`. Для осознанно новой кампании нужен новый key.

```ts
const draft = await sdk.createMailingDraft(ctx, {
  key: "launch-november-2026-v1",
  title: "Ноябрьские новости",
  channelIds: selectedChannelIds,
  audienceRef: { v: 1, scope: "customers", type: "collection", collectionId },
});
// Один тип -> draft.id; несколько типов -> draft.groupMembers[].id.
```

Число дочерних = число типов, а не число ботов. Два Telegram-бота остаются каналами одной рассылки; Email + Telegram создают две дочерних. Нельзя предполагать доставку «только в один из ботов»: один человек может получить сообщение по нескольким выбранным каналам. Рут ничего не рассылает. Изменение аудитории дочерней не синхронизируется с соседями.

```ts
const doc = await sdk.getMailingContent(ctx, mailingId);
if (!doc.editable) throw new Error("Контент этой отправки уже зафиксирован");
const saved = await sdk.updateMailingContent(ctx, {
  mailingId,
  expectedRevision: doc.revision,
  content: {
    ...doc.content,
    subject: "Новая тема",
    preheader: "Короткое продолжение",
  },
  editorMode: doc.editorMode,
  blocks: doc.blocks,
  htmlLayout: doc.htmlLayout,
});
```

Для изменения контента после запуска подготовь новую рассылку; не пытайся менять отправленный snapshot. Переносит ли новая рассылка прежних получателей и должна ли исключать уже отправленных — отдельное решение пользователя.

Аудитория `prepareMailing.audienceRef` в прежнем API принимает **только collection**. Для all/contacts сначала `updateMailingSettings`, затем `prepareMailing({mailingId})` без ref. Пустой контент допустим при создании, но блокирует prepare/start.

## Существующие API

Обратная совместимость сохранена:

- `createMailing({key,title,channelIds,content,editorMode?,blocks?,htmlLayout?,audienceRef?,variableBindings?,batchSettings?})` — сразу заполненная **одна** рассылка, без автоматической группы. `audienceRef` только collection. Для нового пошагового сценария предпочтителен `createMailingDraft`.
- `addMailingRecipient({mailingId,contact:{contactId}})` или `{contact:{type,value}}` — добавляет точный контакт в адресный черновик; неоднозначные совпадения отклоняются. Коллекции изменяются через CRM, этот метод к ним неприменим.
- `listLetters`, `getLetter({id})`, `getLetterSettings({folder})`, `createLetter`, `updateLetter` работают с библиотекой писем; собственный контент рассылки меняй через MailingContent API.
- `readMessageFile` и `sendMessageFromTemplate` нужны для существующих файловых шаблонов. Для `processes/<slug>/…` действуют config.mailings.testOnly/testContacts и config.senderChannels; используй процессный сценарий, не импортируй его в обход ограничений.

## Ссылки

Используй домен выбранного аккаунта и `encodeURIComponent(id)`:

- список: `/app/mailings`;
- письмо/сообщение без PluginLayout: `/app/mailings/preview?mailingId=ID`;
- группа: `/app/mailings#/group/ID`;
- отчёт: `/app/mailings#/report/ID`.

Превью показывает сохранённый контент. Оно доступно в авторизованном аккаунте, не обещай публичную ссылку без входа. Предпросмотр не подставляет данные каждого реального адресата и не доказывает доставку.
