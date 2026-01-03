/**
 * Migration File Parser
 * Parses PocketBase migration files to extract collection operations
 *
 * This module handles parsing migration files to extract:
 * - Collection creations (new Collection(...))
 * - Collection deletions (app.delete(...))
 * - Field modifications (field.property = value)
 */

import * as fs from "fs";
import * as path from "path";
import { convertPocketBaseCollection } from "./pocketbase-converter";
import type { CollectionSchema } from "./types";

/**
 * Extracts timestamp from migration filename
 * Migration files are named: [timestamp]_[description].js
 *
 * @param filename - Migration filename
 * @returns Timestamp as number or null if not found
 */
export function extractTimestampFromFilename(filename: string): number | null {
  const match = filename.match(/^(\d+)_/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return null;
}

/**
 * Finds all migration files after a given snapshot timestamp
 * Excludes snapshot files themselves
 *
 * @param migrationsPath - Path to migrations directory
 * @param snapshotTimestamp - Timestamp of the snapshot file
 * @returns Array of migration file paths sorted by timestamp
 */
export function findMigrationsAfterSnapshot(migrationsPath: string, snapshotTimestamp: number): string[] {
  try {
    if (!fs.existsSync(migrationsPath)) {
      return [];
    }

    const files = fs.readdirSync(migrationsPath);
    const migrationFiles: { path: string; timestamp: number }[] = [];

    for (const file of files) {
      // Skip snapshot files
      if (file.endsWith("_collections_snapshot.js") || file.endsWith("_snapshot.js")) {
        continue;
      }

      // Skip non-JS files
      if (!file.endsWith(".js")) {
        continue;
      }

      const timestamp = extractTimestampFromFilename(file);
      if (timestamp && timestamp > snapshotTimestamp) {
        migrationFiles.push({
          path: path.join(migrationsPath, file),
          timestamp,
        });
      }
    }

    // Sort by timestamp (ascending order)
    migrationFiles.sort((a, b) => a.timestamp - b.timestamp);

    return migrationFiles.map((f) => f.path);
  } catch (error) {
    console.warn(`Error finding migrations after snapshot: ${error}`);
    return [];
  }
}

/**
 * Helper function to parse collection operations from migration content
 *
 * @param content - Migration content (should be just the UP migration)
 * @returns Object with collections to create and collections to delete
 */
function parseMigrationOperationsFromContent(content: string): {
  collectionsToCreate: CollectionSchema[];
  collectionsToDelete: string[];
} {
  const collectionsToCreate: CollectionSchema[] = [];
  const collectionsToDelete: string[] = [];

  try {
    // Extract collection definitions from `new Collection({...})`
    // Use a more robust approach: find all "new Collection(" and then parse until matching closing paren
    let searchIndex = 0;
    while (true) {
      const collectionStart = content.indexOf("new Collection(", searchIndex);
      if (collectionStart === -1) {
        break;
      }

      // Find the opening brace after "new Collection("
      const openParen = collectionStart + "new Collection(".length;
      let braceCount = 0;
      let parenCount = 1; // We're already inside the opening paren
      let inString = false;
      let stringChar = null;
      let i = openParen;

      // Skip whitespace to find the opening brace
      while (i < content.length && /\s/.test(content[i])) {
        i++;
      }

      if (content[i] !== "{") {
        searchIndex = i + 1;
        continue;
      }

      const objectStart = i;
      braceCount = 1;
      i++;

      // Find the matching closing brace and paren
      while (i < content.length && (braceCount > 0 || parenCount > 0)) {
        const char = content[i];
        const prevChar = i > 0 ? content[i - 1] : "";

        // Handle strings
        if (!inString && (char === '"' || char === "'")) {
          inString = true;
          stringChar = char;
        } else if (inString && char === stringChar && prevChar !== "\\") {
          inString = false;
          stringChar = null;
        }

        if (!inString) {
          if (char === "{") braceCount++;
          if (char === "}") braceCount--;
          if (char === "(") parenCount++;
          if (char === ")") parenCount--;
        }

        i++;
      }

      if (braceCount === 0 && parenCount === 0) {
        const objectContent = content.substring(objectStart, i - 1); // -1 to exclude the closing paren
        try {
          // Use Function constructor to parse the JavaScript object
          const collectionObj = new Function(`return ${objectContent}`)();
          if (collectionObj && collectionObj.name) {
            const schema = convertPocketBaseCollection(collectionObj);
            collectionsToCreate.push(schema);
          }
        } catch (error) {
          // Skip malformed collection definitions
          console.warn(`Failed to parse collection definition: ${error}`);
        }
      }

      searchIndex = i;
    }

    // Extract collection deletions from `app.delete(...)`
    // Look for patterns like: app.delete(collection_xxx) or app.delete(app.findCollectionByNameOrId("name"))
    const deleteMatches = content.matchAll(
      /app\.delete\s*\(\s*(?:collection_\w+|app\.findCollectionByNameOrId\s*\(\s*["']([^"']+)["']\s*\))\s*\)/g
    );
    for (const match of deleteMatches) {
      // If we have a collection name from findCollectionByNameOrId, use it
      if (match[1]) {
        collectionsToDelete.push(match[1]);
      } else {
        // Try to find the collection name from the variable name
        // Look backwards for the collection variable definition
        const varNameMatch = match[0].match(/collection_(\w+)/);
        if (varNameMatch) {
          // Try to find the collection name from the variable definition
          const varName = `collection_${varNameMatch[1]}`;
          // Search backwards from the delete call to find the variable definition
          const deleteIndex = content.indexOf(match[0]);
          const beforeDelete = content.substring(0, deleteIndex);
          const varDefMatch = beforeDelete.match(
            new RegExp(`const\\s+${varName}\\s*=\\s*new\\s+Collection\\(\\s*(\\{[\\s\\S]*?\\})\\s*\\)`, "g")
          );
          if (varDefMatch && varDefMatch.length > 0) {
            // Find the collection definition (get the last match closest to the delete)
            const collectionDefMatch = beforeDelete.match(
              new RegExp(`const\\s+${varName}\\s*=\\s*new\\s+Collection\\(\\s*(\\{[\\s\\S]*?\\})\\s*\\)`)
            );
            if (collectionDefMatch) {
              try {
                const collectionDefStr = collectionDefMatch[1];
                const collectionObj = new Function(`return ${collectionDefStr}`)();
                if (collectionObj && collectionObj.name) {
                  collectionsToDelete.push(collectionObj.name);
                }
              } catch {
                // Skip if we can't parse
              }
            }
          }
        }
      }
    }

    // Also look for direct collection name in findCollectionByNameOrId followed by delete
    const findAndDeleteMatches = content.matchAll(
      /app\.findCollectionByNameOrId\s*\(\s*["']([^"']+)["']\s*\)[\s\S]*?app\.delete/g
    );
    for (const match of findAndDeleteMatches) {
      collectionsToDelete.push(match[1]);
    }
  } catch (error) {
    console.warn(`Failed to parse migration operations from content: ${error}`);
  }

  return { collectionsToCreate, collectionsToDelete };
}

/**
 * Parses a migration file to extract collection operations
 * Extracts collections created with `new Collection(...)` and collections deleted with `app.delete(...)`
 * Only parses the UP migration (first function), not the down migration
 *
 * @param migrationContent - Raw migration file content
 * @returns Object with collections to create and collections to delete
 */
export function parseMigrationOperations(migrationContent: string): {
  collectionsToCreate: CollectionSchema[];
  collectionsToDelete: string[];
} {
  try {
    // Extract only the UP migration (first function argument to migrate())
    // Find the migrate call and extract the first function body
    const migrateMatch = migrationContent.match(/migrate\s*\(\s*/);
    if (!migrateMatch) {
      // If we can't find the migrate pattern, try to parse the whole file
      return parseMigrationOperationsFromContent(migrationContent);
    }

    const startIndex = migrateMatch.index! + migrateMatch[0].length;

    // Find the opening paren of the first function
    let i = startIndex;
    let parenCount = 0;
    let foundFirstParen = false;

    while (i < migrationContent.length) {
      const char = migrationContent[i];
      if (char === "(") {
        parenCount++;
        foundFirstParen = true;
        i++;
        break;
      }
      i++;
    }

    if (!foundFirstParen) {
      return parseMigrationOperationsFromContent(migrationContent);
    }

    // Skip the function parameters: (app) => {
    let inString = false;
    let stringChar = null;
    let foundBrace = false;
    let braceStart = -1;

    while (i < migrationContent.length && !foundBrace) {
      const char = migrationContent[i];
      const prevChar = i > 0 ? migrationContent[i - 1] : "";

      if (!inString && (char === '"' || char === "'")) {
        inString = true;
        stringChar = char;
      } else if (inString && char === stringChar && prevChar !== "\\") {
        inString = false;
        stringChar = null;
      }

      if (!inString) {
        if (char === "(") parenCount++;
        if (char === ")") {
          parenCount--;
          if (parenCount === 0) {
            // Found end of function parameters, look for =>
            i++;
            while (i < migrationContent.length && /\s/.test(migrationContent[i])) {
              i++;
            }
            if (i < migrationContent.length - 1 && migrationContent[i] === "=" && migrationContent[i + 1] === ">") {
              i += 2;
              while (i < migrationContent.length && /\s/.test(migrationContent[i])) {
                i++;
              }
              if (i < migrationContent.length && migrationContent[i] === "{") {
                foundBrace = true;
                braceStart = i + 1;
                break;
              }
            }
          }
        }
      }
      i++;
    }

    if (!foundBrace || braceStart === -1) {
      return parseMigrationOperationsFromContent(migrationContent);
    }

    // Find the matching closing brace
    let braceCount = 1;
    i = braceStart;
    inString = false;
    stringChar = null;

    while (i < migrationContent.length && braceCount > 0) {
      const char = migrationContent[i];
      const prevChar = i > 0 ? migrationContent[i - 1] : "";

      if (!inString && (char === '"' || char === "'")) {
        inString = true;
        stringChar = char;
      } else if (inString && char === stringChar && prevChar !== "\\") {
        inString = false;
        stringChar = null;
      }

      if (!inString) {
        if (char === "{") braceCount++;
        if (char === "}") braceCount--;
      }

      i++;
    }

    if (braceCount === 0) {
      const upMigrationContent = migrationContent.substring(braceStart, i - 1);
      return parseMigrationOperationsFromContent(upMigrationContent);
    }

    // Fallback: parse the whole file
    return parseMigrationOperationsFromContent(migrationContent);
  } catch (error) {
    console.warn(`Failed to parse migration operations: ${error}`);
    return { collectionsToCreate: [], collectionsToDelete: [] };
  }
}


