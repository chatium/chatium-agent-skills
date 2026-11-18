# Secrets

Keep API keys, client secrets, OAuth tokens and TLS client keys in `@app/secrets`, never in source, Heap or settings files. Values are encrypted by the platform and belong to the account the code runs in; an installed app sees only its own secrets there. Server code only: the browser runtime refuses secret references.

```ts
import { deleteSecret, getSecret, secret, secretRef, setSecret } from '@app/secrets'
```

## Modes and allowed hosts

- `readable` ("Code access" on the Secrets page) — server code reads the value with `getSecret(ctx, name)` (null when it does not exist).
- `refOnly` ("HTTP requests only") — code never sees the value: `getSecret` throws, the code passes `secretRef(name)` into `@app/request` and the platform substitutes the value right before sending. Use it for private keys and long-lived credentials. Its value is never shown again, neither to the code nor on the Secrets page, and it can't be switched back to `readable`. It is still sent to every allowed host, so whoever manages the secrets decides where it goes.
- `allowedHosts` — where a reference may be sent: exact host names (`api.example.com`) or `*.example.com` for subdomains; empty means nowhere. Checked for every reference, a client certificate included, and on every redirect. A request with references must use `https`, on every redirect too, and can't reach private or loopback addresses.
- `allowedIn` — places of the request a reference may be used in: `url` (`url`, `searchParams`), `header` (headers, `username`, `password`), `body` (`body`, `json`, `form`), `tls` (`https.certificate`, `https.key`); all of them by default. Narrow it to what the secret is for: `['tls']` for a client key, `['header']` for an API token.

`setSecret(ctx, name, value, { mode, allowedHosts, allowedIn })` creates a secret with these options (defaults: `readable`, no hosts, every place) or, when it exists, replaces only its value — the other options stay as an admin set them. The replaced value is kept: it can be restored on the Secrets page, the code can't read it. The developer panel page `/app/dev/secrets` is where secrets are created and their values, modes and hosts changed; only the account Owner has it by default, others get it when the Owner assigns them the Secrets manager role. Ask the user to put credentials there rather than pasting them into code or chat.

A secret an admin marks "Only admin changes" (on by default for secrets created on that page) can still be read or referenced per its mode, but `setSecret` and `deleteSecret` throw. A token the code refreshes must be a secret the code may change: either the code creates it, or the admin unticks that box.

## References in requests

`secretRef(name)` is accepted in place of any string in `@app/request` options: `url`, header values, `searchParams`, `json` and `form` values, `body`, `username`, `password`, `https.certificate`, `https.key`. The `secret` tagged template builds a string with secrets inside.

```ts
import { request } from '@app/request'
import { secret, secretRef } from '@app/secrets'

const response = await request({
  url: 'https://api.example.com/v1/items',
  headers: { Authorization: secret`Bearer ${secretRef('example.accessToken')}` },
  responseType: 'json',
})
```

A missing secret, a place outside its `allowedIn` or a host outside its `allowedHosts` fails the request. Values never reach the code: if the server echoes one back, the response URL, headers, body and errors carry `[secret]` instead (a JSON body stays valid JSON). A request with references can't set a response `encoding` other than UTF-8.

Limits: a name is 1–128 characters of `A-Z a-z 0-9 _ . -`; a value is 1 to 65 536 characters; an app (or the account's own code) holds at most 200 secrets. A `secret` template may contain another `secret` template.

## Mutual TLS with a PKCS#12 certificate

`https.certificate` and `https.key` take PEM. Convert a `.p12` container once, outside Chatium, and store both parts as `refOnly` secrets with the API host in `allowedHosts`:

```sh
openssl pkcs12 -in client.p12 -clcerts -nokeys -out client.crt
openssl pkcs12 -in client.p12 -nocerts -nodes -out client.key
```

Add `-legacy` to both commands when OpenSSL 3 refuses an old container. Server certificates must chain to a root the platform trusts; report a TLS verification error to the user instead of disabling verification.

```ts
const tls = { certificate: secretRef('bank.crt'), key: secretRef('bank.key') }
await request({ url: 'https://api.example.com/statement', https: tls, responseType: 'json' })
```

## Refreshing OAuth tokens

Refresh lazily under a lock and store the new pair with `setSecret`; a refresh token that rotates must never be used by two refreshes at once.

```ts
import { request } from '@app/request'
import { getSecret, secretRef, setSecret } from '@app/secrets'
import { runWithExclusiveLock } from '@app/sync'

const tls = { certificate: secretRef('example.crt'), key: secretRef('example.key') }

async function accessToken(ctx: app.Ctx): Promise<string> {
  // the lock outlives a slow token call (default maxDurationMs is 30 s)
  return runWithExclusiveLock(ctx, 'example.oauth', { timeoutMs: 30_000, maxDurationMs: 70_000 }, async ctx => {
    const expiresAt = Number((await getSecret(ctx, 'example.expiresAt')) ?? 0)
    if (Date.now() < expiresAt - 5 * 60_000) return (await getSecret(ctx, 'example.accessToken'))!

    const tokens = await request<{ access_token: string; refresh_token: string; expires_in: number }>({
      url: 'https://api.example.com/oauth/token',
      method: 'post',
      https: tls,
      form: {
        grant_type: 'refresh_token',
        refresh_token: (await getSecret(ctx, 'example.refreshToken'))!,
        client_id: (await getSecret(ctx, 'example.clientId'))!,
        client_secret: secretRef('example.clientSecret'),
      },
      responseType: 'json',
      resolveBodyOnly: true,
    })
    // the rotated refresh token first: it is the one that can't be obtained again if a later write fails
    await setSecret(ctx, 'example.refreshToken', tokens.refresh_token)
    await setSecret(ctx, 'example.accessToken', tokens.access_token)
    await setSecret(ctx, 'example.expiresAt', String(Date.now() + tokens.expires_in * 1000))
    return tokens.access_token
  })
}
```

- Tokens returned by a response are visible to the code anyway, so they are `readable` secrets.
- Retry a `401` once after a forced refresh. If the refresh token can expire from disuse, keep it alive with a self-rescheduling [job](jobs.md) that calls `accessToken`.
- The initial token pair comes from the provider's authorization flow or its admin console; store it through the admin page (untick "Only admin changes" for the tokens) or a one-off authorized route, never in source. Client keys and secrets the code never rewrites stay admin-only.
