/**
 * Record / $dbx simulation: `records: "simulate"` executes data migrations
 * against an in-memory row store instead of no-oping them.
 */

import { describe, expect, it } from "vitest";
import { Collection } from "../collection";
import { createDbx, parseStatement, UnsupportedQueryError } from "../dbx";
import { evaluateCondition, ExpressionError, parseCondition } from "../expression";
import { RecordModel } from "../records";
import { executeMigrationDownSource, executeMigrationSource } from "../runner";
import { CollectionStore } from "../store";
import type { EngineOptions, EngineWarning } from "../types";

const SIMULATE: EngineOptions = { records: "simulate" };

function storeWithPosts(): CollectionStore {
  const store = new CollectionStore();
  store.upsert(
    new Collection({
      id: "pbc_posts",
      name: "posts",
      type: "base",
      fields: [
        { id: "text_title", name: "title", type: "text" },
        { id: "text_status", name: "status", type: "text" },
        { id: "number_views", name: "views", type: "number" },
      ],
      indexes: [],
    })
  );
  return store;
}

function seed(store: CollectionStore, rows: Record<string, unknown>[]): void {
  const collection = store.getByNameOrId("posts")!;
  for (const row of rows) {
    store.records.save(new RecordModel(collection, row));
  }
}

function run(store: CollectionStore, body: string, options: EngineOptions = SIMULATE) {
  const warnings: EngineWarning[] = [];
  const result = executeMigrationSource(`migrate((app) => {\n${body}\n}, (app) => {});`, store, {
    ...options,
    onWarning: (warning) => warnings.push(warning),
  });
  return { result, warnings };
}

function rows(store: CollectionStore): Record<string, unknown>[] {
  return store.records.list("pbc_posts").map((record) => record.export());
}

describe("Record", () => {
  it("stores and reads values with the typed getters", () => {
    const store = storeWithPosts();
    const record = new RecordModel(store.getByNameOrId("posts")!, { title: "Hello", views: "12", live: "true" });

    expect(record.get("title")).toBe("Hello");
    expect(record.getString("title")).toBe("Hello");
    expect(record.getInt("views")).toBe(12);
    expect(record.getFloat("views")).toBe(12);
    expect(record.getBool("live")).toBe(true);
    expect(record.getBool("missing")).toBe(false);
    expect(record.getString("missing")).toBe("");
    expect(record.getStringSlice("title")).toEqual(["Hello"]);

    record.set("title", "Changed");
    expect(record.get("title")).toBe("Changed");
    expect(record.collection().name).toBe("posts");
  });

  it("keeps the pre-save values available through originalCopy()", () => {
    const store = storeWithPosts();
    const record = store.records.save(new RecordModel(store.getByNameOrId("posts")!, { title: "First" }));

    record.set("title", "Second");

    expect(record.originalCopy().get("title")).toBe("First");
    expect(record.get("title")).toBe("Second");
  });

  it("assigns an id on save", () => {
    const store = storeWithPosts();
    const record = new RecordModel(store.getByNameOrId("posts")!, { title: "Hello" });

    expect(record.id).toBe("");
    store.records.save(record);
    expect(record.id).toMatch(/^[a-z0-9]{15}$/);
  });

  it("carries the password and pre-modification values across a transaction clone", () => {
    const store = storeWithPosts();
    const record = store.records.save(new RecordModel(store.getByNameOrId("posts")!, { id: "r1", title: "First" }));
    record.setPassword("hunter2");
    record.set("title", "Second");

    const cloned = store.clone().records.getById("pbc_posts", "r1")!;

    expect(cloned.validatePassword("hunter2")).toBe(true);
    expect(cloned.validatePassword("wrong")).toBe(false);
    expect(cloned.originalCopy().get("title")).toBe("First");
    expect(cloned.get("title")).toBe("Second");
    // Rebound to the cloned schema, and independent of the source record
    expect(cloned.collection()).not.toBe(record.collection());
    cloned.set("title", "Third");
    expect(record.get("title")).toBe("Second");
  });

  it("names the fields a record carries that the collection does not declare", () => {
    const store = storeWithPosts();
    const record = new RecordModel(store.getByNameOrId("posts")!, { title: "Hello", oops: 1 });
    expect(record.undeclaredFields()).toEqual(["oops"]);
  });
});

describe("record operations inside a migration", () => {
  it("seeds records through new Record() and app.save()", () => {
    const store = storeWithPosts();

    run(
      store,
      `const posts = app.findCollectionByNameOrId("posts");
       for (const title of ["a", "b", "c"]) {
         const record = new Record(posts);
         record.set("title", title);
         record.set("status", "draft");
         app.save(record);
       }`
    );

    expect(rows(store).map((row) => row.title)).toEqual(["a", "b", "c"]);
  });

  it("reads records back and transforms them", () => {
    const store = storeWithPosts();
    seed(store, [
      { id: "r1", title: "one", status: "draft", views: 5 },
      { id: "r2", title: "two", status: "published", views: 50 },
    ]);

    run(
      store,
      `const posts = app.findCollectionByNameOrId("posts");
       for (const record of app.findAllRecords(posts)) {
         record.set("title", record.getString("title").toUpperCase());
         app.save(record);
       }`
    );

    expect(rows(store).map((row) => row.title)).toEqual(["ONE", "TWO"]);
  });

  it("finds a record by id and throws like PocketBase on a miss", () => {
    const store = storeWithPosts();
    seed(store, [{ id: "r1", title: "one" }]);

    const { result } = run(store, `app.findRecordById("posts", "r1");`);
    expect(result.applied).toBe(true);

    expect(() => run(store, `app.findRecordById("posts", "nope");`)).toThrow(/no rows in result set/);
  });

  it("filters with PocketBase filter syntax, sort, and limit", () => {
    const store = storeWithPosts();
    seed(store, [
      { id: "r1", title: "one", status: "draft", views: 5 },
      { id: "r2", title: "two", status: "published", views: 50 },
      { id: "r3", title: "three", status: "published", views: 500 },
    ]);

    run(
      store,
      `const found = app.findRecordsByFilter("posts", 'status = "published" && views > 100', "-views", 10, 0);
       for (const record of found) {
         record.set("status", "featured");
         app.save(record);
       }`
    );

    expect(rows(store).map((row) => row.status)).toEqual(["draft", "published", "featured"]);
  });

  it("sorts numeric fields numerically, like ORDER BY", () => {
    const store = storeWithPosts();
    seed(store, [
      { id: "r1", title: "nine", views: 9 },
      { id: "r2", title: "ten", views: 10 },
      { id: "r3", title: "two", views: 2 },
    ]);

    run(
      store,
      `const ordered = app.findRecordsByFilter("posts", "views > 0", "-views", 0, 0);
       const first = ordered[0];
       first.set("status", "top");
       app.save(first);

       const viaSql = app.db().newQuery("SELECT id FROM posts ORDER BY views DESC").all();
       const sqlFirst = app.findRecordById("posts", viaSql[0].id);
       sqlFirst.set("title", "sql-top");
       app.save(sqlFirst);`
    );

    const top = rows(store).find((row) => row.status === "top")!;
    expect(top.views).toBe(10);
    expect(top.title).toBe("sql-top");
  });

  it("binds filter parameters", () => {
    const store = storeWithPosts();
    seed(store, [
      { id: "r1", title: "one", status: "draft" },
      { id: "r2", title: "two", status: "published" },
    ]);

    run(
      store,
      `const found = app.findRecordsByFilter("posts", "status = {:status}", "", 0, 0, { status: "published" });
       found[0].set("title", "matched");
       app.save(found[0]);`
    );

    expect(rows(store).map((row) => row.title)).toEqual(["one", "matched"]);
  });

  it("counts and filters with $dbx expressions", () => {
    const store = storeWithPosts();
    seed(store, [
      { id: "r1", title: "one", status: "draft" },
      { id: "r2", title: "two", status: "published" },
      { id: "r3", title: "three", status: "published" },
    ]);

    run(
      store,
      `const published = app.countRecords("posts", $dbx.hashExp({ status: "published" }));
       const drafts = app.findAllRecords("posts", $dbx.exp("status = 'draft'"));
       drafts[0].set("title", "count:" + published);
       app.save(drafts[0]);`
    );

    expect(rows(store)[0].title).toBe("count:2");
  });

  it("deletes records", () => {
    const store = storeWithPosts();
    seed(store, [
      { id: "r1", title: "one", status: "draft" },
      { id: "r2", title: "two", status: "published" },
    ]);

    run(
      store,
      `for (const record of app.findAllRecords("posts", $dbx.hashExp({ status: "draft" }))) {
         app.delete(record);
       }`
    );

    expect(rows(store).map((row) => row.id)).toEqual(["r2"]);
  });

  it("drops a collection's rows when the collection is deleted", () => {
    const store = storeWithPosts();
    seed(store, [{ id: "r1", title: "one" }]);

    run(store, `app.delete(app.findCollectionByNameOrId("posts"));`);

    expect(store.records.list("pbc_posts")).toEqual([]);
  });
});

describe("app.db() DML", () => {
  it("updates rows matching a bound WHERE clause", () => {
    const store = storeWithPosts();
    seed(store, [
      { id: "r1", title: "one", status: "draft" },
      { id: "r2", title: "two", status: "published" },
    ]);

    run(
      store,
      `app.db()
         .newQuery("UPDATE posts SET status = {:next} WHERE status = {:current}")
         .bind({ next: "archived", current: "draft" })
         .execute();`
    );

    expect(rows(store).map((row) => row.status)).toEqual(["archived", "published"]);
  });

  it("deletes rows", () => {
    const store = storeWithPosts();
    seed(store, [
      { id: "r1", title: "one", status: "draft" },
      { id: "r2", title: "two", status: "published" },
    ]);

    run(store, `app.db().newQuery("DELETE FROM posts WHERE status = 'draft'").execute();`);

    expect(rows(store).map((row) => row.id)).toEqual(["r2"]);
  });

  it("inserts rows", () => {
    const store = storeWithPosts();

    run(
      store,
      `app.db()
         .newQuery("INSERT INTO posts (id, title, status) VALUES ({:id}, 'seeded', 'draft')")
         .bind({ id: "r9" })
         .execute();`
    );

    expect(rows(store)).toEqual([{ id: "r9", title: "seeded", status: "draft" }]);
  });

  it("selects rows with projection, ordering and limit", () => {
    const store = storeWithPosts();
    seed(store, [
      { id: "r1", title: "one", views: 5 },
      { id: "r2", title: "two", views: 50 },
      { id: "r3", title: "three", views: 500 },
    ]);

    run(
      store,
      `const found = app.db().newQuery("SELECT id, title FROM posts ORDER BY views DESC LIMIT 2").all();
       const record = app.findRecordById("posts", found[0].id);
       record.set("title", found.map((row) => row.title).join(","));
       app.save(record);`
    );

    expect(store.records.getById("pbc_posts", "r3")!.get("title")).toBe("three,two");
  });

  it("reports an unsupported query instead of silently matching nothing", () => {
    const store = storeWithPosts();
    const { warnings } = run(store, `app.db().newQuery("SELECT * FROM posts JOIN authors ON 1=1").all();`);

    const reported = warnings.find((warning) => warning.api === "app.db");
    expect(reported?.message).toContain("JOIN authors");
    expect(reported?.message).toContain("skipped");
  });

  it("throws on an unsupported query in strict mode", () => {
    const store = storeWithPosts();
    expect(() =>
      run(store, `app.db().newQuery("WITH x AS (SELECT 1) SELECT * FROM x").all();`, {
        records: "simulate",
        strictness: "strict",
      })
    ).toThrow(/not simulated|Only single-table/);
  });
});

describe("transaction semantics", () => {
  it("discards record changes when the migration throws", () => {
    const store = storeWithPosts();
    seed(store, [{ id: "r1", title: "one" }]);

    expect(() =>
      run(
        store,
        `const record = app.findRecordById("posts", "r1");
         record.set("title", "changed");
         app.save(record);
         throw new Error("boom");`
      )
    ).toThrow(/boom/);

    expect(rows(store)[0].title).toBe("one");
  });

  it("keeps rows out of the way of a down() that recreates the collection", () => {
    const store = storeWithPosts();
    seed(store, [{ id: "r1", title: "one" }]);

    executeMigrationDownSource(
      `migrate((app) => {}, (app) => {
         app.delete(app.findCollectionByNameOrId("posts"));
       });`,
      store,
      SIMULATE
    );

    expect(store.getByNameOrId("posts")).toBeUndefined();
    expect(store.records.list("pbc_posts")).toEqual([]);
  });
});

describe("stub mode is unchanged", () => {
  it("no-ops record operations and reports them", () => {
    const store = storeWithPosts();

    const { warnings } = run(
      store,
      `const posts = app.findCollectionByNameOrId("posts");
       const record = new Record(posts);
       record.set("title", "ignored");
       app.save(record);`,
      {}
    );

    expect(store.records.list("pbc_posts")).toEqual([]);
    expect(warnings.some((warning) => warning.api === "app.save")).toBe(true);
  });
});

describe("condition parsing", () => {
  const context = {
    field: (name: string) => (({ status: "draft", views: 42, tag: null }) as Record<string, unknown>)[name],
  };

  it.each([
    ['status = "draft"', true],
    ["status != 'draft'", false],
    ["views > 40 && views <= 42", true],
    ["views < 40 || status = 'draft'", true],
    ["status ~ 'raf'", true],
    ["status !~ 'zzz'", true],
    ["status LIKE 'dra%'", true],
    ["status IN ('draft', 'published')", true],
    ["tag IS NULL", true],
    ["tag IS NOT NULL", false],
    ["views BETWEEN 40 AND 50", true],
    ["NOT (status = 'draft')", false],
    ["status NOT IN ('draft', 'archived')", false],
    ["status NOT IN ('published', 'archived')", true],
    ["status NOT LIKE 'dra%'", false],
    ["status NOT LIKE 'pub%'", true],
    ["views NOT BETWEEN 40 AND 50", false],
    ["views NOT BETWEEN 1 AND 5", true],
    ["NOT status IN ('draft')", false],
    ["status NOT IN ('published') && views NOT BETWEEN 1 AND 5", true],
  ])("evaluates %s", (source, expected) => {
    expect(evaluateCondition(parseCondition(source as string), context)).toBe(expected);
  });

  it("rejects syntax it cannot evaluate", () => {
    expect(() => parseCondition("status @@ 'draft'")).toThrow(ExpressionError);
  });

  it("rejects NOT that is not followed by IN, LIKE or BETWEEN", () => {
    expect(() => parseCondition("status NOT = 'draft'")).toThrow(/Expected IN, LIKE or BETWEEN after NOT/);
  });

  it("requires a bound parameter to be supplied", () => {
    expect(() => evaluateCondition(parseCondition("status = {:missing}"), context)).toThrow(ExpressionError);
  });
});

describe("$dbx builders", () => {
  const collection = new Collection({ id: "pbc_posts", name: "posts", fields: [], indexes: [] });
  const record = new RecordModel(collection, { status: "published", views: 50, title: "Hello world" });
  const dbx = createDbx() as any;

  it("builds SQL text and matches records", () => {
    expect(dbx.hashExp({ status: "published" }).matches(record)).toBe(true);
    expect(dbx.hashExp({ status: "draft" }).matches(record)).toBe(false);
    expect(dbx.in("status", "draft", "published").matches(record)).toBe(true);
    expect(dbx.notIn("status", "draft").matches(record)).toBe(true);
    expect(dbx.like("title", "world").matches(record)).toBe(true);
    expect(dbx.notLike("title", "goodbye").matches(record)).toBe(true);
    expect(dbx.between("views", 10, 100).matches(record)).toBe(true);
    expect(dbx.and(dbx.hashExp({ status: "published" }), dbx.in("views", 50)).matches(record)).toBe(true);
    expect(dbx.or(dbx.hashExp({ status: "draft" }), dbx.in("views", 50)).matches(record)).toBe(true);
    expect(dbx.not(dbx.hashExp({ status: "draft" })).matches(record)).toBe(true);
    expect(dbx.hashExp({ status: "published" }).build()).toBe("status='published'");
  });
});

describe("parseStatement", () => {
  it("rejects statements outside the supported subset", () => {
    expect(() => parseStatement("CREATE TABLE x (id TEXT)")).toThrow(UnsupportedQueryError);
    expect(() => parseStatement("SELECT * FROM posts GROUP BY status")).toThrow(UnsupportedQueryError);
  });

  it("parses the supported statements", () => {
    expect(parseStatement("SELECT id FROM `posts` WHERE id = {:id}")).toMatchObject({
      kind: "select",
      table: "posts",
      columns: ["id"],
    });
    expect(parseStatement("UPDATE posts SET status = 'x'")).toMatchObject({ kind: "update", table: "posts" });
    expect(parseStatement("DELETE FROM posts")).toMatchObject({ kind: "delete", table: "posts" });
    expect(parseStatement("INSERT INTO posts (id) VALUES ('a')")).toMatchObject({ kind: "insert", table: "posts" });
  });
});
