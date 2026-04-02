#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');

// Auto-discover skill files from directories listed in package.json "files"
// No hardcoded list — adding/renaming files just works.
const SKILL_DIRS = ['references', 'docs'];
const SKILL_ROOT_FILES = ['SKILL.md'];

function discoverSkillFiles(srcDir) {
  const files = [...SKILL_ROOT_FILES];
  for (const dir of SKILL_DIRS) {
    const dirPath = path.join(srcDir, dir);
    if (!fs.existsSync(dirPath)) continue;
    for (const file of fs.readdirSync(dirPath)) {
      if (file.endsWith('.md')) files.push(path.join(dir, file));
    }
  }
  return files;
}

const TARGETS = {
  claude: path.join(os.homedir(), '.claude', 'skills', 'waffo-integrate'),
  cursor: path.join(process.cwd(), '.cursor', 'skills', 'waffo-integrate'),
};

function copySkillFiles(targetDir, label) {
  const srcDir = path.resolve(__dirname, '..');
  let copied = 0;

  const skillFiles = discoverSkillFiles(srcDir);
  for (const file of skillFiles) {
    const src = path.join(srcDir, file);
    const dest = path.join(targetDir, file);

    if (!fs.existsSync(src)) {
      console.warn(`  skip: ${file} (not found)`);
      continue;
    }

    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    copied++;
  }

  console.log(`  ${label}: installed ${copied} files -> ${targetDir}`);
}

function detect() {
  const targets = [];
  const args = process.argv.slice(2);

  if (args.includes('--claude')) targets.push('claude');
  if (args.includes('--cursor')) targets.push('cursor');

  if (targets.length > 0) return targets;

  // Auto-detect
  const claudeDir = path.join(os.homedir(), '.claude');
  const cursorDir = path.join(process.cwd(), '.cursor');

  if (fs.existsSync(claudeDir)) targets.push('claude');
  if (fs.existsSync(cursorDir)) targets.push('cursor');

  if (targets.length === 0) {
    // Default: install for claude
    targets.push('claude');
  }

  return targets;
}

function main() {
  console.log('waffo-integrate: installing skill...\n');

  const targets = detect();

  for (const target of targets) {
    copySkillFiles(TARGETS[target], target === 'claude' ? 'Claude Code' : 'Cursor');
  }

  console.log('\nDone! Usage:');
  if (targets.includes('claude')) {
    console.log('  Claude Code: say "integrate waffo" or "接入waffo" to trigger the skill');
  }
  if (targets.includes('cursor')) {
    console.log('  Cursor: add to .cursorrules:');
    console.log('    When integrating Waffo SDK, read .cursor/skills/waffo-integrate/SKILL.md');
  }
}

main();
