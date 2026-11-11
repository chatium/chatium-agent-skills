# One-off execution with `chatium exec`

Use `chatium exec` to inspect deployed account data, debug server code, or perform a user-authorized one-off data operation. Keep persistent behavior in application modules; use exec instead of adding a temporary route. For platform logs, read [Account logs](account-logs.md).

## Before running

- Exec uses the successful Source Build for the exact committed `HEAD`; it does not add the snippet to Git.
- The checkout must belong to the account where the code ran, and `origin` must point to that account's Chatium Source Git repository. A generic Git remote does not establish this.
- Treat a dirty-checkout warning as proof that the run did not test staged, unstaged, untracked, or dirty-submodule changes. Runtime verification of local edits starts only when their exact commit has a successful Source Build.
- Run from the directory that should own the snippet. Relative imports resolve from the current directory; `/module` resolves from the account root.
- Start with reads. Run a seed or other mutation only when the user's request authorizes changing account data.
- Exec runs read-only: writes to Heap and platform data (users, identities, account settings) fail. Add `--write` only for a mutation the user authorized; read-only does not stop outbound HTTP requests, messages or other side effects outside the databases.
- Filter platform lists such as `findIdentities`, `findAsapJobs` or `findApps` with `where` too; unknown option keys fail the run.
- Exec type-checks the snippet against the checkout and refuses to run on type errors. If it reports missing typings, run `chatium get-typings`. Fix the error; never cast around it with `as any`.

## Snippet contract

- Use the injected `ctx`; do not redeclare it. `ctx.user` is the OAuth user, `ctx.authSession` is the CLI authorization session, and `ctx.session` is `null`.
- Use imports, top-level `await`, and top-level `return` normally. Keep code in the snippet body: user exports are rejected.
- Import tables and other stateful application modules from committed source. The snippet itself must not declare Heap tables, routes, registered jobs/functions, hooks, or manifest data.
- Call existing tables and SDKs directly rather than through a route or HTTP request.
- For installing a Store plugin, follow [Store plugin installation](store-plugin-install.md). Report the result and every declared permission to the user after the call.

Pipe multiline code through a quoted heredoc so the shell does not expand it:

```sh
chatium exec <<'EOF'
import Items from './tables/items.table'

const rows = await Items.findAll(ctx, { limit: 20 })
return rows.map(({ id, title }) => ({ id, title }))
EOF
```

The returned value is stdout; `console.*` and errors are stderr. Return only the serializable fields needed for the next decision.

## Data inspection and seed

Use the existing table and its [record operations](heap.md#record-operations) directly. Read current data before seeding to avoid duplicates. A mutation needs `--write`, takes effect immediately and has no rollback.

```sh
chatium exec --write <<'EOF'
import { Money } from '@app/heap'
import Items from './tables/items.table'

const starter = await Items.create(ctx, {
  title: 'Starter plan',
  status: 'active',
  price: new Money(990, 'RUB'),
})
const pro = await Items.create(ctx, {
  title: 'Pro plan',
  status: 'active',
  price: new Money(2490, 'RUB'),
})

return [starter, pro].map(({ id, title }) => ({ id, title }))
EOF
```

After a successful mutation, return changed IDs or counts and verify the resulting state. After a timeout, network failure, or runtime error, inspect current state before retrying: the first call may have applied some or all writes.

## Bulk changes

Filter with `where`. Before a bulk update or delete, run a read-only exec that returns `countBy(ctx, where)` and a few sample rows, and check that the count matches what the user asked for. Then change the rows in one call with an explicit `limit`, not with `delete` in a loop over `findAll`:

```sh
chatium exec --write <<'EOF'
import Items from './tables/items.table'

return await Items.deleteAll(ctx, { where: { status: 'draft' }, limit: 50 })
EOF
```
