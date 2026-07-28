# Type Mapping Reference

This document provides a comprehensive reference for how Zod schemas are mapped to PocketBase field types in the migration system. The library supports two approaches: explicit field helpers (recommended) and automatic type inference (backward compatible).

## Field Helper Functions (Recommended)

Field helpers provide explicit, type-safe field definitions with PocketBase-specific options. They embed metadata that the migration generator uses to create accurate field definitions.

### Boolean Field

**Helper:** `BoolField()`

**Maps to:** PocketBase `bool` field

**Example:**
```typescript
import { BoolField } from "pocketbase-zod-schema/schema";

const ProductSchema = z.object({
  active: BoolField(),
  featured: BoolField().optional(),
});
```

**Generated PocketBase Field:**
```javascript
{
  name: "active",
  type: "bool",
  required: true
}
```

### Number Field

**Helper:** `NumberField(options?)`

**Maps to:** PocketBase `number` field

**Options:**
- `min?: number` - Minimum value constraint
- `max?: number` - Maximum value constraint
- `noDecimal?: boolean` - Disallow decimal values (integers only)

**Example:**
```typescript
import { NumberField } from "pocketbase-zod-schema/schema";

const ProductSchema = z.object({
  price: NumberField({ min: 0 }),
  quantity: NumberField({ min: 0, noDecimal: true }),
  rating: NumberField({ min: 0, max: 5 }),
});
```

**Generated PocketBase Field:**
```javascript
{
  name: "price",
  type: "number",
  required: true,
  min: 0
}
```

### Text Field

**Helper:** `TextField(options?)`

**Maps to:** PocketBase `text` field

**Options:**
- `min?: number` - Minimum length constraint
- `max?: number` - Maximum length constraint
- `pattern?: RegExp | string` - Pattern constraint (regex)
- `autogeneratePattern?: string` - Auto-generate pattern (e.g., `"[A-Z]{3}-[0-9]{6}"`)

**Example:**
```typescript
import { TextField } from "pocketbase-zod-schema/schema";

const ProductSchema = z.object({
  name: TextField({ min: 1, max: 200 }),
  sku: TextField({ autogeneratePattern: "[A-Z]{3}-[0-9]{6}" }),
  slug: TextField({ pattern: /^[a-z0-9-]+$/ }),
});
```

**Generated PocketBase Field:**
```javascript
{
  name: "name",
  type: "text",
  required: true,
  min: 1,
  max: 200
}
```

### Email Field

**Helper:** `EmailField()`

**Maps to:** PocketBase `email` field

**Example:**
```typescript
import { EmailField } from "pocketbase-zod-schema/schema";

const UserSchema = z.object({
  email: EmailField(),
  alternateEmail: EmailField().optional(),
});
```

**Generated PocketBase Field:**
```javascript
{
  name: "email",
  type: "email",
  required: true
}
```

### URL Field

**Helper:** `URLField()`

**Maps to:** PocketBase `url` field

**Example:**
```typescript
import { URLField } from "pocketbase-zod-schema/schema";

const ProductSchema = z.object({
  website: URLField(),
  documentation: URLField().optional(),
});
```

**Generated PocketBase Field:**
```javascript
{
  name: "website",
  type: "url",
  required: true
}
```

### Editor Field

**Helper:** `EditorField()`

**Maps to:** PocketBase `editor` field (rich text)

**Example:**
```typescript
import { EditorField } from "pocketbase-zod-schema/schema";

const PostSchema = z.object({
  content: EditorField(),
  summary: EditorField().optional(),
});
```

**Generated PocketBase Field:**
```javascript
{
  name: "content",
  type: "editor",
  required: true
}
```

### Date Field

**Helper:** `DateField(options?)`

**Maps to:** PocketBase `date` field

**Options:**
- `min?: Date | string` - Minimum date constraint
- `max?: Date | string` - Maximum date constraint

**Example:**
```typescript
import { DateField } from "pocketbase-zod-schema/schema";

const EventSchema = z.object({
  startDate: DateField(),
  endDate: DateField({ min: new Date('2024-01-01') }),
  releaseDate: DateField().optional(),
});
```

**Generated PocketBase Field:**
```javascript
{
  name: "startDate",
  type: "date",
  required: true
}
```

### Autodate Field

**Helper:** `AutodateField(options?)`

**Maps to:** PocketBase `autodate` field (automatic timestamp management)

**Options:**
- `onCreate?: boolean` - Set date automatically on record creation
- `onUpdate?: boolean` - Update date automatically on record update

**Example:**
```typescript
import { AutodateField } from "pocketbase-zod-schema/schema";

const PostSchema = z.object({
  createdAt: AutodateField({ onCreate: true }),
  updatedAt: AutodateField({ onUpdate: true }),
  publishedAt: AutodateField({ onCreate: true, onUpdate: false }),
});
```

**Generated PocketBase Field:**
```javascript
{
  name: "createdAt",
  type: "autodate",
  required: true,
  onCreate: true
}
```

### Select Field

**Helper:** `SelectField(values, options?)`

**Maps to:** PocketBase `select` field

**Parameters:**
- `values: [string, ...string[]]` - Array of allowed values (required)

**Options:**
- `maxSelect?: number` - Maximum selections (default: 1, >1 enables multiple selection)

**Example:**
```typescript
import { SelectField } from "pocketbase-zod-schema/schema";

const PostSchema = z.object({
  // Single select
  status: SelectField(["draft", "published", "archived"]),
  
  // Multiple select
  categories: SelectField(["electronics", "clothing", "food"], { maxSelect: 3 }),
});
```

**Generated PocketBase Field (Single):**
```javascript
{
  name: "status",
  type: "select",
  required: true,
  values: ["draft", "published", "archived"],
  maxSelect: 1
}
```

**Generated PocketBase Field (Multiple):**
```javascript
{
  name: "categories",
  type: "select",
  required: true,
  values: ["electronics", "clothing", "food"],
  maxSelect: 3
}
```

**Ordering:** the diff compares `values` as a set, not as a sequence. Reordering the array on
its own produces no migration — the order only fixes the option order in the PocketBase admin
UI, and options added there land at the end of the stored list, which would otherwise diff
against a schema that keeps them in a logical order. Adding or removing a value *is* a change,
and the generated migration writes the whole array back in the schema's order, so the stored
order re-syncs then. To apply a reorder on its own, change the set in the same commit or edit
the option order in the admin UI.

### File Field

**Helper:** `FileField(options?)`

**Maps to:** PocketBase `file` field (single file)

**Options:**
- `mimeTypes?: string[]` - Allowed MIME types (e.g., `["image/*", "application/pdf"]`)
- `maxSize?: ByteSize` - Maximum file size. A number is raw bytes; a string may use a `K`/`M`/`G`
  suffix (case-insensitive), e.g. `"5M"`. Maximum allowed is `"8G"`.
- `thumbs?: string[]` - Thumbnail sizes to generate (e.g., `["100x100", "200x200"]`)
- `protected?: boolean` - Whether file requires auth to access

**Example:**
```typescript
import { FileField } from "pocketbase-zod-schema/schema";

const ProductSchema = z.object({
  thumbnail: FileField({ 
    mimeTypes: ["image/*"], 
    maxSize: "5M", // or 5242880
    thumbs: ["100x100", "200x200"],
  }),
  document: FileField({ mimeTypes: ["application/pdf"] }),
});
```

**Return type:** `z.ZodType<string, File | string>` — the input accepts a `File` (or an existing
filename), and the parsed output is the stored filename string. `FilesField` is the array
equivalent: `z.ZodType<string[], (File | string)[]>`.

**Generated PocketBase Field:**
```javascript
{
  name: "thumbnail",
  type: "file",
  required: true,
  maxSelect: 1,
  mimeTypes: ["image/*"],
  maxSize: 5242880,
  thumbs: ["100x100", "200x200"]
}
```

### Files Field

**Helper:** `FilesField(options?)`

**Maps to:** PocketBase `file` field (multiple files)

**Options:**
- All `FileField` options plus:
- `minSelect?: number` - Minimum number of files required
- `maxSelect?: number` - Maximum number of files allowed

**Example:**
```typescript
import { FilesField } from "pocketbase-zod-schema/schema";

const ProductSchema = z.object({
  images: FilesField({ 
    mimeTypes: ["image/*"], 
    maxSelect: 5,
  }),
  attachments: FilesField({ 
    minSelect: 1, 
    maxSelect: 10,
  }),
});
```

**Generated PocketBase Field:**
```javascript
{
  name: "images",
  type: "file",
  required: true,
  maxSelect: 5,
  mimeTypes: ["image/*"]
}
```

### JSON Field

**Helper:** `JSONField(schema?, options?)`

**Maps to:** PocketBase `json` field

**Parameters:**
- `schema?: z.ZodTypeAny` - Optional Zod schema for JSON structure validation
- `options?: JSONFieldOptions` - Optional PocketBase constraints:
  - `maxSize?: ByteSize` - maximum size of the serialized value, as bytes (`5242880`) or a suffixed
    string (`"200K"`, `"5M"`, `"1G"`). PocketBase applies a **1MB** default when this is unset, and
    rejects a value over the limit at write time, so a field holding a larger payload must set it.
    The ceiling PocketBase accepts is 2^53-1 bytes.

Either argument may be given alone — `JSONField({ maxSize: "5M" })` is an untyped JSON field with a
5MB cap.

**Example:**
```typescript
import { JSONField } from "pocketbase-zod-schema/schema";

const ProductSchema = z.object({
  // Any JSON
  metadata: JSONField(),

  // Typed JSON
  settings: JSONField(z.object({
    theme: z.string(),
    notifications: z.boolean(),
  })),

  // Past PocketBase's 1MB default
  timelineData: JSONField({ maxSize: "5M" }),
  outputSettings: JSONField(z.object({ fps: z.number() }), { maxSize: "200K" }),
});
```

**Generated PocketBase Field:**
```javascript
{
  name: "metadata",
  type: "json",
  required: true
}

// timelineData — maxSize is emitted in bytes
{
  name: "timelineData",
  type: "json",
  required: true,
  maxSize: 5242880
}
```

### GeoPoint Field

**Helper:** `GeoPointField()`

**Maps to:** PocketBase `geoPoint` field (geographic coordinates)

**Example:**
```typescript
import { GeoPointField } from "pocketbase-zod-schema/schema";

const LocationSchema = z.object({
  coordinates: GeoPointField(),
  homeLocation: GeoPointField().optional(),
});
```

**Generated PocketBase Field:**
```javascript
{
  name: "coordinates",
  type: "geoPoint",
  required: true
}
```

### Relation Fields

**Helpers:** `RelationField(config)` and `RelationsField(config)`

**Maps to:** PocketBase `relation` field

**RelationField Options (Single Relation):**
- `collection: string` - Target collection name (required)
- `cascadeDelete?: boolean` - Delete related records when this record is deleted (default: `false`)
- `displayFields?: string[] | null` - Fields to show in the PocketBase admin UI

**RelationsField Options (Multiple Relations):**
- All `RelationField` options plus:
- `minSelect?: number` - Minimum number of relations required (default: `0`)
- `maxSelect?: number` - Maximum number of relations allowed (default: `999`)

**Example:**
```typescript
import { RelationField, RelationsField } from "pocketbase-zod-schema/schema";

const PostSchema = z.object({
  // Single relation
  author: RelationField({ collection: "users" }),
  category: RelationField({ 
    collection: "categories",
    cascadeDelete: true,
  }),
  
  // Multiple relations
  tags: RelationsField({ 
    collection: "tags",
    minSelect: 1,
    maxSelect: 10,
  }),
});
```

**Generated PocketBase Field (Single):**
```javascript
{
  name: "author",
  type: "relation",
  required: true,
  maxSelect: 1,
  collectionId: "users_collection_id"
}
```

**Generated PocketBase Field (Multiple):**
```javascript
{
  name: "tags",
  type: "relation",
  required: true,
  minSelect: 1,
  maxSelect: 10,
  collectionId: "tags_collection_id"
}
```

## Field Helper Summary Table

| Field Helper | PocketBase Type | Key Options | Example |
|--------------|-----------------|-------------|---------|
| `BoolField()` | bool | None | `active: BoolField()` |
| `NumberField(options?)` | number | min, max, noDecimal | `price: NumberField({ min: 0 })` |
| `TextField(options?)` | text | min, max, pattern, autogeneratePattern | `name: TextField({ min: 1, max: 200 })` |
| `EmailField()` | email | None | `email: EmailField()` |
| `URLField()` | url | None | `website: URLField()` |
| `EditorField()` | editor | None | `content: EditorField()` |
| `DateField(options?)` | date | min, max | `birthdate: DateField()` |
| `AutodateField(options?)` | autodate | onCreate, onUpdate | `createdAt: AutodateField({ onCreate: true })` |
| `SelectField(values, options?)` | select | maxSelect | `status: SelectField(["draft", "published"])` |
| `FileField(options?)` | file | mimeTypes, maxSize, thumbs | `avatar: FileField({ mimeTypes: ["image/*"] })` |
| `FilesField(options?)` | file | minSelect, maxSelect, mimeTypes | `images: FilesField({ maxSelect: 5 })` |
| `JSONField(schema?, options?)` | json | maxSize | `timelineData: JSONField({ maxSize: "5M" })` |
| `GeoPointField()` | geoPoint | None | `location: GeoPointField()` |
| `RelationField(config)` | relation | collection, cascadeDelete, displayFields | `author: RelationField({ collection: "users" })` |
| `RelationsField(config)` | relation | collection, minSelect, maxSelect | `tags: RelationsField({ collection: "tags" })` |

`SingleSelectField(values)` and `MultiSelectField(values, options?)` are also exported, for when
you want the single/multiple decision made at the call site instead of inferred from `maxSelect`.

---

## Automatic Type Inference (Backward Compatible)

For backward compatibility, the library still supports automatic type inference from plain Zod types. However, using field helpers is recommended for new schemas.

### Basic Type Mappings

| Zod Type | PocketBase Field | Example |
|----------|------------------|---------|
| `z.string()` | `text` | `name: z.string()` |
| `z.string().email()` | `email` | `email: z.string().email()` |
| `z.string().url()` | `url` | `website: z.string().url()` |
| `z.string().datetime()` | `date` | `publishedAt: z.string().datetime()` |
| `z.number()` | `number` | `age: z.number()` |
| `z.boolean()` | `bool` | `active: z.boolean()` |
| `z.date()` | `date` | `birthdate: z.date()` |
| `z.enum([...])` | `select` | `status: z.enum(["active", "inactive"])` |
| `z.record(z.any())` | `json` | `metadata: z.record(z.any())` |
| `z.object({...})` | `json` | `settings: z.object({ theme: z.string() })` |
| `z.instanceof(File)` | `file` | `avatar: z.instanceof(File)` |
| `z.array(z.instanceof(File))` | `file` | `images: z.array(z.instanceof(File))` |
| `z.array(z.string())` | `relation` | see the caveat below |
| `z.array(<anything else>)` | `json` | `scores: z.array(z.number())` |

> **Caveat — `z.array(z.string())` always maps to `relation`.** The array-of-strings case is
> assumed to be a relation regardless of the field name. If the name does not also satisfy the
> naming convention below, the field is emitted as a `relation` with **no target collection**,
> which PocketBase will reject. Use `RelationsField({ collection })` for real relations and
> `JSONField(z.array(z.string()))` for a plain list of strings.

### Relation Type Mappings (Automatic Detection)

**Note:** For explicit relation definitions, use `RelationField()` and `RelationsField()` helpers instead. Naming-convention detection exists for backward compatibility and only applies when a field carries no relation metadata.

### Single Relations

A **`z.string()` field whose name starts with an uppercase letter** is treated as a single
relation, unless the name is one of the excluded common fields (`Title`, `Name`, `Description`,
`Content`, `Summary`, `Status`, `Type`). The target collection is the field name pluralized —
whether or not a collection by that name exists.

```typescript
{
  User: z.string(),           // → relation to Users (maxSelect: 1)
  Author: z.string(),         // → relation to Authors (maxSelect: 1)
  Category: z.string(),       // → relation to Categories (maxSelect: 1)
  Title: z.string(),          // → text (excluded name)
  username: z.string(),       // → text (lowercase)
}
```

**Generated PocketBase Field:**
```javascript
{
  name: "User",
  type: "relation",
  required: true,
  maxSelect: 1,
  collectionId: "users_collection_id"
}
```

### Multiple Relations

A **`z.array(z.string())` field whose name contains any uppercase letter** is treated as a multiple
relation. The target collection is the *last* capitalized word in the name, pluralized.

```typescript
{
  Tags: z.array(z.string()),              // → relation to Tags (maxSelect: 999)
  SubscriberUsers: z.array(z.string()),   // → relation to Users (maxSelect: 999)
  Categories: z.array(z.string()),        // → relation to Categories (maxSelect: 999)
  relatedPosts: z.array(z.string()),      // → relation to Posts (the "P" is enough)
}
```

**Generated PocketBase Field:**
```javascript
{
  name: "Tags",
  type: "relation",
  required: true,
  maxSelect: 999,
  collectionId: "tags_collection_id"
}
```

## Validation Constraint Mappings

Zod validation methods are mapped to PocketBase field options:

These mappings also apply to validators chained onto a field helper, so a shared Zod rule can be
reused as a field:

```typescript
const NameRule = z.string().min(1).max(60).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);

// Both produce min: 1, max: 60, pattern: "^[A-Za-z0-9][A-Za-z0-9_-]*$"
name: TextField().min(1).max(60).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/),
name: TextField({ min: 1, max: 60, pattern: /^[A-Za-z0-9][A-Za-z0-9_-]*$/ }),
```

The helper's own options win where the two overlap. Chained validators are read for `text`,
`password`, `number`, `select`, and `file` fields — the types where a Zod constraint means the same
thing as the PocketBase option. They are ignored elsewhere: `DateField()` is a Zod string, so
`.min()` on it is a string *length*, not an earliest date. Use `DateField({ min })` for that.

A constraint that disappears from the schema is reset rather than deleted, because PocketBase always
stores every option its field type has: dropping `max` from a text field writes `max: 0`, dropping
`pattern` writes `pattern: ""`. Both mean "unconstrained", and the diff treats them as equivalent to
never setting the option, so the change settles in one migration.

### String Constraints

| Zod Validation | PocketBase Option | Example |
|----------------|-------------------|---------|
| `.min(n)` | `min: n` | `z.string().min(2)` → `min: 2` |
| `.max(n)` | `max: n` | `z.string().max(100)` → `max: 100` |
| `.regex(pattern)` | `pattern: "..."` | `z.string().regex(/^[a-z]+$/)` → `pattern: "^[a-z]+$"` |
| `.email()` | `type: "email"` | `z.string().email()` → `type: "email"` |
| `.url()` | `type: "url"` | `z.string().url()` → `type: "url"` |

**Example:**
```typescript
// Zod schema
title: z.string().min(5).max(200)

// PocketBase field
{
  name: "title",
  type: "text",
  required: true,
  min: 5,
  max: 200
}
```

### Number Constraints

| Zod Validation | PocketBase Option | Example |
|----------------|-------------------|---------|
| `.min(n)` | `min: n` | `z.number().min(0)` → `min: 0` |
| `.max(n)` | `max: n` | `z.number().max(100)` → `max: 100` |
| `.int()` | `onlyInt: true` | `z.number().int()` → `onlyInt: true` |

**Example:**
```typescript
// Zod schema
age: z.number().int().min(0).max(150)

// PocketBase field
{
  name: "age",
  type: "number",
  required: true,
  min: 0,
  max: 150,
  onlyInt: true
}
```

### Optional Fields

| Zod Validation | PocketBase Option | Example |
|----------------|-------------------|---------|
| `.optional()` | `required: false` | `z.string().optional()` → `required: false` |
| `.nullable()` | `required: false` | `z.string().nullable()` → `required: false` |

**Example:**
```typescript
// Zod schema
bio: z.string().optional()

// PocketBase field
{
  name: "bio",
  type: "text",
  required: false
}
```

## File Upload Mappings

A file field has two shapes: a `File` on the way in, a filename string on the way out. `FileField()`
already models both, so a single declaration covers the collection *and* the form:

```typescript
import { z } from "zod";
import { defineCollection, FileField, TextField } from "pocketbase-zod-schema/schema";

export const UserSchema = z.object({
  name: TextField({ max: 100 }),
  avatar: FileField({
    mimeTypes: ["image/jpeg", "image/png"],
    maxSize: "5M",
  }),
});

export default defineCollection({ collectionName: "users", schema: UserSchema });
```

### Generated PocketBase Field

```javascript
{
  name: "avatar",
  type: "file",
  required: true,
  maxSelect: 1,
  maxSize: 5242880,
  mimeTypes: ["image/jpeg", "image/png"]
}
```

### When you need a separate input schema

Keep one only for fields that exist on the form but not in the database (`passwordConfirm`, a
client-side size message):

```typescript
export const UserInputSchema = UserSchema.extend({
  passwordConfirm: z.string(),
  avatar: z.instanceof(File).refine((f) => f.size <= 5_000_000, "Max 5MB"),
});
```

The library also ships ready-made fragments — `baseImageFileSchema` (adds `thumbnailURL` and
`imageFiles` to `baseSchema`), `inputImageFileSchema` and `omitImageFilesSchema`. All three are
plain objects of Zod fields, so spread them or pass them to `.extend()`.

## Enum Mappings

Zod enums map to PocketBase `select` fields, with the enum members becoming the allowed values:

### Zod Enum

```typescript
import { z } from "zod";

export const StatusEnum = z.enum(["draft", "published", "archived"]);

export const PostSchema = z.object({
  status: StatusEnum,
});
```

### Generated PocketBase Field

```javascript
{
  name: "status",
  type: "select",
  required: true,
  values: ["draft", "published", "archived"],
  maxSelect: 1
}
```

`SelectField(values, { maxSelect })` is the explicit form and the only way to declare a
multi-select.

## Collection Type Detection

`defineCollection({ type })` always wins. When `type` is omitted, the type is inferred:

### Auth Collection

Detected when the schema contains **both** an `email` and a `password` field (case-insensitive on
the field names). One without the other is not enough:

```typescript
export const UserSchema = z.object({
  email: EmailField(),
  password: TextField({ min: 8 }),
  name: TextField({ max: 100 }).optional(),
});
```

**Generated Collection:**
```javascript
{
  name: "Users",
  type: "auth", // Automatically detected
  fields: [...] // plus the injected system fields
}
```

Auth collections get PocketBase's system fields injected (`email`, `emailVisibility`, `verified`,
`password`, `tokenKey`), and `manageRule` is only emitted for this type.

### Base Collection

Default for everything else:

```typescript
export const PostSchema = z.object({
  title: TextField(),
  content: EditorField(),
});
```

**Generated Collection:**
```javascript
{
  name: "Posts",
  type: "base",
  fields: [...]
}
```

### View Collection

Never inferred — declared with `defineView()` or `type: "view"`, and always accompanied by a
`viewQuery`. PocketBase derives a view's fields by running the query, so the Zod schema is used for
TypeScript types only and the generated migration contains **no `fields` and no `indexes` array**.
See [VIEW_COLLECTIONS.md](./VIEW_COLLECTIONS.md).

> Changing an existing collection's *type* is not diffed and produces no migration. Recreate the
> collection instead.

## Special Cases

### Array Fields (Non-Relation)

Arrays of non-strings become `json`:

```typescript
{
  scores: z.array(z.number()),
}
```

**Generated PocketBase Field:**
```javascript
{
  name: "scores",
  type: "json",
  required: true
}
```

An array of *strings* does **not** land here — it is always inferred as a relation. For a plain
list of strings use `JSONField(z.array(z.string()))`.

### JSON Fields

Complex objects stored as JSON:

```typescript
{
  metadata: z.record(z.any()),
  settings: z.object({
    theme: z.string(),
    notifications: z.boolean(),
  }),
}
```

**Generated PocketBase Field:**
```javascript
{
  name: "metadata",
  type: "json",
  required: true
}
```

### Date Fields

Date handling:

```typescript
{
  publishedAt: z.date(),
  createdAt: z.string(), // ISO string
}
```

**Generated PocketBase Field:**
```javascript
{
  name: "publishedAt",
  type: "date",
  required: true
}
```

## Unsupported Types

The following Zod types are not directly supported and will need manual migration editing:

- `z.union()` - Use discriminated unions or separate fields
- `z.intersection()` - Flatten to single object
- `z.tuple()` - Use array or separate fields
- `z.map()` - Use record or JSON field
- `z.set()` - Use array field
- `z.promise()` - Not applicable to database
- `z.function()` - Not applicable to database

## Best Practices

### When to Use Field Helpers

**Use field helpers for:**
- ✅ New schemas and collections
- ✅ When you need PocketBase-specific options (autogenerate patterns, file constraints, etc.)
- ✅ When you want explicit field type declarations
- ✅ When you need autodate fields with onCreate/onUpdate options
- ✅ When you want better IDE autocomplete for field options

**Example:**
```typescript
import { TextField, NumberField, SelectField } from "pocketbase-zod-schema/schema";

const ProductSchema = z.object({
  name: TextField({ min: 1, max: 200 }),
  sku: TextField({ autogeneratePattern: "[A-Z]{3}-[0-9]{6}" }),
  price: NumberField({ min: 0 }),
  status: SelectField(["draft", "published", "archived"]),
});
```

### When Automatic Inference is Acceptable

**Automatic inference works for:**
- ✅ Existing schemas (backward compatibility)
- ✅ Simple fields without PocketBase-specific options
- ✅ Quick prototyping

**Example:**
```typescript
const SimpleSchema = z.object({
  title: z.string(),
  count: z.number(),
  active: z.boolean(),
});
```

### Migration Path

If you have existing schemas using plain Zod types, you can gradually migrate to field helpers:

**Before:**
```typescript
const PostSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string(),
  published: z.boolean(),
});
```

**After:**
```typescript
import { TextField, EditorField, BoolField } from "pocketbase-zod-schema/schema";

const PostSchema = z.object({
  title: TextField({ min: 1, max: 200 }),
  content: EditorField(),
  published: BoolField(),
});
```

Both will generate the same migration, but the field helper version is more explicit and provides access to PocketBase-specific options.

## Field Helper Benefits

1. **Explicit Type Declarations** - No ambiguity about field types
2. **PocketBase-Specific Options** - Access to all PocketBase field options
3. **Better Type Safety** - TypeScript knows exactly what options are available
4. **IDE Autocomplete** - Get suggestions for field options
5. **Future-Proof** - New PocketBase features can be added to helpers
6. **Self-Documenting** - Code clearly shows intent

## Complete Example with Field Helpers

```typescript
import { z } from "zod";
import {
  defineCollection,
  BoolField,
  NumberField,
  TextField,
  EmailField,
  URLField,
  EditorField,
  DateField,
  AutodateField,
  SelectField,
  FileField,
  FilesField,
  JSONField,
  GeoPointField,
  RelationField,
  RelationsField,
} from "pocketbase-zod-schema/schema";

const ProductSchema = z.object({
  // Text fields
  name: TextField({ min: 1, max: 200 }),
  sku: TextField({ autogeneratePattern: "[A-Z]{3}-[0-9]{6}" }),
  description: EditorField(),
  website: URLField().optional(),
  
  // Number fields
  price: NumberField({ min: 0 }),
  quantity: NumberField({ min: 0, noDecimal: true }),
  rating: NumberField({ min: 0, max: 5 }).optional(),
  
  // Boolean fields
  active: BoolField(),
  featured: BoolField().optional(),
  
  // Date fields
  releaseDate: DateField().optional(),
  createdAt: AutodateField({ onCreate: true }),
  updatedAt: AutodateField({ onUpdate: true }),
  
  // Select fields
  status: SelectField(["draft", "published", "archived"]),
  categories: SelectField(["electronics", "clothing", "food"], { maxSelect: 3 }),
  
  // File fields
  thumbnail: FileField({ 
    mimeTypes: ["image/*"], 
    maxSize: 5242880,
    thumbs: ["100x100", "200x200"],
  }),
  images: FilesField({ 
    mimeTypes: ["image/*"], 
    maxSelect: 5,
  }),
  
  // JSON field
  metadata: JSONField(),
  settings: JSONField(z.object({
    theme: z.string(),
    notifications: z.boolean(),
  })).optional(),
  
  // GeoPoint field
  location: GeoPointField().optional(),
  
  // Relation fields
  vendor: RelationField({ collection: "vendors" }),
  tags: RelationsField({ collection: "tags", maxSelect: 10 }),
});

export const ProductCollection = defineCollection({
  collectionName: "products",
  schema: ProductSchema,
  permissions: {
    listRule: "",
    viewRule: "",
    createRule: '@request.auth.id != ""',
    updateRule: "vendor.owner = @request.auth.id",
    deleteRule: "vendor.owner = @request.auth.id",
  },
});
```

## General Best Practices

1. **Use field helpers for new schemas** - Get explicit type declarations and PocketBase-specific options
2. **Keep it simple** - Use basic types that map cleanly to PocketBase
3. **Use enums** - For fixed value sets instead of unions
4. **Follow naming conventions** - For automatic relation detection (if not using helpers)
5. **Separate input/database schemas** - For file uploads and form validation
6. **Add validation messages** - For better user feedback
7. **Document complex mappings** - With comments in schema

## See Also

- [API Reference](./API.md) - Every exported function and type
- [Naming Conventions](./NAMING_CONVENTIONS.md) - The exact relation-detection rules
- [View Collections](./VIEW_COLLECTIONS.md) - SQL-backed collections, whose fields are derived not declared
- [Migration Guide](./MIGRATION_GUIDE.md) - Adoption and upgrade notes
- [PocketBase Field Types](https://pocketbase.io/docs/collections/) - Official PocketBase docs
- [Zod Documentation](https://zod.dev/) - Zod validation library
