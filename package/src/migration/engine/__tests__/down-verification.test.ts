/**
 * Down-migration verification against the captured native-PocketBase
 * fixtures: every reference migration must undo itself.
 *
 * The fixture set is a sequence — created_* fixtures define the collections
 * the updated_* fixtures then modify — so each file is round-tripped against
 * the state its predecessors leave behind, then committed, exactly as
 * `pocketbase migrate up` would apply them.
 */

import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";
import { CollectionStore } from "../store";
import { verifyMigrationFileRoundTrip, verifyMigrationFiles } from "../verify";

const REFERENCE_DIR = path.resolve(__dirname, "../../__tests__/fixtures/reference-migrations");
const DYNAMIC_DIR = path.resolve(__dirname, "../../__tests__/fixtures/dynamic-migrations");

function filesIn(directory: string): string[] {
  return fs
    .readdirSync(directory)
    .filter((file) => file.endsWith(".js"))
    .sort()
    .map((file) => path.join(directory, file));
}

describe("Reference fixture down-migration verification", () => {
  const files = filesIn(REFERENCE_DIR);
  const report = verifyMigrationFiles(files);

  it("verifies every fixture", () => {
    expect(report.results.length).toBe(files.length);
  });

  it("leaves the same state the up-only replay produces", () => {
    // Verification must not disturb the forward path: the state after every
    // up() is what state reconstruction would have produced on its own
    const replayed = new CollectionStore();
    for (const file of files) {
      const result = verifyMigrationFileRoundTrip(file, replayed);
      replayed.replaceWith(result.storeAfterUp);
    }
    expect(replayed.serialize()).toEqual(report.store.serialize());
  });

  for (const file of filesIn(REFERENCE_DIR)) {
    const name = path.basename(file);
    it(`round-trips ${name}`, () => {
      const result = report.results.find((candidate) => candidate.file === file)!;

      expect(result.error, result.error?.message).toBeUndefined();
      expect(result.upApplied, "up() must apply").toBe(true);
      expect(result.downApplied, "down() must apply").toBe(true);
      expect(
        result.reversible,
        `${name} did not return to its pre-migration state:\n  ${result.differences
          .map((difference) => difference.message)
          .join("\n  ")}`
      ).toBe(true);
    });
  }
});

describe("Dynamic fixture down-migration verification", () => {
  // These fixtures exercise loops, helper functions, indirection and computed
  // values. Two of them register a down() that returns null without undoing
  // anything — written that way to isolate an up-only construct — which makes
  // them the ground truth for "verification detects a rollback that does not
  // roll back"
  const NO_OP_DOWN_FIXTURES = new Set(["1800000006_remove_by_id.js", "1800000007_computed_unmarshal.js"]);

  const files = filesIn(DYNAMIC_DIR);
  const report = verifyMigrationFiles(files);

  it("has fixtures to verify", () => {
    expect(files.length).toBeGreaterThan(0);
    expect(report.results.length).toBe(files.length);
  });

  it("executes every fixture in both directions", () => {
    for (const result of report.results) {
      expect(result.error, `${path.basename(result.file)}: ${result.error?.message}`).toBeUndefined();
      expect(result.upApplied, path.basename(result.file)).toBe(true);
      expect(result.downApplied, path.basename(result.file)).toBe(true);
    }
  });

  it("round-trips every fixture whose down() undoes its up()", () => {
    const unreversible = report.results
      .filter((result) => !NO_OP_DOWN_FIXTURES.has(path.basename(result.file)))
      .filter((result) => !result.reversible)
      .map(
        (result) =>
          `${path.basename(result.file)}:\n  ${result.differences.map((difference) => difference.message).join("\n  ")}`
      );

    expect(unreversible.join("\n")).toBe("");
  });

  it("reports the no-op downs as unreversible, naming what was left behind", () => {
    const removeById = report.results.find((result) => path.basename(result.file) === "1800000006_remove_by_id.js")!;
    expect(removeById.reversible).toBe(false);
    // up() removed two fields by id; the down() puts neither back
    expect(removeById.differences.map((difference) => difference.field).sort()).toEqual(["step_2", "step_4"]);
    expect(removeById.differences.every((difference) => difference.kind === "field-removed")).toBe(true);

    const unmarshalled = report.results.find(
      (result) => path.basename(result.file) === "1800000007_computed_unmarshal.js"
    )!;
    expect(unmarshalled.reversible).toBe(false);
    expect(unmarshalled.differences.map((difference) => difference.kind).sort()).toEqual([
      "collection-property",
      "collection-property",
      "indexes",
    ]);
  });
});
