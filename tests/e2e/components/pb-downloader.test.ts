/**
 * Tests for PBDownloader component
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rm } from 'fs/promises';
import { join } from 'path';
import { createPBDownloader } from './pb-downloader.js';
import { createTempDir, env } from '../utils/test-helpers.js';

describe('PBDownloader', () => {
  let tempDir: string;
  let downloader: ReturnType<typeof createPBDownloader>;

  beforeEach(async () => {
    tempDir = await createTempDir('pb-downloader-test-');
    downloader = createPBDownloader(tempDir);
  });

  afterEach(async () => {
    await downloader.cleanup();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should download and verify PocketBase executable', async () => {
    const version = env.getPbVersion();
    const executablePath = await downloader.downloadPocketBase(version);
    
    expect(executablePath).toBeTruthy();
    expect(executablePath).toContain(version);
    expect(await downloader.verifyExecutable(executablePath)).toBe(true);
  }, 120000); // 2 minute timeout for download

  it('should use cached executable on subsequent calls', async () => {
    const version = env.getPbVersion();
    
    // First download
    const path1 = await downloader.downloadPocketBase(version);
    expect(await downloader.verifyExecutable(path1)).toBe(true);
    
    // Second call should use cache
    const path2 = await downloader.downloadPocketBase(version);
    expect(path1).toBe(path2);
    expect(await downloader.verifyExecutable(path2)).toBe(true);
  }, 120000);

  it('should generate correct path for different versions', () => {
    const path1 = downloader.getPocketBasePath('0.35.0');
    const path2 = downloader.getPocketBasePath('0.35.0');
    
    expect(path1).toContain('0.35.0');
    expect(path2).toContain('0.35.0');
    expect(path1).not.toBe(path2);
  });

  it('should handle platform-specific executable names', () => {
    const path = downloader.getPocketBasePath('0.35.0');
    
    if (process.platform === 'win32') {
      expect(path).toMatch(/pocketbase\.exe$/);
    } else {
      expect(path).toMatch(/pocketbase$/);
      expect(path).not.toMatch(/\.exe$/);
    }
  });
});