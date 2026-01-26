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
import { convertPocketBaseCollection, convertPocketBaseField } from "./pocketbase-converter";
import type { CollectionSchema, FieldDefinition } from "./types";

export interface ParsedCollectionUpdate {
  collectionName: string;
  fieldsToAdd: FieldDefinition[];
  fieldsToRemove: string[]; // names
  fieldsToUpdate: {
    fieldName: string;
    changes: Record<string, any>; // property -> value
  }[];
  indexesToAdd: string[];
  indexesToRemove: string[];
  rulesToUpdate: Record<string, string | null>;
}

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
    const timestampsSeen = new Set<number>();
    // const duplicates: string[] = [];

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
      if (timestamp) {
        if (timestampsSeen.has(timestamp)) {
          console.warn(`Duplicate migration timestamp detected: ${timestamp} in file ${file}`);
        }
        timestampsSeen.add(timestamp);

        if (timestamp > snapshotTimestamp) {
          migrationFiles.push({
            path: path.join(migrationsPath, file),
            timestamp,
          });
        }
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
  collectionsToUpdate: ParsedCollectionUpdate[];
} {
  const collectionsToCreate: CollectionSchema[] = [];
  const collectionsToDelete: string[] = [];
  const collectionsToUpdate: ParsedCollectionUpdate[] = [];

  // Mock app object for eval
  const mockApp = {
    findCollectionByNameOrId: (name: string) => ({ id: name, name }),
  };

  // Helper to get or create update object
  const getUpdate = (name: string) => {
    let update = collectionsToUpdate.find((u) => u.collectionName === name);
    if (!update) {
      update = {
        collectionName: name,
        fieldsToAdd: [],
        fieldsToRemove: [],
        fieldsToUpdate: [],
        indexesToAdd: [],
        indexesToRemove: [],
        rulesToUpdate: {},
      };
      collectionsToUpdate.push(update);
    }
    return update;
  };

  try {
    // 1. Parse Creations: new Collection({...})
    let searchIndex = 0;
    while (true) {
      const collectionStart = content.indexOf("new Collection(", searchIndex);
      if (collectionStart === -1) {
        break;
      }

      const openParen = collectionStart + "new Collection(".length;
      let objectContent = "";
      let i = openParen;

      // Extract object literal
      let braceCount = 0;
      let parenCount = 1;
      let inString = false;
      let stringChar = null;
      let objectStart = -1;

      // Skip whitespace to find the opening brace
      while (i < content.length && /\s/.test(content[i])) {
        i++;
      }

      if (content[i] === "{") {
        objectStart = i;
        braceCount = 1;
        i++;

        while (i < content.length && (braceCount > 0 || parenCount > 0)) {
          const char = content[i];
          const prevChar = i > 0 ? content[i - 1] : "";

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

        if (braceCount === 0) {
          objectContent = content.substring(objectStart, i - (parenCount === 0 ? 1 : 0));
          // Correctly substring: if we broke loop because braceCount is 0, i is at char AFTER '}'
          // But if parenCount also went to 0, we might be further.
          // Actually my logic above: i increments at end of loop.
          // If braceCount becomes 0, loop continues if parenCount > 0 (which it is, started at 1)
          // Wait, new Collection({...})
          // { ... } is inside ( ... )
          // So braceCount goes 1 -> ... -> 0.
          // parenCount stays 1.
          // Loop continues until parenCount 0? No, usually `new Collection({...})`
          // The loop condition is `braceCount > 0 || parenCount > 0`.
          // When '}' matches, braceCount becomes 0. parenCount is 1. Loop continues.
          // Next char is ')'. parenCount becomes 0. Loop stops.
        }
      } else {
        // No object literal?
        searchIndex = i + 1;
        continue;
      }

      if (objectContent) {
        // We need to extract just the object part, which ended when braceCount hit 0.
        // My loop logic is a bit combined.
        // Let's rely on the previous simpler logic but refined.
        // Actually, let's use the object content extraction from the previous implementation but wrapped in this loop
      }

      // Re-implementing the object extraction carefully
      i = openParen;
      // Skip whitespace
      while (i < content.length && /\s/.test(content[i])) {
        i++;
      }

      if (content[i] !== "{") {
        searchIndex = i + 1;
        continue;
      }

      const startObj = i;
      let bCount = 1;
      i++;
      let inStr = false;
      let strChar = null;

      while (i < content.length && bCount > 0) {
        const char = content[i];
        const prev = i > 0 ? content[i - 1] : "";

        if (!inStr && (char === '"' || char === "'")) {
          inStr = true;
          strChar = char;
        } else if (inStr && char === strChar && prev !== "\\") {
          inStr = false;
          strChar = null;
        }

        if (!inStr) {
          if (char === "{") bCount++;
          if (char === "}") bCount--;
        }
        i++;
      }

      if (bCount === 0) {
        const objStr = content.substring(startObj, i);
        try {
          // Pass mockApp as 'app' to the function
          const collectionObj = new Function("app", `return ${objStr}`)(mockApp);
          if (collectionObj && collectionObj.name) {
            const schema = convertPocketBaseCollection(collectionObj);
            collectionsToCreate.push(schema);
          }
        } catch (e) {
          console.warn("Failed to parse collection object:", e);
        }
      }
      searchIndex = i;
    }

    // 2. Parse Deletions
    const deleteMatches = content.matchAll(
      /app\.delete\s*\(\s*(?:collection_\w+|app\.findCollectionByNameOrId\s*\(\s*["']([^"']+)["']\s*\))\s*\)/g
    );
    for (const match of deleteMatches) {
      if (match[1]) {
        collectionsToDelete.push(match[1]);
      } else {
        // Variable lookup logic (simplified for now, assuming standard variable naming)
        // Assuming collection variables are tracked if I were parsing sequentially.
        // But here I'm using regex.
        // Let's try to extract name from variable name if it follows `collection_NAME`
        const varMatch = match[0].match(/collection_(\w+)/);
        if (varMatch) {
          // Try to infer name (may not be accurate if variable name != collection name)
          // But usually generator uses `collection_NAME`
          // Can I look up the definition?
          // Not easily without full scan.
          // I'll stick to what was there: try to find definition.
          const varName = `collection_${varMatch[1]}`;
          const defRegex = new RegExp(
            `const\\s+${varName}\\s*=\\s*app\\.findCollectionByNameOrId\\(["']([^"']+)["']\\)(?:\\s*//\\s*([^\\n\\r;]+))?`
          );
          const defMatch = content.match(defRegex);
          if (defMatch) {
            const name = defMatch[2] ? defMatch[2].trim() : defMatch[1];
            collectionsToDelete.push(name);
          } else {
            // Try new Collection assignment
            // const newColRegex = new RegExp(
            //   `const\\s+${varName}\\s*=\\s*new\\s+Collection\\(\\s*\\{([\\s\\S]*?)\\}\\s*\\)`
            // );
            // This is hard.
          }
        }
      }
    }

    // Also direct delete of variable
    // Check assignments: const col = app.findCollectionByNameOrId("name"); app.delete(col);
    const varAssignments = new Map<string, string>();
    const assignmentMatches = content.matchAll(
      /const\s+(\w+)\s*=\s*app\.findCollectionByNameOrId\s*\(\s*["']([^"']+)["']\s*\)(?:[ \t]*\/\/\s*([^\n\r;]+))?/g
    );
    for (const match of assignmentMatches) {
      const name = match[3] ? match[3].trim() : match[2];
      varAssignments.set(match[1], name);
    }

    const varDeleteMatches = content.matchAll(/app\.delete\s*\(\s*(\w+)\s*\)/g);
    for (const match of varDeleteMatches) {
      if (varAssignments.has(match[1])) {
        const name = varAssignments.get(match[1])!;
        if (!collectionsToDelete.includes(name)) {
          collectionsToDelete.push(name);
        }
      }
    }

    // 3. Parse Updates

    // Map of variable name -> { collectionName, type: 'collection' | 'field' | 'index', parentVar? }
    const variables = new Map<string, { type: "collection" | "field"; name: string; parentCollection?: string }>();

    // Initialize variables from assignments
    for (const [varName, colName] of varAssignments) {
      variables.set(varName, { type: "collection", name: colName });
    }

    // Find field variables: const field = col.fields.getByName("name")
    const fieldAssignmentMatches = content.matchAll(
      /const\s+(\w+)\s*=\s*(\w+)\.fields\.getByName\s*\(\s*["']([^"']+)["']\s*\)/g
    );
    for (const match of fieldAssignmentMatches) {
      const [_, fieldVar, colVar, fieldName] = match;
      const colInfo = variables.get(colVar);
      if (colInfo && colInfo.type === "collection") {
        variables.set(fieldVar, {
          type: "field",
          name: fieldName,
          parentCollection: colInfo.name,
        });
      }
    }

    // 3a. fields.add and fields.addAt
    // Pattern: colVar.fields.add(new TypeField({...})) OR colVar.fields.addAt(index, new TypeField({...}))
    const addFieldMatches = content.matchAll(
      /(\w+)\.fields\.(?:add|addAt)\s*\((?:\s*\d+\s*,)?\s*new\s+\w*Field\s*\(/g
    );
    for (const match of addFieldMatches) {
      const [fullMatch, colVar] = match;
      const colInfo = variables.get(colVar);
      if (colInfo && colInfo.type === "collection") {
        // Extract the field definition object
        const startIdx = match.index! + fullMatch.length;
        // We need to find the object inside (...)
        // It usually looks like: new TextField({ ... })
        // So we are at start of `{` hopefully?
        // Actually `new TextField(` -> next char might be whitespace then `{`

        let j = startIdx;
        while (j < content.length && /\s/.test(content[j])) j++;

        if (content[j] === "{") {
          // Extract object
          const objStart = j;
          let bCount = 1;
          j++;
          let inStr = false;
          let sChar = null;

          while (j < content.length && bCount > 0) {
            const char = content[j];
            const prev = j > 0 ? content[j - 1] : "";
            if (!inStr && (char === '"' || char === "'")) {
              inStr = true;
              sChar = char;
            } else if (inStr && char === sChar && prev !== "\\") {
              inStr = false;
              sChar = null;
            }
            if (!inStr) {
              if (char === "{") bCount++;
              if (char === "}") bCount--;
            }
            j++;
          }

          if (bCount === 0) {
            const objStr = content.substring(objStart, j);
            // We also need the type. Regex `new (\w+)Field`
            const typeMatch = fullMatch.match(/new\s+(\w*)Field/);
            // const fieldTypeStr = typeMatch ? typeMatch[1].toLowerCase() : "text"; // Default/Fallback

            try {
              // We need to inject the type into the object if it's not there,
              // or rely on convertPocketBaseField.
              // convertPocketBaseField expects `type` property.
              // But `new TextField({...})` usually doesn't have `type: 'text'` inside.
              // It's inferred from constructor.

              const rawObj = new Function("app", `return ${objStr}`)(mockApp);

              // Map constructor name to type string if needed
              // Valid types: text, number, bool, email, url, date, select, json, file, relation
              const typeMap: Record<string, string> = {
                Text: "text",
                Number: "number",
                Bool: "bool",
                Email: "email",
                URL: "url",
                Date: "date",
                Select: "select",
                JSON: "json",
                File: "file",
                Relation: "relation",
              };
              const typePrefix = typeMatch ? typeMatch[1] : "Text";
              const inferredType = typeMap[typePrefix] || typePrefix.toLowerCase();

              if (!rawObj.type) rawObj.type = inferredType;

              const fieldDef = convertPocketBaseField(rawObj);
              getUpdate(colInfo.name).fieldsToAdd.push(fieldDef);
            } catch (e) {
              console.warn("Failed to parse field object:", e);
            }
          }
        }
      }
    }

    // 3b. fields.removeByName
    const removeFieldMatches = content.matchAll(/(\w+)\.fields\.removeByName\s*\(\s*["']([^"']+)["']\s*\)/g);
    for (const match of removeFieldMatches) {
      const [_, colVar, fieldName] = match;
      const colInfo = variables.get(colVar);
      if (colInfo && colInfo.type === "collection") {
        getUpdate(colInfo.name).fieldsToRemove.push(fieldName);
      }
    }

    // 3c. Field updates: fieldVar.prop = value
    // We iterate over lines/statements or just generic assignment regex?
    // Assignment: `var.prop = value;`
    // Regex: `(\w+)\.(\w+)\s*=\s*(.+?);`
    // Be careful with newlines and semicolons.
    const assignmentRegex = RegExp(`(\\w+)\\.([\\w.]+)\\s*=\\s*([^;]+);`, "g");
    const assignments = content.matchAll(assignmentRegex);
    for (const match of assignments) {
      const [_, varName, propPath, valueStr] = match;
      const varInfo = variables.get(varName);

      if (varInfo) {
        if (varInfo.type === "field") {
          // Update to a field
          const colName = varInfo.parentCollection!;
          const fieldName = varInfo.name;
          const update = getUpdate(colName);

          let fieldUpdate = update.fieldsToUpdate.find((f) => f.fieldName === fieldName);
          if (!fieldUpdate) {
            fieldUpdate = { fieldName, changes: {} };
            update.fieldsToUpdate.push(fieldUpdate);
          }

          try {
            // Parse value
            const value = new Function("app", `return ${valueStr}`)(mockApp);
            fieldUpdate.changes[propPath] = value;
          } catch {
            // console.warn("Failed to parse value:", valueStr);
            // Use string if eval fails?
            fieldUpdate.changes[propPath] = valueStr.trim();
          }
        } else if (varInfo.type === "collection") {
          // Update to collection (rules, indexes)
          const colName = varInfo.name;
          const update = getUpdate(colName);

          if (propPath === "indexes") {
            // ignore direct assignment to indexes for now, usually it's push/splice
          } else if (propPath.endsWith("Rule")) {
            try {
              const value = new Function("app", `return ${valueStr}`)(mockApp);
              update.rulesToUpdate[propPath] = value;
            } catch {
              update.rulesToUpdate[propPath] = valueStr.trim();
            }
          }
        }
      }
    }

    // 3d. Indexes push/splice
    // col.indexes.push("...")
    const idxPushRegex = /(\w+)\.indexes\.push\s*\(/g;
    let match;
    while ((match = idxPushRegex.exec(content)) !== null) {
      const colVar = match[1];
      const colInfo = variables.get(colVar);
      if (colInfo && colInfo.type === "collection") {
        // Parse forward to find matching closing parenthesis
        let i = match.index + match[0].length;
        let parenCount = 1;
        let inString = false;
        let stringChar: string | null = null;
        const start = i;

        while (i < content.length && parenCount > 0) {
          const char = content[i];
          const prevChar = i > 0 ? content[i - 1] : "";

          if (!inString && (char === '"' || char === "'")) {
            inString = true;
            stringChar = char;
          } else if (inString && char === stringChar && prevChar !== "\\") {
            inString = false;
            stringChar = null;
          }

          if (!inString) {
            if (char === "(") parenCount++;
            if (char === ")") parenCount--;
          }
          i++;
        }

        if (parenCount === 0) {
          const valStr = content.substring(start, i - 1).trim();
          try {
            const val = new Function(`return ${valStr}`)();
            getUpdate(colInfo.name).indexesToAdd.push(val);
          } catch {
            console.warn(`Failed to parse index value: ${valStr}`);
          }
        }
      }
    }

    // col.indexes.splice(idx, 1) - this is hard because we need to know what index corresponds to.
    // The generator produces:
    // const idxVar = col.indexes.findIndex(idx => idx === "...");
    // if (idxVar !== -1) col.indexes.splice(idxVar, 1);
    // So we should look for the findIndex call to identify the index string being removed.
    const idxFindMatches = content.matchAll(
      /const\s+(\w+)\s*=\s*(\w+)\.indexes\.findIndex\s*\(\s*idx\s*=>\s*idx\s*===\s*"((?:[^"\\]|\\.)*)"\s*\)/g
    );
    for (const match of idxFindMatches) {
      const [_, idxVar, colVar, idxStr] = match;
      const colInfo = variables.get(colVar);
      if (colInfo && colInfo.type === "collection") {
        try {
          // idxStr contains the JavaScript string value (escape sequences already processed)
          getUpdate(colInfo.name).indexesToRemove.push(idxStr);
        } catch {
          console.warn(`Failed to parse index value: ${idxStr} ${idxVar} ${colVar}`);
        }
      }
    }
  } catch (error) {
    console.warn(`Failed to parse migration operations from content: ${error}`);
  }

  return { collectionsToCreate, collectionsToDelete, collectionsToUpdate };
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
  collectionsToUpdate: ParsedCollectionUpdate[];
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
    return { collectionsToCreate: [], collectionsToDelete: [], collectionsToUpdate: [] };
  }
}
