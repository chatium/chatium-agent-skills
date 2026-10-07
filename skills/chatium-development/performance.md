# Live updates and request efficiency

## Push or polling

For frequent live updates, prefer push when the server can publish changes and the client can subscribe. When choosing push, use the [realtime implementation](realtime.md); fetch initial state and reconcile after reconnect so a missed notification does not leave stale UI.

Use polling when push is unavailable or the update rate does not justify a subscription. Keep it bounded:

- Allow one request in flight; schedule the next only after completion.
- Stop on completion, a terminal error, component disposal, or a defined time/attempt limit. Suspend unnecessary work while the page is hidden.
- Use a sensible base interval and capped backoff after transient failures; add jitter so clients do not retry together. Honor server retry guidance and avoid retrying permanent failures.
- Cancel obsolete requests where supported and ignore late responses after the owner is disposed or the requested entity changes.

Browser timers belong to the component lifecycle. Deferred server work uses platform jobs, not timers.

## Avoid repeated work

Before adding a cache, remove duplicate calls within one operation. Fetch related records in batches rather than once per row; collect unique IDs, load once, and map results back to the original rows. Keep projections and result sets bounded. When independent calls cannot be batched, use bounded concurrency rather than an unbounded `Promise.all`.

Do not refetch unchanged external data on each render or poll. Reuse results within the operation; cache across operations only with an explicit lifetime/invalidation rule. Cache keys must include relevant account/user/access context, and shared caches must not expose private data. Recheck authorization and current state for mutations even when UI data is cached.
