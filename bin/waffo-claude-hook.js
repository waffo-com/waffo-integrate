#!/usr/bin/env node

/**
 * Claude Code PreToolUse adapter for Waffo integration reports.
 * Claude sends hook input as JSON on stdin.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function deny(message) {
  process.stderr.write(`waffo-integrate hook: ${message}\n`);
  process.exit(2);
}

function main() {
  let input;
  try {
    input = JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch (err) {
    deny(`invalid hook JSON on stdin: ${err.message}`);
  }

  if (!['Write', 'Edit'].includes(input.tool_name)) process.exit(0);
  const suppliedPath = input.tool_input && (input.tool_input.file_path || input.tool_input.path);
  if (!suppliedPath) process.exit(0);
  const reportPath = path.resolve(input.cwd || process.cwd(), suppliedPath);
  if (!/^integration-report-\d{8}\.md$/.test(path.basename(reportPath))) process.exit(0);

  const verifyPath = path.join(__dirname, 'waffo-verify.js');
  const args = [verifyPath, path.dirname(reportPath), '--gate', 'report', '--require-human-transcript'];
  if (input.transcript_path) args.push('--transcript', input.transcript_path);
  const result = spawnSync(process.execPath, args, { encoding: 'utf8' });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) deny(`cannot run validator: ${result.error.message}`);
  process.exit(typeof result.status === 'number' ? result.status : 2);
}

main();
