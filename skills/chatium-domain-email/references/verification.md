# Проверка подключения

Проверь состояние после **последнего** изменения. Сохрани время проверки, целевой
аккаунт/домен, режим, идентификатор транспорта, нужные статусы и результаты внешних
проверок. Ответ мутации, старый снимок или один зелёный флаг не заменяют эту проверку.

## Сайт

1. Повторно получи `getDomains(ctx)` и `getAccountDomainState(ctx, domain)` из того же
   аккаунта. Имя и режим должны совпасть с задачей. Для управляемого сертификата
   ожидай `domain.isReady === true`, `service.status === 'Ready'`,
   `service.controlType === domain.controlType`, `service.syncInProgress === false`.
   `External` проверяется по реальному DNS/HTTPS: отсутствие CDM в этом режиме ожидаемо.
2. Проверь публичный DNS выбранного имени. Для Chatium DNS сверяй делегирование
   с `setup.nameservers`; для прямого подключения — адреса с `setup.addresses`.
   Проверь A и AAAA, алиасы и запись нужного поддомена. За прокси публичный IP может
   принадлежать прокси: проверяй выбранную схему, а не требуй прямой IP Chatium.
   NXDOMAIN, SERVFAIL или разные ответы оставляют конкретный пробел в проверке.
3. Открой **обычный пользовательский URL**, без preview-параметров и подмены DNS/Host.
   Проверь TLS для точного имени, конечный адрес после редиректов и ожидаемую страницу
   выбранного аккаунта. Заранее возьми проверяемый признак страницы: заголовок/контент
   или известный элемент, а не просто HTTP 200. Парковка, чужой сайт и страница ошибки
   с кодом 200 не подтверждают подключение.
4. Если менялся основной адрес или homepage, проверь именно их поведение. Закрытую
   страницу проверяй через доступную авторизованную сессию; экран входа сам по себе
   подтверждает лишь маршрут, не работу нужной страницы. Сохрани непроверенные части.

Снаружи UGC можно использовать `dig` и обычный HTTP-клиент. Например, с подставленным
целевым URL: `curl --silent --show-error --location --max-time 30 --proto '=https'
--proto-redir '=https' --output page.html --write-out '%{http_code} %{url_effective}\n'
'https://example.com/'`. Затем проверь тело/страницу. В итоговой проверке не используй
`-k`, `--resolve` или вручную заданный `Host`: они обходят проверяемый пользовательский путь.

## Почта

Окончательные чтения выполняй через `@email/sdk`. Пример собирает проверяемые факты
для выбранного транспорта, не отправляет письмо и не меняет настройки:

```ts
import { getEmailTransport, getEmailDomainStatus } from '@email/sdk'

const domain = 'example.com'
const transportId = 'TRANSPORT_ID'
const transportResult = await getEmailTransport(ctx, { transportId })
if (!transportResult.success) return { phase: 'transport', result: transportResult }
const status = await getEmailDomainStatus(ctx, { domain })
if (!status.success) return { phase: 'domain-status', result: status }

const transport = transportResult.transport
const checks = status.checks
const checksVerified = Array.isArray(checks) && checks.length > 0 && checks.every(c => c.ok === true)
return {
  checkedAt: new Date().toISOString(),
  accountId: ctx.account.id,
  domain,
  transport: {
    id: transport.id, domain: transport.domain, from: transport.from,
    active: transport.active, isDefault: transport.isDefault, ces: transport.ces,
  },
  status,
  configurationVerified:
    transport.id === transportId && transport.domain === domain && status.domain === domain &&
    transport.active === true && transport.ces.enabled === true &&
    status.connected === true && status.ready === true && checksVerified,
}
```

Сопоставь сохранённый `from` с согласованным адресом. `success:true` без `ready` или
`connected` недостаточно. Пустой/отсутствующий `checks` не является доказательством
DNS-проверки: явно сообщи пробел и получи данные текущего профиля сервиса.
Ошибки сервиса оставляют результат неизвестным, а не «готовым, потому что DNS уже внесён».

Для запрошенного приёма проверь `checks` с `purpose: 'inbound'` и именем нужного
домена, затем повторно прочитай `listEmailMailboxes`. Нужны точный ящик и `active:true`.
`mxState:'Ok'` в `getEmailDomainStatus` производен от этой проверки; legacy MX-статус
из системного API не подтверждает готовность нового Email.

Если выбирался default, перечитай `listEmailTransports`: ровно выбранный транспорт
должен быть default. Если он не менялся, сравни с исходным снимком. Для DNS-патча
проверь сохранность остальных RRset; для переноса зоны — всех заранее согласованных
сервисов. Неполная проверка существующей почты остаётся отмеченной в результате.

## Веб-почта и доступ к ящику

Если пользователь настраивает ящик, дополнительно выполни этот блок после
[включения веб-почты](email.md#включи-веб-почту-аккаунта). Предыдущий
`configurationVerified` относится только к транспорту и DNS.

```ts
import { getEmailWorkspaceState, listEmailMailboxes } from '@email/sdk'

const domain = 'example.com'
const transportId = 'TRANSPORT_ID'
const mailbox = 'support@example.com'
const result = await getEmailWorkspaceState(ctx)
if (!result.success) return { phase: 'workspace', result }
const boxes = await listEmailMailboxes(ctx, { transportId })
if (!boxes.success) return { phase: 'mailboxes', result: boxes }
const workspace = result.workspace
const matches = (box: { address: string; domain: string; kind: string; active: boolean }) =>
  box.address === mailbox && box.domain === domain && box.kind === 'shared' && box.active === true
return {
  checkedAt: new Date().toISOString(), accountId: ctx.account.id, transportId, mailbox,
  workspace, mailboxes: boxes.mailboxes,
  webmailVerified:
    workspace.accountId === ctx.account.id && workspace.enabled === true &&
    workspace.domains.includes(domain) && workspace.mailboxes.some(matches) && boxes.mailboxes.some(matches),
}
```

`listEmailMailboxes` подтверждает существование ящика в CES, а список `workspace.mailboxes`
подтверждает доступность в веб-почте текущего администратора. `enabled:true` с пустым
списком или другим адресом недостаточно. Ошибка чтения оставляет доступ неизвестным.
При доступном браузере открой `/app/email` и проверь выбранный ящик; экран
«Включите почту» означает незавершённую настройку веб-почты даже при зелёных DNS.
При старой версии SDK используй проверку через интерфейс из сценария Email.

## Обмен тестовыми письмами

Техническую готовность можно проверить без отправки. Для доказательства доставки
нужен отдельно согласованный тест: конкретные отправитель, получатель и одно письмо
с уникальным маркером. Используй почтовый путь, который пользователь настраивал.
Отправка через другой сервис не проверяет выбранный транспорт.

Для существующего общего ящика доступен `sendEmailFromMailbox`:

```ts
import { sendEmailFromMailbox, getEmailMailboxSubmission } from '@email/sdk'
const ref = { transportId: 'TRANSPORT_ID', mailbox: 'support@example.com' }
// UUID генерируется и сохраняется до отправки. Здесь — пример формы вызова.
const result = await sendEmailFromMailbox(ctx, {
  ...ref,
  message: {
    to: [{ address: 'AGREED_TEST_RECIPIENT@example.net' }],
    subject: 'Проверка подключения — UNIQUE_MARKER',
    text: 'Одно согласованное тестовое письмо — UNIQUE_MARKER',
    idempotencyKey: 'SAVED_UUID_FOR_THIS_MESSAGE',
  },
})
if (!result.success) return result
return await getEmailMailboxSubmission(ctx, { ...ref, messageId: result.submission.id })
```

Подставь реальные согласованные адреса, маркер и UUID. Сохрани ID и проверь конечный
статус **каждого получателя** по актуальному контракту сервиса. Принятие отправки
(`success:true`, submission ID) не является доставкой. Очередь, повторы, неизвестный
исход или отсутствие статуса получателя оставляют доставку неподтверждённой.
Не обещай попадание во «Входящие» по одному техническому статусу; при проверке ящика
получателя сверяй именно маркер тестового письма.

При `submission_unknown` не отправляй «новый тест»: сохрани прежний UUID и содержимое,
проверь доступный статус; повторять можно только тот же запрос с тем же ключом.
Для нового письма нужен новый UUID. В текущем API отправки из ящика вложения не нужны
и не поддерживаются. Если настраивался только исходящий транспорт без ящика, используй
согласованный существующий путь отправки из приложения; не создавай ящик ради теста.

Для входящего теста попроси отправить одно письмо с другим уникальным маркером
с внешнего адреса на настраиваемый ящик. Подтверждение — новое письмо в нужном ящике
интерфейса Email или соответствующее входящее событие и
`getEmailMailboxIncomingMessage(ctx, { transportId, mailbox, incomingId })`.
`incomingId` берётся из реального события, не из ID исходящего submission.
Проверь адресата и маркер. Не считай наличие MX/ящика доказательством приёма.
Новый webhook, изменение существующей подписки или просмотр посторонних писем для
такой проверки не требуется. Если события/ящик недоступны — укажи, что приём не проверен.

## Условия завершения

| Запрошено | Что должно быть подтверждено |
| --- | --- |
| Сайт на домене | Привязка к нужному аккаунту, выбранная DNS-схема, готовый управляемый сертификат либо проверенный внешний TLS, ожидаемая HTTPS-страница |
| Исходящая почта | Нужный `from`, активный транспорт, свежие `connected:true` и `ready:true`, DNS-проверки; default — только если менялся |
| Общий ящик в Email | Готовое подключение, inbound MX, активный ящик в CES, включённая веб-почта аккаунта и доступность в ней нужного ящика |
| Тест отправки/приёма | Результат согласованного теста по конкретному письму в нужном направлении |

При ожидании DNS/сертификата назови фактический статус и оставшиеся записи. При ошибке
API сообщи её отдельно. Отчёт «настройки готовы; обмен письмами не проверялся» точнее
обещания «почта полностью работает» без теста доставки/приёма.
