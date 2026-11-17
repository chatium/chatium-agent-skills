# Left menu settings through `@store/sdk`

Use `getMenuSettings`, `saveMenuSettings`, and `resetMenuSettings` from
`@store/sdk` to configure the account's left menu and application menu. They
work in account/Workspace server code and in [chatium exec](exec.md). Store must
be installed and its current SDK typings must export these methods. Plugin
callers are rejected with `STORE_MENU_ACCOUNT_CALLER_REQUIRED`.

## Choose the profile

All three methods require the current real `Admin`, `Developer`, or `Owner`.
Use the injected `ctx`; never impersonate the employee or accept a supplied
role as authority for that employee.

| Target | Argument |
| --- | --- |
| Current user's personal menu | Omit the target or pass `{ scope: 'user' }` |
| A particular real Staff+ employee | `{ scope: 'user', userId: 'actual-user-id' }` |
| Everyone with an exact account role | `{ scope: 'role', role: 'staff' }` |

Role keys are lowercase: `owner`, `developer`, `admin`, `staff`, `client`.
Admin can manage Admin/Staff/Client role profiles and Admin/Staff employees;
Developer can also manage Developer; Owner can manage all roles and Staff+
employees. Personal Client and bot menus are unsupported. Staff cannot invoke
these settings methods themselves. An employee's actual current role is
determined by the SDK. Use a known user ID or resolve the intended employee
through the public user APIs; do not guess IDs from names.

Personal settings override the role profile as a complete menu. A change to
the role profile affects only users without a personal override. Profiles are
specific to an exact role: a change in the employee's role selects that role's
profile. `resetMenuSettings(ctx, target)` immediately removes that profile's
override: a personal menu inherits its role; a role menu inherits defaults.

## Read, change, verify

Read before a mutation. `settings.snapshot` is the full editable configuration;
`settings.items` is the effective tree; `catalog` lists available items, including
`appSections`; `icons` supplies valid icon keys. Use IDs from that response.
`source` is `system`, `account`, or `personal`. `settings.target` identifies
the actual role/user read.

`saveMenuSettings(ctx, { target, snapshot, items?, updates? })` replaces the whole
profile. Spread the returned snapshot and change only requested fields,
preserving application menu settings and existing hidden sections. Do not
reconstruct a snapshot from the visible tree: temporarily unavailable entries
may still be configured. Concurrent saves use the last saved profile.

Example: rename a selected item in the Staff role menu. Substitute an item ID
actually returned by `getMenuSettings`; run from the intended account checkout.

```sh
chatium exec <<'EOF'
import { getMenuSettings, saveMenuSettings } from '@store/sdk'

const target = { scope: 'role' as const, role: 'staff' as const }
const settings = await getMenuSettings(ctx, target)
const entry = settings.snapshot.entries.find(item => item.itemId === 'actual-item-id')
if (!entry) throw new Error('Requested menu item is not configured')
const result = await saveMenuSettings(ctx, {
  target,
  snapshot: {
    ...settings.snapshot,
    entries: settings.snapshot.entries.map(item =>
      item.itemId === entry.itemId ? { ...item, titleAlias: 'Рабочие задачи' } : item
    )
  }
})
return { target: result.settings.target, items: result.settings.items, warnings: result.warnings }
EOF
```

For an employee, use `{ scope: 'user', userId }` with the same read/save flow.
The change takes effect immediately; existing pages show it after reloading.
Check the returned `settings` and `warnings`; after a timeout or failure, read
the target again before retrying, especially when creating custom items.

## Snapshot and custom items

- `entries`: `{ itemId, parentId: 'root' | folderId, position, titleAlias? }`.
  Position determines order within the parent. Folders support one level.
- `hiddenItemIds`: hidden items and application sections. Removing an entry
  and hiding it are different: set both deliberately when hiding a default item.
- `appMenuOrder`: at most three `{ type: 'item', itemId }`, followed by fixed
  `{ type: 'system', id: 'chats' }` and `{ type: 'system', id: 'profile' }`.
  Preserve `appMenuItemIds` and `appMenuItemOverrides` unless changing this menu.
- `appMenuItemOverrides`: per-item `{ titleAlias?, iconKey? }` for application
  menu labels/icons. They do not rename the left menu.

Create folders, links and Workspace items in the same save with `items`.
Give each a unique `tempId` matching `draft:[a-z0-9:-]+` and reference it from
the snapshot, including child `parentId`. The response's `itemIdMap` maps these
temporary IDs to permanent IDs; use the permanent IDs on later saves.

```ts
const result = await saveMenuSettings(ctx, {
  target: { scope: 'user', userId },
  snapshot: {
    ...settings.snapshot,
    entries: [
      ...settings.snapshot.entries,
      { itemId: 'draft:reports', parentId: 'root', position: 1000 },
      { itemId: 'draft:report', parentId: 'draft:reports', position: 0 }
    ]
  },
  items: [
    { tempId: 'draft:reports', kind: 'group', title: 'Отчёты', iconKey: 'folder' },
    { tempId: 'draft:report', kind: 'link', title: 'Продажи', iconKey: 'link',
      target: { type: 'url', href: '/reports/sales', openIn: 'same-tab' } }
  ]
})
```

`updates` edits an existing custom item by `itemId`, with `kind`, `title`,
optional `iconKey` and `target`. Personal items belong to the selected employee
and role; another profile cannot edit them. A custom item reused by multiple
role menus changes wherever that item is used; prefer entry `titleAlias` for
a label specific to one profile.

Workspace targets use `{ type: 'workspace', resultHref, editorHref,
view: 'result' | 'editor', openIn: 'same-tab' | 'new-tab' }`. Obtain ready URLs
from the public Start workspace list. Do not pass file IDs or invent source
paths. Menu visibility does not grant access to the destination page.

Limits: 500 entries, 500 hidden IDs, 50 custom creations/updates per save.
Folders and items marked `menuAvailability: 'web'` cannot be application tabs;
items marked `app` cannot enter the left menu. Application sections stay under
their application: hide/show them by stable ID, do not move them into entries.
`dormant-menu-items` warnings list unavailable IDs kept for later recovery;
they do not prove that these items are visible or accessible.
