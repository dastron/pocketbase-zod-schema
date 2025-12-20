/**
 * PocketBase Downloader Component
 * 
 * Downloads and manages PocketBase executable versions with platform/architecture detection,
 * version-based caching, and executable verification.
 */

import { createWriteStream, existsSync } from 'fs';
import { chmod, mkdir, stat, rm } from 'fs/promises';
import { platform, arch } from 'os';
import { join, dirname } from 'path';
import { pipeline } from 'stream/promises';
import { spawn, execSync } from 'child_process';
import { env, logger, retry } from '../utils/test-helpers.js';

export interface PBDownloadConfig {
  version: string;
  downloadDir: string;
  platform: 'darwin' | 'linux' | 'win32';
  arch: 'x64' | 'arm64';
}

export interface PBDownloader {
  downloadPocketBase(version?: string): Promise<string>;
  getPocketBasePath(version?: string): string;
  verifyExecutable(path: string): Promise<boolean>;
  cleanup(): Promise<void>;
}

export class PBDownloaderImpl implements PBDownloader {
  private readonly downloadDir: string;
  private readonly downloadTimeout: number;
  private readonly downloadedVersions = new Set<string>();

  constructor(downloadDir?: string) {
    this.downloadDir = downloadDir || join(process.cwd(), '.pb-cache');
    this.downloadTimeout = env.getDownloadTimeout();
  }

  /**
   * Download PocketBase executable for the specified version
   * Uses version-based caching to avoid repeated downloads
   */
  async downloadPocketBase(version?: string): Promise<string> {
    const targetVersion = version || env.getPbVersion();
    const config = this.createDownloadConfig(targetVersion);
    const executablePath = this.getPocketBasePath(targetVersion);

    logger.debug(`Downloading PocketBase ${targetVersion} for ${config.platform}-${config.arch}`);

    // Check if already cached and verified
    if (existsSync(executablePath) && await this.verifyExecutable(executablePath)) {
      logger.debug(`Using cached PocketBase executable: ${executablePath}`);
      this.downloadedVersions.add(targetVersion);
      return executablePath;
    }

    // Ensure download directory exists
    await mkdir(dirname(executablePath), { recursive: true });

    // Download with retry logic
    await retry(
      async () => {
        await this.performDownload(config, executablePath);
      },
      {
        maxAttempts: 3,
        baseDelay: 2000,
        maxDelay: 10000,
      }
    );

    // Verify the downloaded executable
    if (!await this.verifyExecutable(executablePath)) {
      throw new Error(`Downloaded PocketBase executable failed verification: ${executablePath}`);
    }

    this.downloadedVersions.add(targetVersion);
    logger.info(`Successfully downloaded and verified PocketBase ${targetVersion}`);
    
    return executablePath;
  }

  /**
   * Get the expected path for a PocketBase executable version
   */
  getPocketBasePath(version?: string): string {
    const targetVersion = version || env.getPbVersion();
    const config = this.createDownloadConfig(targetVersion);
    const filename = config.platform === 'win32' ? 'pocketbase.exe' : 'pocketbase';
    
    return join(
      this.downloadDir,
      `pocketbase-${targetVersion}-${config.platform}-${config.arch}`,
      filename
    );
  }

  /**
   * Verify that a PocketBase executable is functional
   */
  async verifyExecutable(path: string): Promise<boolean> {
    try {
      // Check if file exists and is executable
      const stats = await stat(path);
      if (!stats.isFile()) {
        logger.debug(`Path is not a file: ${path}`);
        return false;
      }

      // Try to execute --version command with timeout
      const result = await this.executeWithTimeout(path, ['--version'], 10000);
      
      // Check if output contains expected version information
      const output = result.stdout.toLowerCase();
      const hasVersion = output.includes('pocketbase') && output.includes('version');
      
      if (hasVersion) {
        logger.debug(`PocketBase executable verified: ${path}`);
        return true;
      } else {
        logger.debug(`PocketBase executable verification failed - unexpected output: ${result.stdout}`);
        return false;
      }
    } catch (error) {
      logger.debug(`PocketBase executable verification failed: ${error}`);
      return false;
    }
  }

  /**
   * Clean up downloaded PocketBase executables
   */
  async cleanup(): Promise<void> {
    // This is a no-op for now since we want to keep cached downloads
    // In the future, this could implement cache size limits or age-based cleanup
    logger.debug('PBDownloader cleanup completed');
  }

  /**
   * Create download configuration based on current platform and architecture
   */
  private createDownloadConfig(version: string): PBDownloadConfig {
    const currentPlatform = platform();
    const currentArch = arch();

    // Map Node.js platform names to PocketBase release names
    let pbPlatform: 'darwin' | 'linux' | 'win32';
    switch (currentPlatform) {
      case 'darwin':
        pbPlatform = 'darwin';
        break;
      case 'linux':
        pbPlatform = 'linux';
        break;
      case 'win32':
        pbPlatform = 'win32';
        break;
      default:
        throw new Error(`Unsupported platform: ${currentPlatform}`);
    }

    // Map Node.js architecture names to PocketBase release names
    let pbArch: 'x64' | 'arm64';
    switch (currentArch) {
      case 'x64':
        pbArch = 'x64';
        break;
      case 'arm64':
        pbArch = 'arm64';
        break;
      default:
        throw new Error(`Unsupported architecture: ${currentArch}`);
    }

    return {
      version,
      downloadDir: this.downloadDir,
      platform: pbPlatform,
      arch: pbArch,
    };
  }

  /**
   * Perform the actual download of PocketBase
   */
  private async performDownload(config: PBDownloadConfig, executablePath: string): Promise<void> {
    const downloadUrl = this.buildDownloadUrl(config);
    const zipPath = executablePath + '.zip';
    const extractDir = dirname(executablePath);
    
    logger.debug(`Downloading from: ${downloadUrl}`);

    try {
      // Download the zip file
      const response = await fetch(downloadUrl, {
        signal: AbortSignal.timeout(this.downloadTimeout),
      });

      if (!response.ok) {
        throw new Error(`Download failed: ${response.status} ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('Download response has no body');
      }

      // Stream the download to zip file
      const fileStream = createWriteStream(zipPath);
      await pipeline(response.body, fileStream);

      logger.debug(`Downloaded zip to: ${zipPath}`);

      // Extract the zip file
      await this.extractZip(zipPath, extractDir);

      // Clean up zip file
      await rm(zipPath, { force: true });

      // Make executable on Unix-like systems
      if (config.platform !== 'win32') {
        await chmod(executablePath, 0o755);
      }

      logger.debug(`Extracted PocketBase to: ${executablePath}`);
    } catch (error) {
      // Clean up on failure
      try {
        await rm(zipPath, { force: true });
      } catch {
        // Ignore cleanup errors
      }
      
      logger.error(`Failed to download PocketBase: ${error}`);
      throw error;
    }
  }

  /**
   * Extract zip file using system unzip command
   */
  private async extractZip(zipPath: string, extractDir: string): Promise<void> {
    try {
      // Use system unzip command for simplicity and reliability
      execSync(`unzip -o "${zipPath}" -d "${extractDir}"`, {
        stdio: 'pipe', // Suppress output unless there's an error
      });
    } catch (error) {
      throw new Error(`Failed to extract zip file: ${error}`);
    }
  }

  /**
   * Build the download URL for PocketBase release
   */
  private buildDownloadUrl(config: PBDownloadConfig): string {
    const { version, platform, arch } = config;
    
    // PocketBase GitHub releases URL pattern
    const baseUrl = 'https://github.com/pocketbase/pocketbase/releases/download';
    
    // Build platform-specific filename
    let filename: string;
    if (platform === 'win32') {
      filename = `pocketbase_${version}_windows_${arch === 'x64' ? 'amd64' : 'arm64'}.zip`;
    } else if (platform === 'darwin') {
      filename = `pocketbase_${version}_darwin_${arch === 'x64' ? 'amd64' : 'arm64'}.zip`;
    } else {
      filename = `pocketbase_${version}_linux_${arch === 'x64' ? 'amd64' : 'arm64'}.zip`;
    }

    return `${baseUrl}/v${version}/${filename}`;
  }

  /**
   * Execute a command with timeout
   */
  private executeWithTimeout(
    command: string,
    args: string[],
    timeout: number
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let timeoutId: NodeJS.Timeout;

      // Set up timeout
      timeoutId = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`Command timed out after ${timeout}ms`));
      }, timeout);

      // Collect output
      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      // Handle completion
      child.on('close', (code) => {
        clearTimeout(timeoutId);
        resolve({
          stdout,
          stderr,
          exitCode: code || 0,
        });
      });

      // Handle errors
      child.on('error', (error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
    });
  }
}

// Export factory function for easier testing
export function createPBDownloader(downloadDir?: string): PBDownloader {
  return new PBDownloaderImpl(downloadDir);
}