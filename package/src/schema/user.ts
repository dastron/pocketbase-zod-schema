import { z } from "zod";
import { baseSchema, defineCollection } from "./base";

/** -- User Collections -- */
// Input schema for forms (includes passwordConfirm for validation)
export const UserInputSchema = z.object({
  name: z.string().optional(),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  passwordConfirm: z.string(),
  avatar: z.instanceof(File).optional(),
});

// Database schema (excludes passwordConfirm, includes avatar as file field)
export const UserCollectionSchema = z.object({
  name: z.string().optional(),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  avatar: z.instanceof(File).optional(),
});

// Full schema with base fields for type inference (used in types.ts)
// This includes id, collectionId, collectionName from baseSchema
export const UserSchema = UserCollectionSchema.extend(baseSchema);

// Matches PocketBase's default users collection configuration
export const UserCollection = defineCollection({
  collectionName: "Users",
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
