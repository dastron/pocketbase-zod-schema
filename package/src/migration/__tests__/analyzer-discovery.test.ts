/**
 * Tests for collection discovery in the schema analyzer
 *
 * A Zod object export is a collection iff its description carries collection
 * metadata (what defineCollection()/defineView() produce). Export names carry
 * no meaning, files without a collection are skipped with a warning, and
 * ambiguity (two collections in one file, one name in two files) is an error.
 */

import * as fs from "fs";
import * as path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseSchemaFiles } from "../analyzer";
import { SchemaParsingError } from "../errors";

// Temp dirs live inside __tests__ so the generated files can resolve "zod"
// through the package's node_modules
const tempDirs: string[] = [];

function createSchemaDir(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(__dirname, ".analyzer-discovery-"));
  tempDirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content);
  }
  return dir;
}

afterEach(() => {
  vi.restoreAllMocks();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

function parse(schemaDir: string) {
  return parseSchemaFiles({ schemaDir, useCompiledFiles: false });
}

describe("Analyzer discovery", () => {
  it("should warn and skip files whose Zod exports carry no collection metadata", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const dir = createSchemaDir({
      "bare.ts": `
        import { z } from "zod";
        export const BareSchema = z.object({ title: z.string() });
      `,
      "widget.ts": `
        import { z } from "zod";
        export default z
          .object({ title: z.string() })
          .describe(JSON.stringify({ collectionName: "Widgets" }));
      `,
    });

    const result = await parse(dir);

    expect(Array.from(result.collections.keys())).toEqual(["Widgets"]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("no export carries collection metadata"));
  });

  it("should pick a metadata-carrying named export over a metadata-less default export", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const dir = createSchemaDir({
      "mixed.ts": `
        import { z } from "zod";
        export const GadgetCollection = z
          .object({ title: z.string() })
          .describe(JSON.stringify({ collectionName: "Gadgets" }));
        export default z.object({ other: z.string() });
      `,
    });

    const result = await parse(dir);

    expect(Array.from(result.collections.keys())).toEqual(["Gadgets"]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("should error when one file exports two distinct collections", async () => {
    const dir = createSchemaDir({
      "double.ts": `
        import { z } from "zod";
        export const ACollection = z
          .object({ a: z.string() })
          .describe(JSON.stringify({ collectionName: "As" }));
        export const BCollection = z
          .object({ b: z.string() })
          .describe(JSON.stringify({ collectionName: "Bs" }));
      `,
    });

    await expect(parse(dir)).rejects.toThrow(SchemaParsingError);
    await expect(parse(dir)).rejects.toThrow(/Multiple collection schemas/);
  });

  it("should accept the same object exported as default and named", async () => {
    const dir = createSchemaDir({
      "both.ts": `
        import { z } from "zod";
        const ThingCollection = z
          .object({ title: z.string() })
          .describe(JSON.stringify({ collectionName: "Things" }));
        export default ThingCollection;
        export { ThingCollection };
      `,
    });

    const result = await parse(dir);

    expect(Array.from(result.collections.keys())).toEqual(["Things"]);
  });

  it("should error when two files declare the same collection name", async () => {
    const dir = createSchemaDir({
      "one.ts": `
        import { z } from "zod";
        export default z
          .object({ a: z.string() })
          .describe(JSON.stringify({ collectionName: "Dupes" }));
      `,
      "two.ts": `
        import { z } from "zod";
        export default z
          .object({ b: z.string() })
          .describe(JSON.stringify({ collectionName: "Dupes" }));
      `,
    });

    await expect(parse(dir)).rejects.toThrow(/Collection "Dupes" is declared in both/);
  });

  it("should discover hand-written metadata without defineCollection (e2e harness shape)", async () => {
    // The e2e harness writes named exports with hand-rolled metadata JSON and
    // no default export; the InputSchema sibling carries no metadata
    const dir = createSchemaDir({
      "gizmo.ts": `
        import { z } from "zod";
        export const GizmoInputSchema = z.object({ title: z.string() });
        export const GizmoSchema = GizmoInputSchema.extend({ id: z.string() }).describe(
          JSON.stringify({ collectionName: "Gizmos", type: "base" })
        );
      `,
    });

    const result = await parse(dir);

    expect(Array.from(result.collections.keys())).toEqual(["Gizmos"]);
    expect(result.collections.get("Gizmos")?.type).toBe("base");
  });
});
