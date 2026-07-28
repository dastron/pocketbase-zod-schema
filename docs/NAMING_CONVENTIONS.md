# Naming Conventions Reference

This document outlines the naming conventions used in the schema-driven migration system.

## Collection Names

`collectionName` in `defineCollection()` / `defineView()` is authoritative. Only when it is absent
is the name derived from the schema file name and pluralized.

```typescript
// src/schema/post.ts — collection is "posts", not "Posts"
export default defineCollection({ collectionName: "posts", schema: PostSchema });
```

### Basic Rules

| Schema File | Collection Name | Notes |
|-------------|-----------------|-------|
| `user.ts` | `Users` | Standard pluralization |
| `post.ts` | `Posts` | Standard pluralization |
| `article.ts` | `Articles` | Standard pluralization |
| `comment.ts` | `Comments` | Standard pluralization |
| `tag.ts` | `Tags` | Standard pluralization |

### Special Pluralization Cases

| Schema File | Collection Name | Rule |
|-------------|-----------------|------|
| `person.ts` | `People` | Irregular plural |
| `category.ts` | `Categories` | -y → -ies |
| `company.ts` | `Companies` | -y → -ies |
| `city.ts` | `Cities` | -y → -ies |
| `country.ts` | `Countries` | -y → -ies |
| `story.ts` | `Stories` | -y → -ies |
| `activity.ts` | `Activities` | -y → -ies |

### Naming Best Practices

✅ **DO:**
- Use singular form for file names: `user.ts`, `post.ts`
- Use lowercase for file names: `article.ts`, not `Article.ts`
- Use descriptive entity names: `blogPost.ts`, `userProfile.ts`
- Keep names simple and clear: `tag.ts`, `comment.ts`

❌ **DON'T:**
- Use plural in file names: ~~`users.ts`~~
- Use special characters: ~~`user-profile.ts`~~
- Use abbreviations: ~~`usr.ts`~~, ~~`pst.ts`~~
- Mix naming styles: ~~`User.ts`~~, ~~`user_profile.ts`~~

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

> **Prefer `RelationField()` / `RelationsField()`.** They state the target collection explicitly,
> which is checked, and they support `cascadeDelete`, `minSelect`/`maxSelect` and `displayFields`.
> The naming conventions below are a **fallback** that only applies to fields carrying no relation
> metadata, kept for backward compatibility.

```typescript
// Preferred — explicit, no naming rules involved
{
  author: RelationField({ collection: "users" }),
  tags: RelationsField({ collection: "tags", maxSelect: 10 }),
}
```

#### Single Relations (One-to-One, Many-to-One)

A **`z.string()` field whose name starts with an uppercase letter** is detected as a single
relation. The target collection is the field name pluralized — the rule never checks that such a
collection exists, so a typo produces a relation to a collection that isn't there.

Seven names are excluded because they are common text fields: `Title`, `Name`, `Description`,
`Content`, `Summary`, `Status`, `Type`.

```typescript
{
  User: z.string(),           // → Users collection (maxSelect: 1)
  Author: z.string(),         // → Authors collection (maxSelect: 1)
  Category: z.string(),       // → Categories collection (maxSelect: 1)
  Post: z.string(),           // → Posts collection (maxSelect: 1)
  Title: z.string(),          // → text (excluded name)
  slug: z.string(),           // → text (lowercase)
}
```

**Pattern:** `CollectionName: z.string()`

**Generated Field:**
```javascript
{
  name: "User",
  type: "relation",
  maxSelect: 1,
  collectionId: "users_collection_id"
}
```

#### Multiple Relations (One-to-Many, Many-to-Many)

A **`z.array(z.string())` field whose name contains any uppercase letter** is detected as a
multiple relation. The target collection is the *last* capitalized word in the name, pluralized.

```typescript
{
  Tags: z.array(z.string()),              // → Tags collection (maxSelect: 999)
  Categories: z.array(z.string()),        // → Categories collection (maxSelect: 999)
  SubscriberUsers: z.array(z.string()),   // → Users collection (maxSelect: 999)
  AuthorUsers: z.array(z.string()),       // → Users collection (maxSelect: 999)
  relatedPosts: z.array(z.string()),      // → Posts collection (one uppercase letter is enough)
}
```

**Pattern:** `[Prefix]CollectionName: z.array(z.string())`

> **Watch out:** an all-lowercase `z.array(z.string())` such as `tags: z.array(z.string())` still
> maps to the `relation` **type** — arrays of strings always do — but fails this naming check, so
> it is emitted with no target collection and PocketBase rejects it. Use
> `RelationsField({ collection: "tags" })` for a relation, or `JSONField(z.array(z.string()))` for
> a plain list of strings.

**Generated Field:**
```javascript
{
  name: "Tags",
  type: "relation",
  maxSelect: 999,
  collectionId: "tags_collection_id"
}
```

### Relation Naming Examples

#### Blog Post Example

```typescript
// post.ts
export const PostInputSchema = z.object({
  title: z.string(),
  content: z.string(),
  
  // Single relations
  User: z.string(),           // Post author (Users collection)
  Category: z.string(),       // Post category (Categories collection)
  
  // Multiple relations
  Tags: z.array(z.string()),              // Post tags (Tags collection)
  CoauthorUsers: z.array(z.string()),     // Co-authors (Users collection)
});
```

#### E-commerce Order Example

```typescript
// order.ts
export const OrderInputSchema = z.object({
  orderNumber: z.string(),
  total: z.number(),
  
  // Single relations
  User: z.string(),           // Customer (Users collection)
  ShippingAddress: z.string(), // Address (Addresses collection)
  
  // Multiple relations
  Products: z.array(z.string()),          // Ordered products (Products collection)
  Coupons: z.array(z.string()),           // Applied coupons (Coupons collection)
});
```

#### Social Media Post Example

```typescript
// socialPost.ts
export const SocialPostInputSchema = z.object({
  content: z.string(),
  
  // Single relations
  User: z.string(),           // Post author (Users collection)
  
  // Multiple relations
  LikerUsers: z.array(z.string()),        // Users who liked (Users collection)
  MentionedUsers: z.array(z.string()),    // Mentioned users (Users collection)
  Tags: z.array(z.string()),              // Hashtags (Tags collection)
});
```

### Field Naming Best Practices

✅ **DO:**
- Use camelCase: `firstName`, `emailAddress`
- Use descriptive names: `publishedAt`, `viewCount`
- Use boolean prefixes: `isActive`, `hasAccess`, `canEdit`
- Match collection names for relations: `User`, `Category`
- Add prefix for multiple relations to same collection: `SubscriberUsers`, `AuthorUsers`

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
├── user.ts               # User entity      → Users
├── post.ts               # Post entity      → Posts
├── comment.ts            # Comment entity   → Comments
├── tag.ts                # Tag entity       → Tags
└── projectStats.ts       # View collection  → ProjectStats
```

Files that hold helpers rather than collections must be listed in `schema.exclude`, or the analyzer
will try to read a collection out of them. Subdirectories are supported.

### File Naming Rules

✅ **DO:**
- Use singular entity names: `user.ts`, `post.ts`
- Use camelCase for multi-word entities: `blogPost.ts`, `userProfile.ts`
- Keep names concise: `tag.ts`, `comment.ts`
- Group related schemas in subdirectories if needed

❌ **DON'T:**
- Use plural: ~~`users.ts`~~, ~~`posts.ts`~~
- Use kebab-case: ~~`blog-post.ts`~~, ~~`user-profile.ts`~~
- Use snake_case: ~~`blog_post.ts`~~, ~~`user_profile.ts`~~
- Use PascalCase: ~~`User.ts`~~, ~~`BlogPost.ts`~~

## Schema Export Names

### Which export the analyzer picks

Per file, in order: the **default export**, then `*Collection`, then `*Schema`. Prefer a default
export of `defineCollection()` — it is unambiguous:

```typescript
const PostCollection = defineCollection({ collectionName: "posts", schema: PostSchema });
export default PostCollection;
```

### Collection definition

**Pattern:** `[Entity]Collection`

```typescript
export const PostCollection = defineCollection({ ... });
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
} from "pocketbase-zod-schema/schema";

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

**Generated Collection:** `BlogPosts` (from `collectionName`; it would also be `BlogPosts` if
derived from the filename)

**Generated Migration:** `1769385981_created_BlogPosts.js`

## Quick Reference

### Collection Names
- `collectionName` wins; otherwise `entity.ts` → `Entities`
- Singular file name → plural collection name
- Special cases: `person.ts` → `People`, `category.ts` → `Categories`

### Field Names
- Standard: `camelCase` (e.g., `firstName`, `emailAddress`)
- Relations: use `RelationField()` / `RelationsField()` and name the field however you like
- Fallback detection (no relation metadata): `z.string()` starting uppercase → single relation;
  `z.array(z.string())` containing an uppercase letter → multiple relation
- Boolean: `is/has/can` prefix (e.g., `isActive`, `hasAccess`)

### Schema Names
- Collection: `[Entity]Collection`, exported as default
- Database: `[Entity]Schema` (e.g., `UserSchema`)
- Input: `[Entity]InputSchema`, only when the form differs from the collection
- Enum: `[Entity][Property]Enum` (e.g., `UserStatusEnum`)

### File Names
- Schema: `entity.ts` (singular, camelCase)
- Migration: `[timestamp]_created_<Name>.js` and friends (auto-generated)

## See Also

- [API Reference](./API.md) - Every exported function and type
- [Migration Guide](./MIGRATION_GUIDE.md) - Adoption and upgrade notes
- [Type Mapping Reference](./TYPE_MAPPING.md) - Type conversion rules
- [View Collections](./VIEW_COLLECTIONS.md) - SQL-backed read-only collections
