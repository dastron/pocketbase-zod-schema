
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { compare } from "../../diff";
import { generate } from "../../generator";
import type { SchemaDefinition } from "../../types";
import { CreateCollectionWithColumnsSchema } from "../fixtures/schemas";

function createSchemaDefinition(collectionSchema: any): SchemaDefinition {
    return {
        collections: new Map([[collectionSchema.name, collectionSchema]]),
    };
}

describe("Duplicate Migration Detection", () => {
    const tempDir = path.join(os.tmpdir(), "migration-duplicate-test-" + Date.now());

    beforeAll(() => {
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
    });

    afterAll(() => {
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it("should generate a duplicate migration when run twice with the same schema changes", () => {
        const currentSchema = createSchemaDefinition(CreateCollectionWithColumnsSchema);
        // Simulate a fresh start where the collection doesn't exist yet
        const diff = compare(currentSchema, null);

        // Mock timestamp generator to ensure distinct filenames
        let timestamp = 1000;
        const timestampGenerator = () => (timestamp++).toString();

        // First generation
        // FIX: Pass config as object
        const generatedPaths1 = generate(diff, { migrationDir: tempDir, timestampGenerator });
        expect(generatedPaths1).toHaveLength(1);
        const file1 = generatedPaths1[0];
        expect(fs.existsSync(file1)).toBe(true);

        // Second generation: Should be skipped as duplicate
        const generatedPaths2 = generate(diff, { migrationDir: tempDir, timestampGenerator });
        expect(generatedPaths2).toHaveLength(0);

        // Third generation with force: Should generate a new file
        const generatedPaths3 = generate(diff, { migrationDir: tempDir, timestampGenerator, force: true });
        expect(generatedPaths3).toHaveLength(1);
        const file3 = generatedPaths3[0];
        expect(fs.existsSync(file3)).toBe(true);

        // file1 and file3 are different files (different timestamps)
        expect(file1).not.toBe(file3);

        const content1 = fs.readFileSync(file1, "utf-8");
        const content3 = fs.readFileSync(file3, "utf-8");

        // Content should be identical
        expect(content1).toEqual(content3);

        // Check that we have 2 files in the dir (file1 and file3, generatedPaths2 yielded nothing)
        const files = fs.readdirSync(tempDir).filter(f => f.endsWith('.js'));
        expect(files.length).toBe(2);
    });
});
