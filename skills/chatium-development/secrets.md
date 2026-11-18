# Secrets

Keep API keys, client secrets, OAuth tokens and TLS client keys in `@app/secrets`, never in source, Heap or settings files. Values are encrypted by the platform and belong to the account the code runs in; an installed app sees only its own secrets there. Server code only: the browser runtime refuses secret references.

```ts
import { deleteSecret, getSecret, secret, secretRef, setSecret } from '@app/secrets'
```

## Modes and allowed hosts

- `readable` ("Code access" on the Secrets page) — server code reads the value with `getSecret(ctx, name)` (null when it does not exist). It takes no `allowedHosts` and no narrowed `allowedIn` (`setSecret` throws). Use it only for a value the code needs as a string: a signing key for an HMAC, a value put into a computed signature. A `secretRef` to it also works, for any host and any place of a request — nothing restricts where it goes.
- `refOnly` ("HTTP requests only") — code never sees the value: `getSecret` throws, the code passes `secretRef(name)` into `@app/request` and the platform substitutes the value right before sending. The default choice for everything that is only sent to an API: private keys, API keys, client secrets, and OAuth tokens too — the code can still replace a token with `setSecret` without being able to read it. Its value is never shown again, neither to the code nor on the Secrets page, and it can't be switched back to `readable`. It is still sent to every allowed host, so whoever manages the secrets decides where it goes.
- `allowedHosts` — where a reference may be sent: exact host names (`api.example.com`) or `*.example.com` for subdomains; empty means nowhere. Checked for every reference, a client certificate included, and on every redirect. A request with references must use `https`, on every redirect too, and can't reach private or loopback addresses.
- `allowedIn` — places of the request a reference may be used in: `url` (`url`, `searchParams`), `header` (headers, `username`, `password`), `body` (`body`, `json`, `form`), `tls` (`https.certificate`, `https.key`); all of them by default. Narrow it to what the secret is for: `['tls']` for a client key, `['header']` for an API token.

`setSecret(ctx, name, value, { mode, allowedHosts, allowedIn })` creates a secret with these options (defaults: `readable`, no hosts, every place; hosts and places only with `mode: 'refOnly'`) or, when it exists, replaces only its value — the other options stay as an admin set them. The replaced value is kept: it can be restored on the Secrets page, the code can't read it. The developer panel page `/app/dev/secrets` is where secrets are created and their values, modes and hosts changed; only the account Owner has it by default, others get it when the Owner assigns them the Secrets manager role. Ask the user to put credentials there rather than pasting them into code or chat.

Whoever may manage secrets and commit code (`system:code:commit`, required by every CLI command) also manages them from the terminal with `chatium secrets` (CLI 3.26.0 or newer): `list`, `log <name>`, `create <name>`, `set <name>`, `settings <name>`, `restore-previous <name>`, `delete <name>`. The CLI never shows a value. `create` and `set` take the value from a hidden prompt, or from a file or stdin with `--value-file <path|->` — never from a command argument. The prompt takes one line, so a certificate or a key goes through `--value-file`:

```sh
chatium secrets create BANK_TOKEN                      # the user types the value, nothing is echoed
chatium secrets create client.key --value-file ./client.key --ref-only --host api.bank.example --allow-in tls
```

Do not ask the user for a secret value in chat and do not write it into a file yourself. Either the user runs `chatium secrets create <name>` in their own terminal, or you run it with `--value-file` on a file the user already has (a downloaded certificate or key). Without a terminal the hidden prompt is unavailable, and `delete`, `restore-previous` and `settings --code-managed` need `--yes`: pass it only when the user asked for that change.

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

Keep the tokens as `refOnly` secrets bound to the API host: the code replaces them with `setSecret` and passes them by reference, and never reads them back. Refresh lazily under a lock; a refresh token that rotates must never be used by two refreshes at once.

```ts
import { request } from '@app/request'
import { getSecret, secret, secretRef, setSecret, type SetSecretOptions } from '@app/secrets'
import { runWithExclusiveLock } from '@app/sync'

const host = 'api.example.com'
const tls = { certificate: secretRef('example.crt'), key: secretRef('example.key') }
// applied when the code creates the secret; an existing one keeps what an admin set
const accessTokenOptions: SetSecretOptions = { mode: 'refOnly', allowedHosts: [host], allowedIn: ['header'] }
const refreshTokenOptions: SetSecretOptions = { mode: 'refOnly', allowedHosts: [host], allowedIn: ['body'] }

/** Makes `secretRef('example.accessToken')` valid for the next minutes */
async function ensureAccessToken(ctx: app.Ctx, force = false): Promise<void> {
  // the lock outlives a slow token call (default maxDurationMs is 30 s)
  await runWithExclusiveLock(ctx, 'example.oauth', { timeoutMs: 30_000, maxDurationMs: 70_000 }, async ctx => {
    // not a secret: a time the code compares, kept next to the tokens
    const expiresAt = Number((await getSecret(ctx, 'example.expiresAt')) ?? 0)
    if (!force && Date.now() < expiresAt - 5 * 60_000) return

    const { body: tokens } = await request<{ access_token: string; refresh_token?: string; expires_in: number }>({
      url: `https://${host}/oauth/token`,
      method: 'post',
      https: tls,
      form: {
        grant_type: 'refresh_token',
        refresh_token: secretRef('example.refreshToken'),
        client_id: (await getSecret(ctx, 'example.clientId'))!,
        client_secret: secretRef('example.clientSecret'),
      },
      responseType: 'json',
    })
    // The rotated refresh token first: it can't be obtained again if a later write fails. A provider that does not
    // rotate echoes the old one, which the platform hides as `[secret]`: keep the stored one then.
    if (tokens.refresh_token && tokens.refresh_token !== '[secret]') {
      await setSecret(ctx, 'example.refreshToken', tokens.refresh_token, refreshTokenOptions)
    }
    await setSecret(ctx, 'example.accessToken', tokens.access_token, accessTokenOptions)
    await setSecret(ctx, 'example.expiresAt', String(Date.now() + tokens.expires_in * 1000))
  })
}

async function listItems(ctx: app.Ctx) {
  await ensureAccessToken(ctx)
  return request({
    url: `https://${host}/v1/items`,
    https: tls,
    headers: { Authorization: secret`Bearer ${secretRef('example.accessToken')}` },
    responseType: 'json',
  })
}
```

- The new tokens come in a response, so the code sees each of them once, before it stores them. After that nothing reads them: not the code of a later request, not the Secrets page.
- A response that echoes a referenced secret carries `[secret]` in its place. Never store a value equal to `[secret]`.
- Use `readable` only where the code computes with the value (an HMAC signing key). `example.clientId` and `example.expiresAt` above are readable because they are not secret.
- Retry a `401` once after `ensureAccessToken(ctx, true)`. If the refresh token can expire from disuse, keep it alive with a self-rescheduling [job](jobs.md) that calls `ensureAccessToken`.
- The initial token pair comes from the provider's authorization flow or its admin console. Store it with a one-off authorized route that calls `setSecret` with the options above, or with `chatium secrets create example.refreshToken --ref-only --host api.example.com --allow-in body --code-managed`; never in source. A secret created on the Secrets page or by the CLI is admin-only unless made code-managed, and then `setSecret` throws. Client keys and secrets the code never rewrites stay admin-only.
