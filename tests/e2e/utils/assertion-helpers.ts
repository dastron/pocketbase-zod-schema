/**
 * Custom assertion helpers for E2E tests
 */

import { expect } from 'vitest';

/**
 * Assert that a migration file has the expected structure
 */
export function assertMigrationStructure(migrationContent: string, expectedProperties: {
  hasUpFunction?: boolean;
  hasDownFunction?: boolean;
  hasCollections?: boolean;
  collectionCount?: number;
}) {
  const {
    hasUpFunction = true,
    hasDownFunction = true,
    hasCollections = true,
    collectionCount
  } = expectedProperties;
  
  if (hasUpFunction) {
    expect(migrationContent).toMatch(/migrate\s*\(\s*\(db\)\s*=>\s*\{/);
  }
  
  if (hasDownFunction) {
    expect(migrationContent).toMatch(/revert\s*\(\s*\(db\)\s*=>\s*\{/);
  }
  
  if (hasCollections) {
    expect(migrationContent).toMatch(/collection\s*\(/);
  }
  
  if (collectionCount !== undefined) {
    const collectionMatches = migrationContent.match(/collection\s*\(/g);
    expect(collectionMatches?.length || 0).toBe(collectionCount);
  }
}

/**
 * Assert that two migration files are structurally equivalent
 */
export function assertMigrationsEquivalent(
  nativeMigration: string,
  libraryMigration: string,
  options: {
    ignoreTimestamps?: boolean;
    ignoreComments?: boolean;
    allowFieldOrderDifferences?: boolean;
  } = {}
) {
  const {
    ignoreTimestamps = true,
    ignoreComments = true,
    allowFieldOrderDifferences = false
  } = options;
  
  let native = nativeMigration;
  let library = libraryMigration;
  
  if (ignoreTimestamps) {
    // Remove timestamp-based migration names
    native = native.replace(/\d{10,}_/g, 'TIMESTAMP_');
    library = library.replace(/\d{10,}_/g, 'TIMESTAMP_');
  }
  
  if (ignoreComments) {
    // Remove comments
    native = native.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    library = library.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  }
  
  // Normalize whitespace
  native = native.replace(/\s+/g, ' ').trim();
  library = library.replace(/\s+/g, ' ').trim();
  
  if (allowFieldOrderDifferences) {
    // This is a simplified approach - in practice, you'd need more sophisticated parsing
    // For now, we'll just check that both contain the same key elements
    const nativeElements = extractMigrationElements(native);
    const libraryElements = extractMigrationElements(library);
    
    expect(libraryElements.collections).toEqual(nativeElements.collections);
    expect(libraryElements.fields.sort()).toEqual(nativeElements.fields.sort());
  } else {
    expect(library).toBe(native);
  }
}

/**
 * Extract key elements from migration content for comparison
 */
function extractMigrationElements(migrationContent: string) {
  const collections: string[] = [];
  const fields: string[] = [];
  
  // Extract collection names
  const collectionMatches = migrationContent.match(/collection\s*\(\s*["']([^"']+)["']/g);
  if (collectionMatches) {
    collections.push(...collectionMatches.map(match => {
      const nameMatch = match.match(/["']([^"']+)["']/);
      return nameMatch ? nameMatch[1] : '';
    }).filter(Boolean));
  }
  
  // Extract field definitions (simplified)
  const fieldMatches = migrationContent.match(/addField\s*\([^)]+\)/g);
  if (fieldMatches) {
    fields.push(...fieldMatches);
  }
  
  return { collections, fields };
}

/**
 * Assert that a PocketBase instance is running and accessible
 */
export async function assertPocketBaseRunning(baseUrl: string, timeout: number = 10000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) {
        return;
      }
    } catch (error) {
      // Continue trying
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  throw new Error(`PocketBase instance at ${baseUrl} is not accessible within ${timeout}ms`);
}

/**
 * Assert that a directory contains expected files
 */
export async function assertDirectoryContains(
  dirPath: string,
  expectedFiles: string[],
  options: { exact?: boolean } = {}
) {
  const { readdir } = await import('fs/promises');
  const { exact = false } = options;
  
  try {
    const files = await readdir(dirPath);
    
    if (exact) {
      expect(files.sort()).toEqual(expectedFiles.sort());
    } else {
      for (const expectedFile of expectedFiles) {
        expect(files).toContain(expectedFile);
      }
    }
  } catch (error) {
    throw new Error(`Failed to read directory ${dirPath}: ${error}`);
  }
}

/**
 * Assert that a file exists and has expected content patterns
 */
export async function assertFileContains(
  filePath: string,
  patterns: (string | RegExp)[],
  options: { encoding?: BufferEncoding } = {}
) {
  const { readFile } = await import('fs/promises');
  const { encoding = 'utf8' } = options;
  
  try {
    const content = await readFile(filePath, encoding);
    
    for (const pattern of patterns) {
      if (typeof pattern === 'string') {
        expect(content).toContain(pattern);
      } else {
        expect(content).toMatch(pattern);
      }
    }
  } catch (error) {
    throw new Error(`Failed to read file ${filePath}: ${error}`);
  }
}

/**
 * Assert that CLI output contains expected patterns
 */
export function assertCliOutput(
  output: { stdout: string; stderr: string; exitCode: number },
  expectations: {
    exitCode?: number;
    stdoutPatterns?: (string | RegExp)[];
    stderrPatterns?: (string | RegExp)[];
    shouldNotContain?: (string | RegExp)[];
  }
) {
  const {
    exitCode = 0,
    stdoutPatterns = [],
    stderrPatterns = [],
    shouldNotContain = []
  } = expectations;
  
  expect(output.exitCode).toBe(exitCode);
  
  for (const pattern of stdoutPatterns) {
    if (typeof pattern === 'string') {
      expect(output.stdout).toContain(pattern);
    } else {
      expect(output.stdout).toMatch(pattern);
    }
  }
  
  for (const pattern of stderrPatterns) {
    if (typeof pattern === 'string') {
      expect(output.stderr).toContain(pattern);
    } else {
      expect(output.stderr).toMatch(pattern);
    }
  }
  
  for (const pattern of shouldNotContain) {
    if (typeof pattern === 'string') {
      expect(output.stdout + output.stderr).not.toContain(pattern);
    } else {
      expect(output.stdout + output.stderr).not.toMatch(pattern);
    }
  }
}