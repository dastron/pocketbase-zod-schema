/**
 * PocketBase Admin REST API helpers
 *
 * The test superuser credentials and the auth/read calls made against a
 * running workspace instance, in one place: the workspace manager creates
 * the superuser, the native generator drives collection CRUD through it, and
 * the real-apply verifier reads the resulting state back.
 */

import { logger, retry } from '../utils/test-helpers.js';

/** Superuser every test workspace is provisioned with */
export const SUPERUSER_EMAIL = 'test@example.com';
export const SUPERUSER_PASSWORD = 'testpassword123';

const DEFAULT_TIMEOUT = 30000;

export function adminUrlForPort(port: number): string {
  return `http://127.0.0.1:${port}`;
}

/**
 * Authenticate as the test superuser and return the auth token.
 *
 * Retries: right after startup PocketBase may still be applying migrations,
 * so the first attempts can legitimately fail.
 */
export async function authenticateSuperuser(
  adminUrl: string,
  options: { timeout?: number; maxAttempts?: number } = {}
): Promise<string> {
  const { timeout = DEFAULT_TIMEOUT, maxAttempts = 5 } = options;

  return await retry(
    async () => {
      const credentials = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: SUPERUSER_EMAIL, password: SUPERUSER_PASSWORD }),
        signal: AbortSignal.timeout(timeout),
      } as const;

      // v0.23+ superusers collection, with a fallback to the pre-0.23 admins API
      let response = await fetch(`${adminUrl}/api/collections/_superusers/auth-with-password`, credentials);
      if (response.status === 404) {
        response = await fetch(`${adminUrl}/api/admins/auth-with-password`, credentials);
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to authenticate superuser: ${response.status} - ${errorText}`);
      }

      const auth = await response.json();
      logger.debug('Superuser authentication successful');
      return auth.token as string;
    },
    {
      maxAttempts,
      baseDelay: 500,
      maxDelay: 2000,
      backoffFactor: 1.5,
    }
  );
}

/**
 * Read every collection the instance currently has (`GET /api/collections`).
 * Returns PocketBase's own JSON shape — the same shape migration files and
 * the execution engine's store use.
 */
export async function fetchCollections(
  adminUrl: string,
  token: string,
  options: { timeout?: number } = {}
): Promise<Record<string, any>[]> {
  const { timeout = DEFAULT_TIMEOUT } = options;

  const response = await fetch(`${adminUrl}/api/collections?perPage=500`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(timeout),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch collections: ${response.status} - ${errorText}`);
  }

  const body = await response.json();
  return Array.isArray(body?.items) ? body.items : [];
}
