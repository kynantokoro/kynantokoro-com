#!/usr/bin/env tsx

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const projectName = process.argv[2];

if (!projectName) {
  console.error('Usage: pnpm -w build:project <project-name>');
  console.error('Example: pnpm -w build:project sokol-template');
  process.exit(1);
}

// When using -w flag, process.cwd() is always the workspace root
const rootDir = process.cwd();
const projectDir = path.join(rootDir, 'packages/projects', projectName);
const outputDir = path.join(rootDir, 'packages/website/public/projects', projectName);

if (!fs.existsSync(projectDir)) {
  console.error(`Error: Project '${projectName}' not found at ${projectDir}`);
  process.exit(1);
}

console.log(`🔨 Building ${projectName}...`);
execSync('pnpm build', { cwd: projectDir, stdio: 'inherit' });

const distDir = path.join(projectDir, 'dist');
if (fs.existsSync(distDir)) {
  console.log(`📦 Installing to website/public/projects/${projectName}`);
  fs.mkdirSync(outputDir, { recursive: true });

  // Copy dist contents
  execSync(`cp -r "${distDir}/"* "${outputDir}/"`, { stdio: 'inherit' });

  console.log(`✅ Done! Output: ${outputDir}`);
} else {
  console.log('⚠️  No dist/ directory found, skipping installation');
}
