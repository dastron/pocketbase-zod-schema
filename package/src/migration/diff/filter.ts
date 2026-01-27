import type { SchemaDiff, FieldModification } from "../types";

export interface FilterOptions {
  patterns?: string[];
  skipDestructive?: boolean;
}

function matchesPattern(text: string, patterns: string[]): boolean {
  if (!patterns || patterns.length === 0) return true;
  return patterns.some(pattern => {
    try {
        const regex = new RegExp(pattern);
        return regex.test(text);
    } catch {
        return text.includes(pattern);
    }
  });
}

function isDestructiveFieldModification(mod: FieldModification): boolean {
    const typeChange = mod.changes.find(c => c.property === "type");
    const requiredChange = mod.changes.find(c => c.property === "required" && c.newValue === true);
    return !!(typeChange || requiredChange);
}

export function filterDiff(diff: SchemaDiff, options: FilterOptions): SchemaDiff {
  const { patterns = [], skipDestructive = false } = options;

  // 1. Filter Collections to Create
  const collectionsToCreate = diff.collectionsToCreate.filter(col => {
    return matchesPattern(col.name, patterns);
  });

  // 2. Filter Collections to Delete
  let collectionsToDelete = diff.collectionsToDelete;
  if (skipDestructive) {
    collectionsToDelete = [];
  } else {
    collectionsToDelete = collectionsToDelete.filter(col => {
      return matchesPattern(col.name, patterns);
    });
  }

  // 3. Filter Collections to Modify
  const collectionsToModify = diff.collectionsToModify.map(mod => {
    // Check if collection name itself matches
    const collectionMatches = matchesPattern(mod.collection, patterns);

    // Filter fields to add
    const fieldsToAdd = mod.fieldsToAdd.filter(field => {
      return collectionMatches || matchesPattern(`${mod.collection}.${field.name}`, patterns);
    });

    // Filter fields to remove
    let fieldsToRemove = mod.fieldsToRemove;
    if (skipDestructive) {
      fieldsToRemove = [];
    } else {
      fieldsToRemove = fieldsToRemove.filter(field => {
         return collectionMatches || matchesPattern(`${mod.collection}.${field.name}`, patterns);
      });
    }

    // Filter fields to modify
    let fieldsToModify = mod.fieldsToModify;
    if (skipDestructive) {
        fieldsToModify = fieldsToModify.filter(f => !isDestructiveFieldModification(f));
    }
    fieldsToModify = fieldsToModify.filter(f => {
        return collectionMatches || matchesPattern(`${mod.collection}.${f.fieldName}`, patterns);
    });

    // Filter collection-level changes (indexes, rules, permissions)
    // Only include them if the collection name itself matches the pattern.
    // If user targets specific fields (e.g. "User.name"), collectionMatches is false, so these are skipped.
    const indexesToAdd = collectionMatches ? mod.indexesToAdd : [];
    const indexesToRemove = collectionMatches ? mod.indexesToRemove : [];
    const rulesToUpdate = collectionMatches ? mod.rulesToUpdate : [];
    const permissionsToUpdate = collectionMatches ? mod.permissionsToUpdate : [];

    return {
      ...mod,
      fieldsToAdd,
      fieldsToRemove,
      fieldsToModify,
      indexesToAdd,
      indexesToRemove,
      rulesToUpdate,
      permissionsToUpdate
    };
  }).filter(mod => {
     // Keep modification object only if there is something left to modify
     return mod.fieldsToAdd.length > 0 ||
            mod.fieldsToRemove.length > 0 ||
            mod.fieldsToModify.length > 0 ||
            mod.indexesToAdd.length > 0 ||
            mod.indexesToRemove.length > 0 ||
            mod.rulesToUpdate.length > 0 ||
            mod.permissionsToUpdate.length > 0;
  });

  return {
    ...diff,
    collectionsToCreate,
    collectionsToDelete,
    collectionsToModify
  };
}
