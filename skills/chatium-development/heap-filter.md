# Heap queries

Use the [Items table](heap.md#table-definition) for the examples below. All queries run on the backend.

## Filters and pagination

`findAll(ctx, { where, order, limit, offset })` supports:

- Scalars for equality; arrays of scalars for matching any listed value.
- `$lt`, `$lte`, `$gt`, and `$gte` where supported by the field type.
- `{ title: { $ilike: '%vue%' } }` for case-insensitive pattern matching; `%` and `_` are wildcards.
- `$and`, `$or`, and `$not` to combine conditions.
- ID strings or arrays of IDs for record/user link filters.

Use an explicit limit and stable order, for example `[{ createdAt: 'desc' }, { id: 'asc' }]`. Results are capped at 1000 records: requesting more throws; an omitted limit can truncate results and log a warning. Offset pagination does not freeze concurrent changes. Use `countBy(ctx, where)` for totals.

## Public and administrative reads

Keep the same access conditions in public list and detail reads, including any visibility or ownership conditions in the existing application. Administrative reads must include manageable drafts and enforce access themselves. In this example `active` means published; an existing schema with an additional `isPublic` flag also requires that flag in public reads.

```ts
// server/item-reads.ts
import { requireAccountRole } from '@app/auth'
import Items from '../tables/items.table'
import { toItemData } from './item-data'

const published = { status: 'active' } as const

export async function listPublicItems(ctx: app.Ctx, offset = 0) {
  const rows = await Items.findAll(ctx, {
    where: published, limit: 50, offset,
    order: [{ createdAt: 'desc' }, { id: 'asc' }],
  })
  return rows.map(row => toItemData(ctx, row))
}

export async function getPublicItem(ctx: app.Ctx, id: string) {
  const row = await Items.findOneBy(ctx, { ...published, id })
  return row ? toItemData(ctx, row) : null
}

export async function listAdminItems(ctx: app.Ctx, offset = 0) {
  requireAccountRole(ctx, 'Staff')
  const rows = await Items.findAll(ctx, {
    limit: 50, offset, order: [{ createdAt: 'desc' }, { id: 'asc' }],
  })
  return rows.map(row => toItemData(ctx, row))
}

export async function getAdminItem(ctx: app.Ctx, id: string) {
  requireAccountRole(ctx, 'Staff')
  return toItemData(ctx, await Items.getById(ctx, id))
}
```

The helper `toItemData` is defined in [Money and serialization](heap.md#money-and-serialization). Call only the needed helpers from [validated routes](routing.md#route-convention-and-inputs); validate request offsets with `s.number().int().min(0)`. Keep public and administrative API handlers separate.

## Indexed search

Enable field searchability only when requested. For full-text search, add `searchable: { langs: ['en'] }` to the relevant `Heap.String` options. Choose supported languages for the actual data, such as `en` or `ru`; add `embeddings: true` only when semantic search is needed.

`Table.searchBy(ctx, { query, embeddingsQuery?, where?, limit? })` returns matching rows. `query` is required and follows PostgreSQL `websearch_to_tsquery` syntax; `embeddingsQuery` needs configured field embeddings. Include the same access filter used by other reads and serialize returned values for callers. `$ilike` does not require these search settings.

## Aggregations

For grouped data, use `Table.select({ alias: expression }).where(...).group([...aliases]).run(ctx)`. For example, a Staff-only backend summary can use:

```ts
// server/item-counts.ts
import { requireAccountRole } from '@app/auth'
import Items from '../tables/items.table'

export async function countItemsByStatus(ctx: app.Ctx) {
  requireAccountRole(ctx, 'Staff')
  return Items.select({ status: 'status', count: { $count: ['id'] } })
    .group(['status'])
    .run(ctx)
}
```

Expressions use column names or field-path arrays. Aggregates include `$count`, `$sum`, `$avg`, `$min`, and `$max`; `$count` accepts `$distinct: true`. Other expressions include `$abs`, `$ceil`, `$floor`, `$coalesce`, and `$concat`; use `$dyn` for literal values. The result is an array of rows and is subject to the query limit even when aggregation covers more source records.

## Batch loading links

For linked rows, collect distinct IDs, query the target table once, and join by ID. Handle both an absent link and a missing target. This Staff-only example uses the [Articles and Categories tables](heap.md#optional-record-links):

```ts
// server/articles-with-categories.ts
import { requireAccountRole } from '@app/auth'
import Articles from '../tables/articles.table'
import Categories from '../tables/categories.table'

export async function listArticlesWithCategories(ctx: app.Ctx) {
  requireAccountRole(ctx, 'Staff')
  const articles = await Articles.findAll(ctx, { limit: 50, order: [{ id: 'asc' }] })
  const ids = [...new Set(articles.flatMap(a => a.category ? [a.category.id] : []))]
  const categories = ids.length
    ? await Categories.findAll(ctx, { where: { id: ids }, limit: 50 })
    : []
  const byId = new Map(categories.map(category => [category.id, category.name]))
  return articles.map(article => ({
    id: article.id,
    title: article.title,
    categoryName: article.category ? byId.get(article.category.id) ?? null : null,
  }))
}
```

For user links, batch with `findUsersByIds(ctx, ids)` from `@app/auth` and key by user ID. Keep each batch within the query limit.
