#!/usr/bin/env node

/**
 * Claude Code PreToolUse adapter for Waffo integration reports.
 * Claude sends hook input as JSON on stdin.
 *
 * Two tiers:
 *   - every manifest: the report save gate must pass before the report can be written.
 *   - schemaVersion 2: the written bytes must equal `waffo-verify --emit report` exactly,
 *     so the report is the rendered projection of validated data rather than a retyping
 *     of it. schemaVersion 1 keeps the gate-only behaviour so existing integrations that
 *     have not migrated are never blocked by a renderer they do not use.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const RENDERABLE_SCHEMA_VERSION = 2;

function deny(message) {
  process.stderr.write(`waffo-integrate hook: ${message}\n`);
  process.exit(2);
}

function manifestSchemaVersion(projectDir) {
  try {
    const raw = fs.readFileSync(path.join(projectDir, '.waffo', 'integration-manifest.json'), 'utf8');
    return JSON.parse(raw).schemaVersion;
  } catch (err) {
    return null;
  }
}

function firstDifference(actual, expected) {
  const a = actual.split('\n');
  const b = expected.split('\n');
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      return `line ${i + 1}\n    written:  ${JSON.stringify(a[i] ?? '(end of file)')}\n    rendered: ${JSON.stringify(b[i] ?? '(end of file)')}`;
    }
  }
  return 'trailing bytes';
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
  const basename = path.basename(reportPath);
  if (!/^integration-report-\d{8}\.md$/.test(basename)) process.exit(0);

  const projectDir = path.dirname(reportPath);
  const verifyPath = path.join(__dirname, 'waffo-verify.js');
  const strictFlags = [];
  if (input.transcript_path) strictFlags.push('--transcript', input.transcript_path);

  const gate = spawnSync(process.execPath, [verifyPath, projectDir, '--gate', 'report', '--require-human-transcript', ...strictFlags], { encoding: 'utf8' });
  if (gate.error) deny(`cannot run validator: ${gate.error.message}`);
  if (gate.stdout) process.stdout.write(gate.stdout);
  if (gate.stderr) process.stderr.write(gate.stderr);
  if (gate.status !== 0) process.exit(typeof gate.status === 'number' ? gate.status : 2);

  if (manifestSchemaVersion(projectDir) !== RENDERABLE_SCHEMA_VERSION) process.exit(0);

  if (input.tool_name === 'Edit') {
    deny(`${basename} is rendered from .waffo/integration-manifest.json. Editing it by hand would desynchronise the report from the validated data — update the manifest and re-run "waffo-verify . --emit report" instead.`);
  }

  const content = input.tool_input.content;
  if (typeof content !== 'string') deny('Write to a rendered report must supply file content.');

  const emitted = spawnSync(process.execPath, [verifyPath, projectDir, '--emit', 'report', '--require-human-transcript', ...strictFlags], { encoding: 'utf8' });
  if (emitted.error) deny(`cannot render report: ${emitted.error.message}`);
  if (emitted.status !== 0) {
    if (emitted.stderr) process.stderr.write(emitted.stderr);
    process.exit(2);
  }

  const expectedDate = `| Date | ${basename.slice(19, 23)}-${basename.slice(23, 25)}-${basename.slice(25, 27)} |`;
  if (!emitted.stdout.includes(expectedDate)) {
    deny(`file name ${basename} does not match report.date in the manifest; rename the file or fix report.date.`);
  }

  if (content !== emitted.stdout) {
    deny(`report content differs from "waffo-verify . --emit report" at ${firstDifference(content, emitted.stdout)}\n  Write the rendered output verbatim; change the manifest, not the Markdown.`);
  }

  process.exit(0);
}

main();
