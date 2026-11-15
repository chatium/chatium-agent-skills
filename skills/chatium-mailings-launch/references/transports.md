# Транспорты, форматирование и вложения

Ограничения ниже относятся к **Mailings SDK**, даже если собственный API платформы умеет больше. Проверено по реализации Mailings/Sender и официальным справочникам 15.11.2026; для новой функции проверяй актуальную поддержку в установленном приложении.

| Тип канала | CRM contact.type | Контент Mailings                                    |
| ---------- | ---------------- | --------------------------------------------------- |
| email      | email            | subject/preheader/html/plain, блоки или полный HTML |
| telegram   | telegram_id      | content.plain + messenger.format, вложения          |
| max        | max_id           | content.plain + messenger.format, вложения          |
| vk         | vk_id            | content.plain, обычный текст                        |
| sms        | phone            | content.short, обычный текст                        |
| viber      | viber_id         | content.plain                                       |
| facebook   | facebook_psid    | content.plain                                       |
| instagram  | instagram_uid    | content.plain                                       |
| wazzup24   | wazzup24_id      | content.plain                                       |
| avito      | avito_id         | content.plain                                       |
| bitrix24   | bitrix24_id      | content.plain                                       |

Выбирай только каналы, вернувшиеся в listMailingChannels. Неизвестный тип с messageKind:messenger получает обычный текст; тип без совместимых CRM-контактов может вообще не предоставляться Mailings. Доступность самого канала не гарантирует возможность написать конкретному человеку: проверь его CRM-контакт, связь/диалог и результат Sender.

## Telegram

Mailings `messenger.format:'markdown'` передаётся Sender как **MarkdownV2**. Это не обычный Markdown. Проще выбрать HTML с поддерживаемыми тегами `<b>`, `<i>`, `<u>`, `<s>`, `<code>`, `<pre>`, `<a href="…">`; переносы делай символом newline, без HTML-документа, CSS, `<p>` и `<br>`. В текстовых значениях экранируй `&`, `<`, `>`.

В MarkdownV2 знаки ``_ * [ ] ( ) ~ ` > # + - = | { } . !`` вне разметки требуют обратной косой черты; внутри code/pre и URL свои правила. Например исходник `Привет\. Что мы _тут_ умеем?` отображается с обычной точкой и курсивом. В JS-строке косая черта удваивается: `'Привет\\. Что мы _тут_ умеем?'`. Не экранируй готовое сообщение целиком после вставки намеренной разметки.

Лимиты Bot API: текст sendMessage до 4096 символов после разбора сущностей, подпись к фото обычно до 1024. Sender может разделить длинную подпись и медиа, поэтому если важна одна карточка, делай подпись короче 1024 и проверь тест. Изображение отправляется вложением, не `<img>` внутри текста. [Telegram Bot API: formatting и методы отправки](https://core.telegram.org/bots/api#formatting-options).

```ts
const doc = await sdk.getMailingContent(ctx, mailingId);
await sdk.updateMailingContent(ctx, {
  mailingId,
  expectedRevision: doc.revision,
  editorMode: "text",
  blocks: [],
  htmlLayout: "",
  content: {
    ...doc.content,
    plain:
      '<b>Новости клуба</b>\nНовые маршруты уже на сайте.\n<a href="https://example.com/trips">Посмотреть маршруты</a>',
    messenger: { format: "html", attachments: [] },
  },
});
```

`example.com` замени проверенной ссылкой пользователя до сохранения. При правке существующего сообщения сохраняй doc.content.messenger.attachments, если удаления не просили. Тема/прехедер email не используются для мессенджера.

## MAX

Тот же контракт `content.plain` + `messenger:{format,attachments}`, но **свой синтаксис Markdown**: жирный `**текст**`, курсив `*текст*` или `_текст_`, ссылка `[текст](https://…)`, подчёркивание `++текст++`. Telegram MarkdownV2 нельзя копировать без адаптации. HTML поддерживает базовые теги, ссылки, code/pre и цитаты. Для переносов используй newline, не HTML email. [Форматы текста MAX](https://dev.max.ru/docs-api/use-cases/sending-messages/text-formatting).

Для короткого переносимого объявления достаточно HTML `<b>Заголовок</b>\nТекст`. Более сложное форматирование проверь в MAX отдельно: визуальный preview Mailings приблизителен. Новый текст ограничен 4000 символами по контракту MAX; учитывай также ограничения медиа и проверяй ответ транспорта. [MAX NewMessageBody](https://dev.max.ru/docs-api/objects/NewMessageBody).

## ВК и другие мессенджеры

Для ВК в текущем Mailings сохраняй editorMode:text, content.plain с переносами и полными ссылками, без messenger.format:html/markdown и вложений. VK API может поддерживать иной синтаксис/медиа, но универсальный маршрут Mailings этого сейчас не экспортирует. Если пользователь просит фото/кнопки именно в ВК, объясни ограничение и подготовь текст; расширение интеграции — отдельная задача. Аналогично для Viber, Wazzup24, Facebook, Instagram, Авито и Битрикс24. Не выдавай поддержку Telegram/MAX за поддержку всех каналов.

Для СМС используй content.short: одна цель, короткая ссылка, без темы, HTML или вложений. Кириллица/эмодзи и длинный текст могут увеличить число платных частей; для точной оценки проверяй выбранного провайдера, не обещай универсальную цену/лимит.

## Вложения Telegram/MAX

До 10 файлов, каждый не более 50 MiB на уровне Mailings; ограничения самого транспорта могут быть ниже. Контракт:

```ts
{
  hash: 'реальный_storage_hash',
  name: 'photo.jpg',
  type: 'image/jpeg',             // MIME, не "image"
  size: actualByteSize,           // целое число байт из метаданных
  kind: 'image',                 // image | video | audio | file
}
```

Используй оригинальный storage hash и метаданные. Hash — не URL, не ID строки Vault, не локальный путь. MIME должен соответствовать kind; `file` отправляет документ. Превью и отправка читают один и тот же массив attachments.

Найти файл в аккаунте:

```ts
const vault = await import("@vault/sdk");
const page = await vault.searchVaultFiles(ctx, {
  query: "обложка",
  kind: "image",
  limit: 20,
});
return page.items.map((f) => ({
  id: f.id,
  name: f.name,
  hash: f.hash,
  publicCopyHash: f.publicCopyHash,
  mediaType: f.mediaType,
  size: f.size,
}));
```

После выбора проверь метаданные через `getVaultFile(ctx,id)`. У Vault поле mediaType, в Mailings оно называется **type**. Если size неизвестен, определи размер через хранилище/загрузку, не подставляй 0. Для фото сохрани исходные пропорции; производные изображения делай с одной заданной шириной, высоту оставляй пустой. Не используй квадратную миниатюру пикера как исходное вложение.

Защищённый файл требует публичной копии для внешнего транспорта. Если пользователь ещё не разрешал публикацию конкретного файла, используй виджет хранилища с requirePublic:true, который показывает согласие на копию, или запроси это разрешение. Не публикуй приватные файлы автоматически. Для уже доступного публичного файла используй подтверждённый hash/publicCopyHash. Mailings не создаёт публичную копию сам.

В интерфейсной интеграции вызывай `selectStorageFiles(ctx,{kind:'any',multiple:true,requirePublic:true})` из `@vault/sdk`. Это браузерный виджет, не серверная функция exec. Вне браузера новый локальный файл можно загрузить через `chatium storage upload <путь>` в правильном аккаунте; используй возвращённые hash/размер/MIME и учитывай видимость загрузки.

Подстановки messenger с format:html/markdown экранируются сервером. Сохраняй разметку вокруг placeholders, а не внутри значения переменной. При ошибке парсинга исправь контент и создай осознанный новый тестовый ключ; не отправляй его автоматически всем получателям.
