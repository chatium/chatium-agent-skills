# Background jobs

Use jobs for deferred backend work. Define a handler in its own file with serializable parameters and a `.body()` schema. Load current records inside the job; the originating request may be long finished.

This example uses the [Items table](heap.md#table-definition):

```ts
// jobs/archive-item.ts
import Items from '../tables/items.table'

export const archiveItemJob = app.job('/')
  .body(s => ({ itemId: s.string() }))
  .handle(async (ctx, params) => {
    const item = await Items.findById(ctx, params.itemId)
    if (!item) return
    await Items.update(ctx, { id: item.id, status: 'archived' })
  })
```

The schema validates and infers `params`. With shorthand `app.job('/', handler)`, explicitly type the handler's parameters. Make repeated execution safe; the example's update has the same effect on repetition and ignores a deleted item.

Schedule from authorized backend code by importing the job's exported reference:

| Need | Call |
| --- | --- |
| After a delay | `archiveItemJob.scheduleJobAfter(ctx, 5, 'minutes', { itemId })` |
| At a date | `archiveItemJob.scheduleJobAt(ctx, startAt, { itemId })`, with a `Date` |
| As soon as possible | `archiveItemJob.scheduleJobAsap(ctx, { itemId })` |
| Cancel a delayed/date task | `cancelScheduledJob(ctx, taskId)` from `@app/jobs` |
| Cancel an ASAP task | `cancelAsapJob(ctx, taskId)` from `@app/jobs` |

Await these operations. Scheduling returns a numeric task ID; use the cancellation function matching its task kind. Cancellation returns a boolean and does not guarantee that an already-running handler stops.
