#!/usr/bin/env node

import { spawn } from 'child_process';
import { join } from 'path';

const POCKETBASE_DIR = join(process.cwd(), 'pocketbase');

// Start PocketBase with ./pocketbase serve --dev
const pb = spawn('./pocketbase', ['serve', '--dev'], {
  stdio: 'inherit',
  cwd: POCKETBASE_DIR,
  shell: true
});

pb.on('error', (error) => {
  console.error('❌ Failed to start PocketBase:', error.message);
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  pb.kill('SIGINT');
});

process.on('SIGTERM', () => {
  pb.kill('SIGTERM');
});