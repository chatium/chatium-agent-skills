---
title: Как подписаться на возвраты платежей
description: Используй этот документ, если нужно обработать возврат платежа, подписаться на событие payment-refunded, написать хук @pay/payment-refunded или вызвать markPaymentRefunded.
---

# Подписка на возвраты платежей

Событие `payment-refunded` отправляется, когда платеж **помечен как возвращенный**. Это не проведение реального возврата через платежного провайдера, а фиксация факта возврата в Chatium.

## Когда использовать

- Закрыть или изменить доступ после возврата.
- Отправить уведомление клиенту, менеджеру или в CRM.
- Синхронизировать локальный заказ со статусом возврата.
- Записать событие в аналитику или свою таблицу.

## Как подписаться

В серверном коде зарегистрируй account hook:

```typescript
import type { PaymentRefundedHookBody } from '@pay/sdk'

app.accountHook('@pay/payment-refunded', async (ctx, params: PaymentRefundedHookBody) => {
  const { attempt, payment, refund } = params

  ctx.account.log('Payment refunded', {
    json: {
      paymentId: payment.id,
      attemptId: attempt.id,
      refundSource: refund.source,
    },
  })

  // Здесь бизнес-логика:
  // - закрыть доступ к продукту
  // - обновить заказ
  // - отправить уведомление
  // - записать customer/workspace event
})
```

Важно: адрес хука должен быть ровно `@pay/payment-refunded`.

## Payload хука

Используй экспортируемые `PaymentRefundedHookBody` и `PaymentRefundData` из `@pay/sdk`; локальную копию payload не создавай.

В `PaymentRefundedHookBody` приходят:

| Поле | Описание |
|------|----------|
| `attempt` | Сериализованная попытка оплаты, которая стала `Refunded` |
| `payment` | Сериализованный платеж, который стал `Refunded` |
| `refund.refundedAt` | Когда возврат был зафиксирован |
| `refund.source` | Источник пометки: `manual`, `provider`, `system` или свой string |
| `refund.reason` | Причина возврата, если указана |
| `refund.body` | Дополнительные данные возврата |
| `refund.byUserId` | Пользователь, который вручную отметил возврат, если известен |

## Как пометить платеж возвращенным

Если нужно именно **пометить** платеж как возвращенный, используй `markPaymentRefunded`:

```typescript
import { markPaymentRefunded } from '@pay/sdk'

const result = await markPaymentRefunded(ctx, {
  paymentId: 'payment-id',
  reason: 'Customer requested refund',
  source: 'manual',
})

if (!result.success) {
  throw new Error(result.error || 'Failed to mark payment refunded')
}

if (result.alreadyRefunded) {
  // Платеж уже был Refunded, хук повторно не отправляется
}
```

Можно передать `attemptId` вместо `paymentId`. Тогда будет найден последний не удаленный платеж попытки.

## Важные правила

- `markPaymentRefunded` не вызывает API провайдера и не переводит деньги клиенту.
- Метод поддерживает попытку с одним фактическим платежом, даже если в настройках провайдера разрешены частичные оплаты.
- Если попытка содержит несколько платежей, метод возвращает `PARTIAL_PAYMENT_REFUND_REQUIRES_SINGLE_PAYMENT`: частичные и многотраншевые возвраты этим API не реализованы.
- Событие отправляется только после успешной пометки платежа и попытки в статус `Refunded`.
- Повторная пометка уже возвращенного платежа возвращает `alreadyRefunded: true` и не вызывает хук повторно.
- Не меняй `Refunded` обратно в `Succeeded` или `Failed` при поздних callback/webhook от провайдера.
- Если хук обновляет связанные сущности, делай обработчик идемпотентным: одно и то же бизнес-действие не должно выполниться дважды.
