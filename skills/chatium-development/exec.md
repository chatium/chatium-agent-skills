# One-off execution with `chatium exec`

Use `chatium exec` to inspect deployed account data, debug server code, or perform a user-authorized one-off data operation. Keep persistent behavior in application modules; use exec instead of adding a temporary route.

## Before running

- Run inside a Source Git checkout. Exec uses the successful Source Build for the exact committed `HEAD`; it does not add the snippet to Git.
- Treat a dirty-checkout warning as proof that the run did not test staged, unstaged, untracked, or dirty-submodule changes. Runtime verification of local edits starts only when their exact commit has a successful Source Build.
- Run from the directory that should own the snippet. Relative imports resolve from the current directory; `/module` resolves from the account root.
- Start with reads. Run a seed or other mutation only when the user's request authorizes changing account data.

## Snippet contract

- Use the injected `ctx`; do not redeclare it. `ctx.user` is the OAuth user, `ctx.authSession` is the CLI authorization session, and `ctx.session` is `null`.
- Use imports, top-level `await`, and top-level `return` normally. Keep code in the snippet body: user exports are rejected.
- Import tables and other stateful application modules from committed source. The snippet itself must not declare Heap tables, routes, registered jobs/functions, hooks, or manifest data.
- Call existing tables and SDKs directly rather than through a route or HTTP request.

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

Use the existing table and its [record operations](heap.md#record-operations) directly. Read current data before seeding to avoid duplicates. A mutation takes effect immediately and has no read-only mode or rollback.

```sh
chatium exec <<'EOF'
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
