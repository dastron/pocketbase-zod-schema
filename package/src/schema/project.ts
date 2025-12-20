import { z } from "zod";
import { StatusEnum } from "../enums";
import {
  baseImageFileSchema,
  inputImageFileSchema,
  omitImageFilesSchema,
  RelationField,
  RelationsField,
  withPermissions,
} from "./base";

export const ProjectInputSchema = z
  .object({
    // Required fields
    title: z.string(),
    content: z.string(),
    status: StatusEnum,
    summary: z.string().optional(),

    OwnerUser: RelationField({ collection: "Users" }),
    SubscriberUsers: RelationsField({ collection: "Users" }),
  })
  .extend(inputImageFileSchema);

// Apply permissions using template with custom overrides
// Uses 'owner-only' template but allows all authenticated users to list projects
// This allows users to see all projects but only manage their own
export const ProjectSchema = withPermissions(
  ProjectInputSchema.omit(omitImageFilesSchema).extend(baseImageFileSchema),
  {
    template: "owner-only",
    ownerField: "OwnerUser",
    customRules: {
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != "" && (OwnerUser = @request.auth.id || SubscriberUsers ?= @request.auth.id)',
    },
  }
);
