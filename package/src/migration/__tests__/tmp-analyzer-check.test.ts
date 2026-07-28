import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, it } from "vitest";
import { buildSchemaDefinition } from "../analyzer/index";

describe("analyzer surfacing", () => {
  it("reports the refusal with a file path", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "analyzer-check-"));
    fs.writeFileSync(
      path.join(dir, "mediacliplabel.ts"),
      `import { z } from "zod";
export default z.object({
  WorkspaceRef: z.string(),
  Workspace: z.string(),
});
`
    );

    try {
      await buildSchemaDefinition({ schemaDir: dir } as any);
      console.log("NO ERROR (unexpected)");
    } catch (e: any) {
      console.log("NAME:   ", e.name);
      console.log("MESSAGE:", e.message);
      console.log("FILE:   ", e.filePath);
      console.log("DETAIL: ", typeof e.getDetailedMessage === "function" ? e.getDetailedMessage() : "n/a");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
