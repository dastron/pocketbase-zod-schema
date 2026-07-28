import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineCollection } from "../base";
import type {
  AutodateFieldOptions,
  ByteSize,
  DateFieldOptions,
  EnumFromArray,
  FieldMetadata,
  FileFieldOptions,
  FilesFieldOptions,
  JSONFieldOptions,
  NumberFieldOptions,
  PocketBaseFieldType,
  RelationConfig,
  RelationsConfig,
  SelectFieldOptions,
  TextFieldOptions,
  ViewCollectionConfig,
} from "../index";

describe("Type exports", () => {
  it("should export field option types", () => {
    // This test verifies that TypeScript types are properly exported
    // If this compiles, the types are exported correctly

    const textOptions: TextFieldOptions = { min: 1, max: 100 };
    const numberOptions: NumberFieldOptions = { min: 0, max: 100 };
    const dateOptions: DateFieldOptions = { min: new Date() };
    const autodateOptions: AutodateFieldOptions = { onCreate: true };
    const selectOptions: SelectFieldOptions = { maxSelect: 3 };
    const fileOptions: FileFieldOptions = { maxSize: 1000000 };
    const filesOptions: FilesFieldOptions = { minSelect: 1, maxSelect: 5 };
    const jsonOptions: JSONFieldOptions = { maxSize: "5M" };

    const relationConfig: RelationConfig = { collection: "users" };
    const relationsConfig: RelationsConfig = { collection: "tags", minSelect: 1 };

    const fieldType: PocketBaseFieldType = "text";
    const metadata: FieldMetadata = { type: "text", options: {} };
    const byteSize: ByteSize = "5M";
    const statusEnum: EnumFromArray<["a", "b"]> = z.enum(["a", "b"]);
    const viewConfig: ViewCollectionConfig = {
      collectionName: "Stats",
      schema: z.object({ id: z.string() }),
      viewQuery: "SELECT id FROM projects",
    };

    // If we got here, all types are properly exported
    expect(textOptions).toBeDefined();
    expect(numberOptions).toBeDefined();
    expect(dateOptions).toBeDefined();
    expect(autodateOptions).toBeDefined();
    expect(selectOptions).toBeDefined();
    expect(fileOptions).toBeDefined();
    expect(filesOptions).toBeDefined();
    expect(jsonOptions).toBeDefined();
    expect(relationConfig).toBeDefined();
    expect(relationsConfig).toBeDefined();
    expect(fieldType).toBeDefined();
    expect(metadata).toBeDefined();
    expect(byteSize).toBeDefined();
    expect(statusEnum).toBeDefined();
    expect(viewConfig).toBeDefined();
  });

  it("should reject unknown defineCollection keys at compile time", () => {
    const collection = defineCollection({
      collectionName: "posts",
      schema: z.object({ title: z.string() }),
      // @ts-expect-error - unknown keys are excess-property errors, not silently serialized
      futureOption: true,
    });

    // Unknown keys never reach the serialized metadata
    expect(JSON.parse(collection.description!)).toEqual({ collectionName: "posts" });
  });
});
