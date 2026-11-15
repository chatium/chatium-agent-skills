# CRM, сегменты и получатели

## Выбрать существующую аудиторию

```ts
const sdk = await import("@mailings/sdk");
const options = await sdk.listMailingSegments(ctx);
// ref:null + hasChildren -> вызвать listMailingSegments с parentRef: option.childRef.
// Выбрать опцию по намерению пользователя, затем сохранить её точный ref.
```

Не выбирай «Вся база» только потому, что нужный сегмент не найден. Уточни условие или создай нужную коллекцию CRM. Название не гарантирует состав: прочитай коллекцию и её фильтр/композицию, посчитай и просмотри небольшую выборку.

Публичные настройки Mailings принимают строгий `MailingSdkAudienceRef`:

```ts
{v:1, scope:'customers', type:'collection', collectionId:'...'}
{v:1, scope:'customers', type:'all'}                 // вся активная база
{v:1, scope:'customers', type:'all', table:'...'}    // связь с реальной таблицей
{v:1, scope:'customers', type:'contacts', contactIds:['...'], manualEmails:[]}
```

Лишние поля отвергаются: `{type:'all',filter:…}` не является сегментом. Динамический фильтр сначала сохраняется в коллекцию CRM, затем используется collectionId. Это позволяет человеку увидеть и проверить сегмент в `/app/crm`. Если picker вернул dynamic ref, сохрани его точные table/filter как коллекцию, проверь число и используй новый collection ref.

`countMailingAudience` считает клиентов. Сообщений может оказаться меньше (нет нужного контакта, блокировки) или больше (несколько каналов/контактов). `prepareMailing.coverage` показывает предварительное покрытие. При `approximate:true` аудитория больше 20 000 клиентов, онлайновая разбивка не выполнена: нулевой totalMessages не означает нулевой охват. Окончательный состав определяется при запуске с актуальными ограничениями Sender.

## Проверка коллекции через CRM SDK

```ts
const crm = await import("@crm/sdk/v2");
const collection = await crm.collectionFindById(ctx, collectionId);
if (!collection) throw new Error("Коллекция не найдена");
const ref = {
  v: 1,
  scope: "customers",
  type: "collection",
  collectionId,
} as const;
const total = await crm.countCustomersByCollectionRef(ctx, ref);
const ids = await crm.findCustomerIdsByCollectionRef(ctx, ref, {
  limit: 10,
  offset: 0,
});
const customers = await crm.customersFindByIds(ctx, ids);
return {
  total,
  sample: customers.map((c) => ({
    id: c.id,
    name: c.displayName || c.firstName,
  })),
};
```

Heap-объекты CRM возвращай наружу проекцией нужных полей, не целиком. Для большого сегмента используй серверный count и страницы; не загружай всю базу ради подсчёта.

## Создать сегмент

Ручная группа выбранных клиентов (customerIds — ID клиентов CRM, не контактов):

```ts
const result = await crm.createCollection(ctx, {
  title: "Участники запуска",
  idempotencyKey: "launch-november-audience-v1",
  description: "Клиенты, отобранные для ноябрьского запуска",
  customerIds: selectedCustomerIds,
});
if (!result.success) throw new Error(result.errorMessage);
const ref = {
  v: 1,
  scope: "customers",
  type: "collection",
  collectionId: result.collection.id,
} as const;
const total = await crm.countCustomersByCollectionRef(ctx, ref);
```

В обычной созданной коллекции без table/filter учитываются явные включения; пустой customerIds не обозначает всю базу. Повтор createCollection с тем же idempotencyKey возвращает существующую коллекцию и **добавляет переданные customerIds**, поэтому повторяй исходный список; не используй ключ другой аудитории. `addCollectionCustomers({collectionId,customerIds,method:'include'|'exclude'})` меняет состав по явному запросу пользователя.

Композиция «выбранные минус исключённые»:

```ts
const result = await crm.createCollection(ctx, {
  title: "Запуск без исключений",
  idempotencyKey: "launch-november-exclusions-v1",
  composition: {
    v: 1,
    include: [{ type: "collection", collectionId: baseCollectionId }],
    exclude: [{ type: "collection", collectionId: excludedCollectionId }],
  },
});
if (!result.success) throw new Error(result.errorMessage);
```

composition несовместима с собственными table/filter. Сегмент исключений выбирай по реальным данным аккаунта: названия «отписавшиеся» и «сотрудники» не универсальные системные ID. Отписки и блокировки Sender продолжают применяться при отправке.

Для бизнес-условий («купили тур», «оплатили заказ после даты») сначала изучи фактическую схему через `getAccountTablesInfo` / `getAccountTableByName` из `@app/heap` и существующие коллекции CRM. В связанных таблицах строки заказов не равны клиентам. Проверяй связь записи с customerId, границы дат и часовую зону; одну персону включай один раз. Фильтры CRM типизированы, это не произвольный SQL/JS: используй актуальные типы `CustomerCollectionFilter` или материализуй проверенные customerIds в отдельную коллекцию. При неизвестном поле останови построение фильтра, а не отбрасывай условие.

## Тестовый получатель

```ts
const staff = await sdk.listTestRecipients(ctx, { id: mailingId });
const found = await sdk.listTestRecipients(ctx, {
  id: mailingId,
  search: "anna_example",
});
```

Без поиска показываются сотрудники с совместимыми контактами. `scope:'all'` включает все контакты; поиск всегда ищет по CRM, в том числе Telegram-нику. Используй returned contact.id, не username в качестве адреса. Поле `email` в результате для мессенджера содержит его ID. Пустой список сотрудников не разрешает отправлять всем клиентам.

Один customer может иметь несколько email/мессенджеров. Адресный ref и тест передают только выбранные contactIds; остальные контакты клиента автоматически не добавляются. Ручные emails допустимы только с email-транспортом. Для неизвестного получателя сначала найди или по поручению создай корректный CRM-контакт; не угадывай messenger ID.
