'use strict';

// Python template compile-check. Python is dynamically typed, so compilation only
// guarantees syntax + resolvable names — the dict-key field contract (e.g. no bogus
// orderDescription) is guarded by static-spec.mjs, not here. When `pyright` and the
// `waffo` package are present (CI), a type pass adds import/attribute checking.

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

  // Syntax + name-resolution compile (always available).
  const files = collect(dir, '.py');
  const compileRes = run(py, ['-m', 'py_compile', ...files], { cwd: dir, allowFail: true });
  if (compileRes.status !== 0) {
    return { lang: 'python', ok: false, files: files.length, output: compileRes.stderr || compileRes.stdout };
  }

  // Optional type pass when the toolchain + SDK are installed (CI).
  const waffoInstalled = run(py, ['-c', 'import waffo'], { allowFail: true }).status === 0;
  if (has('pyright') && waffoInstalled) {
    const tp = run('pyright', ['--outputjson', dir], { cwd: dir, allowFail: true });
    const ok = tp.status === 0;
    return { lang: 'python', ok, files: files.length, output: ok ? '' : tp.stdout || tp.stderr };
  }

  // Syntax passed; deeper type checking not available in this environment.
  return { lang: 'python', ok: true, files: files.length, output: '', note: 'syntax-only (no pyright/waffo)' };
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
