# Store plugin installation

Use the public `@store/sdk` methods from `chatium exec` in a Source Git account. Both methods require an Admin user and an account-code caller. Installation is an account mutation that can grant the plugin access to account data; a general request to inspect or debug an account does not authorize it.

```ts
import { getPluginInstallInfo, installPlugin } from '@store/sdk'

const preview = await getPluginInstallInfo(ctx, 'plugin-slug')
return preview
```

`getPluginInstallInfo(ctx, slug)` returns `{ slug, title, installed, paymentRequired, storeUrl, displayPermissions, permissions }`. `displayPermissions` matches the short permission list in the Store installation UI. It includes account data, account settings, authorization, translations, user data, events, and storage when declared. It omits technical categories such as account/global apps, child accounts, hooks, and feeds. `permissions` still lists **all** declared permission paths and their exact access modes, including optional modes. Show the short list when explaining an installation, and use the full list when the user asks for detail or a security review.

When the user has authorized installation, run:

```ts
import { installPlugin } from '@store/sdk'

return await installPlugin(ctx, 'plugin-slug')
```

`installPlugin(ctx, slug)` accepts published, available plugins. It returns `{ status, plugin, userMessage, requiresUserNotification, warning? }`. For a free plugin, `status` is `installed`, `already_installed`, or `installed_with_warnings`; `plugin.permissions` is read again after a new installation. For a paid plugin, it returns `status: 'checkout_required'` and a top-level `storeUrl`. Nothing is installed in that case. Do not call `installPlugin` for a plugin the user has not asked to install.

**After every call, tell the user what happened.** Include `userMessage` in the final response, or convey its full meaning in the user's language. For `checkout_required`, state that the plugin is paid, was not installed, and that the user needs to install it themselves; link to `storeUrl`. For an installed plugin, include the short Store permission summary. The message notes how many entries the full list contains; do not present the short list as exhaustive. If `warning` is present, report it too. Do not quietly install a plugin or reduce the disclosure to “done.” The SDK flag is a reminder; the agent's response is what informs the user.

The permission list represents the application's declared `permissionRequirements`, not an independent audit of its behavior. An empty list means it declares no additional permissions. For `read-optional`, `write-optional`, and `write-or-read`, preserve the exact mode instead of claiming a stronger right was granted.

The SDK raises `STORE_PLUGIN_NOT_AVAILABLE` for an unlisted/unavailable plugin and `STORE_PLUGIN_PERMISSIONS_UNAVAILABLE` when its permission metadata cannot be verified. It also rejects malformed slugs and non-account callers. A paid plugin is a normal `checkout_required` result, not an exception. If execution times out or errors after installation may have started, inspect with `getPluginInstallInfo` before retrying; the first call may already have installed it. Report any unverified outcome to the user.
