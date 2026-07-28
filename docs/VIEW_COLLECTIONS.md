# View Collections

A PocketBase **view collection** is read-only: its rows come from a SQL `SELECT` rather than from
stored records. Views are the way to answer a question once in the database instead of issuing N
queries per page from the client — "how many projects does each user own", "which entities are
attached to this media".

`defineView()` lets you keep the SQL next to the Zod shape in a single schema file, and
`pocketbase-migrate generate` turns it into a migration like any other collection.

## Defining a view

```typescript
import { z } from 'zod';
import { baseSchema, defineView, sql } from 'pocketbase-zod-schema';

export const ProjectStatsSchema = z
  .object({
    OwnerUser: z.string(),
    projectCount: z.number(),
  })
  .extend(baseSchema);

export default defineView({
  collectionName: 'ProjectStats',
  schema: ProjectStatsSchema,
  viewQuery: sql`
    SELECT p.OwnerUser AS id,
           p.OwnerUser AS OwnerUser,
           COUNT(*)    AS projectCount
      FROM Projects p
     GROUP BY p.OwnerUser
  `,
  permissions: {
    listRule: 'OwnerUser = @request.auth.id',
    viewRule: 'OwnerUser = @request.auth.id',
  },
});
```

| Option | Required | Notes |
| --- | --- | --- |
| `collectionName` | yes | Name of the PocketBase collection |
| `schema` | yes | Zod shape of a row — drives TypeScript types, not the migration |
| `viewQuery` | yes | The SQL `SELECT`; use the `sql` tag |
| `permissions` | no | `listRule` and `viewRule` only; both default to `null` (superusers only) |

`defineCollection({ type: 'view', viewQuery })` is equivalent, but `defineView()` turns the
constraints below into compile errors rather than runtime failures.

### The `sql` tag

`sql` is a tagged template that interpolates values, strips the common leading indentation, and
trims blank leading/trailing lines. It returns a plain string, so a normal string literal works
too. Two benefits:

- Most editors syntax-highlight `` sql`…` `` template literals.
- Re-indenting a query in your source file does not produce a migration — the tool compares
  queries with whitespace normalized.

## What the Zod schema is (and isn't) for

PocketBase derives a view's fields by **running the query** when the collection is saved. So:

- The generated migration contains no `fields` array and no `indexes` — only the query.
- The Zod schema drives `generate-types` and any client-side parsing you do. It is never compared
  against the database, so a mismatch between the schema and the columns your SQL selects will not
  be caught at generate time — it shows up as a missing property at runtime.
- Generated view types omit `created`/`updated`, because a view only has the columns its query
  selects. If your query selects them, add them to your Zod schema.
- Relation `expand` does not cross a view, so view types have no `expand` block. Embed what you
  need in the query instead.

## Rules PocketBase places on view queries

These come from PocketBase itself; getting them wrong means the migration fails to apply:

- **The outermost `SELECT` must expose an `id` column**, and it should be unique per row —
  PocketBase uses it as the record id.
- **Select relation columns bare from the outer table** (`p.OwnerUser AS OwnerUser`). That is what
  makes PocketBase infer a real `relation` field, which API rules can then traverse
  (`OwnerUser.someField = …`). Wrapping the outer select in a subquery degrades every column to
  `json` and the rule stops working.
- **No top-level `UNION`** — PocketBase's view parser rejects it. Put unions inside a subquery.
- **No indexes.** `defineView()` has no `indexes` option; declaring them elsewhere is an error.
- **No write rules.** `createRule`, `updateRule`, `deleteRule` and `manageRule` are always `null`.
  PocketBase rejects writes to a view with `Unsupported collection type`.

## Changing a view

Edit the SQL and re-run `generate`. The migration updates the query in place, so the collection id
stays stable and anything referencing it keeps working:

```javascript
migrate((app) => {
  const collection_ProjectStats_viewQuery = app.findCollectionByNameOrId("pb_…") // ProjectStats;
  unmarshal({
    "viewQuery": `
      SELECT …new…
    `,
  }, collection_ProjectStats_viewQuery)
  return app.save(collection_ProjectStats_viewQuery);
}, (app) => { /* restores the previous query */ });
```

The update uses `unmarshal()` rather than `collection.viewQuery = …`. PocketBase stores
`viewQuery` on an embedded struct, and a direct property assignment from the migration runtime is
silently dropped — the migration would report success and change nothing.

Deleting a view is **not** treated as a destructive change: a view stores no data, so removing one
does not require `--force`.

## Reading from a view

Views are ordinary read-only collections over the API, so the generated `TypedPocketBase` covers
them:

```typescript
const stats = await pb.collection('ProjectStats').getFullList();
//    ^? ProjectStatsResponse[]
```

For a JSON column produced by `json_group_array` / `json_object`, PocketBase returns it as a
parsed value, but defensive parsing is worth it when the shape matters:

```typescript
export function projectStatsOf(value: unknown): ProjectStats[] {
  let raw = value;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const parsed = ProjectStatsSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}
```

## Worked example

`package/src/schema/projectStats.ts` in this repo defines a view over `Projects`; its generated
migration is `pocketbase/pb_migrations/*_created_ProjectStats.js` and its types appear in
`pocketbase-types.ts`. Applying it to a fresh PocketBase instance yields a collection whose derived
fields are `id` (text), `OwnerUser` (relation) and `projectCount` (number).
