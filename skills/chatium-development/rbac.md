# RBAC: permissions and roles

Use platform RBAC when access should follow a capability of the application (“manage backups”, “approve orders”) rather than an account role. Code declares Permissions and Roles in an `rbac` manifest and checks Permissions through `@app/rbac`; the account decides who holds which Role. Account roles (`requireAccountRole`, `ctx.user.is(...)`) keep working; see [Authentication](auth.md#access-checks).

## Declare Permissions and Roles

`rbac` is a platform manifest type: pass its bare name, with no imported handle. The general static-value rules in [Manifests](manifests.md) apply.

```ts
// approvals/rbac.manifest.ts
import { t } from '@app/i18n'

app.manifest('rbac', {
  permissions: {
    'orders:read': { title: t('View orders') },
    'orders:approve': { title: t('Approve orders'), isDangerous: true },
    'orders:blocked': { title: t('Blocked from orders'), isNegative: true },
  },
  roles: {
    orderViewer: { title: t('Order viewer'), permissions: ['orders:read'] },
    orderApprover: {
      title: t('Order approver'),
      includes: ['orderViewer'],
      permissions: ['orders:approve'],
      includedIn: ['Admin'],
    },
  },
})
```

- Write unscoped local names. The platform prefixes them with `acc:` for account code or `app:<id>:` for a plugin; do not write the prefix yourself. Names cannot contain `*` or start with `-`.
- `permissions` and `includes` reference only this scope's own names. `includedIn` installs the Role into an account tier: `None`, `Staff`, `Admin`, `Developer` or `Owner`. Tiers form a ladder, so `includedIn: ['Admin']` also reaches Developer; Owner holds every non-negative Permission anyway. `includedIn: ['None']` reaches every user of the account, anonymous users and staff included. Choose the lowest tier that should have access by default; omit `includedIn` when the account should grant the Role explicitly.
- Flags: `isDangerous` asks management screens to confirm before granting a Role that reaches the Permission; `isProtected` means it can be granted only through a Role that declares it, never added to a Role by hand; `isNegative` is a denial flag that no wildcard grants (see below).
- Put the declaration in its own module and import that module from the routes that check it, so it is part of the build. Declaration values must be literals and the manifest module cannot export them, so mirror the Permission names checked in code as exported constants in another module and rename both together.
- Broken references, duplicate names and Role cycles fail at **publish**, not at save. A Permission removed from the manifest becomes undeclared; leftover account assignments to it grant nothing.

## Check a Permission

Check on the server before every protected read or mutation, in each API handler as well as the page. Pass the result to Vue only to decide what to show.

```ts
// approvals/access.ts
import { checkPermissions, requirePermission } from '@app/rbac'

export const ORDERS_APPROVE = 'orders:approve'

export async function requireApproveAccess(ctx: app.Ctx) {
  await requirePermission(ctx, ORDERS_APPROVE)
}

export async function getOrdersAccess(ctx: app.Ctx) {
  const perms = await checkPermissions(ctx, ['orders:read', ORDERS_APPROVE, 'orders:blocked'])
  const blocked = perms['orders:blocked']
  return { canRead: perms['orders:read'] && !blocked, canApprove: perms[ORDERS_APPROVE] && !blocked }
}
```

| Need | API |
| --- | --- |
| Gate a handler or page | `await requirePermission(ctx, perm)` asks a visitor with no user to sign in; a user without the permission gets `AccessDeniedError` |
| Decide whether to show a control | `await hasPermission(ctx, perm)` |
| Several flags at once | `await checkPermissions(ctx, perms)` returns `Record<string, boolean>` keyed by the names exactly as passed |
| Another user's access, e.g. on a management screen | `hasPermission(ctx, userId, perm)` / `checkPermissions(ctx, userId, perms)` |

- Only users hold Roles. A request with no user fails every check: `hasPermission` answers `false`, and `requirePermission` asks the visitor to sign in as `requireRealUser` does, or throws `AccessDeniedError` outside a client request (jobs, hooks). No `requireRealUser` call is needed before it.
- A user of any type, an anonymous one included, is checked as is: it passes with the permission and gets `AccessDeniedError` without it, never a sign-in prompt. Add `requireRealUser(ctx)` only when the page itself must be limited to signed-in users.
- Keep Permission checks off a public path; no RBAC setting makes a route public.
- A bare name resolves against the caller's own scope: the plugin's for plugin code, `acc:` for account code. A fully scoped name such as `system:domains:manage` is used as written.
- Checking an undeclared name throws `RbacUndeclaredPermissionError`, including in `hasPermission`; it is a bug, not a denial. Declare the Permission and publish. A navigation flag that must not break unrelated pages may catch this error and return `false`, logging other errors.
- A negative Permission has no built-in relation to any positive one. Check both and combine them yourself, as above.
- Checks are cheap; do not cache their results. Role and assignment changes apply on the user's next request.

## Manage Roles from code

Use the management API only when the task is to build role administration. Account administrators can already assign Roles in the Users application's Roles section.

| Need | API |
| --- | --- |
| Give or take a Role from a user | `assignRoleToUser(ctx, userId, role)` / `unassignRoleFromUser(...)`; both return the user's remaining assigned Roles |
| Create, list or delete account-specific Roles | `createCustomRole(ctx, name, title)`, `listCustomRoles(ctx)`, `deleteCustomRole(ctx, name)` |
| Edit what a custom or tier Role holds | `assignPermissionToRole(ctx, role, perm)`, `assignRoleToRole(ctx, containerRole, role)` and their `unassign...` reverses |
| Render what a Role directly holds | `getRoleContent(ctx, role)`; each entry has `source` (`declared`/`seeded`/`added`) and `suppressed` |
| Account-wide management screen | `listRoles`, `listPermissions`, `getUserRoles`, `getGrantBlastRadius`, `listOrphanedReferences` |

- Role arguments are **full** names: `acc:orderApprover`, `app:<id>:orderApprover`, `custom:<name>` (use the `role` field returned by `createCustomRole`/`listCustomRoles`), a tier such as `system:Staff`, or a platform bundle such as `system:DomainsManager`. Tier Roles follow from the user's account role and cannot be assigned to a user; `getUserRoles` lists stored assignments only, so ask `hasPermission(ctx, userId, perm)` for effective access.
- Roles declared in a manifest cannot be edited at runtime; change their source. Editable containers are custom Roles and the tier Roles. Removing a declared or platform-seeded pairing from a tier Role records a standing refusal that survives republishing and reinstalling.
- Before offering a grant, call `getGrantBlastRadius` and show its result; honor `isDangerous` from the listings with a confirmation. It is advisory and blocks nothing.
- Custom Roles require the account's entitlement: when it lapses, creating, adding to and assigning them fail, while listing, removing and deleting stay available.

### Who may call what

Account code is an own-tier caller in the `acc:` scope: it may manage its own Roles and custom Roles it created, and every manager-only call (`listRoles`, `listPermissions`, `getUserRoles`, `getGrantBlastRadius`, `listOrphanedReferences`) is denied to it. A plugin must declare app permissions, granted by the installing account:

| App permission | Opens |
| --- | --- |
| `rbac.own.assign: write` | Assign the plugin's own Roles to users; put its own Permissions/Roles into tier Roles and Roles it may target |
| `rbac.own.customRoles: read` / `write` | List shared custom Roles plus its own / create custom Roles **owned** by the plugin, delete them and assign them (with `own.assign`) |
| `rbac.manager.roles: read` / `write` | The account-wide listings / create **shared** custom Roles and edit tier and shared Roles with any name |
| `rbac.manager.userRoles: read` / `write` | `getUserRoles` / assign any Role, platform bundles included, to users |

Only the owner of an owned custom Role edits its content, even against the manager tier. A shared Role takes content from any plugin with `rbac.own.assign: write` and `rbac.own.customRoles: read`, but only the manager tier grants or deletes it. Request the narrowest tier the feature needs and check each call's typings in `@app/rbac` before relying on edge cases.

Typecheck against the current `@app/rbac` declarations. With the user's permission, verify after publishing that a user holding the Role passes and one without it gets access denied.
