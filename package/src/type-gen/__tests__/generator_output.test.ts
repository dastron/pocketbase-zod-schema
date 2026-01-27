import { describe, expect, it } from "vitest";
import { SchemaDefinition } from "../../migration/types";
import { TypeGenerator } from "../generator";

describe("TypeGenerator", () => {
    it("should generate TypedPocketBase with correct overloads", () => {
        const schema: SchemaDefinition = {
            collections: new Map(),
            snapshots: new Map()
        };

        // Mock collection
        schema.collections.set("users", {
            name: "users",
            fields: [
                { name: "name", type: "text", required: true },
                { name: "role", type: "select", options: { values: ["A", "B"] } }
            ],
            id: "users_id",
            type: "auth",
            system: false,
            listRule: null,
            viewRule: null,
            createRule: null,
            updateRule: null,
            deleteRule: null,
            indexes: [],
            options: {}
        });

        const generator = new TypeGenerator(schema);
        const output = generator.generate();

        // Check Imports
        expect(output).toContain('import PocketBase from "pocketbase";');

        // Check TypedPocketBase
        expect(output).toContain('export interface TypedPocketBase extends PocketBase {');
        expect(output).toContain('collection(idOrName: "users"): RecordService<UsersResponse>;');

        // Check Order: Specific should be before generic
        const specificIndex = output.indexOf('collection(idOrName: "users")');
        const genericIndex = output.indexOf('collection(idOrName: string)');
        expect(specificIndex).toBeLessThan(genericIndex);
        expect(specificIndex).not.toBe(-1);
    });
});
