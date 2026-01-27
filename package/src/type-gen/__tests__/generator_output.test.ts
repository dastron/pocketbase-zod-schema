import { describe, expect, it } from "vitest";
import type { SchemaDefinition } from "../../migration/types";
import { TypeGenerator } from "../generator";

describe("TypeGenerator", () => {
    it("should generate TypedPocketBase with correct overloads", () => {
        const schema: SchemaDefinition = {
            collections: new Map(),
        };

        // Mock collection
        schema.collections.set("users", {
            name: "users",
            type: "auth",
            fields: [
                { name: "name", id: "f1", type: "text", required: true },
                { name: "role", id: "f2", type: "select", required: false, options: { values: ["A", "B"] } },
            ],
            id: "users_id",
            indexes: [],
        });

        const generator = new TypeGenerator(schema);
        const output = generator.generate();

        // Check Imports
        expect(output).toContain('import PocketBase from "pocketbase";');

        // Check TypedPocketBase
        expect(output).toContain('export interface TypedPocketBase extends PocketBase {');
        expect(output).toContain('collection(idOrName: "users"): RecordService<UsersResponse>;');

        // Check that generic fallback is NOT present (strongly typed only)
        expect(output).not.toContain('collection(idOrName: string)');
    });
});
