'use strict';

// Python template gate: `py_compile` catches syntax errors, then mypy checks SDK methods
// and response attributes against an exact, typed Waffo package. Dict payload keys remain
// guarded by static-spec.mjs because Python intentionally accepts dict[str, Any].

import fs from 'node:fs';
import path from 'node:path';
import { extractBlocks, FENCE } from './extract.mjs';
import { isFrameworkBlock, writeProject, run, has, tmpDir } from './util.mjs';

const WAFFO_PYTHON_VERSION = '0.4.0b0';
const MYPY_VERSION = '1.19.1';
const LOCAL_SDK = process.env.WAFFO_PYTHON_SDK;
// Optional prebuilt environment for offline runs; both pinned versions are verified below.
const TYPECHECK_PYTHON = process.env.WAFFO_PYTHON_TYPECHECK_PYTHON;

export async function checkPython(repoRoot) {
  const py = has('python3') ? 'python3' : has('python') ? 'python' : null;
  if (!py) return { lang: 'python', skipped: 'python not found' };

  const blocks = extractBlocks(path.join(repoRoot, 'references', 'python.md'), FENCE.python)
    .filter((b) => b.path && !isFrameworkBlock(b.path)); // Tier 1: config/services/test

  const dir = tmpDir('waffo-python');
  writeProject(dir, blocks);

  // Syntax + parse compile (reproducible without dependencies).
  const files = collect(dir, '.py');
  const compileRes = run(py, ['-m', 'py_compile', ...files], { cwd: dir, allowFail: true });
  if (compileRes.status !== 0) {
    return {
      lang: 'python', ok: false, files: files.length,
      output: compileRes.stderr || compileRes.stdout,
    };
  }

  // The snippets omit empty package markers. Add them only in the throwaway project so
  // mypy does not mistake app/config/waffo.py for the installed top-level `waffo` package.
  for (const marker of [
    'app/__init__.py', 'app/config/__init__.py', 'app/services/__init__.py',
    'tests/__init__.py', 'tests/integration/__init__.py',
  ]) {
    const markerPath = path.join(dir, marker);
    fs.mkdirSync(path.dirname(markerPath), { recursive: true });
    if (!fs.existsSync(markerPath)) fs.writeFileSync(markerPath, '');
  }

  let typecheckPython = TYPECHECK_PYTHON;
  if (!typecheckPython) {
    const venvDir = path.join(dir, '.venv');
    const venv = run(py, ['-m', 'venv', venvDir], { cwd: dir, allowFail: true });
    if (venv.status !== 0) {
      return { lang: 'python', skipped: `venv creation failed: ${firstLine(venv.stderr)}` };
    }
    typecheckPython = process.platform === 'win32'
      ? path.join(venvDir, 'Scripts', 'python.exe')
      : path.join(venvDir, 'bin', 'python');

    const sdkSpec = LOCAL_SDK || `waffo==${WAFFO_PYTHON_VERSION}`;
    const install = run(typecheckPython, [
      '-m', 'pip', 'install', '--quiet', '--disable-pip-version-check',
      `mypy==${MYPY_VERSION}`, sdkSpec,
    ], { cwd: dir, allowFail: true });
    if (install.status !== 0) {
      return {
        lang: 'python',
        skipped: `pip install failed (SDK/type checker not resolvable): ${firstLine(install.stderr)}`,
      };
    }
  }

  const expectedVersions = `${WAFFO_PYTHON_VERSION} ${MYPY_VERSION}`;
  const version = run(typecheckPython, [
    '-c', 'import mypy.version, waffo; print(waffo.__version__, mypy.version.__version__)',
  ], { cwd: dir, allowFail: true });
  if (version.status !== 0 || version.stdout.trim() !== expectedVersions) {
    return {
      lang: 'python', ok: false, files: files.length,
      output: `expected waffo/mypy ${expectedVersions}; got ${version.stdout.trim() || firstLine(version.stderr)}`,
    };
  }

  const typecheck = run(typecheckPython, [
    '-m', 'mypy', '--no-incremental', '--ignore-missing-imports', '--check-untyped-defs', ...files,
  ], { cwd: dir, allowFail: true });
  return {
    lang: 'python',
    ok: typecheck.status === 0,
    files: files.length,
    output: typecheck.status === 0 ? '' : typecheck.stdout || typecheck.stderr,
  };
}

function firstLine(s) {
  return (s || '').split('\n').find((line) => line.trim()) || '';
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
