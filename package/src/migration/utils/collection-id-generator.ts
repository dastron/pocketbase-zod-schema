/**
 * Collection ID generation utilities for PocketBase migrations
 */

import { createHash, randomBytes } from "crypto";

/**
 * Generates a unique collection ID in PocketBase format
 * Format: pb_ followed by 15 alphanumeric lowercase characters
 *
 * @returns A unique collection ID string (e.g., "pb_a1b2c3d4e5f6g7h")
 */
export function generateCollectionId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const idLength = 15;

  // Generate cryptographically secure random bytes
  const bytes = randomBytes(idLength);

  // Convert bytes to alphanumeric characters
  let id = "pb_";
  for (let i = 0; i < idLength; i++) {
    const index = bytes[i] % chars.length;
    id += chars[index];
  }

  return id;
}

/**
 * Generates a unique field ID based on type and name
 * Format: type followed by 10 alphanumeric lowercase characters
 * If name is provided, the ID is deterministic
 *
 * @param type - PocketBase field type
 * @param name - Optional field name for deterministic ID
 * @returns A unique field ID string
 */
export function generateFieldId(type: string, name?: string): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const idLength = 10;

  let bytes: Buffer | Uint8Array;
  if (name) {
    // Deterministic based on name to ensure stability across runs
    bytes = createHash("sha256").update(name).digest();
  } else {
    // Random
    bytes = randomBytes(idLength);
  }

  // Convert bytes to alphanumeric characters
  let suffix = "";
  for (let i = 0; i < idLength; i++) {
    const index = bytes[i] % chars.length;
    suffix += chars[index];
  }

  return `${type}${suffix}`;
}

/**
 * Registry to track generated collection IDs and ensure uniqueness within a migration batch
 */
export class CollectionIdRegistry {
  private ids: Set<string>;

  constructor() {
    this.ids = new Set<string>();
  }

  /**
   * Generates a unique collection ID for a given collection name
   * Retries up to 10 times if collision occurs (extremely rare)
   * Special case: returns "_pb_users_auth_" for users collection
   *
   * @param collectionName - The name of the collection (optional)
   * @returns A unique collection ID
   * @throws Error if unable to generate unique ID after max attempts
   */
  generate(collectionName?: string): string {
    // Special case: users collection always uses the constant
    if (collectionName && collectionName.toLowerCase() === "users") {
      const usersId = "_pb_users_auth_";
      if (!this.has(usersId)) {
        this.register(usersId);
      }
      return usersId;
    }

    const maxAttempts = 10;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const id = generateCollectionId();

      if (!this.has(id)) {
        this.register(id);
        return id;
      }
    }

    throw new Error("Failed to generate unique collection ID after maximum attempts");
  }

  /**
   * Checks if an ID has already been registered
   *
   * @param id - The collection ID to check
   * @returns True if the ID exists in the registry
   */
  has(id: string): boolean {
    return this.ids.has(id);
  }

  /**
   * Registers a collection ID in the registry
   *
   * @param id - The collection ID to register
   */
  register(id: string): void {
    this.ids.add(id);
  }
}
