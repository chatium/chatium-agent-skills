# Internal balance payments

Use Pay's built-in `pay:internal-balance` provider for purchases paid with an account's bonuses, credits, tokens, or wallet balance. Implement a balance adapter in the account or a plugin; do not register another acquiring provider or record a new debit as historical `importPayment`. Pay owns attempts, payments, the confirmation page, and normal payment callbacks. The adapter owns balances, conversion rules, debit, and full refund.

Read the installed `@pay/sdk` types and existing wallet code first. Reuse its balance and ledger; do not create a second wallet. Resolve the owner, units, eligible purchases, rate, rounding, and any limits from the task or existing implementation. Ask only for missing business rules that determine a debit.

## Keep the ordinary checkout contract

- Use `runAttemptPayment(ctx, { subject, amount: [number, currency], description, providerId?, user?, ... })` as in [payments.md](payments.md). It accepts the same `items`, `customer`, `payload`, redirects, and callbacks as other providers.
- `providerId` is an existing configured instance ID, not `pay:internal-balance`. Find it through SDK or account configuration. The internal provider may be selected explicitly or made the default. A non-default internal instance is not an automatic fallback; saved-card autocharge ignores an internal default.
- Do not require `source` or `externalId` in ordinary `runAttemptPayment`. Each call creates a new attempt. Persist the payment link/attempt for retries of the same checkout instead of creating another attempt.
- The Pay page requires a signed-in real user. If the attempt has a user, it must match. If not, the first confirmation atomically binds the payer. Do not alter an existing checkout solely to force a user field for this provider; still enforce order ownership in the merchant's initiating handler.
- Payment `amount` remains the order's denomination, e.g. 1000 RUB; the adapter may debit 100 points. Reports in Pay sum the former, not token units.

## Register three server functions

The hook returns one `BalanceAdapterRegistration`: `{ key, title, description?, quote, debit, refund }`. All three functions are required `FunctionRouteRef` values. Use a stable key unique within its account/plugin source. Account code uses `app.accountHook('@pay/get-balance-adapters', ...)`; a plugin uses `app.pluginHook` with the same hook name.

This is registration glue. Implement the imported ledger functions against the actual wallet using the rules below; they are application functions, not platform APIs.

```ts
import { validateCaller } from '@pay/sdk'
import type {
  BalanceAdapterRegistration,
  BalanceQuoteParams, BalanceQuoteResult,
  BalanceDebitParams, BalanceDebitResult,
  BalanceRefundParams, BalanceRefundResult,
} from '@pay/sdk'
import { quoteBalance, debitBalance, refundBalance } from './ledger'

export const quote = app.function('/quote', async (
  ctx, input: BalanceQuoteParams, caller,
): Promise<BalanceQuoteResult> => {
  validateCaller(caller)
  return quoteBalance(ctx, input)
})

export const debit = app.function('/debit', async (
  ctx, input: BalanceDebitParams, caller,
): Promise<BalanceDebitResult> => {
  validateCaller(caller)
  return debitBalance(ctx, input)
})

export const refund = app.function('/refund', async (
  ctx, input: BalanceRefundParams, caller,
): Promise<BalanceRefundResult> => {
  validateCaller(caller)
  return refundBalance(ctx, input)
})

app.accountHook('@pay/get-balance-adapters', (): BalanceAdapterRegistration => ({
  key: 'loyalty-balance',
  title: 'Loyalty balance',
  description: 'Pay using the existing loyalty points wallet',
  quote, debit, refund,
}))
```

`validateCaller` admits only Pay. Keep these handlers server-only; do not expose unguarded HTTP debit/refund endpoints. Validate runtime inputs and wallet access inside the implementation: TS annotations are not runtime validation. Reject absent `userId` when the wallet requires an owner, unsupported currency, invalid/non-positive amount, and mismatched operation identity. In `self` mode require that the signed-in real user matches `userId`. In `delegated` mode the current user may be an employee; never replace the payer's `userId` with `ctx.user.id`. If rules depend on the purchase, use `getAttemptSubject(ctx, attemptId)` to read its subject.

## Quote without debiting

Input: `{ attemptId, amount: Money, userId?, mode: 'self' | 'delegated' }`.

Return `{ success, canPay, balanceText?, debitText?, quoteToken?, errorCode?, publicMessage? }`. A successful available quote needs `quoteToken`. Return readable units in both display strings, such as `1200 points` and `100 points`. Insufficient balance can be `success: true, canPay: false`; calculation failures have `success: false`. The page shows `publicMessage` for an unavailable quote.

Bind the quote to attempt, payer, nominal amount/currency, actual debit units, and relevant pricing rules/version (and expiry if used). Store an opaque server quote or verify a signed token. With a fixed rate, comparing the received token to a fresh server-derived value also works. A client-provided amount is never authority. Quote does not modify the balance; debit rechecks current eligibility and funds.

## Debit once by attemptId

Input is the quote input plus `quoteToken?: string`. Success requires `{ success: true, transactionId: string, paidAt: Date }`; preserve both ID and time durably.

Inside the wallet's atomic operation:

1. Find a prior debit by `attemptId`. Verify its payer, nominal amount, and currency match. Return that debit's original ID/time **before** validating a quote token, current rate, or current balance.
2. Without a prior debit or token, return `{ success: false, errorCode: 'QUOTE_REQUIRED' }`. This is a protocol response; do not debit on that call.
3. Validate the token against current rules. If the price/conditions changed or the quote expired, return `PRICE_CHANGED` without debiting. A self-service payer must see and confirm a fresh quote.
4. Recheck the available balance, debit it, and record the operation atomically. Insufficient funds can return `BALANCE_UNAVAILABLE`.

Pay calls debit without a token to recover an earlier result. Delegated SDK first attempts this recovery, then gets a quote on `QUOTE_REQUIRED` and debits using its token. The page's recovery action only checks for a previous debit. A retry after Pay failed to create its Payment must return the prior debit even if the rate changed or the remaining wallet is now insufficient.

For Heap-backed wallets, use one `serializableTransaction` for prior-operation lookup, balance check/update, and ledger insertion, passing its context to every operation. A separate `find` then `create` allows races. Keep Pay RPC and external effects out of the transaction callback; do not nest transactions. For external wallets, propagate `attemptId` as the remote idempotency key and recover the committed result after timeouts. Never return success merely because a request was sent.

Store at least `attemptId`, payer, Pay amount/currency, actual debited units, operation ID and time, and the data needed to check quote consistency. New Heap tables need unique names in the account, not copied scaffold names. Retain the ledger for retries and refunds.

## Refund the original units once by paymentId

Input: `{ paymentId, attemptId, originalTransactionId, amount: Money, userId?, reason? }`. Success requires `{ success: true, refundId: string, refundedAt: Date }`.

Find the original debit by `originalTransactionId`; verify attempt, payer, nominal amount/currency. Return its original number of units, not `amount.amount` or a conversion using today's rate. Atomically restore the balance and persist the refund keyed by `paymentId`. A repeat must return the original refund ID/time, including after a lost response. Reject a second refund of the same debit under another payment key. Use remote idempotency if the ledger is external.

The Pay admin action **Return balance / Вернуть на баланс** calls the adapter first, then marks the attempt/payment `Refunded` and invokes `@pay/payment-refunded`. Do not call `markPaymentRefunded` or emit hooks from the adapter. The refund hook handles order/access changes; it must not credit the wallet a second time. Partial refunds are unsupported.

**Mark refunded manually / Отметить возврат вручную** and public `markPaymentRefunded` only record an already completed external refund. **Delete Pay record / Удалить запись Pay** soft-deletes the attempt/payment with an audit reason; it does not restore balance or undo fulfillment. See [payment-refunds.md](payment-refunds.md).

## Delegated charge

`chargeInternalBalancePayment` is available only to account code and plugin `start`. Other plugins use ordinary user-confirmed checkout. Its caller gate is not employee authorization: an account HTTP handler must authorize the staff action and derive/check the order, payer, amount, and provider server-side before invoking it.

Required inputs: `source`, `externalId`, `providerId`, `userId`, `subject`, `amount: Money`, `description`. Optional: `paidAt: Date`, `dealId`, `successHook`, `successCallbackRoute`. Types: `ChargeInternalBalancePaymentProps`, `ChargeInternalBalancePaymentResult`. A successful result has `success`, `action: 'created' | 'unchanged'`, `attemptId`, `paymentId`; failure has `error` and may omit IDs.

Persist the operation key before the first request. Pay encodes `["internal", caller, source, externalId]` in `Attempts.operationKey` and `Payments.operationKey`, with caller `account` or `plugin:start`. Import uses `[source, externalId]` in `Payments.operationKey`, so the namespaces do not collide. Do not use a new ID to retry an uncertain charge. Reuse the original `paidAt` if passed; recomputing it causes a conflict. Changed operation identity/data returns `OPERATION_KEY_CONFLICT`; a deleted internal payment returns `INTERNAL_PAYMENT_DELETED` and is not restored (unlike import). A refunded one returns `INTERNAL_PAYMENT_REFUNDED`.

Treat `BALANCE_DEBIT_UNCONFIRMED`, `PAYMENT_FINALIZATION_FAILED`, and `INTERNAL_CHARGE_UNCONFIRMED` as uncertain outcomes, recoverable with the same operation. `INTERNAL_PROVIDER_NOT_CONFIGURED` means the provider lacks an adapter and needs a correctly created instance. The SDK returns error codes; arbitrary debit/refund `publicMessage` is not automatically passed through to the client. There is no public SDK method for executing a balance refund; use the Pay admin action.

## Configure and verify

Tell the administrator to open **Оплата → Провайдеры → Добавить провайдера → Внутренний баланс**, select the registered adapter, and optionally make this provider the default. Otherwise connect its ID to the existing checkout's payment-method choice. Adding a provider does not create a wallet or add a staff charging UI.

The adapter binding is immutable. To choose another adapter create a new provider. Pay stores the server-resolved function references: changing hook results does not rebind old providers, and missing routes do not fall back to another adapter. Preserve old routes and ledger records for outstanding operations/refunds.

On a successful debit Pay records one full payment: `attempt.paymentOrigin === 'internal'`, `payment.origin === 'internal'`, `providerTransactionId` is the debit ID, `paidAt` is the adapter timestamp unless the trusted SDK overrides it. Pay runs the normal success hook/callback, notifications, and applicable CRM events. It does not call `paymentReceivedCallbackRoute` for this full payment. Do not call provider-side `successAttemptPayment`, mutate Pay tables, grant access in the adapter, or add a separate callback-delivery system. Success URL is navigation, not payment authority.

No fiscal receipts, partial payments, card saving, or saved-card autocharge. Ordinary `items` are retained as data without fiscalization; `saveCard` creates no card. Admin list, totals, and CSV share `paymentScope: money | internal | all`: default `money` means `live + imported`; `internal` selects balance payments; `all` includes test records too. Public list/count SDKs do not apply this UI default: filter payment `origin` or attempt `paymentOrigin` explicitly for financial reporting.

Validate the adapter with the real checkout contract, ownership/caller rejection, configured conversion/rounding, insufficient balance, a changed price between quote and confirmation, concurrent confirms, recovery without a token after a committed debit, refund after a rate change, and retry after a lost refund response. Check that callbacks do not duplicate fulfillment or wallet credits, and that manual marks/deletes never invoke refund. Use a test customer and test units for live mutation checks; the internal provider actually changes the configured balance.
