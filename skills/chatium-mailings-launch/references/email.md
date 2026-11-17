# HTML-письмо и редактируемые блоки

## Выбрать режим

- `editorMode:'blocks'`: редактируемое письмо, сервер собирает HTML и plain из blocks. Для своего оформления используй htmlLayout вокруг блоков.
- `editorMode:'text'`: полный HTML в content.html и отдельно plain. Визуальный редактор блоков для такого письма недоступен, исходник можно менять SDK.

Сохраняй режим существующего документа, если задача не требует смены. Не превращай редактируемые блоки в монолитный HTML ради одной стилистической правки.

Email-поля: `subject`, `preheader`, `html`, `plain`, `variables`. `title` — название материала, не тема в почтовом ящике. Тема конкретна и соответствует содержанию; прехедер продолжает её, а не повторяет. В blocks-режиме сервер перезаписывает html/plain рендером блоков, ручные правки этих полей будут потеряны.

## Блоки

До 200 блоков, id уникален. heading/text — обычный text с необязательными runs. HTML в text экранируется, для произвольного HTML нужен блок html.

```ts
const doc = await sdk.getMailingContent(ctx, mailingId);
const saved = await sdk.updateMailingContent(ctx, {
  mailingId,
  expectedRevision: doc.revision,
  editorMode: "blocks",
  content: {
    ...doc.content,
    subject: "Новости клуба",
    preheader: "Новые маршруты и ближайшие поездки",
  },
  blocks: [
    { id: "intro", type: "heading", text: "Новые маршруты" },
    {
      id: "greeting",
      type: "text",
      text: "Здравствуйте! Выберите путешествие по душе.",
    },
    {
      id: "benefits",
      type: "list",
      ordered: false,
      items: [
        { text: "Даты и программа доступны на сайте" },
        { text: "Поможем выбрать подходящий маршрут" },
      ],
    },
    {
      id: "cta",
      type: "button",
      text: "Посмотреть маршруты",
      url: verifiedLandingUrl,
      color: "#2457d6",
      textColor: "#ffffff",
      radius: 8,
      align: "left",
    },
  ],
  htmlLayout: emailShell,
});
```

`emailShell` — содержимое [assets/email-shell.html](../assets/email-shell.html), прочитанное локально и переданное строкой. В нём ровно один `<!-- mailings:blocks -->`, при полном документе — внутри body. Замени примерные оформление/язык по бренду; в шаблоне нет адресатов или авторизации отправки. Пустая строка htmlLayout убирает свою оболочку.

| Тип           | Дополнительные поля                                                                                |
| ------------- | -------------------------------------------------------------------------------------------------- |
| heading, text | text, runs?:[{text,bold?,italic?,color?,backgroundColor?,link?}]                                   |
| list          | items:[{text,runs?}], ordered?:boolean                                                             |
| button        | text,url, appearance:solid/outline/soft, size:small/medium/large, color,textColor,radius,fullWidth |
| image         | url,alt,link?,width?,radius?,sourceUrl?,crop?                                                      |
| divider       | без обязательных дополнительных полей                                                              |
| html          | html — фрагмент, не целый html/body документ                                                       |

У блоков align:left/center/right. У runs сумма строк text обязана совпадать с text блока/пункта. Цвета #RRGGBB. У картинки width 80–1200; для письма обычно достаточно не шире контейнера. Сохраняй sourceUrl/crop существующего блока: crop — метаданные, сама обрезка уже должна отражаться в url. В новом изображении не добавляй crop без просьбы.

## Полный HTML

```ts
await sdk.updateMailingContent(ctx, {
  mailingId,
  expectedRevision: doc.revision,
  editorMode: "text",
  blocks: [],
  htmlLayout: "",
  content: {
    ...doc.content,
    subject,
    preheader,
    html: completeEmailHtml,
    plain: plainText,
  },
});
```

Композиция: одна понятная мысль → короткое вступление → доказательства/детали → заметный CTA → подпись. Для контента из материалов пользователя сохраняй факты, не добавляй вымышленные скидки или сроки. Переносы, список и ссылка должны читаться и в plain.

## Вёрстка для почтовых клиентов

- Основной контейнер 600–640 px, на узком экране width:100%. Mailings ограничивает итоговую оболочку 640 px, но вложенная таблица фиксированной ширины может всё равно распереть письмо. Собственные вложенные элементы делай адаптивными.
- Таблицы `role="presentation"`, cellpadding/cellspacing/border=0 для структуры; критические шрифты, цвет, отступы и ширину задавай inline. Не строй основную вёрстку на grid/flex, JS или формах.
- Arial/Helvetica/sans-serif, читаемый базовый размер около 16px, line-height 1.4–1.6. Заголовки и абзацы с явными margin/padding, одинаковый вертикальный ритм; не создавай отступы пустыми блоками.
- Картинки: абсолютный HTTPS URL, alt, display:block,max-width:100%,height:auto. Без фиксированного height и принудительного 800×800; сохраняй пропорции и исходное изображение. Размер файла разумный для почты; важная информация должна оставаться текстом.
- CTA — настоящая ссылка `<a href>`, с достаточными отступами и контрастом. Проверь целевой URL, параметры кампании и отсутствие локальных/тестовых адресов. Не подставляй неподтверждённые адреса.
- Head/CSS допустимы в полном HTML и htmlLayout, но inline-стили должны обеспечивать читаемое базовое письмо. Проверяй тёмный режим и отсутствие горизонтального скролла. Учитывай, что почтовый клиент может удалить часть CSS.
- Прехедер хранится отдельно; проверь реальный тест в почтовом клиенте, если его вид критичен. Не полагайся только на браузерный screenshot.
- Ссылка отписки и служебный футер должны соответствовать настройке фактического Sender-транспорта. Проверь существующее письмо/тест; не выдумывай `{{unsubscribe}}` или URL. Не дублируй автоматически добавляемый футер.

## Подстановки

В content.variables объяви `{name,description?,example?}`, в тексте используй `{{name}}`. Имена лучше lowercase, например `first_name`. Затем:

```ts
await sdk.updateMailingSettings(ctx, {
  mailingId,
  variableBindings: {
    first_name: { source: "customer", field: "firstName", fallback: "друг" },
    offer: { source: "const", value: "Новые маршруты" },
  },
});
```

Доступные customer-поля: firstName,lastName,displayName,externalId,note,contact,customFields.<key>. Существующие bindings объединяй с новыми, не стирай другие переменные. Все объявленные переменные должны получить binding до запуска. Значения экранируются по формату; HTML-оформление помещай в шаблон, не в пользовательское значение. source:'ai' с prompt генерирует контент по адресату, увеличивает время/стоимость; добавляй его только по смыслу запроса.

Перед тестом перечитай fields.html/plain после серверной сборки: нет ли слепленных списков, дублированной подписи, потерянных переменных. Проверь desktop и узкий preview, затем разрешённый тест в настоящем почтовом клиенте.
