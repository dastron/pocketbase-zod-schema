import type { CollectionSchema } from "../types";

/**
 * Sorts collections based on their relationship dependencies.
 * Collections that are referenced by others should be created first.
 *
 * @param collections - List of collections to sort
 * @returns Sorted list of collections
 */
export function sortCollectionsByDependency(collections: CollectionSchema[]): CollectionSchema[] {
  // Map collection names to schema objects for easy lookup
  const collectionMap = new Map<string, CollectionSchema>();
  collections.forEach((col) => collectionMap.set(col.name, col));

  // Build dependency graph
  // Adjacency list: dependency -> [dependents]
  // In this graph, an edge A -> B means A must be created before B.
  const adjList = new Map<string, string[]>();
  // In-degree: number of dependencies a collection has that are also in the list
  const inDegree = new Map<string, number>();

  // Initialize graph
  collections.forEach((col) => {
    adjList.set(col.name, []);
    inDegree.set(col.name, 0);
  });

  // Populate graph
  collections.forEach((col) => {
    col.fields.forEach((field) => {
      // Check if field is a relation
      if (field.relation) {
        const targetName = field.relation.collection;

        // We only care about dependencies on collections that are currently being created.
        // If the target collection is not in the list, it's assumed to already exist.
        if (collectionMap.has(targetName)) {
          // If self-reference, ignore for topological sort (creation order doesn't matter strictly,
          // but usually we want to avoid cycles if possible. Self-ref is cycle size 1).
          if (targetName === col.name) {
            return;
          }

          // Edge: Target -> Collection (Target comes before Collection)
          adjList.get(targetName)?.push(col.name);
          inDegree.set(col.name, (inDegree.get(col.name) || 0) + 1);
        }
      }
    });
  });

  // Kahn's algorithm for topological sort
  const queue: string[] = [];
  const sortedResult: CollectionSchema[] = [];

  // Add all nodes with in-degree 0 to queue
  inDegree.forEach((degree, name) => {
    if (degree === 0) {
      queue.push(name);
    }
  });

  // Process queue
  while (queue.length > 0) {
    const currentName = queue.shift()!;
    const currentCollection = collectionMap.get(currentName);

    if (currentCollection) {
      sortedResult.push(currentCollection);
    }

    const neighbors = adjList.get(currentName) || [];
    for (const neighbor of neighbors) {
      inDegree.set(neighbor, (inDegree.get(neighbor) || 0) - 1);
      if (inDegree.get(neighbor) === 0) {
        queue.push(neighbor);
      }
    }
  }

  // Check for cycles
  if (sortedResult.length !== collections.length) {
    const remainingCount = collections.length - sortedResult.length;
    console.warn(
      `Warning: Circular dependencies detected involving ${remainingCount} collections. ` +
      `Migrations may fail if strict foreign key checks are enabled. ` +
      `Check your schema for circular relations.`
    );

    // Append remaining collections (those involved in cycles)
    // We can't determine a perfect order, so we append them in their original order
    // (excluding those already sorted)
    const sortedNames = new Set(sortedResult.map((c) => c.name));
    collections.forEach((col) => {
      if (!sortedNames.has(col.name)) {
        sortedResult.push(col);
      }
    });
  }

  return sortedResult;
}
