---
title: Bitrix24 SDK - Инструкция по использованию
description: Изучи этот документ, если пользователь просит написать функционал, который взаимодействует с Bitrix24 CRM (битрикс). Здесь описаны функции для работы с контактами и сделками, а также их параметры и логика работы.
requireApp: bitrix24
---

# Bitrix24 SDK Documentation

SDK для работы с Bitrix24 CRM из других плагинов Chatium.

## Установка и импорт

```typescript
import {
  searchBitrix24Contact,
  createBitrix24Contact,
  updateBitrix24Contact,
  createBitrix24Lead,
  createBitrix24LeadExistingContact
} from '@bitrix/sdk'
```

## Общие правила

- Все функции принимают `ctx` первым аргументом и `params` вторым
- Все функции возвращают `{ ok: boolean, result: any | string }`
- При `ok: false` в `result` содержится текст ошибки
- При `ok: true` в `result` содержится результат операции
- Настройки Bitrix24 (webhook) загружаются автоматически из таблицы `bitrix24_settings`
- Настройки воронки загружаются из таблицы `bitrix24_pipelines_settings` (для функций создания сделок)

---

## Контакты

### searchBitrix24Contact

Поиск контакта по телефону и/или email.

```typescript
import { searchBitrix24Contact } from '@bitrix/sdk'

const result = await searchBitrix24Contact(ctx, {
  phone: '+12025550100',  // опционально
  email: 'test@example.com'  // опционально
})
// Хотя бы одно из полей (phone или email) обязательно

if (result.ok) {
  // result.result — массив найденных контактов
  // Каждый контакт: { ID, NAME, LAST_NAME, PHONE, EMAIL, ASSIGNED_BY_ID, DATE_CREATE, DATE_MODIFY }
}
```

**Параметры:**

| Параметр | Тип | Обязательный | Описание |
|----------|-----|:------------:|----------|
| phone | string | * | Телефон в формате +12025550100 |
| email | string | * | Email клиента |

\* Хотя бы одно из полей обязательно.

---

### createBitrix24Contact

Создание нового контакта с опциональной проверкой дубликатов.

```typescript
import { createBitrix24Contact } from '@bitrix/sdk'

const result = await createBitrix24Contact(ctx, {
  phone: '+12025550100',
  email: 'test@example.com',
  firstName: 'Иван',
  lastName: 'Петров',
  secondName: 'Сергеевич',
  birthDate: '1990-05-15',
  checkDuplicates: true
})

if (result.ok) {
  // result.result — полная информация о контакте (созданном или найденном)
  // { ID, NAME, LAST_NAME, PHONE, EMAIL, ... }
}
```

**Параметры:**

| Параметр | Тип | Обязательный | Описание |
|----------|-----|:------------:|----------|
| phone | string | * | Телефон в формате +12025550100 |
| email | string | * | Email клиента |
| firstName | string | нет | Имя |
| lastName | string | нет | Фамилия |
| secondName | string | нет | Отчество |
| birthDate | string | нет | Дата рождения (YYYY-MM-DD) |
| checkDuplicates | boolean | нет | Проверить дубликаты перед созданием (по умолчанию false) |

\* Хотя бы одно из полей (phone или email) обязательно.

**Логика работы:**
1. Если `checkDuplicates = true` — сначала ищет существующий контакт
2. Если найден — возвращает его данные (не создаёт дубликат)
3. Если не найден или `checkDuplicates = false` — создаёт новый контакт
4. Возвращает полную информацию о контакте

---

### updateBitrix24Contact

Обновление существующего контакта по ID.

```typescript
import { updateBitrix24Contact } from '@bitrix/sdk'

const result = await updateBitrix24Contact(ctx, {
  contactId: '123',
  phone: '+12025550101',
  firstName: 'Новое Имя'
})

if (result.ok) {
  // result.result — обновлённая информация о контакте
}
```

**Параметры:**

| Параметр | Тип | Обязательный | Описание |
|----------|-----|:------------:|----------|
| contactId | string | да | ID контакта в Bitrix24 |
| phone | string | нет | Новый телефон |
| email | string | нет | Новый email |
| firstName | string | нет | Новое имя |
| lastName | string | нет | Новая фамилия |
| secondName | string | нет | Новое отчество |
| birthDate | string | нет | Новая дата рождения (YYYY-MM-DD) |

Хотя бы одно поле для обновления (кроме contactId) обязательно.

**Логика работы:**
1. Проверяет существование контакта по ID
2. Обновляет указанные поля
3. Возвращает полную обновлённую информацию

---

## Сделки (Leads/Deals)

### createBitrix24Lead

Создание сделки с автоматическим поиском/созданием контакта.

```typescript
import { createBitrix24Lead } from '@bitrix/sdk'

const result = await createBitrix24Lead(ctx, {
  leadName: 'Заявка с сайта',
  price: 50000,
  contactName: 'Иван Петров',
  phone: '+12025550100',
  email: 'ivan@example.com',
  comment: 'Клиент интересуется продуктом X'
})

if (result.ok) {
  // result.result — { dealId, contactId, isNewContact, leadName, price }
}
```

**Параметры:**

| Параметр | Тип | Обязательный | Описание |
|----------|-----|:------------:|----------|
| leadName | string | да | Название сделки |
| price | number | нет | Бюджет в рублях (по умолчанию 0) |
| contactName | string | нет | Имя контакта (по умолчанию 'Контакт') |
| phone | string | * | Телефон в формате +12025550100 |
| email | string | * | Email |
| comment | string | нет | Комментарий к сделке |

\* Хотя бы одно из полей (phone или email) обязательно.

**Логика работы:**
1. Ищет контакт по телефону/email
2. Если не найден — создаёт новый контакт
3. Загружает настройки воронки (CATEGORY_ID, STAGE_ID) из таблицы `bitrix24_pipelines_settings`
4. Создаёт сделку с привязкой к контакту

---

### createBitrix24LeadExistingContact

Создание сделки с уже известным контактом (без поиска).

```typescript
import { createBitrix24LeadExistingContact } from '@bitrix/sdk'

const result = await createBitrix24LeadExistingContact(ctx, {
  leadName: 'Повторная заявка',
  price: 100000,
  contactId: 123,
  comment: 'Клиент вернулся с новым запросом'
})

if (result.ok) {
  // result.result — { dealId, contactId, leadName, price }
}
```

**Параметры:**

| Параметр | Тип | Обязательный | Описание |
|----------|-----|:------------:|----------|
| leadName | string | да | Название сделки |
| price | number | нет | Бюджет в рублях (по умолчанию 0) |
| contactId | number | да | ID существующего контакта в Bitrix24 |
| comment | string | нет | Комментарий к сделке |

**Логика работы:**
1. Загружает настройки воронки из таблицы `bitrix24_pipelines_settings`
2. Создаёт сделку с привязкой к указанному контакту
