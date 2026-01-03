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

### File Field

**Helper:** `FileField(options?)`

**Maps to:** PocketBase `file` field (single file)

**Options:**
- `mimeTypes?: string[]` - Allowed MIME types (e.g., `["image/*", "application/pdf"]`)
- `maxSize?: number` - Maximum file size in bytes
- `thumbs?: string[]` - Thumbnail sizes to generate (e.g., `["100x100", "200x200"]`)
- `protected?: boolean` - Whether file requires auth to access

**Example:**
```typescript
import { FileField } from "pocketbase-zod-schema/schema";

const ProductSchema = z.object({
  thumbnail: FileField({ 
    mimeTypes: ["image/*"], 
    maxSize: 5242880, // 5MB
    thumbs: ["100x100", "200x200"],
  }),
  document: FileField({ mimeTypes: ["application/pdf"] }),
});
```

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

**Helper:** `JSONField(schema?)`

**Maps to:** PocketBase `json` field

**Parameters:**
- `schema?: z.ZodTypeAny` - Optional Zod schema for JSON structure validation

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
});
```

**Generated PocketBase Field:**
```javascript
{
  name: "metadata",
  type: "json",
  required: true
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

**RelationsField Options (Multiple Relations):**
- `collection: string` - Target collection name (required)
- `cascadeDelete?: boolean` - Delete related records when this record is deleted (default: `false`)
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
| `JSONField(schema?)` | json | schema | `metadata: JSONField()` |
| `GeoPointField()` | geoPoint | None | `location: GeoPointField()` |
| `RelationField(config)` | relation | collection, cascadeDelete | `author: RelationField({ collection: "users" })` |
| `RelationsField(config)` | relation | collection, minSelect, maxSelect | `tags: RelationsField({ collection: "tags" })` |

---

## Automatic Type Inference (Backward Compatible)

## Automatic Type Inference (Backward Compatible)

For backward compatibility, the library still supports automatic type inference from plain Zod types. However, using field helpers is recommended for new schemas.

### Basic Type Mappings

| Zod Type | PocketBase Field | Example |
|----------|------------------|---------|
| `z.string()` | `text` | `name: z.string()` |
| `z.string().email()` | `email` | `email: z.string().email()` |
| `z.string().url()` | `url` | `website: z.string().url()` |
| `z.number()` | `number` | `age: z.number()` |
| `z.boolean()` | `bool` | `active: z.boolean()` |
| `z.date()` | `date` | `birthdate: z.date()` |
| `z.enum([...])` | `text` | `status: z.enum(["active", "inactive"])` |
| `z.record(z.any())` | `json` | `metadata: z.record(z.any())` |
| `z.instanceof(File)` | `file` | `avatar: z.instanceof(File)` |

### Relation Type Mappings (Automatic Detection)

### Relation Type Mappings (Automatic Detection)

**Note:** For explicit relation definitions, use `RelationField()` and `RelationsField()` helpers instead.

Relations are detected by field naming conventions:

### Single Relations

Field name matches a collection name (singular or plural):

```typescript
{
  User: z.string(),           // → relation to Users (maxSelect: 1)
  Author: z.string(),         // → relation to Authors (maxSelect: 1)
  Category: z.string(),       // → relation to Categories (maxSelect: 1)
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

Field name ends with a collection name:

```typescript
{
  Tags: z.array(z.string()),              // → relation to Tags (maxSelect: 999)
  SubscriberUsers: z.array(z.string()),   // → relation to Users (maxSelect: 999)
  Categories: z.array(z.string()),        // → relation to Categories (maxSelect: 999)
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

File uploads require special handling due to form data vs. database storage:

### Input Schema (Form Validation)

```typescript
import { z } from "zod";

export const inputImageFileSchema = {
  avatar: z
    .instanceof(File)
    .refine((file) => file.size <= 5000000, "Max 5MB")
    .refine(
      (file) => ["image/jpeg", "image/png"].includes(file.type),
      "Only JPG/PNG"
    ),
};

export const UserInputSchema = z.object({
  name: z.string(),
  ...inputImageFileSchema,
});
```

### Database Schema (Storage)

```typescript
export const baseImageFileSchema = {
  avatar: z.string(), // Stored as filename string
};

export const UserSchema = z.object({
  name: z.string(),
  ...baseImageFileSchema,
}).extend(baseSchema);
```

### Generated PocketBase Field

```javascript
{
  name: "avatar",
  type: "file",
  required: true,
  maxSelect: 1,
  maxSize: 5242880, // 5MB in bytes
  mimeTypes: ["image/jpeg", "image/png"]
}
```

## Enum Mappings

Zod enums are mapped to PocketBase text fields with validation:

### Zod Enum

```typescript
import { z } from "zod";

export const StatusEnum = z.enum(["draft", "published", "archived"]);

export const PostInputSchema = z.object({
  status: StatusEnum,
});
```

### Generated PocketBase Field

```javascript
{
  name: "status",
  type: "text",
  required: true,
  options: {
    values: ["draft", "published", "archived"]
  }
}
```

## Collection Type Detection

Collections are automatically typed based on their fields:

### Auth Collection

Detected when schema contains `email` field:

```typescript
export const UserInputSchema = z.object({
  email: z.string().email(),
  username: z.string(),
});
```

**Generated Collection:**
```javascript
{
  name: "Users",
  type: "auth", // Automatically detected
  fields: [...]
}
```

### Base Collection

Default type for all other collections:

```typescript
export const PostInputSchema = z.object({
  title: z.string(),
  content: z.string(),
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

## Special Cases

### Array Fields (Non-Relation)

Arrays that don't match relation naming conventions:

```typescript
{
  tags: z.array(z.string()), // Not matching any collection name
}
```

**Generated PocketBase Field:**
```javascript
{
  name: "tags",
  type: "json", // Stored as JSON array
  required: true
}
```

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

## Best Practices

## General Best Practices

1. **Use field helpers for new schemas** - Get explicit type declarations and PocketBase-specific options
2. **Keep it simple** - Use basic types that map cleanly to PocketBase
3. **Use enums** - For fixed value sets instead of unions
4. **Follow naming conventions** - For automatic relation detection (if not using helpers)
5. **Separate input/database schemas** - For file uploads and form validation
6. **Add validation messages** - For better user feedback
7. **Document complex mappings** - With comments in schema

## See Also

- [Migration Guide](./MIGRATION_GUIDE.md) - Complete migration documentation
- [PocketBase Field Types](https://pocketbase.io/docs/collections/) - Official PocketBase docs
- [Zod Documentation](https://zod.dev/) - Zod validation library
