import { describe, expect, it } from "vitest";
import { Collection } from "../collection";
import { unmarshal } from "../unmarshal";

describe("unmarshal", () => {
  it("sets scalar values", () => {
    const collection = new Collection({ id: "c1", name: "posts" });
    unmarshal({ name: "articles", listRule: "@request.auth.id != ''" }, collection);

    expect(collection.name).toBe("articles");
    expect(collection.listRule).toBe("@request.auth.id != ''");
  });

  it("sets null rule values (rules can be cleared)", () => {
    const collection = new Collection({ id: "c1", name: "posts", listRule: "x = 1" });
    unmarshal({ listRule: null }, collection);

    expect(collection.listRule).toBeNull();
  });

  it("replaces arrays wholesale (indexes)", () => {
    const collection = new Collection({
      id: "c1",
      name: "posts",
      indexes: ["CREATE INDEX `old` ON `posts` (`a`)"],
    });

    unmarshal({ indexes: ["CREATE INDEX `new` ON `posts` (`b`)"] }, collection);
    expect(collection.indexes).toEqual(["CREATE INDEX `new` ON `posts` (`b`)"]);

    unmarshal({ indexes: [] }, collection);
    expect(collection.indexes).toEqual([]);
  });

  it("merges nested plain objects key by key", () => {
    const target: any = { options: { min: 1, max: 10 } };
    unmarshal({ options: { max: 99 } }, target);

    expect(target.options).toEqual({ min: 1, max: 99 });
  });

  it("replaces the fields list when given a fields array", () => {
    const collection = new Collection({
      id: "c1",
      name: "posts",
      fields: [{ id: "a", name: "alpha", type: "text" }],
    });

    unmarshal({ fields: [{ id: "b", name: "beta", type: "number" }] }, collection);

    expect(collection.fields.map((f) => f.id)).toEqual(["b"]);
  });

  it("ignores non-object data", () => {
    const collection = new Collection({ id: "c1", name: "posts" });
    unmarshal(null, collection);
    unmarshal("nope", collection);
    unmarshal(42, collection);

    expect(collection.name).toBe("posts");
  });
});
