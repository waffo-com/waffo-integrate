#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');

const SKILL_FILES = [
  'SKILL.md',
  'references/api-contract.md',
  'references/node.md',
  'references/java.md',
  'references/go.md',
  'docs/INDEX.md',
];

const TARGETS = {
  claude: path.join(os.homedir(), '.claude', 'skills', 'waffo-integrate'),
  cursor: path.join(process.cwd(), '.cursor', 'skills', 'waffo-integrate'),
};

function copySkillFiles(targetDir, label) {
  const srcDir = path.resolve(__dirname, '..');
  let copied = 0;

  for (const file of SKILL_FILES) {
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
