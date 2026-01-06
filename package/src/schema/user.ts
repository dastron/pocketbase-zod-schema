import { z } from "zod";
import { baseSchema, defineCollection } from "./base";
import { EmailField, FileField, TextField } from "./fields";

/** -- User Collections -- */
// Input schema for forms (includes passwordConfirm for validation)
export const UserInputSchema = z.object({
  name: TextField({ min: 0, max: 255, pattern: "" }).optional(),
  email: EmailField(),
  password: TextField({ min: 8 }),
  passwordConfirm: z.string(),
  avatar: FileField({
    mimeTypes: ["image/jpeg", "image/png", "image/svg+xml", "image/gif", "image/webp"],
  }).optional(),
});

// Database schema (excludes passwordConfirm, includes avatar as file field)
export const UserCollectionSchema = z.object({
  name: TextField({ min: 0, max: 255, pattern: "" }).optional(),
  email: EmailField(),
  password: TextField({ min: 8 }),
  avatar: FileField({
    mimeTypes: ["image/jpeg", "image/png", "image/svg+xml", "image/gif", "image/webp"],
  }).optional(),
});

// Full schema with base fields for type inference (used in types.ts)
// This includes id, collectionId, collectionName from baseSchema
export const UserSchema = UserCollectionSchema.extend(baseSchema);

// Matches PocketBase's default users collection configuration
// Using default export - the migration tool will automatically use this
const UserCollection = defineCollection({
  collectionName: "Users",
  type: "auth",
  schema: UserSchema,
  permissions: {
    // Users can list their own profile
    listRule: "id = @request.auth.id",
    // Users can view their own profile
    viewRule: "id = @request.auth.id",
    // Anyone can create an account (sign up)
    createRule: "",
    // Users can only update their own profile
    updateRule: "id = @request.auth.id",
    // Users can only delete their own account
    deleteRule: "id = @request.auth.id",
    // manageRule is null in PocketBase default (not set)
  },
  indexes: [
    // PocketBase's default indexes for auth collections
    "CREATE UNIQUE INDEX `idx_tokenKey__pb_users_auth_` ON `users` (`tokenKey`)",
    "CREATE UNIQUE INDEX `idx_email__pb_users_auth_` ON `users` (`email`) WHERE `email` != ''",
  ],
});

// Default export - preferred pattern for schema files
// The migration tool will automatically detect and use this
export default UserCollection;

// Named export kept for backward compatibility and type inference
export { UserCollection };
