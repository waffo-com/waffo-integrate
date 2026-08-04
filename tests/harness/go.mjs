'use strict';

// Go template compile-check: assemble the SDK-facing Go blocks into a module and
// `go test -run '^$'` (compiles main + test files, runs nothing) against waffo-go.

import fs from 'node:fs';
import path from 'node:path';
import { extractBlocks, FENCE } from './extract.mjs';
import { isFrameworkBlock, writeProject, run, has, tmpDir } from './util.mjs';

const WAFFO_GO = 'github.com/waffo-com/waffo-go';
const WAFFO_GO_VERSION = 'v1.6.0';

export async function checkGo(repoRoot) {
  if (!has('go')) return { lang: 'go', skipped: 'go toolchain not found' };

  const blocks = extractBlocks(path.join(repoRoot, 'references', 'go.md'), FENCE.go)
    .filter((b) => b.path && !isFrameworkBlock(b.path)); // Tier 1: client/payment/refund/subscription/test

  const dir = tmpDir('waffo-go');
  writeProject(dir, blocks);
  fs.writeFileSync(path.join(dir, 'go.mod'),
    `module waffo.harness/templates\n\ngo 1.21\n\nrequire ${WAFFO_GO} ${WAFFO_GO_VERSION}\n`);

  // Resolve deps into the module graph (network in CI; module cache locally).
  const env = { GOFLAGS: '-mod=mod', GOSUMDB: 'off' };
  const tidy = run('go', ['mod', 'tidy'], { cwd: dir, allowFail: true, env });
  if (tidy.status !== 0) {
    return { lang: 'go', skipped: `go mod tidy failed (SDK not resolvable): ${firstLine(tidy.stderr)}` };
  }

  const res = run('go', ['test', '-vet=off', '-run', '^$', './...'], { cwd: dir, allowFail: true, env });
  const files = blocks.length;
  return { lang: 'go', ok: res.status === 0, files, output: res.status === 0 ? '' : res.stderr || res.stdout };
}

function firstLine(s) {
  return (s || '').split('\n').find((l) => l.trim()) || '';
}
