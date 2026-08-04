'use strict';

// Node/TS template compile-check: assemble the SDK-facing TypeScript blocks and run
// `tsc --noEmit` against @waffo/waffo-node types. Excess-property + type checks catch
// phantom/mis-typed fields on the create/subscription params object literals.

import fs from 'node:fs';
import path from 'node:path';
import { extractBlocks, FENCE } from './extract.mjs';
import { isFrameworkBlock, writeProject, run, has, tmpDir } from './util.mjs';

const WAFFO_NODE_VERSION = '3.0.0';
// A local path to the built @waffo/waffo-node package can be supplied for offline runs.
const LOCAL_SDK = process.env.WAFFO_NODE_SDK;

export async function checkNode(repoRoot) {
  if (!has('npm')) return { lang: 'node', skipped: 'npm not found' };

  // config-service is excluded: its `inquiry({})` trips a known SDK type gap — the SDK
  // auto-injects merchantId (Rule 4) but the *ConfigParams types mark it required. That
  // is a SDK-side type issue (reported to the SDK team), not a template defect.
  const EXCLUDE = /config-service/;
  const blocks = extractBlocks(path.join(repoRoot, 'references', 'node.md'), FENCE.node)
    .filter((b) => b.path && !isFrameworkBlock(b.path) && !EXCLUDE.test(b.path)); // Tier 1: config/services/test

  const dir = tmpDir('waffo-node');
  writeProject(dir, blocks);

  const sdkSpec = LOCAL_SDK ? `file:${LOCAL_SDK}` : WAFFO_NODE_VERSION;
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: 'waffo-node-templates', private: true, version: '1.0.0',
    devDependencies: {
      typescript: '^5.5.0', '@types/node': '^20', vitest: '1.6.1',
      '@waffo/waffo-node': sdkSpec,
    },
  }, null, 2));
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2021', module: 'NodeNext', moduleResolution: 'NodeNext',
      noEmit: true, skipLibCheck: true, esModuleInterop: true, strict: false, types: ['node'],
    },
    include: ['src/**/*.ts', 'tests/**/*.ts'],
  }, null, 2));

  const install = run('npm', ['install', '--loglevel=error', '--no-audit', '--no-fund'], { cwd: dir, allowFail: true });
  if (install.status !== 0) {
    return { lang: 'node', skipped: `npm install failed (SDK/toolchain not resolvable): ${firstLine(install.stderr)}` };
  }

  const res = run('npx', ['--no-install', 'tsc', '--noEmit'], { cwd: dir, allowFail: true });
  const files = blocks.length;
  return { lang: 'node', ok: res.status === 0, files, output: res.status === 0 ? '' : res.stdout || res.stderr };
}

function firstLine(s) {
  return (s || '').split('\n').find((l) => l.trim()) || '';
}
