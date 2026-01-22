/**
 * Compares indexes between current and previous collections
 *
 * @param currentIndexes - Current collection indexes
 * @param previousIndexes - Previous collection indexes
 * @returns Object with indexes to add and remove
 */
export function compareIndexes(
  currentIndexes: string[] = [],
  previousIndexes: string[] = []
): { indexesToAdd: string[]; indexesToRemove: string[] } {
  const currentSet = new Set(currentIndexes);
  const previousSet = new Set(previousIndexes);

  const indexesToAdd = currentIndexes.filter((idx) => !previousSet.has(idx));
  const indexesToRemove = previousIndexes.filter((idx) => !currentSet.has(idx));

  return { indexesToAdd, indexesToRemove };
}
