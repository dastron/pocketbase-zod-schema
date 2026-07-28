import * as fs from "fs";
import type { CollectionSchema, SchemaSnapshot } from "../../types";

/**
 * Loads a JSON snapshot fixture from disk.
 *
 * Test-only replacement for the removed file-based snapshot API: fixture files
 * under __tests__/fixtures/snapshots/ store collections as a plain object,
 * which SchemaSnapshot models as a Map.
 */
export function loadJsonSnapshotFixture(snapshotPath: string): SchemaSnapshot {
  const data = JSON.parse(fs.readFileSync(snapshotPath, "utf-8"));
  return {
    version: data.version,
    timestamp: data.timestamp,
    collections: new Map<string, CollectionSchema>(Object.entries(data.collections)),
  };
}
