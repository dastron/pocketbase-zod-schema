/**
 * A select field's `values` order only sets the option order in the admin UI —
 * PocketBase appends options added there to the end, so a schema that lists the
 * same options in a logical order would otherwise diff forever against a
 * database that was touched through the UI. The set is what the diff compares;
 * a genuine add or remove still rewrites the whole array in the schema's order.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, expect, it } from "vitest";
import { compare, compareFieldOptions } from "../diff";
import { planMigrations } from "../generator";
import type { FieldDefinition, SchemaDefinition } from "../types";
import { requireCollection, snapshotFromMigrationSources } from "./helpers/migration-executor";

const ORDER_DECLARED = ["object", "shot", "person", "speech", "speaker", "face", "segment", "text"];
const ORDER_STORED = ["object", "shot", "person", "speech", "face", "segment", "text", "speaker"];

function selectField(values: string[]): FieldDefinition {
  return {
    name: "labelType",
    id: "select1111111111",
    type: "select",
    required: true,
    options: { values, maxSelect: 1 },
  } as FieldDefinition;
}

function schemaWith(values: string[]): SchemaDefinition {
  return {
    collections: new Map([
      ["MediaClipLabels", { name: "MediaClipLabels", type: "base", fields: [selectField(values)] }],
    ]),
  } as SchemaDefinition;
}

/** Migration sources the generator would write for a diff, without touching disk state */
function planSources(diff: ReturnType<typeof compare>): string[] {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "select-values-order-"));
  try {
    return planMigrations(diff, dir).map((migration) => migration.content);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe("compareFieldOptions with select values", () => {
  it("reports no change when the values differ only in order", () => {
    const changes = compareFieldOptions(selectField(ORDER_DECLARED), selectField(ORDER_STORED));

    expect(changes).toEqual([]);
  });

  it("reports a change when a value is added", () => {
    const changes = compareFieldOptions(selectField([...ORDER_STORED, "caption"]), selectField(ORDER_STORED));

    expect(changes).toHaveLength(1);
    expect(changes[0].property).toBe("options.values");
    expect(changes[0].newValue).toEqual([...ORDER_STORED, "caption"]);
  });

  it("reports a change when a value is removed", () => {
    const changes = compareFieldOptions(selectField(["draft", "published"]), selectField(["draft", "published", "archived"]));

    expect(changes).toHaveLength(1);
    expect(changes[0].property).toBe("options.values");
    expect(changes[0].oldValue).toEqual(["draft", "published", "archived"]);
  });

  it("reports a change when a value is swapped for another", () => {
    const changes = compareFieldOptions(selectField(["draft", "live"]), selectField(["draft", "published"]));

    expect(changes).toHaveLength(1);
  });

  it("counts duplicates rather than collapsing them to a set", () => {
    const changes = compareFieldOptions(selectField(["a", "a", "b"]), selectField(["a", "b", "b"]));

    expect(changes).toHaveLength(1);
  });

  it("still compares order-sensitively for options of other field types", () => {
    const asFile = (mimeTypes: string[]): FieldDefinition =>
      ({ name: "asset", id: "file111", type: "file", required: false, options: { mimeTypes } }) as FieldDefinition;

    const changes = compareFieldOptions(asFile(["image/png", "image/jpeg"]), asFile(["image/jpeg", "image/png"]));

    expect(changes).toHaveLength(1);
  });
});

describe("select values ordering end to end", () => {
  it("generates no migration when only the order changed", () => {
    const created = planSources(compare(schemaWith(ORDER_STORED), null));
    const stored = snapshotFromMigrationSources(created);

    const diff = compare(schemaWith(ORDER_DECLARED), stored);

    expect(diff.collectionsToModify).toEqual([]);
    expect(planSources(diff)).toEqual([]);
  });

  it("writes the schema's order when the set of values does change", () => {
    const created = planSources(compare(schemaWith(ORDER_STORED), null));
    const stored = snapshotFromMigrationSources(created);

    // Adding "caption" is a real change, and it carries the reordering with it
    const withAddition = [...ORDER_DECLARED, "caption"];
    const diff = compare(schemaWith(withAddition), stored);
    const modification = planSources(diff);

    expect(modification).toHaveLength(1);

    const replayed = snapshotFromMigrationSources([...created, ...modification]);
    const labelType = requireCollection(replayed, "MediaClipLabels").fields[0];

    expect(labelType.options?.values).toEqual(withAddition);
    expect(compare(schemaWith(withAddition), replayed).collectionsToModify).toEqual([]);
  });
});
