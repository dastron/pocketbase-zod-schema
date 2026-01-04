/**
 * Collection ID generation utilities for PocketBase migrations
 */

import { randomBytes } from "crypto";

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
 * Registry to track generated collection IDs and ensure uniqueness within a migration batch
 */
export class CollectionIdRegistry {
  private ids: Set<string>;

  constructor() {
    this.ids = new Set<string>();
  }

  /**
   * Generates a unique collection ID for a given collection name
   * Special case: Returns constant "_pb_users_auth_" for users collection
   * Retries up to 10 times if collision occurs (extremely rare)
   *
   * @param collectionName - The name of the collection
   * @returns A unique collection ID
   * @throws Error if unable to generate unique ID after max attempts
   */
  generate(collectionName?: string): string {
    // Special case: users collection always uses the constant ID
    if (collectionName && collectionName.toLowerCase() === "users") {
      const usersId = "_pb_users_auth_";
      this.register(usersId);
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
