# Payments

Use the public `@pay/sdk`. An application creates an `Attempt`; a confirmed transfer becomes a `Payment`. The `subject` links the attempt to an order or another Heap record.

## Create a payment

```ts
import { runAttemptPayment, validateCaller } from '@pay/sdk'

type PaymentOptions = Parameters<typeof runAttemptPayment>[1]
type SuccessBody = Parameters<NonNullable<PaymentOptions['successCallbackRoute']>['run']>[1]
type CancelBody = Parameters<NonNullable<PaymentOptions['cancelCallbackRoute']>['run']>[1]

export const paymentSucceeded = app.function(
  '/payment-succeeded',
  async (ctx, { attempt, payment }: SuccessBody, callerInfo) => {
    validateCaller(callerInfo)
    // Idempotently fulfill the order, keyed by payment.id.
    return { success: true }
  },
)

export const paymentCanceled = app.function(
  '/payment-canceled',
  async (ctx, { attempt, errorData }: CancelBody, callerInfo) => {
    validateCaller(callerInfo)
    return { success: true }
  },
)

const result = await runAttemptPayment(ctx, {
  subject: order,
  amount: [order.total, 'RUB'],
  description: `Payment for order #${order.id}`,
  user: ctx.user ?? undefined,
  session: ctx.session,
  customer: { email: order.email, phone: order.phone },
  items: order.items.map(item => ({
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    price: item.price,
  })),
  successUrl: successPageRoute.url(),
  cancelUrl: cancelPageRoute.url(),
  successCallbackRoute: paymentSucceeded,
  cancelCallbackRoute: paymentCanceled,
})

if (!result.success) throw new Error(result.error ?? 'Could not create payment')
return result.result?.paymentLink ?? result.result?.paymentQr
```

`subject`, `amount: [number, Currency]`, and `description` are required. Optional inputs include `providerId`, `paymentMethod`, payer data, receipt items, serializable `payload`, `saveCard`, redirect URLs, and callbacks.

Treat callbacks as authority: redirect URLs are browser UX and can be skipped or opened manually. Call `validateCaller(callerInfo)` in every payment callback. Record transfers idempotently by `payment.id` and guard order fulfillment against repeated or concurrent callbacks; delivery is not an exactly-once guarantee. Callback body types above are inferred from the public function because the SDK does not export them directly.

## Provider and receipt

Omit `providerId` to use the configured default. When a provider is requested, resolve its real ID with `findPaymentProviders(ctx, { providerKey })`; never invent one.

For a receipt, supply `customer.email` or the confirmed user email and `items`. Each item needs `id`, `name`, `quantity`, and `price`; the sum of `quantity * price` must equal the payment amount. Current typings also expose `vat` and `paymentObject`. For a marked product, put its `markingCode` on that individual item, not on the payment or `payload`.

Diagnose `Receipt is missing or illegal` from the item/contact data and the fiscalization mechanism selected in the provider settings. Do not automatically switch the provider to a built-in cash register.

## Saved cards and recurring charges

- Set `saveCard: true` on the initial payment when the chosen provider supports tokenization.
- List usable cards with `getSavedCards(ctx, { userId, providerId })`; handle `success: false` and an empty list.
- Charge with `attemptAutoCharge(ctx, { subject, amount, description, userId, providerId?, savedCardId?, initedBy, bySchedule, customer?, payload?, successCallbackRoute?, cancelCallbackRoute? })`.
- For a scheduled charge use `initedBy: 'system'`, `bySchedule: true`, call it from an [app job](../jobs.md), and notify the customer of the result.

For a user-initiated charge, require a real user, authorize access to the order, and load its amount and provider on the server. Treat a submitted card ID only as a selection: verify that it belongs to this user and to the chosen provider. This handler fragment assumes those order checks have already passed and `selectedCardId` is a validated string:

```ts
import { requireRealUser } from '@app/auth'
import { getSavedCards, attemptAutoCharge } from '@pay/sdk'

const user = requireRealUser(ctx)
const cards = await getSavedCards(ctx, { userId: user.id, providerId })
if (!cards.success) throw new Error('Could not load saved cards')
const card = cards.cards.find(card => card.id === selectedCardId && card.provider.id === providerId)
if (!card) throw new Error('Card is not available for this user and provider')

const charge = await attemptAutoCharge(ctx, {
  subject: order,
  amount: [order.total, 'RUB'],
  description: `Payment for order #${order.id}`,
  userId: user.id,
  providerId,
  savedCardId: card.id,
  initedBy: 'user',
  bySchedule: false,
  customer: { email: order.email, phone: order.phone },
  items: order.items,
  successCallbackRoute: paymentSucceeded,
  cancelCallbackRoute: paymentCanceled,
})

if (!charge.success && charge.errorCode !== 'PAYMENT_PENDING') {
  throw new Error(charge.error ?? 'Charge request failed')
}
// Accepted or pending is not proof of payment; await the verified callback.
```

An immediate successful response can still leave the attempt `Pending`; `PAYMENT_PENDING` also means awaiting confirmation, not final failure. Grant access and schedule the next subscription period only from the validated, idempotent success callback, never again from the initiating handler/job. A scheduled charge derives its owner, selected card and provider from the authorized subscription, not an interactive `ctx.user` or unchecked client IDs.

If the application already schedules failure handling, retain those job IDs and cancel them on late success using the [job cancellation API](../jobs.md). In the failure job, reload the attempt/order state before acting: a cancellation cannot stop a handler already running, and late success can supersede an earlier failure. Reuse the existing retry policy; do not add a second retry system or schedule the next payment in two places.

## Partial payments

The provider must support partial payments, and its Pay settings must enable them and select `automatic` or `manual` fulfillment receipts. There is no `runAttemptPayment` flag to enable the mode. Permission to pay partially does not mean every attempt uses tranches: a first payment for the full amount follows the ordinary single-payment/receipt flow.

Actual partial-flow begins when a payment is less than the outstanding balance: the attempt becomes `PartiallyPaid`, then `Succeeded` when payments reach the full amount. Add `paymentReceivedCallbackRoute` to `runAttemptPayment` or `attemptAutoCharge` when the application needs per-tranche progress:

```ts
// Uses PaymentOptions and validateCaller from the checkout example.
type TrancheBody = Parameters<NonNullable<PaymentOptions['paymentReceivedCallbackRoute']>['run']>[1]

export const paymentReceived = app.function(
  '/payment-received',
  async (ctx, { attempt, payment, paidAmount, remainingAmount, isFullyPaid }: TrancheBody, callerInfo) => {
    validateCaller(callerInfo)
    // Persist this transfer once by payment.id and update the order's progress.
    // paidAmount/remainingAmount are Money; isFullyPaid describes the balance.
    // Leave final fulfillment to paymentSucceeded.
    return { success: true }
  },
)

// Add to the existing payment request, keeping its other checkout fields:
// paymentReceivedCallbackRoute: paymentReceived,
// successCallbackRoute: paymentSucceeded,
```

The received callback describes each tranche of an actual partial-flow, including the final one; it is not called for a single full-amount payment. The success callback signals full settlement regardless of the number of tranches. Do not interpret its last `payment.amount` as the whole order's paid amount, or fulfill independently in both callbacks. Make both handlers safe to repeat; do not depend on their processing order to deduplicate fulfillment.

## Closing receipt after fulfillment

In `automatic` mode, the platform schedules the closing receipt after full payment and successful receipts for all tranches. In `manual` mode, call the following only after actual delivery of the entire product/service, from an authorized fulfillment operation:

```ts
import { createPartialPaymentFulfillmentReceipt } from '@pay/sdk'

const receipt = await createPartialPaymentFulfillmentReceipt(ctx, {
  attemptId: order.paymentAttemptId,
})
if (!receipt.success) throw new Error(receipt.error ?? 'Could not create closing receipt')
// A repeated call returns the same receiptLogId with duplicate: true.
```

The attempt must be fully paid, have actually entered partial-flow, and use manual mode. Treat `duplicate: true` as the existing operation, not a reason to create another receipt. A single full payment needs no separate partial-payment closing receipt. Check the installed SDK for these APIs before use; the callback lifecycle does not promise exactly-once delivery.

For refund recording and the `@pay/payment-refunded` hook, read [payment-refunds.md](payment-refunds.md). `markPaymentRefunded` records an already completed refund; it does not transfer money through a provider.
