# Migration Guide

This guide helps you migrate from existing PocketBase setups to use the PocketBase Zod Migration package, or upgrade between versions of the package.

## Table of Contents

- [Migrating from Manual PocketBase Setup](#migrating-from-manual-pocketbase-setup)
- [Migrating from Other Migration Tools](#migrating-from-other-migration-tools)
- [Version Upgrade Guide](#version-upgrade-guide)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Migrating from Manual PocketBase Setup

If you have an existing PocketBase instance with manually created collections, follow these steps to migrate to schema-driven development.

### Step 1: Install the Package

```bash
npm install pocketbase-zod-schema
```

### Step 2: Create Schema Definitions

Create Zod schemas that match your existing collections:

```typescript
// src/schema/user.ts
import { z } from 'zod';
import { baseSchema, withPermissions } from 'pocketbase-zod-schema/schema';

export const UserInputSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  avatar: z.string().optional(),
  role: z.enum(['user', 'admin']).default('user'),
});

export const UserSchema = withPermissions(
  baseSchema.extend(UserInputSchema.shape),
  {
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: '',
    updateRule: '@request.auth.id = id',
    deleteRule: '@request.auth.id = id',
  }
);
```

### Step 3: Generate Initial Snapshot

Create a snapshot of your current database state:

```bash
# Export your current PocketBase collections
./pocketbase admin export-collections > current-collections.json

# Generate initial snapshot from existing state
npx pocketbase-migrate status --generate-snapshot
```

### Step 4: Verify Schema Compatibility

Check that your schemas match the existing database:

```bash
npx pocketbase-migrate status
```

If there are differences, adjust your schemas to match the existing structure.

### Step 5: Start Using Schema-Driven Development

From now on, make changes to your schemas and generate migrations:

```bash
# Make changes to your schemas
# Then generate migrations
npx pocketbase-migrate generate
```

## Migrating from Other Migration Tools

### From Prisma

If you're migrating from Prisma, you'll need to convert your Prisma schema to Zod schemas:

**Prisma Schema:**
```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  posts     Post[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Post {
  id        String   @id @default(cuid())
  title     String
  content   String?
  published Boolean  @default(false)
  author    User     @relation(fields: [authorId], references: [id])
  authorId  String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

**Equivalent Zod Schemas:**
```typescript
// src/schema/user.ts
export const UserInputSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
});

export const UserSchema = baseSchema.extend(UserInputSchema.shape);

// src/schema/post.ts
export const PostInputSchema = z.object({
  title: z.string(),
  content: z.string().optional(),
  published: z.boolean().default(false),
  author: z.string(), // Relation to user
});

export const PostSchema = baseSchema.extend(PostInputSchema.shape);
```

### From TypeORM

Convert TypeORM entities to Zod schemas:

**TypeORM Entity:**
```typescript
@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  name?: string;

  @OneToMany(() => Post, post => post.author)
  posts: Post[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

**Equivalent Zod Schema:**
```typescript
export const UserInputSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
});

export const UserSchema = baseSchema.extend(UserInputSchema.shape);
```

### From Drizzle

Convert Drizzle schemas to Zod schemas:

**Drizzle Schema:**
```typescript
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`CURRENT_TIMESTAMP`),
});
```

**Equivalent Zod Schema:**
```typescript
export const UserInputSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
});

export const UserSchema = baseSchema.extend(UserInputSchema.shape);
```

## Version Upgrade Guide

### Upgrading to v1.0.0 (Breaking Changes)

#### Configuration Format Changes

**Old Format (v0.x):**
```json
{
  "schemaDir": "./src/schema",
  "migrationsDir": "./pocketbase/pb_migrations",
  "snapshotPath": "./.migration-snapshot.json"
}
```

**New Format (v1.0.0):**
```json
{
  "schema": {
    "directory": "./src/schema",
    "exclude": ["*.test.ts"]
  },
  "migrations": {
    "directory": "./pocketbase/pb_migrations",
    "format": "js"
  },
  "snapshot": {
    "path": "./.migration-snapshot.json"
  }
}
```

#### API Changes

**Old API:**
```typescript
import { generateMigration } from 'pocketbase-zod-schema';

const result = await generateMigration({
  schemaDir: './src/schema',
  outputDir: './migrations'
});
```

**New API:**
```typescript
import { 
  SchemaAnalyzer,
  DiffEngine,
  MigrationGenerator 
} from 'pocketbase-zod-schema/migration';

const analyzer = new SchemaAnalyzer();
const schemas = await analyzer.parseSchemaFiles('./src/schema');

const diffEngine = new DiffEngine();
const diff = diffEngine.compare(schemas, previousSnapshot);

const generator = new MigrationGenerator();
const migrationPath = generator.generate(diff, './migrations');
```

#### Permission Template Changes

**Old Format:**
```typescript
const UserSchema = z.object({
  name: z.string(),
  email: z.string().email(),
}).extend({
  _permissions: {
    list: '@request.auth.id != ""',
    view: '@request.auth.id != ""',
  }
});
```

**New Format:**
```typescript
const UserSchema = withPermissions(
  baseSchema.extend({
    name: z.string(),
    email: z.string().email(),
  }),
  {
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
  }
);
```

### Upgrading to v0.2.0

#### New Features

- Added support for workspace configurations
- Improved error handling with custom error classes
- Added property-based testing support

#### Migration Steps

1. Update your package.json:
   ```bash
   npm install pocketbase-zod-schema@^0.2.0
   ```

2. Update configuration if using custom paths:
   ```json
   {
     "schema": {
       "directory": "./packages/shared/src/schema"
     }
   }
   ```

3. Update imports if using error handling:
   ```typescript
   import { 
     SchemaParsingError,
     MigrationGenerationError 
   } from 'pocketbase-zod-schema/migration';
   ```

## Best Practices

### Schema Organization

Organize your schemas in a logical structure:

```
src/schema/
├── index.ts          # Export all schemas
├── base.ts           # Base schema patterns
├── permissions.ts    # Permission templates
├── auth/
│   ├── user.ts       # User collection
│   └── session.ts    # Session collection
├── content/
│   ├── post.ts       # Post collection
│   ├── comment.ts    # Comment collection
│   └── tag.ts        # Tag collection
└── system/
    ├── setting.ts    # System settings
    └── log.ts        # Activity logs
```

### Migration Workflow

1. **Make Schema Changes**: Update your Zod schemas
2. **Review Changes**: Use `status` command to preview changes
3. **Generate Migration**: Use `generate` command to create migration
4. **Review Migration**: Check the generated migration file
5. **Test Migration**: Apply to development database first
6. **Apply to Production**: Apply migration to production database

### Version Control

Include in version control:
```gitignore
# Include
pocketbase/pb_migrations/
.migration-snapshot.json
src/schema/

# Exclude
pocketbase/pb_data/
node_modules/
dist/
```

### Testing Strategy

Test your schemas and migrations:

```typescript
// __tests__/schema.test.ts
import { describe, it, expect } from 'vitest';
import { UserSchema } from '../src/schema/user.js';

describe('User Schema', () => {
  it('should validate valid user data', () => {
    const validUser = {
      name: 'John Doe',
      email: 'john@example.com',
      role: 'user'
    };
    
    expect(() => UserSchema.parse(validUser)).not.toThrow();
  });

  it('should reject invalid email', () => {
    const invalidUser = {
      name: 'John Doe',
      email: 'invalid-email',
      role: 'user'
    };
    
    expect(() => UserSchema.parse(invalidUser)).toThrow();
  });
});
```

## Troubleshooting

### Common Migration Issues

#### Schema Not Found

**Error:**
```
Error: No schema files found in ./src/schema
```

**Solution:**
- Ensure schema files end with `Schema.ts` or `InputSchema.ts`
- Check the configured schema directory path
- Verify files are properly exported

#### Migration Conflicts

**Error:**
```
Error: Migration timestamp conflicts with existing migration
```

**Solution:**
- Wait a moment and regenerate the migration
- Manually resolve timestamp conflicts in migration files
- Check for concurrent migration generation

#### Destructive Changes Blocked

**Warning:**
```
Warning: Destructive changes detected. Use --force to proceed.
```

**Solution:**
- Review the changes using `pocketbase-migrate status`
- Ensure changes are intentional
- Use `--force` flag if changes are safe
- Consider data migration scripts for complex changes

#### Type Errors

**Error:**
```
Type 'string' is not assignable to type 'ZodString'
```

**Solution:**
- Ensure you're using Zod schema methods correctly
- Check import statements for Zod
- Verify TypeScript configuration

### Performance Issues

#### Slow Schema Parsing

**Symptoms:**
- Long delays when running migration commands
- High memory usage during parsing

**Solutions:**
- Exclude test files from schema directory
- Use more specific include/exclude patterns
- Split large schemas into smaller files

#### Large Migration Files

**Symptoms:**
- Very large migration files
- Slow migration application

**Solutions:**
- Break down large schema changes into smaller migrations
- Use incremental migration approach
- Consider data migration strategies

### Configuration Issues

#### Invalid Configuration

**Error:**
```
ConfigurationError: Invalid configuration format
```

**Solution:**
- Validate JSON syntax in configuration file
- Check required configuration fields
- Use configuration schema validation

#### Path Resolution Issues

**Error:**
```
FileSystemError: Cannot resolve path ./src/schema
```

**Solution:**
- Use absolute paths or paths relative to project root
- Check file permissions
- Verify directory exists

### Getting Help

If you encounter issues not covered in this guide:

1. Check the [GitHub Issues](https://github.com/dastron/pocketbase-zod-schema/issues)
2. Search existing discussions
3. Create a new issue with:
   - Clear description of the problem
   - Steps to reproduce
   - Environment information
   - Relevant configuration and code examples

## Additional Resources

- [API Reference](API.md)
- [Contributing Guide](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)
- [PocketBase Documentation](https://pocketbase.io/docs/)
- [Zod Documentation](https://zod.dev/)