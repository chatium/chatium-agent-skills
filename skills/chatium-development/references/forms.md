# Customer forms

Use this flow when a submitted form represents a customer action that the application should retain and expose to CRM or analytics, such as a lead, registration, booking, or order.

1. Validate and save the submission through its own protected or public POST [RouteRef](../routing.md#route-convention-and-inputs). Store the application record in Heap before capturing the event.
2. Call `captureCustomerEvent` from `@crm/sdk` with the contacts actually supplied, or `appendUserContacts` for an authenticated user's confirmed contacts.
3. Put display name and UTM attribution in `customer`, the saved Heap row in `linkRecords`, business payload in `payload`, and analytics fields in `metricEventData`. `metricEventData` does not accept generated event fields such as `url`.
4. Use a stable action name such as `registrationCreated` or `bookingCreated`. The full event contract and registration rules are in [События](automations/events.md#запись-события-клиента-capturecustomerevent).

```ts
import { captureCustomerEvent } from '@crm/sdk'
import Registrations from '../../tables/registrations.table'

export const registrationCreateRoute = app.post('/')
  .body(s => ({
    name: s.string(),
    email: s.string(),
    utmSource: s.string().optional(),
  }))
  .handle(async (ctx, req) => {
    const registration = await Registrations.create(ctx, req.body)
    const captured = await captureCustomerEvent(ctx, {
      event: 'registrationCreated',
      contacts: [{ type: 'email', value: req.body.email }],
      customer: {
        displayName: req.body.name,
        utm: {
          source: req.body.utmSource,
          // Current SDK requires all UTM keys; this form only collects source.
          medium: undefined, campaign: undefined, content: undefined, term: undefined,
        },
      },
      linkRecords: [registration],
    })

    if (!captured.success) ctx.account.log('CRM capture failed', { json: captured })
    return registration
  })
```

The Vue form imports this route and calls `registrationCreateRoute.run(ctx, body)`. Decide explicitly whether CRM failure blocks the form; if a retry can repeat the Heap write, make the creation path idempotent.
