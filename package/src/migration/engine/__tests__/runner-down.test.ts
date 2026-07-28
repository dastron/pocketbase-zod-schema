import { describe, expect, it } from "vitest";
import { MigrationExecutionError } from "../../errors";
import { executeMigrationDownSource, executeMigrationSource } from "../runner";
import { CollectionStore } from "../store";

function runUp(source: string, store: CollectionStore) {
  return executeMigrationSource(source, store, { filename: "test-migration.js" });
}

function runDown(source: string, store: CollectionStore, options = {}) {
  return executeMigrationDownSource(source, store, { filename: "test-migration.js", ...options });
}

const CREATE_POSTS = `
  migrate((app) => {
    return app.save(new Collection({ id: "pbc_1", name: "posts" }));
  }, (app) => {
    return app.delete(app.findCollectionByNameOrId("pbc_1"));
  });
`;

describe("executeMigrationDownSource", () => {
  it("runs the down function and reports the direction", () => {
    const store = new CollectionStore();
    runUp(CREATE_POSTS, store);
    expect(store.getByNameOrId("posts")).toBeDefined();

    const result = runDown(CREATE_POSTS, store);

    expect(result.direction).toBe("down");
    expect(result.applied).toBe(true);
    expect(store.getByNameOrId("posts")).toBeUndefined();
  });

  it("never executes the up function", () => {
    const store = new CollectionStore();
    runDown(
      `
      migrate((app) => {
        return app.save(new Collection({ id: "pbc_1", name: "created_by_up" }));
      }, (app) => null);
    `,
      store
    );

    expect(store.getByNameOrId("created_by_up")).toBeUndefined();
  });

  it("reports applied=false when the file registers no down", () => {
    const store = new CollectionStore();
    const result = runDown(
      `
      migrate((app) => {
        return app.save(new Collection({ id: "pbc_1", name: "posts" }));
      });
    `,
      store
    );

    expect(result.applied).toBe(false);
    expect(store.list()).toHaveLength(0);
  });

  it("rolls back multiple registrations in reverse order", () => {
    const store = new CollectionStore();
    const source = `
      migrate((app) => app.save(new Collection({ id: "pbc_1", name: "first" })), (app) => {
        const order = app.findCollectionByNameOrId("order");
        order.indexes.push("first");
        return app.save(order);
      });
      migrate((app) => app.save(new Collection({ id: "pbc_2", name: "second" })), (app) => {
        const order = app.findCollectionByNameOrId("order");
        order.indexes.push("second");
        return app.save(order);
      });
    `;

    runUp(`migrate((app) => app.save(new Collection({ id: "pbc_order", name: "order" })), (app) => null);`, store);
    runDown(source, store);

    // The most recently registered migration is undone first
    expect(store.getByNameOrId("order")!.indexes).toEqual(["second", "first"]);
  });

  it("surfaces failures as down-phase MigrationExecutionError", () => {
    const store = new CollectionStore();
    try {
      runDown(`migrate((app) => null, (app) => app.findCollectionByNameOrId("does_not_exist"));`, store);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(MigrationExecutionError);
      expect((error as MigrationExecutionError).phase).toBe("down");
      expect((error as MigrationExecutionError).filePath).toBe("test-migration.js");
      expect((error as MigrationExecutionError).message).toContain("does_not_exist");
    }
  });

  it("rolls back the transaction when down() throws mid-way", () => {
    const store = new CollectionStore();
    runUp(CREATE_POSTS, store);

    expect(() =>
      runDown(
        `
        migrate((app) => null, (app) => {
          app.delete(app.findCollectionByNameOrId("pbc_1"));
          throw new Error("boom");
        });
      `,
        store
      )
    ).toThrowError(MigrationExecutionError);

    // The delete before the throw must not leak into the store
    expect(store.getByNameOrId("posts")).toBeDefined();
  });

  it("kills infinite loops inside down() via the vm timeout", () => {
    expect(() =>
      runDown(`migrate((app) => null, (app) => { while (true) {} });`, new CollectionStore(), { timeoutMs: 200 })
    ).toThrowError(MigrationExecutionError);
  });

  it("binds $app to the transactional app while down() runs", () => {
    const store = new CollectionStore();
    runUp(CREATE_POSTS, store);

    runDown(`migrate((app) => null, (app) => $app.delete($app.findCollectionByNameOrId("pbc_1")));`, store);

    expect(store.getByNameOrId("posts")).toBeUndefined();
  });

  it("evaluates the file fresh, so down() cannot observe up()'s module state", () => {
    // PocketBase runs `migrate down` as a separate invocation; a down that
    // reads a variable up() mutated must see its initial value
    const source = `
      let applied = false;
      migrate((app) => {
        applied = true;
        return app.save(new Collection({ id: "pbc_1", name: "probe" }));
      }, (app) => {
        const collection = app.findCollectionByNameOrId("pbc_1");
        collection.indexes.push("sawAppliedFlag=" + applied);
        return app.save(collection);
      });
    `;

    const store = new CollectionStore();
    runUp(source, store);
    runDown(source, store);

    expect(store.getByNameOrId("probe")!.indexes).toEqual(["sawAppliedFlag=false"]);
  });
});
