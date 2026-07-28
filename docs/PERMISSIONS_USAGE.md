# Permission Schema Usage Guide

How to use the permission exports from `pocketbase-zod-schema/schema`.

> `withPermissions()` is the older API and still supported. For new code, pass `permissions`
> directly to `defineCollection()` — it accepts the same `PermissionSchema` and
> `PermissionTemplateConfig` shapes shown here, and keeps the collection name, schema, permissions
> and indexes in one place. Every example below has a `defineCollection()` equivalent:
>
> ```typescript
> export default defineCollection({
>   collectionName: "posts",
>   schema: PostSchema,
>   permissions: { template: "owner-only", ownerField: "author" },
> });
> ```

## Importing

```typescript
import {
  withPermissions,
  PermissionTemplates,
  resolveTemplate,
  type PermissionSchema,
  type PermissionTemplateConfig,
  type APIRuleType,
  type RuleExpression,
  type PermissionTemplate,
} from "pocketbase-zod-schema/schema";
```

## Using Permission Templates

### Public Access

```typescript
import { z } from "zod";
import { withPermissions } from "pocketbase-zod-schema/schema";

const PublicPostSchema = withPermissions(
  z.object({
    title: z.string(),
    content: z.string(),
  }),
  { template: "public" }
);
```

### Authenticated Users Only

```typescript
const AuthenticatedPostSchema = withPermissions(
  z.object({
    title: z.string(),
    content: z.string(),
  }),
  { template: "authenticated" }
);
```

### Owner-Only Access

```typescript
const PrivatePostSchema = withPermissions(
  z.object({
    title: z.string(),
    content: z.string(),
    User: z.string(), // Owner relation field
  }),
  {
    template: "owner-only",
    ownerField: "User",
  }
);
```

### Admin-Only Access

```typescript
const AdminPostSchema = withPermissions(
  z.object({
    title: z.string(),
    content: z.string(),
  }),
  {
    template: "admin-only",
    roleField: "role", // Field to check for admin role
  }
);
```

### Read-Public, Write-Authenticated

```typescript
const BlogPostSchema = withPermissions(
  z.object({
    title: z.string(),
    content: z.string(),
  }),
  { template: "read-public" }
);
```

## Using Custom Rules

```typescript
const CustomPostSchema = withPermissions(
  z.object({
    title: z.string(),
    content: z.string(),
    User: z.string(),
    status: z.enum(["draft", "published"]),
  }),
  {
    listRule: '@request.auth.id != "" && status = "published"',
    viewRule: '@request.auth.id != "" && (User = @request.auth.id || status = "published")',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id != "" && User = @request.auth.id',
    deleteRule: '@request.auth.id != "" && User = @request.auth.id',
  }
);
```

### Relation Paths and Back-Relations

Rules can traverse relations with dot notation, in both directions.

**Forward** — follow a relation field on this collection:

```typescript
// Captions.WorkspaceRef -> Workspaces.OwnerRef
listRule: "WorkspaceRef.OwnerRef = @request.auth.id";
```

**Backward** — PocketBase's `<collection>_via_<field>` syntax selects the rows of
`<collection>` whose `<field>` relation points at the current record. The classic use is a
membership join table:

```typescript
// Workspaces: "I am a member of this workspace".
// WorkspaceMembers.WorkspaceRef points back at Workspaces; ?= is the
// at-least-one-match operator, since the back-relation yields many rows.
listRule: "WorkspaceMembers_via_WorkspaceRef.UserRef ?= @request.auth.id";

// Captions: hop to the workspace first, then walk the same relation backwards
listRule: "WorkspaceRef.WorkspaceMembers_via_WorkspaceRef.UserRef ?= @request.auth.id";
```

Note there is no `WorkspaceMembers_via_WorkspaceRef` field to declare in your Zod schema —
the back-relation is derived from the *other* collection's relation field.

**Validation reaches one hop only.** Rule validation runs per collection, so only the root
of a path is checked against your schema. Everything past the first dot — and any
`_via_` back-relation, whether at the root or mid-chain — is passed through unresolved, as
are `@collection.*` references. A typo in the collection or field half of a back-relation
therefore surfaces at PocketBase runtime (the rule silently matches nothing), not at
`db:generate` time.

## Combining Templates with Custom Rules

```typescript
const HybridPostSchema = withPermissions(
  z.object({
    title: z.string(),
    content: z.string(),
    User: z.string(),
  }),
  {
    template: "owner-only",
    ownerField: "User",
    customRules: {
      // Override list rule to allow viewing all posts
      listRule: '@request.auth.id != ""',
    },
  }
);
```

## Using Permission Templates Directly

```typescript
import { PermissionTemplates } from "pocketbase-zod-schema/schema";

// Get permission rules without attaching to a schema
const publicRules = PermissionTemplates.public();
const authRules = PermissionTemplates.authenticated();
const ownerRules = PermissionTemplates.ownerOnly("User");
const adminRules = PermissionTemplates.adminOnly("role");
const readPublicRules = PermissionTemplates.readPublic();
const lockedRules = PermissionTemplates.locked();                 // every rule null
const readOnlyRules = PermissionTemplates.readOnlyAuthenticated(); // authed read, writes null
```

Note the function names are camelCase (`ownerOnly`) while the `template:` strings are kebab-case
(`"owner-only"`). `locked()` and `readOnlyAuthenticated()` have no `template:` equivalent — call
them directly and pass the result as `permissions`.

## Resolving Templates Programmatically

```typescript
import { resolveTemplate } from "pocketbase-zod-schema/schema";

const config = {
  template: "owner-only" as const,
  ownerField: "User",
  customRules: {
    listRule: '@request.auth.id != ""',
  },
};

const resolvedRules = resolveTemplate(config);
// resolvedRules will have all rules with custom overrides applied
```

## Type Definitions

### PermissionSchema

```typescript
interface PermissionSchema {
  listRule?: RuleExpression;
  viewRule?: RuleExpression;
  createRule?: RuleExpression;
  updateRule?: RuleExpression;
  deleteRule?: RuleExpression;
  manageRule?: RuleExpression; // Only for auth collections
}
```

### RuleExpression

```typescript
type RuleExpression = string | null;
// null = locked (superuser only)
// "" = public access
// string = filter expression
```

### APIRuleType

```typescript
type APIRuleType = "listRule" | "viewRule" | "createRule" | "updateRule" | "deleteRule" | "manageRule";
```

### PermissionTemplate

```typescript
type PermissionTemplate = "public" | "authenticated" | "owner-only" | "admin-only" | "read-public" | "custom";
```

### PermissionTemplateConfig

```typescript
interface PermissionTemplateConfig {
  template: PermissionTemplate;
  ownerField?: string;
  roleField?: string;
  customRules?: Partial<PermissionSchema>;
}
```

## Migration Generation

Once you've defined your schemas with permissions, run the migration generator:

```bash
npx pocketbase-migrate generate
```

The generated migrations include the permission rules, which are applied to your PocketBase
collections when the migration runs.

`manageRule` is only emitted for `auth` collections. View collections accept only `listRule` and
`viewRule` — every write rule on a view is `null`, because PocketBase rejects writes to a view
outright.

## Best Practices

1. **Use templates for common patterns** - They ensure consistency across your collections
2. **Override specific rules when needed** - Use `customRules` to modify template behavior
3. **Validate field references** - Ensure fields referenced in rules exist in your schema
4. **Test your rules** - Verify that your permission rules work as expected
5. **Document complex rules** - Add comments explaining non-obvious permission logic
6. **Use null for locked rules** - Explicitly set rules to `null` for superuser-only access
7. **Use empty string for public** - Set rules to `""` for public access (use with caution)
