import { describe, expect, it } from "vitest";
import { MigrationExecutionError } from "../../errors";
import { executeMigrationSource } from "../runner";
import { CollectionStore } from "../store";

function run(source: string, store = new CollectionStore(), options = {}) {
  return { result: executeMigrationSource(source, store, { filename: "test-migration.js", ...options }), store };
}

describe("executeMigrationSource", () => {
  it("captures migrate() and applies the up function", () => {
    const { result, store } = run(`
      migrate((app) => {
        const collection = new Collection({ id: "pbc_1", name: "posts" });
        return app.save(collection);
      }, (app) => {
        return app.delete(app.findCollectionByNameOrId("pbc_1"));
      });
    `);

    expect(result.applied).toBe(true);
    expect(store.getByNameOrId("posts")).toBeDefined();
  });

  it("supports the multiline native migrate style", () => {
    const { store } = run(`
      migrate(
        (app) => {
          const collection = new Collection({ id: "pbc_1", name: "posts" });
          return app.save(collection);
        },
        (app) => {
          return app.delete(app.findCollectionByNameOrId("pbc_1"));
        }
      );
    `);

    expect(store.getByNameOrId("posts")).toBeDefined();
  });

  it("never executes the down function while running up", () => {
    const { store } = run(`
      migrate((app) => {
        return app.save(new Collection({ id: "pbc_keep", name: "keep_me" }));
      }, (app) => {
        return app.delete(app.findCollectionByNameOrId("pbc_keep"));
      });
    `);

    expect(store.getByNameOrId("keep_me")).toBeDefined();
  });

  it("reports the direction it ran", () => {
    const { result } = run(`migrate((app) => null, (app) => null);`);
    expect(result.direction).toBe("up");
  });

  it("reports applied=false when no migrate() call is registered", () => {
    const { result } = run(`const x = 1;`);
    expect(result.applied).toBe(false);
  });

  it("surfaces syntax errors as evaluate-phase MigrationExecutionError", () => {
    expect(() => run(`migrate((app) => {`)).toThrowError(MigrationExecutionError);
    try {
      run(`migrate((app) => {`);
    } catch (error) {
      expect((error as MigrationExecutionError).phase).toBe("evaluate");
      expect((error as MigrationExecutionError).filePath).toBe("test-migration.js");
    }
  });

  it("throws when up() references a missing collection, naming the file", () => {
    try {
      run(`
        migrate((app) => {
          const collection = app.findCollectionByNameOrId("does_not_exist");
          return app.save(collection);
        }, (app) => null);
      `);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(MigrationExecutionError);
      expect((error as MigrationExecutionError).phase).toBe("up");
      expect((error as MigrationExecutionError).filePath).toBe("test-migration.js");
      expect((error as MigrationExecutionError).message).toContain("does_not_exist");
    }
  });

  it("rolls back the transaction when up() throws mid-way", () => {
    const store = new CollectionStore();
    expect(() =>
      run(
        `
        migrate((app) => {
          app.save(new Collection({ id: "pbc_first", name: "first" }));
          throw new Error("boom");
        }, (app) => null);
      `,
        store
      )
    ).toThrowError(MigrationExecutionError);

    // The save before the throw must not leak into the store
    expect(store.getByNameOrId("first")).toBeUndefined();
  });

  it("kills infinite loops inside up() via the vm timeout", () => {
    expect(() =>
      run(
        `
        migrate((app) => {
          while (true) {}
        }, (app) => null);
      `,
        new CollectionStore(),
        { timeoutMs: 200 }
      )
    ).toThrowError(MigrationExecutionError);
  });

  it("kills infinite loops at the top level via the vm timeout", () => {
    expect(() => run(`while (true) {}`, new CollectionStore(), { timeoutMs: 200 })).toThrowError(
      MigrationExecutionError
    );
  });

  it("captures console output as warnings instead of printing", () => {
    const { result } = run(`
      migrate((app) => {
        console.log("hello", 42);
        return app.save(new Collection({ id: "pbc_1", name: "posts" }));
      }, (app) => null);
    `);

    const consoleWarnings = result.warnings.filter((w) => w.kind === "console");
    expect(consoleWarnings).toHaveLength(1);
    expect(consoleWarnings[0].message).toContain("hello 42");
    expect(consoleWarnings[0].file).toBe("test-migration.js");
  });

  it("lenient mode stubs unsupported APIs with warnings and no-ops", () => {
    const { result, store } = run(`
      migrate((app) => {
        $os.getenv("HOME");
        app.db().newQuery("DELETE FROM posts").execute();
        const record = new Record();
        record.set("x", 1);
        return app.save(new Collection({ id: "pbc_1", name: "posts" }));
      }, (app) => null);
    `);

    expect(store.getByNameOrId("posts")).toBeDefined();
    const apis = result.warnings.filter((w) => w.kind === "unsupported-api").map((w) => w.api);
    expect(apis).toContain("$os.getenv");
    expect(apis).toContain("app.db");
    expect(apis).toContain("Record");
  });

  it("treats an unsimulated list finder as an empty list", () => {
    // The batched fetch-and-delete shape hand-written data migrations use:
    // it must terminate and iterate nothing, not throw "records is not iterable"
    const { result, store } = run(`
      migrate((app) => {
        app.save(new Collection({ id: "pbc_1", name: "posts" }));
        let removed = 0;
        while (true) {
          const records = app.findRecordsByFilter("posts", "id != ''", "", 500, 0);
          if (!records || records.length === 0) {
            break;
          }
          for (const record of records) {
            app.delete(record);
            removed++;
          }
          if (records.length < 500) {
            break;
          }
        }
        const spread = [...app.findAllRecords("posts")];
        console.log("removed", removed, "spread", spread.length);
      }, (app) => null);
    `);

    expect(result.applied).toBe(true);
    expect(store.getByNameOrId("posts")).toBeDefined();
    expect(result.warnings.find((w) => w.kind === "console")?.message).toContain("removed 0 spread 0");
    const apis = result.warnings.filter((w) => w.kind === "unsupported-api").map((w) => w.api);
    expect(apis).toContain("app.findRecordsByFilter");
  });

  it("strict mode throws on unsupported APIs", () => {
    expect(() =>
      run(
        `
        migrate((app) => {
          $os.getenv("HOME");
        }, (app) => null);
      `,
        new CollectionStore(),
        { strictness: "strict" }
      )
    ).toThrowError(MigrationExecutionError);
  });

  it("binds $app to the transactional app while up() runs", () => {
    const { store } = run(`
      migrate((app) => {
        return $app.save(new Collection({ id: "pbc_1", name: "via_global" }));
      }, (app) => null);
    `);

    expect(store.getByNameOrId("via_global")).toBeDefined();
  });

  it("does not expose Node globals in the sandbox", () => {
    const { store } = run(`
      migrate((app) => {
        const collection = new Collection({ id: "pbc_1", name: "env_probe" });
        collection.hasProcess = typeof process !== "undefined";
        collection.hasRequire = typeof require !== "undefined";
        return app.save(collection);
      }, (app) => null);
    `);

    const probe = store.getByNameOrId("env_probe")!;
    expect(probe.hasProcess).toBe(false);
    expect(probe.hasRequire).toBe(false);
  });

  it("assigns ids to saved fields that lack one", () => {
    const { store } = run(`
      migrate((app) => {
        const collection = new Collection({ id: "pbc_1", name: "posts" });
        collection.fields.add(new TextField({ name: "title" }));
        return app.save(collection);
      }, (app) => null);
    `);

    const field = store.getByNameOrId("posts")!.fields.getByName("title")!;
    // The id PocketBase itself would derive: type + crc32(name)
    expect(field.id).toBe("text724990059");
  });

  it("adds the auth system fields when an auth collection is saved", () => {
    const { store } = run(`
      migrate((app) => {
        return app.save(new Collection({ id: "pbc_auth", name: "members", type: "auth" }));
      }, (app) => null);
    `);

    const members = store.getByNameOrId("members")!;
    for (const name of ["email", "password", "tokenKey", "emailVisibility", "verified"]) {
      expect(members.fields.getByName(name), `auth system field ${name}`).toBeDefined();
    }
  });

  it("keeps an auth system field dropped when the collection is not re-saved", () => {
    const { store } = run(`
      migrate((app) => {
        return app.save(new Collection({ id: "pbc_auth", name: "members", type: "auth" }));
      }, (app) => null);
    `);

    // A later migration drops the field without saving; the state the next
    // file replays against must reflect the drop, not silently undo it
    store.getByNameOrId("members")!.fields.removeByName("verified");
    const next = store.clone();

    expect(next.getByNameOrId("members")!.fields.getByName("verified")).toBeNull();
  });
});
