# Payments

For order checkout, use CRM orders (`createDeal` from `@crm/sdk`) and `/app/crm/pay?deal=<id>`; CRM owns the amount, line items, Pay callbacks and payment accounting. Do not create a parallel order table or bypass CRM with a direct Pay attempt. Use the low-level public `@pay/sdk` below when implementing a payment integration itself. `runAttemptPayment` creates an `Attempt`; a confirmed transfer becomes a `Payment`. Provider-side methods are in [payment-providers.md](payment-providers.md).

For bonuses, tokens, or a wallet, use the built-in internal provider and read [internal-balance-payments.md](internal-balance-payments.md). Ordinary checkout keeps the same `runAttemptPayment` contract; it does not require `source/externalId`. The separate `chargeInternalBalancePayment` SDK performs a protected debit for another user and is restricted to account code and Start.

## Test payments in the current account

An agent can create or retrieve Pay sandbox at any time, including next to live providers. From server-side `chatium exec --write` (or server code):

```ts
import { ensureSandboxProvider } from '@pay/sdk'
const sandbox = await ensureSandboxProvider(ctx)
// { id, key: 'pay:sandbox', isTest: true, isDefault, visibleInProviderLists, created }
```

This idempotent call preserves existing provider settings and the live default. The sandbox is initially hidden from customer lists. `findPaymentProviders` may therefore omit it; an empty result does not mean it cannot be created. `getAllPaymentProviders` auto-creates sandbox only when there are no active providers: use `ensureSandboxProvider` for explicit setup in any account. Install Pay through the supported plugin-install SDK if it is absent; do not insert its Heap rows yourself.

Creating sandbox does not select it for CRM checkout. To test one explicitly selected test order alongside live providers, call CRM as an Admin or Developer:

```ts
import { startDealSandboxPayment } from '@crm/sdk'
const result = await startDealSandboxPayment(ctx, { dealId: testOrderId })
if (!result.success) throw new Error(`Sandbox payment: ${result.reason}`)
// Open result.link while signed in; result.providerId is the selected sandbox.
```

CRM ensures sandbox itself, charges only the order's current outstanding amount through that provider, and retains its normal payment callbacks and accounting. It creates a new attempt on each call; after an uncertain response inspect attempts by `dealId` before retrying. A failed setup never falls back to a live provider. This server SDK is for test operators; do not expose it through an unprotected public route or add a customer-controlled test flag. It returns a sandbox form link, not a way to alter the ordinary customer payment page. After error/cancel, start the next test attempt through this SDK again; `/app/crm/pay` still uses the ordinary configured methods.

Sandbox simulates success, partial payment, error, cancellation and refund without money transfers or fiscal receipts. Its callbacks, automations, messages and product access are real. Use your designated test orders and contacts; verify side effects before submitting. Re-read CRM `getDeal` after callbacks: expect `paidTest` to change and `paidMoney` to stay unchanged. Fulfillment may accept test payment only for server-selected test orders/recipients; do not globally remove a real-payment guard. Sandbox totals are not revenue.

Do not create another account, copy the funnel, switch the account's default provider, or propose a small real charge just to enable this test. If an SDK export is unavailable, refresh installed typings and verify the installed plugin/version. Report the precise missing method or permission and block that payment step; continue independent checks. A separate test account is an explicit testing choice, not a prerequisite for creating sandbox. A sandbox run is not automatically an isolated process TestContext operation and does not prove the customer-facing choice of payment methods works.

## Create a payment integration

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
  customer: { contacts: [{ type: 'email', value: order.email }] },
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

`subject`, `amount: [number, Currency]`, and `description` are required. Optional inputs include `providerId`, `paymentMethod`, `dealId`, `customer`, `payer`, `items`, serializable `payload`, `saveCard`, redirect URLs, and callbacks. `dealId` is stored without checking the CRM deal and copied to payments, including partial payments. `customer.contacts` uses CRM contact objects such as `{ type: 'email' | 'phone' | 'telegram_id', value }`; the flat `email`, `phone`, and `telegramId` inputs remain for compatibility but are deprecated. Pay fills missing flat fields from `contacts` for providers and receipts.

`payer` identifies the legal payer separately from the human contact in `customer`:

```ts
payer: {
  kind: 'company', // or 'person' / 'ip'
  name: 'ООО «Ромашка»',
  inn: '7700000000',
  kpp: '770001001',
  address: 'Москва, ...',
}
```

Pay stores `payer` on the attempt and passes it to the payment provider and external cash register. Do not put company details in `customer.firstName`.

Treat callbacks as authority: redirect URLs are browser UX and can be skipped or opened manually. Call `validateCaller(callerInfo)` in every payment callback. Record transfers idempotently by `payment.id` and guard order fulfillment against repeated or concurrent callbacks; delivery is not an exactly-once guarantee. Callback body types above are inferred from the public function because the SDK does not export them directly.

## Provider and receipt

Omit `providerId` to use the configured default. For development, call `getAllPaymentProviders(ctx)` to discover configured providers. If the account has no active provider, the call creates a test provider and returns its real `id` in `configured` with `isTest: true`. It does not create a test provider when another provider already exists; add one in Pay settings if needed. An existing test provider appears in `configured` even when hidden from buyer-facing `findPaymentProviders`. Pass a returned `id` as `providerId`; never invent IDs or rely on internal provider keys.

For a receipt, supply an email contact (or a confirmed user email) and `items`. Each item needs `id`, `name`, `quantity`, and `price`; the sum of `quantity * price` must equal the payment amount. Optional fiscal fields are `vat`, `paymentObject`, `paymentMode`, `measure`, `measureName`, and `markingCode`. For a marked product, put `markingCode` on that item, not on the payment or `payload`.

`measure` is a numeric `FfdMeasureCode` for FFD 1.2 tag 2108, not an OKEI code; convert OKEI before calling Pay. Examples: `0` for pieces, `71` for hours, `70` for days, and `255` for another unit (provide `measureName`, such as `место` or `чел.-тур`). `measureName` is the printed label, not a substitute for the numeric code. These fields are stored in `attempt.items` and, for an ordinary payment, in `payment.receiptItems`. `attemptAutoCharge.items` has the same fields.

The receipt handler's `receiptPolicy.allowItemOverrides` flag is on by default. When on, item `vat`, `paymentObject`, `paymentMode`, `measure`, and `measureName` can override handler defaults. When off, built-in fiscalization replaces these fields from payment-provider settings while creating the attempt; for an ordinary payment, an external cash register receives them stripped from the receipt request and applies its own defaults. Partial tranches still receive Pay's computed `paymentMode`. `markingCode` stays item-specific. The policy belongs to the handler that actually issues the receipt, either the payment provider or the external cash register.

Diagnose `Receipt is missing or illegal` from the item/contact data and the fiscalization mechanism selected in the provider settings. Do not automatically switch the provider to a built-in cash register.

## Saved cards and recurring charges

- Set `saveCard: true` on the initial payment when the chosen provider supports tokenization.
- List usable cards with `getSavedCards(ctx, { userId, providerId })`; handle `success: false` and an empty list.
- Charge with `attemptAutoCharge(ctx, { subject, amount, description, userId, providerId?, savedCardId?, dealId?, initedBy, bySchedule, customer?, items?, payload?, successCallbackRoute?, cancelCallbackRoute?, paymentReceivedCallbackRoute? })`.
- For a scheduled charge use `initedBy: 'system'`, `bySchedule: true`, call it from an [app job](jobs.md), and notify the customer of the result.

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
  customer: { contacts: [{ type: 'email', value: order.email }] },
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

If the account or plugin code already schedules failure handling, retain those job IDs and cancel them on late success using the [job cancellation API](jobs.md). In the failure job, reload the attempt/order state before acting: a cancellation cannot stop a handler already running, and late success can supersede an earlier failure. Reuse the existing retry policy; do not add a second retry system or schedule the next payment in two places.

## Find and count attempts or payments

Use `findAttempt(ctx, id)` for one known ID, or `findAttempt(ctx, { subject?, providerId?, dealId?, status? })` for the latest matching non-deleted attempt. `findAttempts` and `findPayments` accept Heap `where`, `order`, `limit`, and `offset`. They return at most 1000 rows per call (default 100), ordered by `createdAt desc, id desc` unless you specify `order`. Their matching `countAttempts` and `countPayments` accept the same `where` and `includeDeleted` without loading rows; use one filter for the page and total:

```ts
import { countPayments, findPayments, type CountPaymentsProps } from '@pay/sdk'

const filter: CountPaymentsProps = { where: { dealId: order.dealId } }
const [total, payments] = await Promise.all([
  countPayments(ctx, filter),
  findPayments(ctx, { ...filter, limit: 50, offset: 0 }),
])
```

Use `countAttempts` with `findAttempts` for an attempt list (for example unpaid invoices). Both APIs exclude status `Deleted` by default; pass `includeDeleted: true` to both when needed. Test and internal records are included unless `where` filters them: for money payments use `origin: ['live', 'imported']`, for money attempts use `paymentOrigin: 'live'`. Internal operations use `internal` in these fields. Imported payments have no attempt or provider. `payment.paidAt` is the actual receipt/debit time; old rows may have only `createdAt`. For period reports, filter on `paidAt` and handle those older rows separately. The default list order is creation time, not receipt time. Separate count and list calls can disagree if data changes between them.

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

In `automatic` mode, the closing receipt starts after full payment and confirmation of the tranche receipts. A provider with built-in fiscalization must confirm its final tranche receipt; see [payment-providers.md](payment-providers.md). In `manual` mode, call the following only after actual delivery of the entire product/service, from an authorized fulfillment operation:

```ts
import { createPartialPaymentFulfillmentReceipt } from '@pay/sdk'

const receipt = await createPartialPaymentFulfillmentReceipt(ctx, {
  attemptId: order.paymentAttemptId,
})
if (!receipt.success) throw new Error(receipt.error ?? 'Could not create closing receipt')
// A repeated call returns the existing receiptLogId with duplicate: true.
```

The attempt must be fully paid, have actually entered partial-flow, and use manual mode. Treat `duplicate: true` as the existing operation, not a reason to create another receipt. `receiptLogId` means the receipt was queued, not successfully issued. A single full payment needs no separate partial-payment closing receipt; the callback lifecycle does not promise exactly-once delivery.

## Import historical payments

Use `importPayment(ctx, { source, externalId, subject, amount, paidAt, description, ... })` only for a transfer already completed outside Pay. The stable `(source, externalId)` pair is the idempotency key: an exact repeat returns `action: 'unchanged'`; changed data returns `IMPORTED_PAYMENT_CONFLICT` with `differences` and is not overwritten. Optional fields include `dealId`, `user`, `paymentMethod`, contact data, and `status: 'Refunded'` with `refundedAt`. An imported payment has `origin: 'imported'` and no attempt/provider; it is included in payment lists and revenue by `paidAt`. Import does not charge money or trigger receipts, callbacks, hooks, or notifications. `markPaymentRefunded` cannot subsequently refund an imported payment.

For refund recording and the `@pay/payment-refunded` hook, read [payment-refunds.md](payment-refunds.md). `markPaymentRefunded` records an already completed refund; it does not transfer money through a provider.
