import { generateFindCollectionCode } from "./utils";

/**
 * Generates indexes array for collection creation
 *
 * @param indexes - Array of index definitions
 * @returns Indexes array as string
 */
export function generateIndexesArray(indexes?: string[]): string {
  if (!indexes || indexes.length === 0) {
    return "[]";
  }

  const indexStrings = indexes.map((idx) => JSON.stringify(idx));
  return `[\n    ${indexStrings.join(",\n    ")},\n  ]`;
}

/**
 * Generates code for adding an index to a collection
 *
 * @param collectionName - Name of the collection
 * @param index - Index SQL statement
 * @param varName - Variable name to use for the collection (default: auto-generated)
 * @param isLast - Whether this is the last operation (will return the result)
 * @returns JavaScript code for adding the index
 */
export function generateIndexAddition(
  collectionName: string,
  index: string,
  varName?: string,
  isLast: boolean = false,
  collectionIdMap?: Map<string, string>
): string {
  const lines: string[] = [];
  const collectionVar = varName || `collection_${collectionName}_idx`;

  lines.push(`  const ${collectionVar} = ${generateFindCollectionCode(collectionName, collectionIdMap)};`);
  lines.push(`  ${collectionVar}.indexes.push(${JSON.stringify(index)});`);
  lines.push(isLast ? `  return app.save(${collectionVar});` : `  app.save(${collectionVar});`);

  return lines.join("\n");
}

/**
 * Generates code for removing an index from a collection
 *
 * @param collectionName - Name of the collection
 * @param index - Index SQL statement
 * @param varName - Variable name to use for the collection (default: auto-generated)
 * @param isLast - Whether this is the last operation (will return the result)
 * @returns JavaScript code for removing the index
 */
export function generateIndexRemoval(
  collectionName: string,
  index: string,
  varName?: string,
  isLast: boolean = false,
  collectionIdMap?: Map<string, string>
): string {
  const lines: string[] = [];
  const collectionVar = varName || `collection_${collectionName}_idx`;
  const indexVar = `${collectionVar}_indexToRemove`;

  lines.push(`  const ${collectionVar} = ${generateFindCollectionCode(collectionName, collectionIdMap)};`);
  lines.push(`  const ${indexVar} = ${collectionVar}.indexes.findIndex(idx => idx === ${JSON.stringify(index)});`);
  lines.push(`  if (${indexVar} !== -1) {`);
  lines.push(`    ${collectionVar}.indexes.splice(${indexVar}, 1);`);
  lines.push(`  }`);
  lines.push(isLast ? `  return app.save(${collectionVar});` : `  app.save(${collectionVar});`);

  return lines.join("\n");
}
