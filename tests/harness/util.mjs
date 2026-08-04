'use strict';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/** A framework-glue block (webhook/controller) needs a web framework installed; those
 *  are Tier-2 and skipped for languages with many framework variants. */
export function isFrameworkBlock(p) {
  return /webhook|controller/i.test(p || '');
}

/** Create a fresh throwaway build dir under the OS temp dir. */
export function tmpDir(prefix) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
  return d;
}

/** Write each {path, code} block to <dir>/<path>, creating parent dirs. */
export function writeProject(dir, blocks) {
  for (const b of blocks) {
    if (!b.path) continue;
    const full = path.join(dir, b.path);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, b.code);
  }
}

/** Run a command, capturing status/stdout/stderr. Throws on non-zero unless allowFail. */
export function run(cmd, args, { cwd, allowFail = false, env } = {}) {
  const r = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    env: env ? { ...process.env, ...env } : process.env,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (r.error) {
    if (allowFail) return { status: 127, stdout: '', stderr: String(r.error.message) };
    throw new Error(`failed to spawn ${cmd}: ${r.error.message}`);
  }
  if (r.status !== 0 && !allowFail) {
    throw new Error(`${cmd} exited ${r.status}\n${r.stderr || r.stdout}`);
  }
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

/** Is a binary available on PATH? */
export function has(bin) {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [bin], { encoding: 'utf8' });
  return r.status === 0;
}
