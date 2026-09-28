# External Pay providers

Use this reference when implementing a payment provider in account code or a plugin. Ordinary checkout, lists, and fulfillment belong in [payments.md](payments.md). Read the installed `@pay/sdk` types before coding against a provider's current contract.

## Attempt data and receipts

Declare a provider through `@pay/get-providers`. The provider's `actions.attemptPayment` receives the attempt ID, amount, `customer`, `payer`, and `items`. `payer?: { kind: 'person' | 'company' | 'ip'; name: string; inn?: string; kpp?: string; address?: string }` is the legal payer; `customer` contains the human's contact details. Use `payer` for B2B invoices instead of hiding company details in `customer.firstName`.

An item has `id`, `name`, `quantity`, `price` and optional `vat`, `paymentObject`, `paymentMode`, `measure`, `measureName`, `markingCode`. `measure` is a numeric FFD 1.2 tag 2108 code (`FfdMeasureCode`), while `measureName` is the human-readable unit. Examples: `0` pieces, `71` hours, `70` days, `255` another unit with its label. Convert the numeric code to the payment or cash-register API's required format. A text description can show the unit but does not replace the fiscal tag.

Current integrations translate the unit this way:

| Integration | Unit handling |
| --- | --- |
| YooKassa | Maps the FFD code to its receipt `measure` value. |
| CloudPayments built-in receipt | Sends the code as item `UnitCode`. |
| CloudKassir | Sends `UnitCode` when present; otherwise uses `measureName` or its configured `MeasurementUnit`. |
| Atol | Sends the numeric `measure` for API v5; API v4 uses a string `measurement_unit` from the item label or cash-register default. |
| Stripe, PayPal, QIWI, GetCourse | Adds the readable unit to the payment description where supported; this is not a fiscal measure field. |

The effective receipt handler owns `receiptPolicy.allowItemOverrides` (default `true`): the payment provider for built-in fiscalization, or the external cash register otherwise. With built-in fiscalization and the flag off, Pay has already replaced fiscal item fields with provider defaults when the attempt was created. For an ordinary receipt handled by an external cash register with the flag off, Pay strips fiscal fields from the receipt request so the cash register uses its own defaults. Partial tranches still receive Pay's computed `paymentMode`. `markingCode` remains per item. Preserve the supplied `measure` and `measureName` when the policy allows them; do not hardcode a single unit for every item.

## Record a full payment

After verifying a successful provider transaction, call `successAttemptPayment(ctx, attemptId, { amount?, paidAt?, body?, name?, phone?, email?, card?, savedCardId? })`. `paidAt?: Date` is when funds actually arrived; if omitted, Pay uses the registration time. The created `Payment.paidAt` and callbacks carry that date. A full payment retains the ordinary attempt and receipt flow, even when the provider instance allows partial payments, provided the attempt has no earlier tranches. For a failed or canceled attempt use `failedAttemptPayment(ctx, { attemptId, errorData, status? })`.

## Record installments

Advertise `supportsPartialPayments: true` in `@pay/get-providers`. The account must also enable partial payments on the provider instance; that setting is copied into new attempts. For each successful transfer, call `recordAttemptPartialPayment` with the transaction's actual amount and a stable ID unique within that provider instance:

```ts
import { Money } from '@app/heap'
import { recordAttemptPartialPayment } from '@pay/sdk'

const result = await recordAttemptPartialPayment(ctx, {
  attemptId,
  providerTransactionId: webhook.transactionId,
  amount: new Money(webhook.amount, webhook.currency),
  paidAt: new Date(webhook.paidAt),
  body: webhook,
  receiptItems: webhook.items,
})
if (!result.success) throw new Error(result.error ?? 'Could not record payment')
```

Omit `paidAt` if the provider has no reliable receipt timestamp. An identical webhook returns `duplicate: true` and the existing `paymentId` without another payment, callback, or receipt; it does not revise `paidAt`. A conflicting ID or overpayment fails. The first payment below the full amount starts the partial flow (`PartiallyPaid`); reaching the exact total changes the attempt to `Succeeded`. A single payment of the full amount follows the ordinary flow.

For an actual installment flow, pass `receiptItems` for **this transfer**, including unit fields where available. Their `quantity * price` total must equal this transfer's `amount`; Pay does not divide the original attempt items automatically. `result.receiptPaymentMode` is `partial_prepayment` until the final tranche, then `full_prepayment`. With item overrides enabled, an explicit item `paymentMode` takes precedence; otherwise use the computed mode. A receipt failure does not undo a registered payment. The caller of `runAttemptPayment` may receive `paymentReceivedCallbackRoute` for each tranche and a success callback on full settlement; the provider should not invoke these callbacks itself.

## Closing receipt

In `automatic` mode with built-in fiscalization, issue the final tranche receipt first, then call `confirmPartialPaymentReceipt(ctx, { attemptId, paymentId })`. This queues the separate closing receipt and preserves receipt order. The provider must expose `actions.createPartialPaymentFulfillmentReceipt` to issue that receipt. External cash registers start their automatic closing receipt only after successful receipt records for every tranche. In `manual` mode, authorized account or plugin code calls `createPartialPaymentFulfillmentReceipt` after delivering the whole product or service; it is described in [payments.md](payments.md#closing-receipt-after-fulfillment).

The closing receipt uses the original attempt items, `paymentMode: 'full_pay'`, and prepaid amount equal to the attempt total. It creates no new `Payment`. `receiptLogId` from either scheduling method identifies a queued receipt, not proof that the receipt succeeded. For an external cash register, keep `receiptLogId` and `receiptIdempotencyKey` for each partial-flow receipt and pass the log ID to `updateReceiptLog`; ordinary one-time receipts keep their earlier contract.

For recording an already completed refund and its hook, see [payment-refunds.md](payment-refunds.md). `markPaymentRefunded` supports only an attempt with one payment; multi-tranche partial refunds are not implemented.
