'use strict';

// Python template compile-check. Python is dynamically typed, so the reliable check is
// `py_compile` (syntax + parse). The dict-key field contract (e.g. no bogus
// orderDescription, cancel-by-subscriptionId) is guarded deterministically by
// static-spec.mjs. A pyright type pass was evaluated but dropped from the gate: its import
// resolution is environment-dependent (venv / pythonpath / project-root), which makes it
// flaky across CI vs local — a CI gate must be reproducible, not weather-dependent.

import fs from 'node:fs';
import path from 'node:path';
import { extractBlocks, FENCE } from './extract.mjs';
import { isFrameworkBlock, writeProject, run, has, tmpDir } from './util.mjs';

export async function checkPython(repoRoot) {
  const py = has('python3') ? 'python3' : has('python') ? 'python' : null;
  if (!py) return { lang: 'python', skipped: 'python not found' };

  const blocks = extractBlocks(path.join(repoRoot, 'references', 'python.md'), FENCE.python)
    .filter((b) => b.path && !isFrameworkBlock(b.path)); // Tier 1: config/services

  const dir = tmpDir('waffo-python');
  writeProject(dir, blocks);

  // Syntax + parse compile (reproducible everywhere).
  const files = collect(dir, '.py');
  const compileRes = run(py, ['-m', 'py_compile', ...files], { cwd: dir, allowFail: true });
  return {
    lang: 'python',
    ok: compileRes.status === 0,
    files: files.length,
    output: compileRes.status === 0 ? '' : compileRes.stderr || compileRes.stdout,
  };
}

function collect(root, ext) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(ext)) out.push(p);
    }
  };
  if (fs.existsSync(root)) walk(root);
  return out;
}
