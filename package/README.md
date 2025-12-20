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
  RelationField,
  RelationsField,
  withPermissions,
} from "pocketbase-zod-schema/schema";

export const PostSchema = withPermissions(
  z.object({
    title: z.string().min(1).max(200),
    content: z.string(),
    published: z.boolean().default(false),
    
    // Single relation to users collection
    author: RelationField({ collection: "users" }),
    
    // Multiple relations to tags collection
    tags: RelationsField({ collection: "tags", maxSelect: 10 }),
  }),
  {
    listRule: '@request.auth.id != ""',
    viewRule: "",
    createRule: '@request.auth.id != ""',
    updateRule: "author = @request.auth.id",
    deleteRule: "author = @request.auth.id",
  }
);
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

### Field Types

The library maps Zod types to PocketBase field types automatically:

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
| `RelationField()` | relation | `author: RelationField({ collection: "users" })` |
| `RelationsField()` | relation | `tags: RelationsField({ collection: "tags" })` |

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

Use `withPermissions()` to attach API rules to your schema:

```typescript
import { withPermissions } from "pocketbase-zod-schema/schema";

// Using direct rules
const PostSchema = withPermissions(
  z.object({ title: z.string() }),
  {
    listRule: '@request.auth.id != ""',     // Authenticated users can list
    viewRule: "",                            // Anyone can view (public)
    createRule: '@request.auth.id != ""',   // Authenticated users can create
    updateRule: "author = @request.auth.id", // Only author can update
    deleteRule: "author = @request.auth.id", // Only author can delete
  }
);

// Using templates
const ProjectSchema = withPermissions(
  z.object({ title: z.string(), owner: RelationField({ collection: "users" }) }),
  {
    template: "owner-only",
    ownerField: "owner",
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
const PostSchema = withPermissions(schema, {
  template: "owner-only",
  ownerField: "author",
  customRules: {
    listRule: '@request.auth.id != ""',  // Override just the list rule
    viewRule: "",                         // Make viewing public
  },
});
```

### Defining Indexes

Use `withIndexes()` to define database indexes:

```typescript
import { withIndexes, withPermissions } from "pocketbase-zod-schema/schema";

const UserSchema = withIndexes(
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
import { withPermissions, withIndexes } from "pocketbase-zod-schema/schema";

export const UserSchema = withIndexes(
  withPermissions(
    z.object({
      name: z.string().optional(),
      email: z.string().email(),
      password: z.string().min(8),
      avatar: z.instanceof(File).optional(),
    }),
    {
      listRule: "id = @request.auth.id",
      viewRule: "id = @request.auth.id",
      createRule: "",
      updateRule: "id = @request.auth.id",
      deleteRule: "id = @request.auth.id",
    }
  ),
  [
    'CREATE UNIQUE INDEX idx_users_email ON users (email)',
  ]
);
```

```typescript
// src/schema/post.ts
import { z } from "zod";
import { 
  RelationField, 
  RelationsField, 
  withPermissions 
} from "pocketbase-zod-schema/schema";

export const PostSchema = withPermissions(
  z.object({
    title: z.string().min(1).max(200),
    slug: z.string(),
    content: z.string(),
    excerpt: z.string().optional(),
    published: z.boolean().default(false),
    publishedAt: z.date().optional(),
    
    // Relations
    author: RelationField({ collection: "users" }),
    category: RelationField({ collection: "categories" }),
    tags: RelationsField({ collection: "tags", maxSelect: 10 }),
  }),
  {
    listRule: 'published = true || author = @request.auth.id',
    viewRule: 'published = true || author = @request.auth.id',
    createRule: '@request.auth.id != ""',
    updateRule: "author = @request.auth.id",
    deleteRule: "author = @request.auth.id",
  }
);
```

```typescript
// src/schema/comment.ts
import { z } from "zod";
import { RelationField, withPermissions } from "pocketbase-zod-schema/schema";

export const CommentSchema = withPermissions(
  z.object({
    content: z.string().min(1),
    
    // Relations with cascade delete
    post: RelationField({ collection: "posts", cascadeDelete: true }),
    author: RelationField({ collection: "users" }),
  }),
  {
    listRule: "",
    viewRule: "",
    createRule: '@request.auth.id != ""',
    updateRule: "author = @request.auth.id",
    deleteRule: "author = @request.auth.id || @request.auth.role = 'admin'",
  }
);
```

---

## License

MIT
