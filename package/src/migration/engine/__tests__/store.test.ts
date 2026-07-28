import { describe, expect, it } from "vitest";
import { Collection, ensureAuthSystemFields } from "../collection";
import { CollectionStore } from "../store";

describe("CollectionStore", () => {
  it("upserts by id and looks up by id or name", () => {
    const store = new CollectionStore();
    store.upsert(new Collection({ id: "pbc_1", name: "posts" }));

    expect(store.getById("pbc_1")?.name).toBe("posts");
    expect(store.getByNameOrId("pbc_1")?.name).toBe("posts");
    expect(store.getByNameOrId("posts")?.id).toBe("pbc_1");
    expect(store.getByNameOrId("missing")).toBeUndefined();
  });

  it("keeps lookups consistent after a rename", () => {
    const store = new CollectionStore();
    const collection = new Collection({ id: "pbc_1", name: "posts" });
    store.upsert(collection);

    collection.name = "articles";
    store.upsert(collection);

    expect(store.getByNameOrId("articles")?.id).toBe("pbc_1");
    expect(store.getByNameOrId("posts")).toBeUndefined();
    expect(store.list().length).toBe(1);
  });

  it("resolves the _pb_users_auth_ alias to the users collection", () => {
    const store = new CollectionStore();
    store.upsert(new Collection({ id: "some_custom_id", name: "users", type: "auth" }));

    expect(store.getByNameOrId("_pb_users_auth_")?.name).toBe("users");
  });

  it("finds users stored under the system id directly", () => {
    const store = new CollectionStore();
    store.upsert(new Collection({ id: "_pb_users_auth_", name: "users", type: "auth" }));

    expect(store.getByNameOrId("_pb_users_auth_")?.name).toBe("users");
    expect(store.getByNameOrId("users")?.id).toBe("_pb_users_auth_");
  });

  it("removes by id", () => {
    const store = new CollectionStore();
    store.upsert(new Collection({ id: "pbc_1", name: "posts" }));

    expect(store.removeById("pbc_1")).toBe(true);
    expect(store.removeById("pbc_1")).toBe(false);
    expect(store.list()).toEqual([]);
  });

  it("clone produces an independent deep copy", () => {
    const store = new CollectionStore();
    store.upsert(
      new Collection({
        id: "pbc_1",
        name: "posts",
        fields: [{ id: "a", name: "alpha", type: "text", max: 10 }],
      })
    );

    const clone = store.clone();
    const cloned = clone.getById("pbc_1")!;
    cloned.name = "changed";
    cloned.fields.getByName("alpha")!.max = 999;
    clone.upsert(new Collection({ id: "pbc_2", name: "other" }));

    const original = store.getById("pbc_1")!;
    expect(original.name).toBe("posts");
    expect(original.fields.getByName("alpha")!.max).toBe(10);
    expect(store.getById("pbc_2")).toBeUndefined();
  });

  it("clone does not resurrect a dropped auth system field", () => {
    const store = new CollectionStore();
    const users = new Collection({ id: "_pb_users_auth_", name: "users", type: "auth" });
    ensureAuthSystemFields(users);
    users.fields.removeByName("emailVisibility");
    store.upsert(users);

    const cloned = store.clone().getById("_pb_users_auth_")!;

    expect(cloned.fields.getByName("emailVisibility")).toBeNull();
    expect(cloned.fields.getByName("password")).toBeDefined();
  });

  it("replaceWith commits another store's state", () => {
    const store = new CollectionStore();
    store.upsert(new Collection({ id: "pbc_1", name: "posts" }));

    const tx = store.clone();
    tx.upsert(new Collection({ id: "pbc_2", name: "comments" }));
    tx.removeById("pbc_1");

    store.replaceWith(tx);

    expect(store.getById("pbc_1")).toBeUndefined();
    expect(store.getById("pbc_2")?.name).toBe("comments");
  });

  it("toSnapshot converts to the internal schema model", () => {
    const store = new CollectionStore();
    store.upsert(
      new Collection({
        id: "pbc_1",
        name: "posts",
        type: "base",
        fields: [{ id: "text1", name: "title", type: "text", required: true, max: 100 }],
        indexes: ["CREATE INDEX `idx` ON `posts` (`title`)"],
        listRule: null,
      })
    );

    const snapshot = store.toSnapshot();
    const posts = snapshot.collections.get("posts")!;

    expect(posts.type).toBe("base");
    expect(posts.id).toBe("pbc_1");
    expect(posts.fields.map((f) => f.name)).toEqual(["title"]);
    expect(posts.fields[0].options?.max).toBe(100);
    expect(posts.indexes).toEqual(["CREATE INDEX `idx` ON `posts` (`title`)"]);
    expect(posts.rules?.listRule).toBeNull();
  });
});
