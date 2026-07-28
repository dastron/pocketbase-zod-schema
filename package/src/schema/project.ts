import { z } from "zod";
import { baseSchema, defineCollection, RelationField, RelationsField } from "./base";
import { EditorField, JSONField, SelectField, TextField } from "./fields";

export const ProjectInputSchema = z.object({
  // Required fields - using field helpers for explicit type definitions
  title: TextField({ min: 1, max: 200 }),
  content: EditorField(),
  status: SelectField(["draft", "active", "complete", "fail"]),
  summary: TextField({ max: 500 }).optional(),
  metadata: JSONField(
    z.object({
      title: z.string(),
      description: z.string(),
      tags: z.array(z.string()),
    })
  ),
  OwnerUser: RelationField({ collection: "Users" }),
  SubscriberUsers: RelationsField({ collection: "Users" }),
});

// Full schema with PocketBase system fields, for type inference
export const ProjectSchema = ProjectInputSchema.extend(baseSchema);

// Define collection with permissions using template and custom overrides
// Uses 'owner-only' template but allows all authenticated users to list projects
// This allows users to see all projects but only manage their own
const ProjectCollection = defineCollection({
  collectionName: "Projects",
  schema: ProjectSchema,
  permissions: {
    template: "owner-only",
    ownerField: "OwnerUser",
    customRules: {
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != "" && (OwnerUser = @request.auth.id || SubscriberUsers ?= @request.auth.id)',
    },
  },
});

// Default export - preferred pattern for schema files
// The migration tool will automatically detect and use this
export default ProjectCollection;

// Named export kept for type inference convenience
export { ProjectCollection };
