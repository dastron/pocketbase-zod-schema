import type { CollectionOperation, CollectionSchema, FieldModification, SchemaDiff } from "../types";
import { generateCollectionCreation, generateCollectionDeletion } from "./collections";
import { generateFieldAddition, generateFieldDeletion, generateFieldModification } from "./fields";
import { generateIndexAddition, generateIndexRemoval } from "./indexes";
import { generatePermissionUpdate, generateRuleUpdate } from "./rules";

/**
 * Generates the up migration code for a single collection operation
 * Handles create, modify, and delete operations
 *
 * @param operation - Collection operation to generate migration for
 * @param collectionIdMap - Map of collection names to their pre-generated IDs
 * @returns JavaScript code for up migration
 */
export function generateOperationUpMigration(
  operation: CollectionOperation,
  collectionIdMap: Map<string, string>
): string {
  const lines: string[] = [];

  if (operation.type === "create") {
    // Handle collection creation
    const collection = operation.collection as CollectionSchema;
    const varName = "collection";
    lines.push(generateCollectionCreation(collection, varName, true, collectionIdMap));
  } else if (operation.type === "modify") {
    // Handle collection modification
    const modification = operation.modifications!;
    const collectionName =
      typeof operation.collection === "string"
        ? operation.collection
        : (operation.collection?.name ?? modification.collection);

    let operationCount = 0;
    const totalOperations =
      modification.fieldsToAdd.length +
      modification.fieldsToModify.length +
      modification.fieldsToRemove.length +
      modification.indexesToAdd.length +
      modification.indexesToRemove.length +
      modification.rulesToUpdate.length +
      modification.permissionsToUpdate.length;

    // Add new fields
    for (let i = 0; i < modification.fieldsToAdd.length; i++) {
      const field = modification.fieldsToAdd[i];
      operationCount++;
      const varName = `collection_${collectionName}_add_${field.name}_${i}`;
      const isLast = operationCount === totalOperations;
      lines.push(generateFieldAddition(collectionName, field, varName, isLast, collectionIdMap));
      if (!isLast) lines.push("");
    }

    // Modify existing fields
    for (const fieldMod of modification.fieldsToModify) {
      operationCount++;
      const varName = `collection_${collectionName}_modify_${fieldMod.fieldName}`;
      const isLast = operationCount === totalOperations;
      lines.push(generateFieldModification(collectionName, fieldMod, varName, isLast, collectionIdMap));
      if (!isLast) lines.push("");
    }

    // Remove fields
    for (const field of modification.fieldsToRemove) {
      operationCount++;
      const varName = `collection_${collectionName}_remove_${field.name}`;
      const isLast = operationCount === totalOperations;
      lines.push(generateFieldDeletion(collectionName, field.name, varName, isLast, collectionIdMap));
      if (!isLast) lines.push("");
    }

    // Add indexes
    for (let i = 0; i < modification.indexesToAdd.length; i++) {
      operationCount++;
      const index = modification.indexesToAdd[i];
      const varName = `collection_${collectionName}_addidx_${i}`;
      const isLast = operationCount === totalOperations;
      lines.push(generateIndexAddition(collectionName, index, varName, isLast, collectionIdMap));
      if (!isLast) lines.push("");
    }

    // Remove indexes
    for (let i = 0; i < modification.indexesToRemove.length; i++) {
      operationCount++;
      const index = modification.indexesToRemove[i];
      const varName = `collection_${collectionName}_rmidx_${i}`;
      const isLast = operationCount === totalOperations;
      lines.push(generateIndexRemoval(collectionName, index, varName, isLast, collectionIdMap));
      if (!isLast) lines.push("");
    }

    // Update permissions (preferred) or rules (fallback)
    if (modification.permissionsToUpdate && modification.permissionsToUpdate.length > 0) {
      for (const permission of modification.permissionsToUpdate) {
        operationCount++;
        const varName = `collection_${collectionName}_perm_${permission.ruleType}`;
        const isLast = operationCount === totalOperations;
        lines.push(
          generatePermissionUpdate(collectionName, permission.ruleType, permission.newValue, varName, isLast, collectionIdMap)
        );
        if (!isLast) lines.push("");
      }
    } else if (modification.rulesToUpdate.length > 0) {
      for (const rule of modification.rulesToUpdate) {
        operationCount++;
        const varName = `collection_${collectionName}_rule_${rule.ruleType}`;
        const isLast = operationCount === totalOperations;
        lines.push(generateRuleUpdate(collectionName, rule.ruleType, rule.newValue, varName, isLast, collectionIdMap));
        if (!isLast) lines.push("");
      }
    }
  } else if (operation.type === "delete") {
    // Handle collection deletion
    const collectionName = typeof operation.collection === "string" ? operation.collection : operation.collection.name;
    const varName = "collection";
    lines.push(generateCollectionDeletion(collectionName, varName, true, collectionIdMap));
  }

  let code = lines.join("\n");

  // Check if there's already a return statement in the code
  // If so, skip post-processing to avoid duplicate returns
  const hasReturnStatement = /return\s+app\.(save|delete)\(/m.test(code);

  if (!hasReturnStatement) {
    // Find the last app.save() or app.delete() call and make it return the result
    // Match app.save(...) or app.delete(...) at the end of lines (not in comments or strings)
    const savePattern = /^(\s*)app\.save\((\w+)\);$/gm;
    const deletePattern = /^(\s*)app\.delete\((\w+)\);$/gm;

    const saveMatches = [...code.matchAll(savePattern)];
    const deleteMatches = [...code.matchAll(deletePattern)];

    // Combine all matches and find the last one by position
    const allMatches = [
      ...saveMatches.map((m) => ({ match: m, type: "save", index: m.index! })),
      ...deleteMatches.map((m) => ({ match: m, type: "delete", index: m.index! })),
    ].sort((a, b) => b.index - a.index); // Sort descending to get last match first

    if (allMatches.length > 0) {
      const lastMatch = allMatches[0];
      if (lastMatch.type === "save") {
        code =
          code.substring(0, lastMatch.match.index!) +
          lastMatch.match[1] +
          "return app.save(" +
          lastMatch.match[2] +
          ");" +
          code.substring(lastMatch.match.index! + lastMatch.match[0].length);
      } else {
        code =
          code.substring(0, lastMatch.match.index!) +
          lastMatch.match[1] +
          "return app.delete(" +
          lastMatch.match[2] +
          ");" +
          code.substring(lastMatch.match.index! + lastMatch.match[0].length);
      }
    }
  }

  return code;
}

/**
 * Generates the down migration code for a single collection operation
 * Reverts the operation (inverse of up migration)
 *
 * @param operation - Collection operation to generate rollback for
 * @param collectionIdMap - Map of collection names to their pre-generated IDs
 * @returns JavaScript code for down migration
 */
export function generateOperationDownMigration(
  operation: CollectionOperation,
  collectionIdMap: Map<string, string>
): string {
  const lines: string[] = [];

  if (operation.type === "create") {
    // Rollback: delete the created collection
    const collection = operation.collection as CollectionSchema;
    const varName = "collection";
    lines.push(generateCollectionDeletion(collection.name, varName, true, collectionIdMap));
  } else if (operation.type === "modify") {
    // Rollback: revert all modifications
    const modification = operation.modifications!;
    const collectionName =
      typeof operation.collection === "string"
        ? operation.collection
        : (operation.collection?.name ?? modification.collection);

    let operationCount = 0;
    const totalOperations =
      modification.fieldsToAdd.length +
      modification.fieldsToModify.length +
      modification.fieldsToRemove.length +
      modification.indexesToAdd.length +
      modification.indexesToRemove.length +
      modification.rulesToUpdate.length +
      modification.permissionsToUpdate.length;

    // Revert permissions (preferred) or rules (fallback)
    if (modification.permissionsToUpdate && modification.permissionsToUpdate.length > 0) {
      for (const permission of modification.permissionsToUpdate) {
        operationCount++;
        const varName = `collection_${collectionName}_revert_perm_${permission.ruleType}`;
        const isLast = operationCount === totalOperations;
        lines.push(
          generatePermissionUpdate(collectionName, permission.ruleType, permission.oldValue, varName, isLast, collectionIdMap)
        );
        if (!isLast) lines.push("");
      }
    } else if (modification.rulesToUpdate.length > 0) {
      for (const rule of modification.rulesToUpdate) {
        operationCount++;
        const varName = `collection_${collectionName}_revert_rule_${rule.ruleType}`;
        const isLast = operationCount === totalOperations;
        lines.push(generateRuleUpdate(collectionName, rule.ruleType, rule.oldValue, varName, isLast, collectionIdMap));
        if (!isLast) lines.push("");
      }
    }

    // Revert index removals (add them back)
    for (let i = 0; i < modification.indexesToRemove.length; i++) {
      operationCount++;
      const index = modification.indexesToRemove[i];
      const varName = `collection_${collectionName}_restore_idx_${i}`;
      const isLast = operationCount === totalOperations;
      lines.push(generateIndexAddition(collectionName, index, varName, isLast, collectionIdMap));
      if (!isLast) lines.push("");
    }

    // Revert index additions (remove them)
    for (let i = 0; i < modification.indexesToAdd.length; i++) {
      operationCount++;
      const index = modification.indexesToAdd[i];
      const varName = `collection_${collectionName}_revert_idx_${i}`;
      const isLast = operationCount === totalOperations;
      lines.push(generateIndexRemoval(collectionName, index, varName, isLast, collectionIdMap));
      if (!isLast) lines.push("");
    }

    // Revert field removals (add them back)
    for (const field of modification.fieldsToRemove) {
      operationCount++;
      const varName = `collection_${collectionName}_restore_${field.name}`;
      const isLast = operationCount === totalOperations;
      lines.push(generateFieldAddition(collectionName, field, varName, isLast, collectionIdMap));
      if (!isLast) lines.push("");
    }

    // Revert field modifications
    for (const fieldMod of modification.fieldsToModify) {
      operationCount++;
      // Create a reverse modification
      const reverseChanges = fieldMod.changes.map((change) => ({
        property: change.property,
        oldValue: change.newValue,
        newValue: change.oldValue,
      }));

      const reverseMod: FieldModification = {
        fieldName: fieldMod.fieldName,
        currentDefinition: fieldMod.newDefinition,
        newDefinition: fieldMod.currentDefinition,
        changes: reverseChanges,
      };

      const varName = `collection_${collectionName}_revert_${fieldMod.fieldName}`;
      const isLast = operationCount === totalOperations;
      lines.push(generateFieldModification(collectionName, reverseMod, varName, isLast, collectionIdMap));
      if (!isLast) lines.push("");
    }

    // Revert field additions (remove them)
    for (const field of modification.fieldsToAdd) {
      operationCount++;
      const varName = `collection_${collectionName}_revert_add_${field.name}`;
      const isLast = operationCount === totalOperations;
      lines.push(generateFieldDeletion(collectionName, field.name, varName, isLast, collectionIdMap));
      if (!isLast) lines.push("");
    }
  } else if (operation.type === "delete") {
    // Rollback: recreate the deleted collection
    const collection = operation.collection;
    if (typeof collection !== "string") {
      const varName = "collection";
      lines.push(generateCollectionCreation(collection, varName, true, collectionIdMap));
    }
  }

  let code = lines.join("\n");

  // Check if there's already a return statement in the code
  // If so, skip post-processing to avoid duplicate returns
  const hasReturnStatement = /return\s+app\.(save|delete)\(/m.test(code);

  if (!hasReturnStatement) {
    // Find the last app.save() or app.delete() call and make it return the result
    // Match app.save(...) or app.delete(...) at the end of lines (not in comments or strings)
    const savePattern = /^(\s*)app\.save\((\w+)\);$/gm;
    const deletePattern = /^(\s*)app\.delete\((\w+)\);$/gm;

    const saveMatches = [...code.matchAll(savePattern)];
    const deleteMatches = [...code.matchAll(deletePattern)];

    // Combine all matches and find the last one by position
    const allMatches = [
      ...saveMatches.map((m) => ({ match: m, type: "save", index: m.index! })),
      ...deleteMatches.map((m) => ({ match: m, type: "delete", index: m.index! })),
    ].sort((a, b) => b.index - a.index); // Sort descending to get last match first

    if (allMatches.length > 0) {
      const lastMatch = allMatches[0];
      if (lastMatch.type === "save") {
        code =
          code.substring(0, lastMatch.match.index!) +
          lastMatch.match[1] +
          "return app.save(" +
          lastMatch.match[2] +
          ");" +
          code.substring(lastMatch.match.index! + lastMatch.match[0].length);
      } else {
        code =
          code.substring(0, lastMatch.match.index!) +
          lastMatch.match[1] +
          "return app.delete(" +
          lastMatch.match[2] +
          ");" +
          code.substring(lastMatch.match.index! + lastMatch.match[0].length);
      }
    }
  }

  return code;
}

/**
 * Generates the up migration function code
 * Applies all changes from the diff in the correct order
 *
 * @param diff - Schema diff containing all changes
 * @returns JavaScript code for up migration
 */
export function generateUpMigration(diff: SchemaDiff): string {
  const lines: string[] = [];

  // Add comment header
  lines.push(`  // UP MIGRATION`);
  lines.push(``);

  // Build collection ID map from collections being created and existing collections
  // This map will be used to resolve relation field references
  const collectionIdMap = new Map<string, string>();
  for (const collection of diff.collectionsToCreate) {
    if (collection.id) {
      collectionIdMap.set(collection.name, collection.id);
    }
  }
  // Add existing collection IDs from snapshot (for relation fields referencing existing collections)
  if (diff.existingCollectionIds) {
    for (const [name, id] of diff.existingCollectionIds) {
      collectionIdMap.set(name, id);
    }
  }

  // 1. Create new collections
  if (diff.collectionsToCreate.length > 0) {
    lines.push(`  // Create new collections`);
    for (let i = 0; i < diff.collectionsToCreate.length; i++) {
      const collection = diff.collectionsToCreate[i];
      const varName = `collection_${collection.name}_create`;
      lines.push(generateCollectionCreation(collection, varName, false, collectionIdMap));
      lines.push(``);
    }
  }

  // 2. Modify existing collections
  if (diff.collectionsToModify.length > 0) {
    lines.push(`  // Modify existing collections`);
    for (const modification of diff.collectionsToModify) {
      const collectionName = modification.collection;
      // Add new fields
      if (modification.fieldsToAdd.length > 0) {
        lines.push(`  // Add fields to ${collectionName}`);
        for (let i = 0; i < modification.fieldsToAdd.length; i++) {
          const field = modification.fieldsToAdd[i];
          const varName = `collection_${collectionName}_add_${field.name}_${i}`;
          lines.push(generateFieldAddition(collectionName, field, varName, false, collectionIdMap));
          lines.push(``);
        }
      }

      // Modify existing fields
      if (modification.fieldsToModify.length > 0) {
        lines.push(`  // Modify fields in ${collectionName}`);
        for (const fieldMod of modification.fieldsToModify) {
          const varName = `collection_${collectionName}_modify_${fieldMod.fieldName}`;
          lines.push(generateFieldModification(collectionName, fieldMod, varName, false, collectionIdMap));
          lines.push(``);
        }
      }

      // Remove fields
      if (modification.fieldsToRemove.length > 0) {
        lines.push(`  // Remove fields from ${collectionName}`);
        for (const field of modification.fieldsToRemove) {
          const varName = `collection_${collectionName}_remove_${field.name}`;
          lines.push(generateFieldDeletion(collectionName, field.name, varName, false, collectionIdMap));
          lines.push(``);
        }
      }

      // Add indexes
      if (modification.indexesToAdd.length > 0) {
        lines.push(`  // Add indexes to ${collectionName}`);
        for (let i = 0; i < modification.indexesToAdd.length; i++) {
          const index = modification.indexesToAdd[i];
          const varName = `collection_${collectionName}_addidx_${i}`;
          lines.push(generateIndexAddition(collectionName, index, varName, false, collectionIdMap));
          lines.push(``);
        }
      }

      // Remove indexes
      if (modification.indexesToRemove.length > 0) {
        lines.push(`  // Remove indexes from ${collectionName}`);
        for (let i = 0; i < modification.indexesToRemove.length; i++) {
          const index = modification.indexesToRemove[i];
          const varName = `collection_${collectionName}_rmidx_${i}`;
          lines.push(generateIndexRemoval(collectionName, index, varName, false, collectionIdMap));
          lines.push(``);
        }
      }

      // Update permissions (preferred) or rules (fallback)
      if (modification.permissionsToUpdate && modification.permissionsToUpdate.length > 0) {
        lines.push(`  // Update permissions for ${collectionName}`);
        for (const permission of modification.permissionsToUpdate) {
          const varName = `collection_${collectionName}_perm_${permission.ruleType}`;
          lines.push(
            generatePermissionUpdate(collectionName, permission.ruleType, permission.newValue, varName, false, collectionIdMap)
          );
          lines.push(``);
        }
      } else if (modification.rulesToUpdate.length > 0) {
        lines.push(`  // Update rules for ${collectionName}`);
        for (const rule of modification.rulesToUpdate) {
          const varName = `collection_${collectionName}_rule_${rule.ruleType}`;
          lines.push(generateRuleUpdate(collectionName, rule.ruleType, rule.newValue, varName, false, collectionIdMap));
          lines.push(``);
        }
      }
    }
  }

  // 3. Delete collections
  if (diff.collectionsToDelete.length > 0) {
    lines.push(`  // Delete collections`);
    for (let i = 0; i < diff.collectionsToDelete.length; i++) {
      const collection = diff.collectionsToDelete[i];
      const varName = `collection_${collection.name}_delete`;
      lines.push(generateCollectionDeletion(collection.name, varName, false, collectionIdMap));
      lines.push(``);
    }
  }

  // If no changes, add a comment
  if (lines.length === 2) {
    lines.push(`  // No changes detected`);
    lines.push(``);
  }

  let code = lines.join("\n");

  // Check if there's already a return statement in the code
  // If so, skip post-processing to avoid duplicate returns
  const hasReturnStatement = /return\s+app\.(save|delete)\(/m.test(code);

  if (!hasReturnStatement) {
    // Find the last app.save() or app.delete() call and make it return the result
    // Match app.save(...) or app.delete(...) at the end of lines (not in comments or strings)
    const savePattern = /^(\s*)app\.save\((\w+)\);$/gm;
    const deletePattern = /^(\s*)app\.delete\((\w+)\);$/gm;

    const saveMatches = [...code.matchAll(savePattern)];
    const deleteMatches = [...code.matchAll(deletePattern)];

    // Combine all matches and find the last one by position
    const allMatches = [
      ...saveMatches.map((m) => ({ match: m, type: "save", index: m.index! })),
      ...deleteMatches.map((m) => ({ match: m, type: "delete", index: m.index! })),
    ].sort((a, b) => b.index - a.index); // Sort descending to get last match first

    if (allMatches.length > 0) {
      const lastMatch = allMatches[0];
      if (lastMatch.type === "save") {
        code =
          code.substring(0, lastMatch.match.index!) +
          lastMatch.match[1] +
          "return app.save(" +
          lastMatch.match[2] +
          ");" +
          code.substring(lastMatch.match.index! + lastMatch.match[0].length);
      } else {
        code =
          code.substring(0, lastMatch.match.index!) +
          lastMatch.match[1] +
          "return app.delete(" +
          lastMatch.match[2] +
          ");" +
          code.substring(lastMatch.match.index! + lastMatch.match[0].length);
      }
    }
  }

  return code;
}

/**
 * Generates the down migration function code
 * Reverts all changes from the diff in reverse order
 *
 * @param diff - Schema diff containing all changes
 * @returns JavaScript code for down migration
 */
export function generateDownMigration(diff: SchemaDiff): string {
  const lines: string[] = [];

  // Add comment header
  lines.push(`  // DOWN MIGRATION (ROLLBACK)`);
  lines.push(``);

  // Build collection ID map from collections being created (for rollback)
  // This map will be used to resolve relation field references
  const collectionIdMap = new Map<string, string>();
  for (const collection of diff.collectionsToCreate) {
    if (collection.id) {
      collectionIdMap.set(collection.name, collection.id);
    }
  }
  // Also include deleted collections that might have IDs
  for (const collection of diff.collectionsToDelete) {
    if (collection.id) {
      collectionIdMap.set(collection.name, collection.id);
    }
  }
  // Add existing collection IDs from snapshot (for relation fields referencing existing collections)
  if (diff.existingCollectionIds) {
    for (const [name, id] of diff.existingCollectionIds) {
      collectionIdMap.set(name, id);
    }
  }

  // Reverse order: delete -> modify -> create

  // 1. Recreate deleted collections
  if (diff.collectionsToDelete.length > 0) {
    lines.push(`  // Recreate deleted collections`);
    for (let i = 0; i < diff.collectionsToDelete.length; i++) {
      const collection = diff.collectionsToDelete[i];
      const varName = `collection_${collection.name}_recreate`;
      lines.push(generateCollectionCreation(collection, varName, false, collectionIdMap));
      lines.push(``);
    }
  }

  // 2. Revert modifications (in reverse order)
  if (diff.collectionsToModify.length > 0) {
    lines.push(`  // Revert modifications`);
    for (const modification of diff.collectionsToModify) {
      const collectionName = modification.collection;
      // Revert permissions (preferred) or rules (fallback)
      if (modification.permissionsToUpdate && modification.permissionsToUpdate.length > 0) {
        lines.push(`  // Revert permissions for ${collectionName}`);
        for (const permission of modification.permissionsToUpdate) {
          const varName = `collection_${collectionName}_revert_perm_${permission.ruleType}`;
            lines.push(
              generatePermissionUpdate(collectionName, permission.ruleType, permission.oldValue, varName, false, collectionIdMap)
            );
          lines.push(``);
        }
      } else if (modification.rulesToUpdate.length > 0) {
        lines.push(`  // Revert rules for ${collectionName}`);
        for (const rule of modification.rulesToUpdate) {
          const varName = `collection_${collectionName}_revert_rule_${rule.ruleType}`;
            lines.push(generateRuleUpdate(collectionName, rule.ruleType, rule.oldValue, varName, false, collectionIdMap));
          lines.push(``);
        }
      }

      // Revert index removals (add them back)
      if (modification.indexesToRemove.length > 0) {
        lines.push(`  // Restore indexes to ${collectionName}`);
        for (let i = 0; i < modification.indexesToRemove.length; i++) {
          const index = modification.indexesToRemove[i];
          const varName = `collection_${collectionName}_restore_idx_${i}`;
            lines.push(generateIndexAddition(collectionName, index, varName, false, collectionIdMap));
          lines.push(``);
        }
      }

      // Revert index additions (remove them)
      if (modification.indexesToAdd.length > 0) {
        lines.push(`  // Remove indexes from ${collectionName}`);
        for (let i = 0; i < modification.indexesToAdd.length; i++) {
          const index = modification.indexesToAdd[i];
          const varName = `collection_${collectionName}_revert_idx_${i}`;
            lines.push(generateIndexRemoval(collectionName, index, varName, false, collectionIdMap));
          lines.push(``);
        }
      }

      // Revert field removals (add them back)
      if (modification.fieldsToRemove.length > 0) {
        lines.push(`  // Restore fields to ${collectionName}`);
        for (const field of modification.fieldsToRemove) {
          const varName = `collection_${collectionName}_restore_${field.name}`;
          lines.push(generateFieldAddition(collectionName, field, varName, false, collectionIdMap));
          lines.push(``);
        }
      }

      // Revert field modifications
      if (modification.fieldsToModify.length > 0) {
        lines.push(`  // Revert field modifications in ${collectionName}`);
        for (const fieldMod of modification.fieldsToModify) {
          // Create a reverse modification
          const reverseChanges = fieldMod.changes.map((change) => ({
            property: change.property,
            oldValue: change.newValue,
            newValue: change.oldValue,
          }));

          const reverseMod: FieldModification = {
            fieldName: fieldMod.fieldName,
            currentDefinition: fieldMod.newDefinition,
            newDefinition: fieldMod.currentDefinition,
            changes: reverseChanges,
          };

          const varName = `collection_${collectionName}_revert_${fieldMod.fieldName}`;
          lines.push(generateFieldModification(collectionName, reverseMod, varName, false, collectionIdMap));
          lines.push(``);
        }
      }

      // Revert field additions (remove them)
      if (modification.fieldsToAdd.length > 0) {
        lines.push(`  // Remove added fields from ${collectionName}`);
        for (const field of modification.fieldsToAdd) {
          const varName = `collection_${collectionName}_revert_add_${field.name}`;
          lines.push(generateFieldDeletion(collectionName, field.name, varName, false, collectionIdMap));
          lines.push(``);
        }
      }
    }
  }

  // 3. Delete created collections
  if (diff.collectionsToCreate.length > 0) {
    lines.push(`  // Delete created collections`);
    for (let i = 0; i < diff.collectionsToCreate.length; i++) {
      const collection = diff.collectionsToCreate[i];
      const varName = `collection_${collection.name}_rollback`;
        lines.push(generateCollectionDeletion(collection.name, varName, false, collectionIdMap));
      lines.push(``);
    }
  }

  // If no changes, add a comment
  if (lines.length === 2) {
    lines.push(`  // No changes to revert`);
    lines.push(``);
  }

  let code = lines.join("\n");

  // Check if there's already a return statement in the code
  // If so, skip post-processing to avoid duplicate returns
  const hasReturnStatement = /return\s+app\.(save|delete)\(/m.test(code);

  if (!hasReturnStatement) {
    // Find the last app.save() or app.delete() call and make it return the result
    // Match app.save(...) or app.delete(...) at the end of lines (not in comments or strings)
    const savePattern = /^(\s*)app\.save\((\w+)\);$/gm;
    const deletePattern = /^(\s*)app\.delete\((\w+)\);$/gm;

    const saveMatches = [...code.matchAll(savePattern)];
    const deleteMatches = [...code.matchAll(deletePattern)];

    // Combine all matches and find the last one by position
    const allMatches = [
      ...saveMatches.map((m) => ({ match: m, type: "save", index: m.index! })),
      ...deleteMatches.map((m) => ({ match: m, type: "delete", index: m.index! })),
    ].sort((a, b) => b.index - a.index); // Sort descending to get last match first

    if (allMatches.length > 0) {
      const lastMatch = allMatches[0];
      if (lastMatch.type === "save") {
        code =
          code.substring(0, lastMatch.match.index!) +
          lastMatch.match[1] +
          "return app.save(" +
          lastMatch.match[2] +
          ");" +
          code.substring(lastMatch.match.index! + lastMatch.match[0].length);
      } else {
        code =
          code.substring(0, lastMatch.match.index!) +
          lastMatch.match[1] +
          "return app.delete(" +
          lastMatch.match[2] +
          ");" +
          code.substring(lastMatch.match.index! + lastMatch.match[0].length);
      }
    }
  }

  return code;
}
