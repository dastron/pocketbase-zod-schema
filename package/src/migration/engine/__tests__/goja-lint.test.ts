/**
 * goja-compatibility lint: what executes here but would fail in PocketBase.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import {
  availableGlobals,
  formatGojaLintFinding,
  gojaFindingsFromWarnings,
  lintMigrationFiles,
  lintMigrationSource,
  type GojaLintRule,
} from "../goja-lint";

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(here, "..", "..", "__tests__", "fixtures");

function rules(source: string): GojaLintRule[] {
  return lintMigrationSource(source).findings.map((finding) => finding.rule);
}

describe("clean migrations", () => {
  it("accepts a migration using only the PocketBase JSVM surface", () => {
    const result = lintMigrationSource(`migrate((app) => {
      const collection = new Collection({ name: "posts", type: "base", fields: [] });
      collection.fields.add(new TextField({ name: "title", max: 200 }));
      collection.indexes = ["CREATE INDEX idx ON posts (title)"];
      unmarshal({ listRule: null }, collection);
      return app.save(collection);
    }, (app) => {
      const collection = app.findCollectionByNameOrId("posts");
      return app.delete(collection);
    });`);

    expect(result.findings).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("accepts loops, helpers, destructuring, template literals and classes", () => {
    const result = lintMigrationSource(`migrate((app) => {
      const defs = [{ name: "a" }, { name: "b" }];
      function build({ name }, index = 0) {
        return new TextField({ name: \`\${name}_\${index}\`, ...{ max: 10 } });
      }
      class Helper {
        constructor(list) { this.list = list; }
        names() { return this.list.map((entry) => entry.name); }
      }
      const collection = app.findCollectionByNameOrId("posts");
      for (const [index, def] of defs.entries()) {
        collection.fields.add(build(def, index));
      }
      new Helper(defs).names().forEach((name) => console.log(name));
      return app.save(collection);
    }, (app) => {});`);

    expect(result.findings).toEqual([]);
  });

  it("accepts every captured fixture migration", () => {
    const files = [
      ...fs
        .readdirSync(path.join(FIXTURES, "reference-migrations"))
        .map((name) => path.join(FIXTURES, "reference-migrations", name)),
      ...fs
        .readdirSync(path.join(FIXTURES, "dynamic-migrations"))
        .map((name) => path.join(FIXTURES, "dynamic-migrations", name)),
    ].filter((file) => file.endsWith(".js"));

    expect(files.length).toBeGreaterThan(0);

    const failures = lintMigrationFiles(files)
      .filter((result) => !result.ok)
      .map((result) => `${result.file}: ${result.findings.map(formatGojaLintFinding).join("; ")}`);

    expect(failures).toEqual([]);
  });
});

describe("Node and browser globals", () => {
  it.each([
    ["require", `migrate((app) => { const fs = require("fs"); });`],
    ["process", `migrate((app) => { console.log(process.env.HOME); });`],
    ["Buffer", `migrate((app) => { Buffer.from("x"); });`],
    ["setTimeout", `migrate((app) => { setTimeout(() => {}, 10); });`],
    ["fetch", `migrate((app) => { fetch("https://example.com"); });`],
    ["window", `migrate((app) => { window.alert("hi"); });`],
  ])("flags %s", (name, source) => {
    const result = lintMigrationSource(source);
    expect(result.ok).toBe(false);
    const finding = result.findings.find((entry) => entry.message.startsWith(name));
    expect(finding?.rule).toBe("unknown-global");
    expect(finding?.message).toMatch(/Node\.js|browser/);
  });

  it("flags an undeclared identifier that is not a known runtime global", () => {
    const result = lintMigrationSource(`migrate((app) => { helper(app); });`);
    expect(rules(`migrate((app) => { helper(app); });`)).toEqual(["unknown-global"]);
    expect(result.findings[0].message).toContain("not part of the PocketBase JSVM surface");
    expect(result.findings[0].line).toBe(1);
  });

  it("does not flag locals, parameters, destructured names or catch bindings", () => {
    expect(
      rules(`migrate((app) => {
        const { name, ...rest } = { name: "a", other: 1 };
        let [first, second = 2] = [1];
        function helper(...args) { return args; }
        try { helper(name, rest, first, second); } catch (error) { console.log(error); }
      }, (app) => {});`)
    ).toEqual([]);
  });

  it("does not flag property names that match Node globals", () => {
    expect(rules(`migrate((app) => { const options = { process: 1, require: 2 }; options.process = 3; });`)).toEqual(
      []
    );
  });

  it("reports a repeated missing global once, at its first use", () => {
    const findings = lintMigrationSource(`migrate((app) => {
      require("a");
      require("b");
      require("c");
    });`).findings;

    expect(findings).toHaveLength(1);
    expect(findings[0].line).toBe(2);
  });

  it("accepts extra globals a custom PocketBase build provides", () => {
    const source = `migrate((app) => { $myBinding.doThing(); });`;
    expect(rules(source)).toEqual(["unknown-global"]);
    expect(lintMigrationSource(source, { allowedGlobals: ["$myBinding"] }).findings).toEqual([]);
  });

  it("exposes the accepted global surface", () => {
    const globals = availableGlobals();
    expect(globals.has("migrate")).toBe(true);
    expect(globals.has("$app")).toBe(true);
    expect(globals.has("Collection")).toBe(true);
    expect(globals.has("TextField")).toBe(true);
    expect(globals.has("JSON")).toBe(true);
    // goja implements neither
    expect(globals.has("BigInt")).toBe(false);
    expect(globals.has("require")).toBe(false);
  });
});

describe("asynchronous code", () => {
  it("flags await", () => {
    const result = lintMigrationSource(`migrate(async (app) => { await app.save({}); });`);
    expect(result.ok).toBe(false);
    expect(new Set(result.findings.map((finding) => finding.rule))).toEqual(new Set(["async"]));
  });

  it("flags an async function declaration", () => {
    expect(rules(`migrate((app) => { async function seed() {} seed(); });`)).toEqual(["async"]);
  });

  it("flags Promise", () => {
    const result = lintMigrationSource(`migrate((app) => { Promise.resolve().then(() => {}); });`);
    expect(result.findings[0].rule).toBe("async");
    expect(result.findings[0].message).toContain("job queue");
  });

  it("flags for await...of", () => {
    expect(rules(`migrate(async (app) => { for await (const x of []) {} });`)).toContain("async");
  });
});

describe("syntax beyond goja", () => {
  it("flags class fields", () => {
    expect(rules(`migrate((app) => { class A { count = 0; } new A(); });`)).toEqual(["unsupported-syntax"]);
  });

  it("flags private class members", () => {
    const found = rules(`migrate((app) => { class A { #secret = 1; read() { return this.#secret; } } new A(); });`);
    expect(found).toContain("unsupported-syntax");
  });

  it("flags static initialization blocks", () => {
    expect(rules(`migrate((app) => { class A { static { console.log("x"); } } new A(); });`)).toContain(
      "unsupported-syntax"
    );
  });

  it("flags BigInt literals", () => {
    const findings = lintMigrationSource(`migrate((app) => { const big = 10n; console.log(big); });`).findings;
    expect(findings.map((finding) => finding.rule)).toEqual(["unsupported-syntax"]);
    expect(findings[0].message).toContain("BigInt");
  });

  it("accepts optional chaining and nullish coalescing, which goja supports", () => {
    expect(rules(`migrate((app) => { const name = app?.settings?.name ?? "default"; console.log(name); });`)).toEqual(
      []
    );
  });
});

describe("module syntax", () => {
  it("flags import statements", () => {
    const result = lintMigrationSource(`import fs from "fs";\nmigrate((app) => {});`);
    expect(result.ok).toBe(false);
    expect(result.findings.some((finding) => finding.rule === "module-syntax")).toBe(true);
  });

  it("flags export statements", () => {
    expect(rules(`export const up = () => {};`)).toContain("module-syntax");
  });

  it("flags dynamic import", () => {
    expect(rules(`migrate((app) => { import("fs"); });`)).toContain("module-syntax");
  });
});

describe("invalid JavaScript", () => {
  it("reports a syntax error with a location and stops", () => {
    const result = lintMigrationSource(`migrate((app) => { const = ; });`, { file: "broken.js" });
    expect(result.ok).toBe(false);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].rule).toBe("syntax");
    expect(result.findings[0].file).toBe("broken.js");
    expect(result.findings[0].line).toBe(1);
  });
});

describe("engine warnings", () => {
  it("surfaces unsupported-api warnings as findings without failing the lint", () => {
    const result = lintMigrationSource(`migrate((app) => {});`, {
      file: "seed.js",
      warnings: [
        { kind: "unsupported-api", api: "$os.getenv", message: "$os.getenv() is not simulated", file: "seed.js" },
        { kind: "console", message: "console.log: hello", file: "seed.js" },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].rule).toBe("unsupported-api");
    expect(result.findings[0].severity).toBe("warning");
  });

  it("converts warnings standalone", () => {
    expect(
      gojaFindingsFromWarnings([{ kind: "unsupported-api", api: "$dbx.exp", message: "not simulated" }])
    ).toHaveLength(1);
  });
});

describe("formatGojaLintFinding", () => {
  it("renders file, position and rule", () => {
    expect(
      formatGojaLintFinding({ rule: "async", severity: "error", message: "nope", file: "a.js", line: 3, column: 5 })
    ).toBe("a.js:3:6 [async] nope");
  });
});
