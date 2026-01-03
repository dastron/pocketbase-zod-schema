# pocketbase-zod-schema

Define your PocketBase collections using Zod schemas and automatically generate migration files.

## Features

- **Type-safe schema definitions** - Use Zod to define your PocketBase collections with full TypeScript support
- **Automatic migrations** - Generate PocketBase-compatible migration files from your schema changes
- **Relation support** - Easily define single and multiple relations between collections
- **Permission templates** - Built-in templates for common permission patterns
- **Index definitions** - Declare indexes alongside your schema
- **CLI & programmatic API** - Use the CLI for quick generation or the API for custom workflows

## Installation

```bash
npm install pocketbase-zod-schema
# or
yarn add pocketbase-zod-schema
# or
pnpm add pocketbase-zod-schema
```

## Quick Start

### 1. Create a schema file

Create a schema file in your project (e.g., `src/schema/post.ts`):

```typescript
import { z } from "zod";
import {
  defineCollection,
  TextField,
  EditorField,
  BoolField,
  RelationField,
  RelationsField,
} from "pocketbase-zod-schema/schema";

// Define the Zod schema
export const PostSchema = z.object({
  title: TextField({ min: 1, max: 200 }),
  content: EditorField(),
  published: BoolField(),
  
  // Single relation to users collection
  author: RelationField({ collection: "users" }),
  
  // Multiple relations to tags collection
  tags: RelationsField({ collection: "tags", maxSelect: 10 }),
});

// Define the collection with permissions
export const PostCollection = defineCollection({
  collectionName: "posts",
  schema: PostSchema,
  permissions: {
    listRule: '@request.auth.id != ""',
    viewRule: "",
    createRule: '@request.auth.id != ""',
    updateRule: "author = @request.auth.id",
    deleteRule: "author = @request.auth.id",
  },
});
```

### 2. Configure the CLI

Create `pocketbase-migrate.config.js` at your project root:

```javascript
export default {
  schema: {
    directory: "./src/schema",
    exclude: ["*.test.ts", "*.spec.ts"],
  },
  migrations: {
    directory: "./pocketbase/pb_migrations",
  },
};
```

### 3. Generate migrations

```bash
npx pocketbase-migrate generate
```

This will create a migration file in your PocketBase migrations directory.

**TypeScript Support:** You can use TypeScript (`.ts`) schema files directly - no compilation needed! The tool automatically handles TypeScript files using `tsx`.

---

## Schema Definition

### High-Level Collection Definition

The recommended way to define collections is using `defineCollection()`, which provides a single entry point for collection name, schema, permissions, indexes, and future features:

```typescript
import { z } from "zod";
import { defineCollection, TextField, EditorField, RelationField } from "pocketbase-zod-schema/schema";

export const PostCollectionSchema = z.object({
  title: TextField({ min: 1, max: 200 }),
  content: EditorField(),
  author: RelationField({ collection: "users" }),
});

export const PostCollection = defineCollection({
  collectionName: "posts",
  schema: PostCollectionSchema,
  permissions: {
    template: "owner-only",
    ownerField: "author",
  },
  indexes: [
    "CREATE INDEX idx_posts_author ON posts (author)",
  ],
});
```

**Benefits of `defineCollection()`:**
- **Explicit collection name** - No need to rely on filename conventions
- **All metadata in one place** - Schema, permissions, indexes together
- **Future-proof** - Easy to extend with new features
- **Cleaner syntax** - No nested function calls

**Export Pattern:** It's recommended to export both the schema and collection definition:

```typescript
// Define the Zod schema (for type inference and validation)
export const PostSchema = z.object({
  title: z.string(),
  content: z.string(),
  author: RelationField({ collection: "users" }),
});

// Define the collection (used by migration generator, includes metadata)
export const PostCollection = defineCollection({
  collectionName: "posts",
  schema: PostSchema,
  permissions: { /* ... */ },
});
```

This pattern allows:
- `PostSchema` - Used for type inference (`z.infer<typeof PostSchema>`) and validation
- `PostCollection` - Used by the migration generator (has collection metadata)

**Note:** You can still use `withPermissions()` and `withIndexes()` separately if you prefer, but `defineCollection()` is recommended for new code.

### Field Types

The library provides explicit field helper functions for all PocketBase field types. These helpers embed PocketBase-specific metadata and provide type-safe configuration options.

#### Field Helper Functions

| Field Helper | PocketBase Type | Description | Example |
|--------------|-----------------|-------------|---------|
| `BoolField()` | bool | Boolean field | `active: BoolField()` |
| `NumberField(options?)` | number | Number field with optional constraints | `price: NumberField({ min: 0 })` |
| `TextField(options?)` | text | Text field with optional constraints | `name: TextField({ min: 1, max: 200 })` |
| `EmailField()` | email | Email field with validation | `email: EmailField()` |
| `URLField()` | url | URL field with validation | `website: URLField()` |
| `EditorField()` | editor | Rich text editor field | `content: EditorField()` |
| `DateField(options?)` | date | Date field with optional constraints | `birthdate: DateField()` |
| `AutodateField(options?)` | autodate | Auto-managed timestamp field | `createdAt: AutodateField({ onCreate: true })` |
| `SelectField(values, options?)` | select | Single or multiple select field | `status: SelectField(["draft", "published"])` |
| `FileField(options?)` | file | Single file upload field | `avatar: FileField({ mimeTypes: ["image/*"] })` |
| `FilesField(options?)` | file | Multiple file upload field | `images: FilesField({ maxSelect: 5 })` |
| `JSONField(schema?)` | json | JSON field with optional schema | `metadata: JSONField()` |
| `GeoPointField()` | geoPoint | Geographic coordinates field | `location: GeoPointField()` |
| `RelationField(config)` | relation | Single relation field | `author: RelationField({ collection: "users" })` |
| `RelationsField(config)` | relation | Multiple relation field | `tags: RelationsField({ collection: "tags" })` |

#### Field Options

**BoolField()**
- No options
- Returns: `z.ZodBoolean`

**NumberField(options?)**
- `min?: number` - Minimum value constraint
- `max?: number` - Maximum value constraint
- `noDecimal?: boolean` - Disallow decimal values (integers only)
- Returns: `z.ZodNumber`

**TextField(options?)**
- `min?: number` - Minimum length constraint
- `max?: number` - Maximum length constraint
- `pattern?: RegExp | string` - Pattern constraint (regex)
- `autogeneratePattern?: string` - Auto-generate pattern (e.g., `"[A-Z]{3}-[0-9]{6}"`)
- Returns: `z.ZodString`

**EmailField()**
- No options (includes email validation)
- Returns: `z.ZodString`

**URLField()**
- No options (includes URL validation)
- Returns: `z.ZodString`

**EditorField()**
- No options
- Returns: `z.ZodString`

**DateField(options?)**
- `min?: Date | string` - Minimum date constraint
- `max?: Date | string` - Maximum date constraint
- Returns: `z.ZodString`

**AutodateField(options?)**
- `onCreate?: boolean` - Set date automatically on record creation
- `onUpdate?: boolean` - Update date automatically on record update
- Returns: `z.ZodString`

**SelectField(values, options?)**
- `values: [string, ...string[]]` - Array of allowed values (required)
- `maxSelect?: number` - Maximum selections (default: 1, >1 enables multiple selection)
- Returns: `z.ZodEnum<T>` or `z.ZodArray<z.ZodEnum<T>>`

**FileField(options?)**
- `mimeTypes?: string[]` - Allowed MIME types (e.g., `["image/*", "application/pdf"]`)
- `maxSize?: number` - Maximum file size in bytes
- `thumbs?: string[]` - Thumbnail sizes to generate (e.g., `["100x100", "200x200"]`)
- `protected?: boolean` - Whether file requires auth to access
- Returns: `z.ZodType<File>`

**FilesField(options?)**
- All `FileField` options plus:
- `minSelect?: number` - Minimum number of files required
- `maxSelect?: number` - Maximum number of files allowed
- Returns: `z.ZodArray<z.ZodType<File>>`

**JSONField(schema?)**
- `schema?: z.ZodTypeAny` - Optional Zod schema for JSON structure validation
- Returns: `T | z.ZodRecord<z.ZodString, z.ZodAny>`

**GeoPointField()**
- No options
- Returns: `z.ZodObject<{ lon: z.ZodNumber; lat: z.ZodNumber }>`

#### Field Helper Examples

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
  
  // Boolean field
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
    maxSize: 5242880, // 5MB
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

#### Backward Compatibility

The library still supports plain Zod types for backward compatibility. The migration generator will infer PocketBase field types from Zod types when field helpers are not used:

| Zod Type | PocketBase Type | Example |
|----------|-----------------|---------|
| `z.string()` | text | `title: z.string()` |
| `z.string().email()` | email | `email: z.string().email()` |
| `z.string().url()` | url | `website: z.string().url()` |
| `z.number()` | number | `price: z.number()` |
| `z.boolean()` | bool | `active: z.boolean()` |
| `z.date()` | date | `birthdate: z.date()` |
| `z.enum([...])` | select | `status: z.enum(["draft", "published"])` |
| `z.instanceof(File)` | file | `avatar: z.instanceof(File)` |

**Recommendation:** Use field helpers for new schemas to get explicit field type declarations and access to PocketBase-specific options.

### Defining Relations

Use `RelationField()` for single relations and `RelationsField()` for multiple relations:

```typescript
import { RelationField, RelationsField } from "pocketbase-zod-schema/schema";

const ProjectSchema = z.object({
  name: z.string(),
  
  // Single relation (maxSelect: 1)
  owner: RelationField({ collection: "users" }),
  
  // Single relation with cascade delete
  category: RelationField({ 
    collection: "categories",
    cascadeDelete: true,
  }),
  
  // Multiple relations (maxSelect: 999 by default)
  collaborators: RelationsField({ collection: "users" }),
  
  // Multiple relations with constraints
  tags: RelationsField({ 
    collection: "tags",
    minSelect: 1,
    maxSelect: 5,
  }),
});
```

#### Relation Options

**`RelationField(config)`** - Single relation
- `collection: string` - Target collection name (required)
- `cascadeDelete?: boolean` - Delete related records when this record is deleted (default: `false`)

**`RelationsField(config)`** - Multiple relations
- `collection: string` - Target collection name (required)
- `cascadeDelete?: boolean` - Delete related records when this record is deleted (default: `false`)
- `minSelect?: number` - Minimum number of relations required (default: `0`)
- `maxSelect?: number` - Maximum number of relations allowed (default: `999`)

### Defining Permissions

Use `defineCollection()` with permissions, or `withPermissions()` to attach API rules to your schema:

```typescript
import { defineCollection, withPermissions } from "pocketbase-zod-schema/schema";

// Using defineCollection (recommended)
const PostCollection = defineCollection({
  collectionName: "posts",
  schema: z.object({ title: z.string() }),
  permissions: {
    listRule: '@request.auth.id != ""',     // Authenticated users can list
    viewRule: "",                            // Anyone can view (public)
    createRule: '@request.auth.id != ""',   // Authenticated users can create
    updateRule: "author = @request.auth.id", // Only author can update
    deleteRule: "author = @request.auth.id", // Only author can delete
  },
});

// Using templates with defineCollection
const ProjectCollection = defineCollection({
  collectionName: "projects",
  schema: z.object({ title: z.string(), owner: RelationField({ collection: "users" }) }),
  permissions: {
    template: "owner-only",
    ownerField: "owner",
  },
});

// Using withPermissions (alternative approach)
const PostSchemaAlt = withPermissions(
  z.object({ title: z.string() }),
  {
    listRule: '@request.auth.id != ""',
    viewRule: "",
    createRule: '@request.auth.id != ""',
    updateRule: "author = @request.auth.id",
    deleteRule: "author = @request.auth.id",
  }
);
```

#### Permission Templates

| Template | Description |
|----------|-------------|
| `"public"` | All operations are public (no auth required) |
| `"authenticated"` | All operations require authentication |
| `"owner-only"` | Only the owner can perform operations |

#### Template with Custom Overrides

```typescript
// Using defineCollection (recommended)
const PostCollection = defineCollection({
  collectionName: "posts",
  schema: z.object({ title: z.string(), author: RelationField({ collection: "users" }) }),
  permissions: {
    template: "owner-only",
    ownerField: "author",
    customRules: {
      listRule: '@request.auth.id != ""',  // Override just the list rule
      viewRule: "",                         // Make viewing public
    },
  },
});

// Using withPermissions (alternative)
const PostSchemaAlt = withPermissions(schema, {
  template: "owner-only",
  ownerField: "author",
  customRules: {
    listRule: '@request.auth.id != ""',
    viewRule: "",
  },
});
```

### Defining Indexes

Use `defineCollection()` with indexes, or `withIndexes()` to define database indexes:

```typescript
import { defineCollection, withIndexes, withPermissions } from "pocketbase-zod-schema/schema";

// Using defineCollection (recommended)
const UserCollection = defineCollection({
  collectionName: "users",
  schema: z.object({
    email: z.string().email(),
    username: z.string(),
  }),
  permissions: {
    template: "authenticated",
  },
  indexes: [
    'CREATE UNIQUE INDEX idx_users_email ON users (email)',
    'CREATE INDEX idx_users_username ON users (username)',
  ],
});

// Using withIndexes (alternative)
const UserSchemaAlt = withIndexes(
  withPermissions(
    z.object({
      email: z.string().email(),
      username: z.string(),
    }),
    { template: "authenticated" }
  ),
  [
    'CREATE UNIQUE INDEX idx_users_email ON users (email)',
    'CREATE INDEX idx_users_username ON users (username)',
  ]
);
```

---

## CLI Reference

### Commands

```bash
# Generate migration from schema changes
npx pocketbase-migrate generate

# Show what would be generated without writing files
npx pocketbase-migrate status

# Force generation even with destructive changes
npx pocketbase-migrate generate --force
```

### Configuration Options

```javascript
// pocketbase-migrate.config.js
export default {
  schema: {
    // Directory containing your Zod schema files
    directory: "./src/schema",
    
    // Files to exclude from schema discovery
    exclude: ["*.test.ts", "*.spec.ts", "base.ts", "index.ts"],
  },
  migrations: {
    // Directory to output migration files
    directory: "./pocketbase/pb_migrations",
  },
  diff: {
    // Warn when collections or fields would be deleted
    warnOnDelete: true,
    
    // Require --force flag for destructive changes
    requireForceForDestructive: true,
  },
};
```

---

## Programmatic API

For custom workflows, use the programmatic API:

```typescript
import {
  parseSchemaFiles,
  compare,
  generate,
  loadSnapshotIfExists,
} from "pocketbase-zod-schema/migration";

async function generateMigration() {
  const schemaDir = "./src/schema";
  const migrationsDir = "./pocketbase/pb_migrations";

  // Parse all schema files
  const currentSchema = await parseSchemaFiles(schemaDir);

  // Load the last known state from existing migrations
  const previousSnapshot = loadSnapshotIfExists({ 
    migrationsPath: migrationsDir 
  });

  // Compare schemas and detect changes
  const diff = compare(currentSchema, previousSnapshot);

  // Generate migration file
  if (diff.collectionsToCreate.length > 0 || 
      diff.collectionsToModify.length > 0 || 
      diff.collectionsToDelete.length > 0) {
    const migrationPath = generate(diff, migrationsDir);
    console.log(`Migration created: ${migrationPath}`);
  } else {
    console.log("No changes detected");
  }
}
```

---

## Complete Example

Here's a complete example of a blog schema with users, posts, and comments:

```typescript
// src/schema/user.ts
import { z } from "zod";
import { baseSchema, defineCollection, TextField, EmailField } from "pocketbase-zod-schema/schema";

// Input schema for forms (includes passwordConfirm for validation)
export const UserInputSchema = z.object({
  name: TextField({ max: 100 }).optional(),
  email: EmailField(),
  password: TextField({ min: 8 }),
  passwordConfirm: z.string(),
  avatar: z.instanceof(File).optional(),
});

// Database schema (excludes passwordConfirm)
const UserCollectionSchema = z.object({
  name: TextField({ max: 100 }).optional(),
  email: EmailField(),
  password: TextField({ min: 8 }),
  avatar: z.instanceof(File).optional(),
});

// Full schema with base fields for type inference (includes id, collectionId, etc.)
export const UserSchema = UserCollectionSchema.extend(baseSchema);

// Collection definition with permissions and indexes
export const UserCollection = defineCollection({
  collectionName: "Users",
  schema: UserSchema,
  permissions: {
    listRule: "id = @request.auth.id",
    viewRule: "id = @request.auth.id",
    createRule: "",
    updateRule: "id = @request.auth.id",
    deleteRule: "id = @request.auth.id",
  },
  indexes: [
    'CREATE UNIQUE INDEX idx_users_email ON users (email)',
  ],
});
```

```typescript
// src/schema/post.ts
import { z } from "zod";
import { 
  defineCollection,
  TextField,
  EditorField,
  BoolField,
  DateField,
  RelationField, 
  RelationsField, 
} from "pocketbase-zod-schema/schema";

// Define the Zod schema
export const PostSchema = z.object({
  title: TextField({ min: 1, max: 200 }),
  slug: TextField({ pattern: /^[a-z0-9-]+$/ }),
  content: EditorField(),
  excerpt: TextField({ max: 500 }).optional(),
  published: BoolField(),
  publishedAt: DateField().optional(),
  
  // Relations
  author: RelationField({ collection: "users" }),
  category: RelationField({ collection: "categories" }),
  tags: RelationsField({ collection: "tags", maxSelect: 10 }),
});

// Define the collection with permissions
export const PostCollection = defineCollection({
  collectionName: "posts",
  schema: PostSchema,
  permissions: {
    listRule: 'published = true || author = @request.auth.id',
    viewRule: 'published = true || author = @request.auth.id',
    createRule: '@request.auth.id != ""',
    updateRule: "author = @request.auth.id",
    deleteRule: "author = @request.auth.id",
  },
});
```

```typescript
// src/schema/comment.ts
import { z } from "zod";
import { defineCollection, TextField, RelationField } from "pocketbase-zod-schema/schema";

// Define the Zod schema
export const CommentSchema = z.object({
  content: TextField({ min: 1 }),
  
  // Relations with cascade delete
  post: RelationField({ collection: "posts", cascadeDelete: true }),
  author: RelationField({ collection: "users" }),
});

// Define the collection with permissions
export const CommentCollection = defineCollection({
  collectionName: "comments",
  schema: CommentSchema,
  permissions: {
    listRule: "",
    viewRule: "",
    createRule: '@request.auth.id != ""',
    updateRule: "author = @request.auth.id",
    deleteRule: "author = @request.auth.id || @request.auth.role = 'admin'",
  },
});
```

---

## License

MIT
