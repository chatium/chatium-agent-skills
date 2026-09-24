# Authentication and users

## Access checks

Use `@app/auth` to enforce access before protected reads or mutations. A page or client-side check does not protect the API handler.

| Need | API |
| --- | --- |
| Require a signed-in real user | `requireRealUser(ctx)` returns the user or raises an authentication error |
| Intentionally support anonymous user-owned data | `await requireAnyUser(ctx)` returns or creates a user/session |
| Require a minimum account role | `requireAccountRole(ctx, 'Staff')` or `'Admin'` |
| Follow workspace/file permissions | `app.use(checkFilePermissions())`, importing the middleware from `@app/auth` |
| Decide whether to show a control | `ctx.user?.is('Staff')` or `.is('Admin')` |

Account roles are `None`, `Staff`, `Admin`, `Developer`, and `Owner`; user types are `Anonymous`, `Real`, and `Bot`. The presence of `ctx.user` alone does not establish a real sign-in. Derive ownership from the authenticated user; client-supplied IDs or roles are not authority.

For a public read with optional personalization, inspect the existing `ctx.user`; if absent, return the public/unpersonalized result without creating a user or session via `requireAnyUser`. This exception does not apply to protected reads, which still require authorization and ownership checks.

## Profile updates

Require a real user on a profile page. Pass the requested profile data to Vue or read existing fields from `ctx.user`. For a profile form, include first/last name editing; add avatar editing only when requested.

```ts
// api/profile/save.ts
import { requireRealUser } from '@app/auth'

export const profileSaveRoute = app.post('/')
  .body(s => ({ firstName: s.string(), lastName: s.string() }))
  .handle(async (ctx, req) => {
    const user = requireRealUser(ctx)
    await user.updateExtendedInfo(ctx, {
      firstName: req.body.firstName,
      lastName: req.body.lastName,
    })
    return { success: true }
  })
```

Use `updateExtendedInfo` for supported system fields, including names and image metadata. System profile fields, confirmed identities, account role, and user type already belong to the platform user. Store only additional application fields in an application table. Self-service updates always target the current user; application roles need their own protected authorization policy.

Display confirmed contacts through `ctx.user.confirmedPhone` and `ctx.user.confirmedEmail`. Contact changes and confirmation belong to the identity/authentication flow, not `updateExtendedInfo` or an ordinary profile form.

For avatars, obtain the stored hash through the [upload flow](storage.md#upload-flow), validate the submitted value in the profile handler, and update `{ imageHash }` on the current user.

## Sign-in and sign-out

Link to an existing protected page through its RouteRef; `requireRealUser` lets Chatium initiate authentication. For an explicit modern-auth sign-in link, use `/s/auth/signin?back=<encoded-local-path>`. Given an exported profile page reference, the target is `encodeURIComponent(profileRoute.path())`; chain `.query(...)` before `.path()` when needed.

Unless the task specifies another destination, return after sign-in to the local page that initiated it, preserving its query parameters. Use that page's RouteRef for a known destination; validate a supplied return path as local before using it, never accepting an arbitrary external redirect.

Sign-out is a browser POST to `/s/auth/sign-out`. Check its response before reloading or updating UI. Chatium manages sessions and cookies; these platform endpoints are separate from [application RouteRefs](routing.md#route-references).

## Users and identities

Read this section for account-user lookup or provisioning. These `@app/auth` backend APIs need authorization appropriate to the target user and returned data.

| Need | API |
| --- | --- |
| Required / optional lookup | `getUserById(ctx, id)` / `findUserById(ctx, id)`; missing means throw / `null` |
| Batch users | `findUsersByIds(ctx, ids)` |
| Search users | `findUsers(ctx, { where, limit, offset })` |
| Search phone/email identities | `findIdentities(ctx, { where, limit, offset })` |
| Normalize an identity key | `normalizeIdentityKey(type, value)` |
| Provision a real / bot user | `createRealUser(ctx, info)` / `createOrUpdateBotUser(ctx, username, info)` |
| Add an unconfirmed identity | `createUnconfirmedIdentity(ctx, { userId, type, key })` |

User filters include `type`, `accountRole`, `username`, and `fuzzyText` inside `where`. For email/phone, use identity type `Email` or `Phone`, query identities by `{ type, key: normalizedValue }`, then use their `userId`. Normalize keys before provisioning too, reuse existing identities, and handle duplicate-identity errors. An unconfirmed identity does not prove ownership of an address.

When provisioning a real user with contacts, pass normalized values in `info.unconfirmedIdentities`, for example `{ Email: normalizedEmail }`. Bot users represent service identities, not a replacement for authenticating a person.
