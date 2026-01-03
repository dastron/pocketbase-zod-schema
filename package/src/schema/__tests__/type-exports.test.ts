import { describe, expect, it } from "vitest";
import type {
  AutodateFieldOptions,
  DateFieldOptions,
  FieldMetadata,
  FileFieldOptions,
  FilesFieldOptions,
  NumberFieldOptions,
  PocketBaseFieldType,
  RelationConfig,
  RelationsConfig,
  SelectFieldOptions,
  TextFieldOptions,
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

    const relationConfig: RelationConfig = { collection: "users" };
    const relationsConfig: RelationsConfig = { collection: "tags", minSelect: 1 };

    const fieldType: PocketBaseFieldType = "text";
    const metadata: FieldMetadata = { type: "text", options: {} };

    // If we got here, all types are properly exported
    expect(textOptions).toBeDefined();
    expect(numberOptions).toBeDefined();
    expect(dateOptions).toBeDefined();
    expect(autodateOptions).toBeDefined();
    expect(selectOptions).toBeDefined();
    expect(fileOptions).toBeDefined();
    expect(filesOptions).toBeDefined();
    expect(relationConfig).toBeDefined();
    expect(relationsConfig).toBeDefined();
    expect(fieldType).toBeDefined();
    expect(metadata).toBeDefined();
  });
});
