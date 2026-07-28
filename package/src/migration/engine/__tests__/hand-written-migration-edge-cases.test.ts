/**
 * Hand-written (and AI-written) migrations that mutate existing state
 *
 * Generated migrations declare their result: a whole `new Collection({...})`, or
 * a field replaced wholesale. Migrations people write by hand — and the ones
 * LLMs write, which imitate the PocketBase docs rather than this generator —
 * *edit* what is already there instead: they push onto a select field's
 * `values`, filter `collection.indexes`, and re-`add()` a field to change one
 * option. None of that is visible in the file text; it only exists once the
 * code has run against real prior state.
 *
 * These are the sharp edges of that style, each pinned to what PocketBase
 * itself does (see `pocketbase/pb_data/types.d.ts`).
 */

import { describe, expect, it } from "vitest";
import { compare } from "../../diff";
import type { FieldDefinition, SchemaDefinition } from "../../types";
import { Collection } from "../collection";
import { generateRuntimeFieldId } from "../fields";
import { FieldsList } from "../fields-list";
import { executeMigrationDownSource, executeMigrationSource } from "../runner";
import { CollectionStore } from "../store";
import { verifyMigrationRoundTrip } from "../verify";

// ---------------------------------------------------------------------------
// The motivating case: a migration that appends one select value in place
// ---------------------------------------------------------------------------

const LABEL_TYPES = ["object", "shot", "person", "speech", "face", "segment", "text"];

const OLD_UNIQUE_INDEX =
  "CREATE UNIQUE INDEX idx_mediaclip_labels_unique ON MediaClipLabels (MediaClipRef, labelType, LabelObjectRef)";
const NEW_UNIQUE_INDEX =
  "CREATE UNIQUE INDEX idx_mediaclip_labels_unique ON MediaClipLabels (MediaClipRef, labelType, LabelObjectRef, LabelSpeakerRef)";
const SPEAKER_INDEX = "CREATE INDEX idx_mediaclip_labels_speaker ON MediaClipLabels (LabelSpeakerRef)";

/**
 * State the migration edits: the LabelSpeaker collection it points a relation
 * at, plus MediaClipLabels with the select field it appends to.
 */
function labelsBaseline(): CollectionStore {
  const store = new CollectionStore();

  store.upsert(
    new Collection({
      id: "pb_lblspkr01a2b3c4",
      name: "LabelSpeaker",
      type: "base",
      fields: [{ id: "text3208210256", name: "id", type: "text", primaryKey: true, required: true }],
      indexes: [],
    })
  );

  store.upsert(
    new Collection({
      id: "pb_mediacliplabels01",
      name: "MediaClipLabels",
      type: "base",
      fields: [
        { id: "text3208210256", name: "id", type: "text", primaryKey: true, required: true },
        { id: "select2363381545", name: "labelType", type: "select", required: true, values: [...LABEL_TYPES], maxSelect: 1 },
        {
          id: "relation1234567890",
          name: "LabelObjectRef",
          type: "relation",
          required: false,
          collectionId: "pb_lblobject01a2b3",
          maxSelect: 1,
          minSelect: 0,
          cascadeDelete: true,
        },
      ],
      indexes: [OLD_UNIQUE_INDEX],
    })
  );

  return store;
}

/**
 * Verbatim in shape: adds a relation, appends to `labelType.values` through a
 * live reference, and rebuilds `collection.indexes` with filter/concat.
 */
const APPEND_SPEAKER = `
const OLD_UNIQUE_INDEX =
  ${JSON.stringify(OLD_UNIQUE_INDEX)};
const NEW_UNIQUE_INDEX =
  ${JSON.stringify(NEW_UNIQUE_INDEX)};
const SPEAKER_INDEX =
  ${JSON.stringify(SPEAKER_INDEX)};

migrate((app) => {
  const collection = app.findCollectionByNameOrId("MediaClipLabels");

  collection.fields.add(new RelationField({
    name: "LabelSpeakerRef",
    required: false,
    collectionId: "pb_lblspkr01a2b3c4",
    maxSelect: 1,
    minSelect: 0,
    cascadeDelete: true,
  }));

  const labelType = collection.fields.getByName("labelType");
  if (!labelType.values.includes("speaker")) {
    labelType.values.push("speaker");
  }

  collection.indexes = collection.indexes
    .filter((idx) => idx !== OLD_UNIQUE_INDEX && idx !== SPEAKER_INDEX)
    .concat([SPEAKER_INDEX, NEW_UNIQUE_INDEX]);

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("MediaClipLabels");

  collection.fields.removeByName("LabelSpeakerRef");

  const labelType = collection.fields.getByName("labelType");
  labelType.values = labelType.values.filter((v) => v !== "speaker");

  collection.indexes = collection.indexes
    .filter((idx) => idx !== NEW_UNIQUE_INDEX && idx !== SPEAKER_INDEX)
    .concat([OLD_UNIQUE_INDEX]);

  return app.save(collection);
});
`;

describe("a migration that appends a select value in place", () => {
  it("appends through the live field reference without rewriting the array", () => {
    const store = labelsBaseline();

    executeMigrationSource(APPEND_SPEAKER, store, { filename: "append_speaker.js" });

    const labelType = store.getByNameOrId("MediaClipLabels")!.fields.getByName("labelType")!;
    // Appended at the end, which is where PocketBase's admin UI puts new options
    expect(labelType.values).toEqual([...LABEL_TYPES, "speaker"]);
  });

  it("keeps the guard idempotent when the value is already present", () => {
    const store = labelsBaseline();
    store.getByNameOrId("MediaClipLabels")!.fields.getByName("labelType")!.values.push("speaker");

    executeMigrationSource(APPEND_SPEAKER, store, { filename: "append_speaker.js" });

    const labelType = store.getByNameOrId("MediaClipLabels")!.fields.getByName("labelType")!;
    expect(labelType.values.filter((v: string) => v === "speaker")).toHaveLength(1);
  });

  it("adds the relation and rewrites the indexes", () => {
    const store = labelsBaseline();

    executeMigrationSource(APPEND_SPEAKER, store, { filename: "append_speaker.js" });

    const collection = store.getByNameOrId("MediaClipLabels")!;
    expect(collection.fields.getByName("LabelSpeakerRef")!.collectionId).toBe("pb_lblspkr01a2b3c4");
    expect(collection.indexes).toEqual([SPEAKER_INDEX, NEW_UNIQUE_INDEX]);
  });

  it("reaches the snapshot the diff engine reads, resolving the relation target id to a name", () => {
    const store = labelsBaseline();

    executeMigrationSource(APPEND_SPEAKER, store, { filename: "append_speaker.js" });
    const snapshot = store.toSnapshot();
    const labels = snapshot.collections.get("MediaClipLabels")!;

    expect(labels.fields.find((f) => f.name === "labelType")!.options?.values).toEqual([...LABEL_TYPES, "speaker"]);
    // The migration names the target by id; the diff resolves it against the
    // collections in the same snapshot
    expect(labels.fields.find((f) => f.name === "LabelSpeakerRef")!.relation?.collection).toBe("pb_lblspkr01a2b3c4");

    const desired: SchemaDefinition = {
      collections: new Map([
        [
          "MediaClipLabels",
          {
            name: "MediaClipLabels",
            type: "base",
            fields: [
              {
                name: "labelType",
                id: "select2363381545",
                type: "select",
                required: true,
                options: { values: [...LABEL_TYPES, "speaker"], maxSelect: 1 },
              },
              {
                name: "LabelObjectRef",
                id: "relation1234567890",
                type: "relation",
                required: false,
                relation: { collection: "pb_lblobject01a2b3", cascadeDelete: true, maxSelect: 1, minSelect: 0 },
              },
              {
                name: "LabelSpeakerRef",
                // The migration added it without an id, so it carries the one
                // PocketBase would derive
                id: "relation4217443873",
                type: "relation",
                required: false,
                relation: { collection: "LabelSpeaker", cascadeDelete: true, maxSelect: 1, minSelect: 0 },
              },
            ] as FieldDefinition[],
            indexes: [SPEAKER_INDEX, NEW_UNIQUE_INDEX],
          },
        ],
      ]),
    };

    // The whole point of executing migrations: a schema that already matches
    // what this hand-written file did must not generate another migration
    expect(compare(desired, snapshot).collectionsToModify).toEqual([]);
  });

  it("rolls back to the exact prior state", () => {
    const baseline = labelsBaseline();

    const result = verifyMigrationRoundTrip({ source: APPEND_SPEAKER, file: "append_speaker.js" }, baseline);

    expect(result.error).toBeUndefined();
    expect(result.reversible).toBe(true);
    expect(result.differences).toEqual([]);
  });

  it("restores the original values array on down, not a reordered one", () => {
    const store = labelsBaseline();

    executeMigrationSource(APPEND_SPEAKER, store, { filename: "append_speaker.js" });
    executeMigrationDownSource(APPEND_SPEAKER, store, { filename: "append_speaker.js" });

    const collection = store.getByNameOrId("MediaClipLabels")!;
    expect(collection.fields.getByName("labelType")!.values).toEqual(LABEL_TYPES);
    expect(collection.fields.getByName("LabelSpeakerRef")).toBeNull();
    expect(collection.indexes).toEqual([OLD_UNIQUE_INDEX]);
  });

  it("fails loudly when the select field it edits has no values at all", () => {
    // PocketBase requires the Values option on a select field, so this file is
    // broken there too — but it must not replay as a silent no-op here
    const store = labelsBaseline();
    delete store.getByNameOrId("MediaClipLabels")!.fields.getByName("labelType")!.values;

    expect(() => executeMigrationSource(APPEND_SPEAKER, store, { filename: "append_speaker.js" })).toThrowError(
      /Cannot read propert/
    );
  });
});

// ---------------------------------------------------------------------------
// fields.add() without an explicit id: a rewrite, not a duplicate
// ---------------------------------------------------------------------------

describe("fields.add() matching, per PocketBase's documented rule", () => {
  const widenTitle = `
    migrate((app) => {
      const collection = app.findCollectionByNameOrId("posts");
      collection.fields.add(new TextField({ name: "title", required: true, max: 500 }));
      return app.save(collection);
    }, (app) => null);
  `;

  function postsStore(): CollectionStore {
    const store = new CollectionStore();
    store.upsert(
      new Collection({
        id: "pb_posts01",
        name: "posts",
        type: "base",
        fields: [
          { id: "text3208210256", name: "id", type: "text", primaryKey: true, required: true },
          { id: "text724990059", name: "title", type: "text", required: true, max: 200 },
          { id: "text2363381545", name: "body", type: "text", required: false },
        ],
        indexes: [],
      })
    );
    return store;
  }

  it("replaces the same-named field instead of appending a second one", () => {
    const store = postsStore();

    executeMigrationSource(widenTitle, store, { filename: "widen_title.js" });

    const collection = store.getByNameOrId("posts")!;
    expect(collection.fields.map((f) => f.name)).toEqual(["id", "title", "body"]);
    expect(collection.fields.getByName("title")!.max).toBe(500);
  });

  it("preserves the replaced field's position and id", () => {
    const store = postsStore();

    executeMigrationSource(widenTitle, store, { filename: "widen_title.js" });

    const collection = store.getByNameOrId("posts")!;
    expect(collection.fields.at(1)!.name).toBe("title");
    // Kept, so a later removeById/getById in the same migration still resolves
    expect(collection.fields.getByName("title")!.id).toBe("text724990059");
  });

  it("still matches by id when one is given, even across a rename", () => {
    const list = new FieldsList([{ id: "text724990059", name: "title", type: "text", max: 200 }]);

    list.add({ id: "text724990059", name: "heading", type: "text", max: 200 });

    expect(list.length).toBe(1);
    expect(list.at(0)!.name).toBe("heading");
  });

  it("appends when no field matches by name", () => {
    const list = new FieldsList([{ id: "text724990059", name: "title", type: "text" }]);

    list.add({ name: "subtitle", type: "text" });

    expect(list.map((f) => f.name)).toEqual(["title", "subtitle"]);
  });

  it("moves rather than duplicates when addAt matches by name", () => {
    const list = new FieldsList([
      { id: "text1", name: "a", type: "text" },
      { id: "text2", name: "b", type: "text" },
      { id: "text3", name: "c", type: "text" },
    ]);

    list.addAt(0, { name: "c", type: "text" });

    expect(list.map((f) => f.name)).toEqual(["c", "a", "b"]);
  });
});

// ---------------------------------------------------------------------------
// Field ids
// ---------------------------------------------------------------------------

describe("autogenerated field ids", () => {
  // Real ids PocketBase writes for the auth system fields, which is the only
  // way to know the derivation is right rather than merely plausible
  it.each([
    ["password", "password", "password901924565"],
    ["text", "tokenKey", "text2504183744"],
    ["email", "email", "email3885137012"],
    ["bool", "emailVisibility", "bool1547992806"],
    ["bool", "verified", "bool256245529"],
    ["text", "id", "text3208210256"],
  ])("derives %s field %s as %s", (type, name, expected) => {
    expect(generateRuntimeFieldId(type, name)).toBe(expected);
  });

  it("assigns the derived id when a field is added without one", () => {
    const list = new FieldsList();

    list.add({ name: "tokenKey", type: "text" });

    expect(list.getByName("tokenKey")!.id).toBe("text2504183744");
  });

  it("is stable across runs, so a replayed collection has the same ids", () => {
    const first = new FieldsList([{ name: "title", type: "text" }]);
    const second = new FieldsList([{ name: "title", type: "text" }]);

    expect(first.at(0)!.id).toBe(second.at(0)!.id);
  });
});

// ---------------------------------------------------------------------------
// Lookup misses and snapshot isolation
// ---------------------------------------------------------------------------

describe("JSVM fidelity of field lookups", () => {
  it("returns null for a missing field, the way goja surfaces a nil Field", () => {
    const list = new FieldsList([{ id: "text1", name: "title", type: "text" }]);

    expect(list.getByName("nope")).toBeNull();
    expect(list.getById("nope")).toBeNull();
  });

  it("lets a migration branch on === null", () => {
    const store = new CollectionStore();
    store.upsert(new Collection({ id: "pb_posts01", name: "posts", type: "base", fields: [], indexes: [] }));

    const result = executeMigrationSource(
      `
      migrate((app) => {
        const collection = app.findCollectionByNameOrId("posts");
        if (collection.fields.getByName("legacy") === null) {
          collection.fields.add(new TextField({ name: "replacement" }));
        }
        return app.save(collection);
      }, (app) => null);
      `,
      store,
      { filename: "branch_on_null.js" }
    );

    expect(result.applied).toBe(true);
    expect(store.getByNameOrId("posts")!.fields.getByName("replacement")).not.toBeNull();
  });
});

describe("snapshot isolation", () => {
  it("does not hand the diff engine arrays that alias engine state", () => {
    const store = labelsBaseline();
    const snapshot = store.toSnapshot();

    const values = snapshot.collections.get("MediaClipLabels")!.fields.find((f) => f.name === "labelType")!.options!
      .values as string[];
    values.push("mutated-downstream");
    values.sort();

    expect(store.getByNameOrId("MediaClipLabels")!.fields.getByName("labelType")!.values).toEqual(LABEL_TYPES);
  });
});
