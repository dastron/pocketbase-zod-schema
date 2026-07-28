# Naming Conventions Reference

This document outlines the naming conventions used in the schema-driven migration system.

## Collection Names

`collectionName` in `defineCollection()` / `defineView()` is the **only** source of a collection's
name. There is no derivation from the schema file name — a schema file's basename is purely
organizational and never appears in the generated collection.

```typescript
// src/schema/post.ts — collection is "posts", regardless of the file name
export default defineCollection({ collectionName: "posts", schema: PostSchema });
```

```typescript
// src/schema/whatever-you-want-to-call-it.ts — collection is still "posts"
export default defineCollection({ collectionName: "posts", schema: PostSchema });
```

### File Naming Best Practices

The filename carries no functional meaning, but a consistent style keeps a schema directory
readable:

✅ **DO:**
- Use a singular entity name that matches the collection's subject: `user.ts`, `post.ts`
- Use lowercase or camelCase: `article.ts`, `blogPost.ts`, not `Article.ts`
- Keep names simple and clear: `tag.ts`, `comment.ts`

❌ **DON'T:**
- Rely on the filename to name or pluralize the collection — it does neither
- Use special characters: ~~`user-profile.ts`~~
- Mix naming styles across the directory: ~~`User.ts`~~, ~~`user_profile.ts`~~

## Field Names

### Standard Fields

Use camelCase for regular field names:

```typescript
{
  firstName: z.string(),
  lastName: z.string(),
  emailAddress: z.string().email(),
  phoneNumber: z.string(),
  isActive: z.boolean(),
  createdAt: z.date(),
}
```

### Relation Fields

Relations come **only** from `RelationField()` / `RelationsField()`. There is no other way to
declare one — no naming convention, no field-name inspection. Name the field however reads best;
the target collection is always the explicit `collection` option.

```typescript
{
  author: RelationField({ collection: "users" }),
  category: RelationField({ collection: "categories", cascadeDelete: true }),
  tags: RelationsField({ collection: "tags", maxSelect: 10 }),
  coauthors: RelationsField({ collection: "users" }),
}
```

`RelationField`/`RelationsField` also support `displayFields` (which columns show in the admin UI)
and, for `RelationsField`, `minSelect`. See [TYPE_MAPPING.md](./TYPE_MAPPING.md#relation-fields) for
the full option list.

> A bare `z.array(z.string())` is **not** a relation — it maps to a `json` field, because
> PocketBase has no plain string-array type. Use `RelationsField({ collection })` for a multi-relation
> or `SelectField(values, { maxSelect })` for a multi-select.

### Field Naming Best Practices

✅ **DO:**
- Use camelCase: `firstName`, `emailAddress`
- Use descriptive names: `publishedAt`, `viewCount`
- Use boolean prefixes: `isActive`, `hasAccess`, `canEdit`
- Name relation fields for what they mean, not what they point at: `author`, `owner`, `assignee`

❌ **DON'T:**
- Use snake_case: ~~`first_name`~~, ~~`email_address`~~
- Use abbreviations: ~~`usr`~~, ~~`cat`~~, ~~`pub_at`~~
- Use generic names: ~~`data`~~, ~~`info`~~, ~~`value`~~
- Mix naming styles: ~~`first_name`~~, ~~`emailAddress`~~

## File Organization

### Schema Directory Structure

```
src/schema/
├── index.ts              # Optional barrel; add to schema.exclude
├── base.ts               # Your own shared fragments; add to schema.exclude
├── user.ts               # export default defineCollection({ collectionName: "Users", ... })
├── post.ts               # export default defineCollection({ collectionName: "Posts", ... })
├── comment.ts             # export default defineCollection({ collectionName: "Comments", ... })
├── tag.ts                 # export default defineCollection({ collectionName: "Tags", ... })
└── projectStats.ts        # export default defineView({ collectionName: "ProjectStats", ... })
```

Files that hold helpers rather than collections must be listed in `schema.exclude`, or they will be
skipped with a warning (see below) instead of contributing a collection.

**Discovery is a flat `readdir` of the schema directory — subdirectories are not scanned.** Keep
every schema file directly in `schema.directory`.

### Which export the analyzer picks

A file contributes a collection iff **one** of its exports is a Zod object whose `.describe()`
carries collection metadata — the JSON `defineCollection()`/`defineView()` write. Export *names*
carry no meaning: the default export qualifies exactly the same as any named export, and there is
no preference order between them.

```typescript
// Both of these are equally valid — the analyzer looks at the value, not the name
export default defineCollection({ collectionName: "posts", schema: PostSchema });
// or
export const PostCollection = defineCollection({ collectionName: "posts", schema: PostSchema });
```

Three rules follow from that:

- **No metadata-carrying export → skipped with a warning.** A file that only exports plain Zod
  schemas, types, or helpers contributes nothing; `parseSchemaFiles` logs a warning naming the file
  and moves on. If the file previously defined a collection, the diff may now propose deleting it —
  wrap every collection-bearing schema in `defineCollection()`/`defineView()` before regenerating.
- **Two metadata-carrying exports in one file → error.** One collection per file. Re-exporting the
  same value under two names (`export default X; export { X }`) is fine — candidates are
  deduplicated by object identity — but two distinct `defineCollection()` calls in one file is not.
- **The same `collectionName` declared in two files → error.** Collection names must be unique
  across the whole schema directory.

## Schema Export Names

Since export names carry no meaning to the analyzer, the patterns below are conventions for human
readability and `z.infer` ergonomics, not requirements.

### Collection definition

**Pattern:** `[Entity]Collection`, exported as `default` for clarity — one glance at the file tells
you which export is the collection.

```typescript
const PostCollection = defineCollection({ collectionName: "posts", schema: PostSchema });
export default PostCollection;
```

### Database Schema

The Zod shape passed to `defineCollection()`, and what you infer types from.

**Pattern:** `[Entity]Schema`

**Examples:** `UserSchema`, `PostSchema`, `CommentSchema`, `BlogPostSchema`

Add `baseSchema` when you want the PocketBase-managed fields in the inferred type. `baseSchema` is
a plain object of Zod fields, so pass it to `.extend()` (or spread it) — it has no `.extend()`
method of its own:

```typescript
export const PostTypeSchema = PostSchema.extend(baseSchema);
export type Post = z.infer<typeof PostTypeSchema>;
```

### Input Schema

Only needed for fields that exist on a form but not in the database (`passwordConfirm`, a `File`
before upload).

**Pattern:** `[Entity]InputSchema`

```typescript
export const UserInputSchema = UserSchema.extend({ passwordConfirm: z.string() });
```

### Type Exports

TypeScript types inferred from schemas:

```typescript
export type Entity = z.infer<typeof EntitySchema>;
export type EntityInput = z.infer<typeof EntityInputSchema>;
```

**Pattern:** `[Entity]` and `[Entity]Input`

**Examples:**
- `User`, `UserInput`
- `Post`, `PostInput`
- `Comment`, `CommentInput`

## Enum Names

### Enum Definition

```typescript
export const EntityStatusEnum = z.enum(["active", "inactive", "pending"]);
```

**Pattern:** `[Entity][Property]Enum`

**Examples:**
- `UserStatusEnum`
- `PostStatusEnum`
- `OrderStatusEnum`
- `PaymentMethodEnum`

### Enum Usage

```typescript
import { PostStatusEnum } from "../enums";

export const PostInputSchema = z.object({
  status: PostStatusEnum,
});
```

## Migration File Names

Migration files are generated automatically — one per collection operation — and follow
PocketBase's own convention.

**Pattern:** `[unix-timestamp]_[description].js`

The description is derived from the operation:

| Operation | Description |
| --- | --- |
| Create one collection | `created_<Name>` |
| Create several | `created_<n>_collections` |
| Modify one collection | `updated_<Name>` |
| Modify several | `updated_<n>_collections` |
| Delete one collection | `deleted_<Name>` |
| Delete several | `deleted_<n>_collections` |

**Examples:**
- `1769385981_created_Projects.js`
- `1785109687_created_ProjectStats.js`
- `1764626004_updated_edit_collection_add_field.js`

One filename is special: `[timestamp]_collections_snapshot.js` is a full snapshot of every
collection — written by `./pocketbase migrate collections`, and the point state reconstruction
replays from. Never rename or edit these by hand.

## Complete Example

Recommended style — explicit relations, explicit collection name, default export:

```typescript
// File: src/schema/blogPost.ts

import { z } from "zod";
import {
  baseSchema,
  defineCollection,
  BoolField,
  DateField,
  EditorField,
  RelationField,
  RelationsField,
  SelectField,
  TextField,
} from "pocketbase-zod-schema";

export const BlogPostSchema = z.object({
  // Standard fields (camelCase)
  title: TextField({ min: 5, max: 200 }),
  slug: TextField({ pattern: /^[a-z0-9-]+$/ }),
  content: EditorField(),
  excerpt: TextField({ max: 500 }).optional(),

  // Select field
  status: SelectField(["draft", "published", "archived"]),

  // Boolean fields (is/has/can prefix)
  isFeatured: BoolField(),
  isPublished: BoolField(),

  // Date field
  publishedAt: DateField().optional(),

  // Single relations — explicit target, no naming rules involved
  author: RelationField({ collection: "users" }),
  category: RelationField({ collection: "categories" }),

  // Multiple relations
  tags: RelationsField({ collection: "tags", maxSelect: 10 }),
  coauthors: RelationsField({ collection: "users" }),
});

// Type-level schema with the PocketBase-managed fields
export const BlogPostTypeSchema = BlogPostSchema.extend(baseSchema);
export type BlogPost = z.infer<typeof BlogPostTypeSchema>;

export default defineCollection({
  collectionName: "BlogPosts",
  schema: BlogPostSchema,
  permissions: { template: "owner-only", ownerField: "author" },
  indexes: ["CREATE UNIQUE INDEX idx_blogposts_slug ON BlogPosts (slug)"],
});
```

**Generated Collection:** `BlogPosts` (from `collectionName` — the filename `blogPost.ts` plays no
part)

**Generated Migration:** `1769385981_created_BlogPosts.js`

## Quick Reference

### Collection Names
- `collectionName` in `defineCollection()`/`defineView()` is the only source; the filename is
  never consulted

### Field Names
- Standard: `camelCase` (e.g., `firstName`, `emailAddress`)
- Relations: use `RelationField()` / `RelationsField()` — there is no other way to declare one
- Boolean: `is/has/can` prefix (e.g., `isActive`, `hasAccess`)

### Schema Names
- Collection: `[Entity]Collection`, exported as default (a convention, not a requirement — any
  export whose value carries collection metadata is picked)
- Database: `[Entity]Schema` (e.g., `UserSchema`)
- Input: `[Entity]InputSchema`, only when the form differs from the collection
- Enum: `[Entity][Property]Enum` (e.g., `UserStatusEnum`)

### File Names
- Schema: one collection per file, in a flat schema directory (no subdirectories); the name is
  organizational only
- Migration: `[timestamp]_created_<Name>.js` and friends (auto-generated)

## See Also

- [API Reference](./API.md) - Every exported function and type
- [Migration Guide](./MIGRATION_GUIDE.md) - Adoption and upgrade notes
- [Type Mapping Reference](./TYPE_MAPPING.md) - Type conversion rules
- [View Collections](./VIEW_COLLECTIONS.md) - SQL-backed read-only collections
