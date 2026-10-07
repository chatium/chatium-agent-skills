# Cryptography

Backend application code has no Node.js `crypto` builtin. Use the installed `@npm/node-forge` package for hashes, signatures, keys, and encryption.

```ts
import * as forge from '@npm/node-forge'

export function sha256(value: string) {
  return forge.md.sha256.create().update(value, 'utf8').digest().toHex()
}
```

Use the project's available typings for algorithms and input formats. Keep secrets in the platform's secret/config mechanism rather than application source.
