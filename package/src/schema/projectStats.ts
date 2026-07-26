import { z } from "zod";
import { baseSchema } from "./base";
import { defineView, sql } from "./view";

/** -- Project Stats (view collection) -- */
//
// A read-only VIEW collection: one row per project owner, with a count of the
// projects they own. PocketBase runs the SQL below and derives the collection's
// fields from it, so this Zod schema only describes the shape for TypeScript
// type generation and client-side parsing.
//
// Notes on writing the query:
// - The outermost SELECT must expose an `id` column; PocketBase uses it as the
//   record id, so it needs to be unique per row.
// - A relation column has to be selected bare from the outer table
//   (`p.OwnerUser AS OwnerUser`) for PocketBase to infer it as a real relation
//   field that API rules can traverse. Wrapping the outer select in a subquery
//   degrades every column to `json`.
// - PocketBase's view parser rejects a top-level UNION; put unions in a subquery.

export const ProjectStatsSchema = z
  .object({
    /** The owning user (stored as the user id). */
    OwnerUser: z.string(),
    /** How many projects this user owns. */
    projectCount: z.number(),
  })
  .extend(baseSchema);

const ProjectStatsCollection = defineView({
  collectionName: "ProjectStats",
  schema: ProjectStatsSchema,
  viewQuery: sql`
    SELECT p.OwnerUser AS id,
           p.OwnerUser AS OwnerUser,
           COUNT(*)    AS projectCount
      FROM Projects p
     GROUP BY p.OwnerUser
  `,
  permissions: {
    // Owners can only see their own row
    listRule: "OwnerUser = @request.auth.id",
    viewRule: "OwnerUser = @request.auth.id",
  },
});

// Default export - preferred pattern for schema files
// The migration tool will automatically detect and use this
export default ProjectStatsCollection;

// Named export kept for backward compatibility and type inference
export { ProjectStatsCollection };
