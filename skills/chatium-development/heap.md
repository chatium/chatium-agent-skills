# Heap tables and values

## Table definition

Define backend tables in `tables/*.table.ts`, with one table per entity. Give tables a title and description, and every field (including nested fields) a `customMeta.title` in the project's language. System `id`, `createdAt`, and `updatedAt` fields already exist.

Use a distinct registered name for a new table, such as `t_items_B5CA`. Preserve an existing table's registered name: changing it selects a different table.

```ts
// tables/items.table.ts
import { Heap } from '@app/heap'

const Items = Heap.Table('t_items_B5CA', {
  title: Heap.String({ customMeta: { title: 'Title' } }),
  status: Heap.Enum(
    { draft: 'draft', active: 'active', archived: 'archived' } as const,
    { customMeta: { title: 'Status' } },
  ),
  price: Heap.Money({ customMeta: { title: 'Price' } }),
}, { customMeta: { title: 'Items', description: 'Items with a price and publication state' } })

export default Items
```

This table supports the write, Money, publication, and job examples. Choose fields for the actual entity. Import it with a relative path ending in `.table`, without the final `.ts`.

`typeof Items.T` is the backend row type; `typeof Items.JsonT` is its JSON form. Enum values are stored, not the object's keys when those differ; `as const` preserves their literal types.

For other fields, use `Heap.Number(...)`, `Heap.Boolean(...)`, `Heap.DateTime(...)`, `Heap.Object(...)`, or `Heap.Array(itemSchema, options)`. Use `Heap.Any(...)` for intentionally unstructured data. Wrap optional fields in `Heap.Optional(...)` and handle absence in existing rows. For nested objects/arrays, put titles on both the container and its child schemas. Search settings are [opt-in field metadata](heap-filter.md#indexed-search).

## Record operations

Each method takes `ctx` first. IDs are strings; handler input placement follows [routing.md](routing.md#route-convention-and-inputs).

| Operation | Result |
| --- | --- |
| `Table.create(ctx, fields)` | Created row with ID |
| `Table.findById(ctx, id)` | Row or `null` |
| `Table.getById(ctx, id)` | Row; throws if missing |
| `Table.findOneBy(ctx, where)` | Matching row or `null` |
| `Table.findAll(ctx, options)` | Bounded list |
| `Table.update(ctx, { id, ...patch })` | Updated row; throws if missing |
| `Table.delete(ctx, id)` | Deleted row or `null` |
| `Table.createOrUpdateBy(ctx, key, fields)` | Matched or created row |

Enforce [access checks](auth.md#access-checks) before protected reads and writes. Keep explicit creation and editing separate as described in the [editing flow](routing.md#editing-flow).

For one-off inspection or seed, use [`chatium exec`](exec.md#data-inspection-and-seed) with a table already defined in committed application source.

## Money and serialization

Import `Money` from `@app/heap`. It uses major currency units: `new Money(12.50, 'USD')`. Choose the application's currency. Arithmetic returns new values: `.add(other)`, `.substract(other)` (the API spelling), `.multiply(number)`, and `.divide(number)`; addition/subtraction require matching currencies.

When an external API supplies minor units, convert them to the currency's major units using that API's currency scale before constructing Money; dividing by 100 is not a universal conversion.

Format Money on the server. Send `priceFormatted` for display and a plain numeric `price` for editing; Vue does not need to reconstruct Money. This helper uses the Items table above:

```ts
// server/item-data.ts
import Items from '../tables/items.table'

export function toItemData(ctx: app.Ctx, item: typeof Items.T) {
  return {
    id: item.id,
    title: item.title,
    status: item.status,
    price: item.price.amount,
    priceFormatted: item.price.format(ctx),
  }
}
```

`format(ctx, { minimumFractionDigits: 2, maximumFractionDigits: 2 })` controls precision. Return only fields needed by callers. Backend class methods do not survive JSON serialization; DateTime fields and system timestamps are `Date` objects on the backend and strings in JSON. Write DateTime values as `Date` and use `.getTime()` for in-memory date comparisons.

## Optional record links

When an entity needs categories, define the target table and an optional link. These tables are independent of the Items example:

```ts
// tables/categories.table.ts
import { Heap } from '@app/heap'

export default Heap.Table('t_categories_G2AS', {
  name: Heap.String({ customMeta: { title: 'Name' } }),
}, { customMeta: { title: 'Categories', description: 'Article categories' } })
```

```ts
// tables/articles.table.ts
import { Heap } from '@app/heap'
import Categories from './categories.table'

export default Heap.Table('t_articles_C7DA', {
  title: Heap.String({ customMeta: { title: 'Title' } }),
  category: Heap.Optional(Heap.RefLink(Categories, { customMeta: { title: 'Category' } })),
}, { customMeta: { title: 'Articles', description: 'Categorized articles' } })
```

`Heap.RefLink` accepts the target table or its registered name. On create/update, supply the target ID string. On the backend a populated link has `.id`, `.get(ctx)`, `.getTitle(ctx)`, and `.getTargetTableRepo(ctx)`. Check an optional link before dereferencing it; `.get(ctx)` throws for a missing target, while `.get(ctx, { nonStrict: true })` returns `null`:

```ts
// server/article-category.ts
import Articles from '../tables/articles.table'

export async function getArticleCategory(ctx: app.Ctx, articleId: string) {
  const article = await Articles.findById(ctx, articleId)
  return article?.category ? article.category.get(ctx, { nonStrict: true }) : null
}
```

`Heap.UserRefLink({ customMeta: { title: 'Owner' } })` links to a system user and follows the same ID/runtime-link distinction. Links serialize to ID strings. For multiple rows use [batch loading](heap-filter.md#batch-loading-links); system user lookup APIs are in [auth.md](auth.md#users-and-identities).
