# RBAC: permissions and roles

Use platform RBAC when access should follow a capability of the application (“manage backups”, “approve orders”) rather than an account role. Code declares Permissions and Roles in an `rbac` manifest and checks Permissions through `@app/rbac`; the account decides who holds which Role. When access differs per object (“this user may edit this folder”), declare the Permission `perResource` and grant it per Resource from code; see [Grant access per Resource](#grant-access-per-resource). Account roles (`requireAccountRole`, `ctx.user.is(...)`) keep working; see [Authentication](auth.md#access-checks).

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
- Flags: `isDangerous` asks management screens to confirm before granting a Role that reaches the Permission; `isProtected` means it can be granted only through a Role that declares it, never added to a Role by hand; `isNegative` is a denial flag that no wildcard grants (see below); `requiresSeat` makes the Permission work only for a user with an active seat when the account works with seats (outside seat mode it changes nothing; the seat is asked at check time, so buying or losing one applies on the next check); `perResource` lets the Permission also be granted for one Resource at a time (see [Grant access per Resource](#grant-access-per-resource)). `perResource` together with `isProtected` is a build error.
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
- A `requiresSeat` Permission the user's Roles grant still answers `false` without an active seat; `requirePermission` then throws `AccessDeniedError` whose message says the Permission requires an active seat. A check about another user counts that user's seat.
- Checks are cheap; do not cache their results. Role and assignment changes apply on the user's next request.

## Grant access per Resource

Use per-resource Permissions when the same capability is held for some objects and not others: sharing a folder, a document or a board with particular users or Roles. The platform stores the grants; the Resource is your own object, named by your own string id.

```ts
// folders/rbac.manifest.ts
app.manifest('rbac', {
  permissions: {
    'folders:read': { title: t('Read folder'), perResource: true },
    'folders:manage': { title: t('Manage folder'), perResource: true, isDangerous: true },
  },
  roles: {
    folderAdmin: { title: t('Folder admin'), permissions: ['folders:read', 'folders:manage'], includedIn: ['Admin'] },
  },
})
```

```ts
// folders/access.ts
import {
  checkResourcePermissions,
  grantResourcePermission,
  listEffectiveGrantedResources,
  requireResourcePermission,
  revokeAllResourcePermissions,
} from '@app/rbac'

// share: one user, or a Role (full name)
await grantResourcePermission(ctx, { perm: 'folders:read', resource: `folder:${folder.id}`, user: userId })
await grantResourcePermission(ctx, { perm: 'folders:read', resource: `folder:${folder.id}`, role: 'system:Staff' })

// gate a handler (current user only)
await requireResourcePermission(ctx, { perm: 'folders:manage', resource: `folder:${folder.id}` })

// a tree: check the folder and its ancestors in one call, apply your own inheritance rule
const ids = [folder, ...ancestors].map(f => `folder:${f.id}`)
const res = await checkResourcePermissions(ctx, { perms: ['folders:read'], resources: ids })
const canRead = ids.some(id => res[id]['folders:read'])

// "shared with me"
const sharedIds = await listEffectiveGrantedResources(ctx, { perm: 'folders:read' })

// on delete of the object
await revokeAllResourcePermissions(ctx, { resource: `folder:${folder.id}` })
```

| Need | API |
| --- | --- |
| Gate a handler for the current user | `await requireResourcePermission(ctx, { perm, resource })` throws `AccessDeniedError` |
| One answer, current or another user, or as a Role | `await hasResourcePermission(ctx, { perm, resource, user? \| role? })` |
| A list page: many objects × flags | `await checkResourcePermissions(ctx, { perms, resources, user? \| role? })` returns `result[resource][perm]` |
| Share / unshare | `grantResourcePermission(ctx, { perm, resource, user \| role })` / `revokeResourcePermission(...)`; both are idempotent |
| Object deleted | `revokeAllResourcePermissions(ctx, { resource, perm? })` |
| Who the object is shared with | `listResourceGrants(ctx, { resource, perm?, limit?, offset? })`: `{ type: 'user', userId, perm }` or `{ type: 'role', role, perm }` |
| Objects shared with a user or a Role | `listEffectiveGrantedResources(ctx, { perm, user? \| role?, limit?, offset? })` returns Resource ids |

- Only a Permission declared `perResource: true` can be checked or granted per Resource; any other name throws, as an undeclared one does.
- A Role that holds the Permission grants it for **every** Resource: `hasResourcePermission` is then `true` for any id, and `hasPermission(ctx, perm)` with no Resource is `true` only in that case. A Resource grant never makes `hasPermission` `true`. `listEffectiveGrantedResources` lists Resource grants only, so for an "all I can see" view also ask `hasPermission` and, when it is `true`, show everything.
- A Resource id is a non-empty string of at most 200 characters without control characters. It must be unique within your scope across all your Permissions, so prefix ids of different kinds (`folder:`, `doc:`). The platform knows no hierarchy: pass ancestors in one batch and decide inheritance yourself.
- Subjects: exactly one of `user` (an id or user object of the current account) or `role`, a **full** Role name: your own Roles (`acc:folderAdmin`, `app:<id>:folderAdmin`), a custom Role you created, a shared custom Role (needs `rbac.own.customRoles: read`), a tier such as `system:Staff` (also reaches Admins and Developers through the ladder), or a platform bundle such as `system:DomainsManager`. Not `system:AllowAll`, not another app's Role, not a bare name. A grant to a Role reaches everyone holding a Role that includes it.
- `user` on checks and listings: omit the key for the current user. A key that is present but `undefined` or not a user throws, so a missing variable never becomes a check about the caller. `requireResourcePermission` always checks the current user and rejects `user`; `revokeAllResourcePermissions` rejects `user` and `role`.
- Check as a Role: meant for code that runs with no user in context (a job, a webhook, an anonymous request) but must still restrict what it does as a given Role would be restricted; for a signed-in user, check that user. Pass `role` (a full Role name, the same names as for `grantResourcePermission`) instead of `user` on `hasResourcePermission`, `checkResourcePermissions` or `listEffectiveGrantedResources` to ask what a user holding exactly that one Role, and nothing else, would get: grants to that Role or to a Role it includes (asking as `system:Admin` counts a grant to `system:Staff`), never grants to a user; the checks also count a Permission the Role grants outright. The answer does not depend on who is signed in and works in a request with no user (a job, a webhook, a visitor), e.g. "give callers without a staff account what Staff is granted": `role: 'system:Staff'`. To ask about a tier, name the tier Role: a grant to a tier is not counted when asking as a custom Role or an app's own Role. A Role has no seat, so `requiresSeat` is not applied. Passing both `user` and `role`, or a `role` that is not a non-empty string, throws; a Role that does not exist or cannot be named throws as in `grantResourcePermission`. `requireResourcePermission` rejects `role`.
- A request with no user gets `false` and an empty listing. Unlike `requirePermission`, `requireResourcePermission` does not ask a visitor to sign in: it throws `AccessDeniedError`. Call `requireRealUser(ctx)` first when a visitor should be prompted to sign in. `requiresSeat` applies after a Resource grant as well.
- Limits: at most 50 Permissions and 1000 Resources per check call (an over-cap batch throws even when Roles grant everything). Listings page with `limit` (default 100, max 1000) and `offset`; call again until fewer than `limit` come back. The account has a cap on stored Resource grants; a grant past it throws.
- Grants and revokes apply on the very next check. Checks need no app permission; nothing to cache.
- Cleanup is yours: call `revokeAllResourcePermissions` when you delete the object. Without `perm` it also removes grants of Permissions you no longer declare. The platform removes grants of a deleted user or a deleted custom Role. Grants of an uninstalled app or a removed Permission grant nothing but stay counted against the account cap.

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
- Custom Roles are available in every account; no paid feature gates them.

### Who may call what

Account code is an own-tier caller in the `acc:` scope: it may manage its own Roles, custom Roles it created and Resource grants of its own per-resource Permissions, and every manager-only call (`listRoles`, `listPermissions`, `getUserRoles`, `getGrantBlastRadius`, `listOrphanedReferences`) is denied to it. A plugin must declare app permissions, granted by the installing account:

| App permission | Opens |
| --- | --- |
| `rbac.own.assign: write` | Assign the plugin's own Roles to users; put its own Permissions/Roles into tier Roles and Roles it may target |
| `rbac.own.customRoles: read` / `write` | List shared custom Roles plus its own / create custom Roles **owned** by the plugin, delete them and assign them (with `own.assign`) |
| `rbac.own.resourceGrants: read` / `write` | `listResourceGrants`, `listEffectiveGrantedResources` / grant and revoke Resource grants; own scope's per-resource Permissions only, which no manager key widens |
| `rbac.manager.roles: read` / `write` | The account-wide listings / create **shared** custom Roles and edit tier and shared Roles with any name |
| `rbac.manager.userRoles: read` / `write` | `getUserRoles` / assign any Role, platform bundles included, to users |

Only the owner of an owned custom Role edits its content, even against the manager tier. A shared Role takes content from any plugin with `rbac.own.assign: write` and `rbac.own.customRoles: read`, but only the manager tier grants or deletes it. Request the narrowest tier the feature needs and check each call's typings in `@app/rbac` before relying on edge cases.

Typecheck against the current `@app/rbac` declarations. With the user's permission, verify after publishing that a user holding the Role passes and one without it gets access denied.
