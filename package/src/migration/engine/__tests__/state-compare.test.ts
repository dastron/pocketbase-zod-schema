import { describe, expect, it } from "vitest";
import { Collection } from "../collection";
import { compareRawCollections, compareStores } from "../state-compare";
import { CollectionStore } from "../store";
import type { RawCollection } from "../types";

function storeOf(...collections: RawCollection[]): CollectionStore {
  const store = new CollectionStore();
  for (const raw of collections) {
    store.upsert(new Collection(raw));
  }
  return store;
}

const POSTS: RawCollection = {
  id: "pbc_1",
  name: "posts",
  type: "base",
  fields: [{ id: "text1", name: "title", type: "text", required: true, max: 200 }],
  indexes: ["CREATE INDEX `idx_posts_title` ON `posts` (`title`)"],
};

describe("compareStores", () => {
  it("reports no differences for identical states", () => {
    expect(compareStores(storeOf(POSTS), storeOf(POSTS))).toEqual([]);
  });

  it("reports a collection missing from the actual state", () => {
    const differences = compareStores(storeOf(POSTS), storeOf());

    expect(differences).toHaveLength(1);
    expect(differences[0].kind).toBe("collection-removed");
    expect(differences[0].collection).toBe("posts");
  });

  it("reports a collection the actual state has left behind", () => {
    const differences = compareStores(storeOf(), storeOf(POSTS));

    expect(differences).toHaveLength(1);
    expect(differences[0].kind).toBe("collection-added");
    expect(differences[0].collection).toBe("posts");
  });

  it("matches collections by id across a rename", () => {
    const renamed = { ...POSTS, name: "articles" };
    const differences = compareStores(storeOf(POSTS), storeOf(renamed));

    expect(differences).toHaveLength(1);
    expect(differences[0].kind).toBe("collection-property");
    expect(differences[0].property).toBe("name");
    expect(differences[0].actual).toBe("articles");
  });

  it("reports added, removed and changed fields", () => {
    const changed: RawCollection = {
      ...POSTS,
      fields: [
        { id: "text1", name: "title", type: "text", required: false, max: 200 },
        { id: "text2", name: "body", type: "text" },
      ],
    };

    const differences = compareStores(storeOf(POSTS), storeOf(changed));
    const kinds = differences.map((difference) => `${difference.kind}:${difference.field}`);

    expect(kinds).toContain("field-property:title");
    expect(kinds).toContain("field-added:body");
    expect(differences.find((difference) => difference.kind === "field-property")!.property).toBe("required");
  });

  it("reports a field the rollback failed to restore", () => {
    const withoutTitle: RawCollection = { ...POSTS, fields: [] };
    const differences = compareStores(storeOf(POSTS), storeOf(withoutTitle));

    expect(differences.map((difference) => difference.kind)).toEqual(["field-removed"]);
    expect(differences[0].field).toBe("title");
  });
});

describe("compareRawCollections normalization", () => {
  const base: RawCollection = { id: "pbc_1", name: "posts", type: "base", fields: [], indexes: [] };

  it("treats an undeclared option and its zero value as the same constraint", () => {
    const declared = { ...base, fields: [{ id: "text1", name: "title", type: "text", max: 0, pattern: "" }] };
    const undeclared = { ...base, fields: [{ id: "text1", name: "title", type: "text" }] };

    expect(compareRawCollections([declared], [undeclared])).toEqual([]);
  });

  it("still compares two declared values", () => {
    const min0 = { ...base, fields: [{ id: "text1", name: "title", type: "text", min: 0 }] };
    const min5 = { ...base, fields: [{ id: "text1", name: "title", type: "text", min: 5 }] };

    const differences = compareRawCollections([min0], [min5]);
    expect(differences).toHaveLength(1);
    expect(differences[0].property).toBe("min");
  });

  it("distinguishes a null rule (superuser only) from an empty one (public)", () => {
    const superuserOnly = { ...base, listRule: null };
    const publicRule = { ...base, listRule: "" };

    expect(compareRawCollections([superuserOnly], [publicRule])).toHaveLength(1);
    // An undeclared rule means superuser-only, same as null
    expect(compareRawCollections([base], [superuserOnly])).toEqual([]);
    expect(compareRawCollections([base], [publicRule])).toHaveLength(1);
  });

  it("ignores index order but not index content", () => {
    const twoIndexes = { ...base, indexes: ["CREATE INDEX `a` ON `posts` (`x`)", "CREATE INDEX `b` ON `posts` (`y`)"] };
    const reordered = { ...base, indexes: [...twoIndexes.indexes].reverse() };
    const missingOne = { ...base, indexes: [twoIndexes.indexes[0]] };

    expect(compareRawCollections([twoIndexes], [reordered])).toEqual([]);
    expect(compareRawCollections([twoIndexes], [missingOne])).toHaveLength(1);
  });

  it("ignores index whitespace differences", () => {
    const spaced = { ...base, indexes: ["CREATE INDEX `a`  ON  `posts` (`x`)"] };
    const tight = { ...base, indexes: ["CREATE INDEX `a` ON `posts` (`x`)"] };

    expect(compareRawCollections([spaced], [tight])).toEqual([]);
  });

  it("ignores field order by default and reports it under strictFieldOrder", () => {
    const fields = [
      { id: "text1", name: "title", type: "text" },
      { id: "text2", name: "body", type: "text" },
    ];
    const ordered = { ...base, fields };
    const reordered = { ...base, fields: [...fields].reverse() };

    expect(compareRawCollections([ordered], [reordered])).toEqual([]);

    const strict = compareRawCollections([ordered], [reordered], { strictFieldOrder: true });
    expect(strict).toHaveLength(1);
    expect(strict[0].kind).toBe("field-order");
  });

  it("ignores PocketBase's own timestamps", () => {
    const created = { ...base, created: "2024-01-01 00:00:00.000Z", updated: "2024-01-01 00:00:00.000Z" };
    const recreated = { ...base, created: "2025-06-01 00:00:00.000Z", updated: "2025-06-01 00:00:00.000Z" };

    expect(compareRawCollections([created], [recreated])).toEqual([]);
  });

  it("reports a restored field carrying a different id", () => {
    const original = { ...base, fields: [{ id: "text1", name: "title", type: "text" }] };
    const restored = { ...base, fields: [{ id: "text9999999999", name: "title", type: "text" }] };

    const differences = compareRawCollections([original], [restored]);
    expect(differences).toHaveLength(1);
    expect(differences[0].property).toBe("id");
  });

  it("uses the given labels in messages", () => {
    const differences = compareRawCollections([base], [], {
      labels: { expected: "pre-migration state", actual: "state after down()" },
    });

    expect(differences[0].message).toContain("state after down()");
  });
});
