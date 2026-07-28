import { describe, expect, it } from "vitest";
import { Collection } from "../collection";
import { CollectionStore } from "../store";
import { verifyMigrationRoundTrip, verifyMigrationSources } from "../verify";

const CREATE_POSTS = `
  migrate((app) => {
    return app.save(new Collection({ id: "pbc_posts", name: "posts" }));
  }, (app) => {
    return app.delete(app.findCollectionByNameOrId("pbc_posts"));
  });
`;

function baselineWith(...names: string[]): CollectionStore {
  const store = new CollectionStore();
  for (const name of names) {
    store.upsert(new Collection({ id: `pbc_${name}`, name, fields: [{ id: "text1", name: "title", type: "text" }] }));
  }
  return store;
}

describe("verifyMigrationRoundTrip", () => {
  it("passes a migration whose down undoes its up", () => {
    const result = verifyMigrationRoundTrip({ source: CREATE_POSTS, file: "create_posts.js" });

    expect(result.reversible).toBe(true);
    expect(result.upApplied).toBe(true);
    expect(result.downApplied).toBe(true);
    expect(result.differences).toEqual([]);
    expect(result.file).toBe("create_posts.js");
  });

  it("leaves the baseline store untouched and returns the state after up()", () => {
    const baseline = new CollectionStore();
    const result = verifyMigrationRoundTrip({ source: CREATE_POSTS }, baseline);

    expect(baseline.list()).toHaveLength(0);
    expect(result.storeAfterUp.getByNameOrId("posts")).toBeDefined();
  });

  it("fails a migration whose down forgets part of the up", () => {
    const source = `
      migrate((app) => {
        const collection = app.findCollectionByNameOrId("docs");
        collection.fields.add(new TextField({ id: "text_body", name: "body" }));
        collection.indexes.push("CREATE INDEX \`idx_docs_body\` ON \`docs\` (\`body\`)");
        return app.save(collection);
      }, (app) => {
        const collection = app.findCollectionByNameOrId("docs");
        collection.fields.removeById("text_body");
        return app.save(collection);
      });
    `;

    const result = verifyMigrationRoundTrip({ source, file: "add_body.js" }, baselineWith("docs"));

    expect(result.reversible).toBe(false);
    expect(result.differences).toHaveLength(1);
    expect(result.differences[0].kind).toBe("indexes");
    expect(result.differences[0].message).toContain("state after down()");
  });

  it("flags a migration that registers no down at all", () => {
    const source = `migrate((app) => app.save(new Collection({ id: "pbc_1", name: "orphan" })));`;
    const result = verifyMigrationRoundTrip({ source, file: "orphan.js" });

    expect(result.downApplied).toBe(false);
    expect(result.missingDown).toBe(true);
    expect(result.reversible).toBe(false);
    expect(result.differences.map((difference) => difference.kind)).toEqual(["collection-added"]);
  });

  it("accepts a migration that changes nothing and has no down", () => {
    const result = verifyMigrationRoundTrip({ source: `const noop = 1;`, file: "noop.js" });

    expect(result.upApplied).toBe(false);
    expect(result.missingDown).toBe(false);
    expect(result.reversible).toBe(true);
  });

  it("captures an up() failure instead of throwing", () => {
    const source = `migrate((app) => app.findCollectionByNameOrId("missing"), (app) => null);`;
    const result = verifyMigrationRoundTrip({ source, file: "broken.js" });

    expect(result.error?.phase).toBe("up");
    expect(result.error?.message).toContain("missing");
    expect(result.reversible).toBe(false);
    expect(result.storeAfterUp.list()).toHaveLength(0);
  });

  it("captures a down() failure instead of throwing", () => {
    const source = `
      migrate((app) => app.save(new Collection({ id: "pbc_1", name: "posts" })),
              (app) => app.findCollectionByNameOrId("typo_in_down"));
    `;
    const result = verifyMigrationRoundTrip({ source, file: "broken_down.js" });

    expect(result.error?.phase).toBe("down");
    expect(result.upApplied).toBe(true);
    expect(result.reversible).toBe(false);
    // up() still committed, so a sequence can continue from here
    expect(result.storeAfterUp.getByNameOrId("posts")).toBeDefined();
  });
});

describe("verifyMigrationSources", () => {
  const ADD_FIELD = `
    migrate((app) => {
      const collection = app.findCollectionByNameOrId("posts");
      collection.fields.add(new TextField({ id: "text_body", name: "body" }));
      return app.save(collection);
    }, (app) => {
      const collection = app.findCollectionByNameOrId("posts");
      collection.fields.removeById("text_body");
      return app.save(collection);
    });
  `;

  it("verifies each migration against the state its predecessors left", () => {
    const report = verifyMigrationSources([
      { source: CREATE_POSTS, file: "1_create.js" },
      { source: ADD_FIELD, file: "2_add_field.js" },
    ]);

    expect(report.ok).toBe(true);
    expect(report.failures).toEqual([]);
    expect(report.results.map((result) => result.file)).toEqual(["1_create.js", "2_add_field.js"]);
    // The report's store is the state after every up(), as replay would build it
    expect(report.store.getByNameOrId("posts")!.fields.getByName("body")).toBeDefined();
  });

  it("starts from the given initial store", () => {
    const report = verifyMigrationSources([{ source: ADD_FIELD, file: "add_field.js" }], {
      initialStore: baselineWith("posts"),
    });

    expect(report.ok).toBe(true);
    expect(report.store.getByNameOrId("posts")!.fields.getByName("body")).toBeDefined();
  });

  it("collects failures without stopping at the first unreversible migration", () => {
    const noDown = `migrate((app) => app.save(new Collection({ id: "pbc_2", name: "extra" })));`;
    const report = verifyMigrationSources([
      { source: CREATE_POSTS, file: "1_create.js" },
      { source: noDown, file: "2_no_down.js" },
      { source: ADD_FIELD, file: "3_add_field.js" },
    ]);

    expect(report.ok).toBe(false);
    expect(report.failures.map((failure) => failure.file)).toEqual(["2_no_down.js"]);
    expect(report.results).toHaveLength(3);
  });

  it("stops when a migration cannot be applied at all", () => {
    const broken = `migrate((app) => app.findCollectionByNameOrId("missing"), (app) => null);`;
    const report = verifyMigrationSources([
      { source: broken, file: "1_broken.js" },
      { source: CREATE_POSTS, file: "2_create.js" },
    ]);

    expect(report.ok).toBe(false);
    // Verifying later migrations against a state that will never exist is
    // noise, not signal
    expect(report.results).toHaveLength(1);
    expect(report.results[0].error?.phase).toBe("up");
  });
});
