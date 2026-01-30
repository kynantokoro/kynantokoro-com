#!/usr/bin/env tsx

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();
const projectsDir = path.join(rootDir, 'packages/projects');

if (!fs.existsSync(projectsDir)) {
  console.error(`Error: Projects directory not found at ${projectsDir}`);
  process.exit(1);
}

console.log('🔍 Scanning for projects...\n');

const entries = fs.readdirSync(projectsDir, { withFileTypes: true });
const projects: string[] = [];

for (const entry of entries) {
  if (!entry.isDirectory()) continue;

  const projectName = entry.name;
  const projectDir = path.join(projectsDir, projectName);

  // Skip lovejs-template (same as CI)
  if (projectName === 'lovejs-template') {
    console.log(`⏭️  Skipping ${projectName} (template)`);
    continue;
  }

  // Only process projects with package.json (same as CI)
  const packageJsonPath = path.join(projectDir, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    console.log(`⏭️  Skipping ${projectName} (no package.json)`);
    continue;
  }

  projects.push(projectName);
}

if (projects.length === 0) {
  console.log('ℹ️  No projects found to build');
  process.exit(0);
}

console.log(`\n📦 Found ${projects.length} project(s) to build:\n`);

let successCount = 0;
let failCount = 0;

for (const projectName of projects) {
  console.log(`🔨 Building ${projectName}...`);

  try {
    const projectDir = path.join(projectsDir, projectName);
    const outputDir = path.join(rootDir, 'packages/website/public/projects', projectName);

    // Build the project
    execSync('pnpm build', { cwd: projectDir, stdio: 'inherit' });

    // Copy dist to website/public/projects
    const distDir = path.join(projectDir, 'dist');
    if (fs.existsSync(distDir)) {
      console.log(`   📦 Installing to website/public/projects/${projectName}`);
      fs.mkdirSync(outputDir, { recursive: true });
      execSync(`cp -r "${distDir}/"* "${outputDir}/"`, { stdio: 'inherit' });
      console.log(`   ✅ Done!\n`);
      successCount++;
    } else {
      console.log(`   ⚠️  No dist/ directory found, skipping installation\n`);
      failCount++;
    }
  } catch (error) {
    console.error(`   ❌ Failed to build ${projectName}\n`);
    failCount++;
  }
}

console.log('─────────────────────────────────');
console.log(`✅ Build complete!`);
console.log(`   Success: ${successCount} project(s)`);
if (failCount > 0) {
  console.log(`   Failed: ${failCount} project(s)`);
}
