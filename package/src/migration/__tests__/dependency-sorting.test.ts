import { describe, it, expect, vi } from "vitest";
import { sortCollectionsByDependency } from "../utils/dependency-sorter";
import type { CollectionSchema } from "../types";

// Helper to create mock collection
function createMockCollection(name: string, relations: string[] = []): CollectionSchema {
  return {
    name,
    type: "base",
    fields: relations.map((target) => ({
      name: `rel_${target}`,
      type: "relation",
      required: false,
      relation: {
        collection: target,
      },
    })),
  } as CollectionSchema;
}

describe("sortCollectionsByDependency", () => {
  it("should return collections in same order if no dependencies", () => {
    const collections = [
      createMockCollection("A"),
      createMockCollection("B"),
      createMockCollection("C"),
    ];

    const sorted = sortCollectionsByDependency(collections);
    // Topological sort order isn't guaranteed for independent nodes, but usually it preserves order if stable sort is used or based on queue.
    // Kahn's algorithm using queue usually processes in order of insertion if no dependencies.
    // However, my implementation iterates map entries to find degree 0. Map iteration order is insertion order.
    // So it should be stable-ish.
    expect(sorted.map(c => c.name)).toEqual(["A", "B", "C"]);
  });

  it("should sort simple dependency (A depends on B)", () => {
    // A depends on B -> B created first
    const collections = [
      createMockCollection("A", ["B"]),
      createMockCollection("B"),
    ];

    const sorted = sortCollectionsByDependency(collections);
    expect(sorted.map(c => c.name)).toEqual(["B", "A"]);
  });

  it("should sort chain dependency (A -> B -> C)", () => {
    // A depends on B, B depends on C -> C, B, A
    const collections = [
      createMockCollection("A", ["B"]),
      createMockCollection("B", ["C"]),
      createMockCollection("C"),
    ];

    const sorted = sortCollectionsByDependency(collections);
    expect(sorted.map(c => c.name)).toEqual(["C", "B", "A"]);
  });

  it("should sort multiple dependencies", () => {
    // A -> B, A -> C. B -> D.
    // Order: D, B, C, A (or D, C, B, A or C, D, B, A)
    // C and D are independent. B depends on D. A depends on B and C.
    const collections = [
      createMockCollection("A", ["B", "C"]),
      createMockCollection("B", ["D"]),
      createMockCollection("C"),
      createMockCollection("D"),
    ];

    const sorted = sortCollectionsByDependency(collections);
    const names = sorted.map(c => c.name);

    expect(names.indexOf("D")).toBeLessThan(names.indexOf("B"));
    expect(names.indexOf("B")).toBeLessThan(names.indexOf("A"));
    expect(names.indexOf("C")).toBeLessThan(names.indexOf("A"));
  });

  it("should ignore external dependencies", () => {
    // A -> External. External is not in list.
    const collections = [
      createMockCollection("A", ["External"]),
    ];

    const sorted = sortCollectionsByDependency(collections);
    expect(sorted.map(c => c.name)).toEqual(["A"]);
  });

  it("should handle self dependency gracefully", () => {
    // A -> A
    const collections = [
      createMockCollection("A", ["A"]),
    ];

    const sorted = sortCollectionsByDependency(collections);
    expect(sorted.map(c => c.name)).toEqual(["A"]);
  });

  it("should warn on circular dependency and return all collections", () => {
    // A -> B -> A
    const collections = [
      createMockCollection("A", ["B"]),
      createMockCollection("B", ["A"]),
    ];

    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const sorted = sortCollectionsByDependency(collections);

    expect(consoleSpy).toHaveBeenCalled();
    expect(consoleSpy.mock.calls[0][0]).toContain("Circular dependencies detected");

    // Should contain both collections
    expect(sorted).toHaveLength(2);
    expect(sorted.map(c => c.name)).toEqual(expect.arrayContaining(["A", "B"]));

    consoleSpy.mockRestore();
  });
});
